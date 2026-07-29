import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { db, persist, type UserRecord } from "./store.js";

// ---- Minimal HS256 JWT (no external deps) ----

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signJwt(payload: Record<string, unknown>, ttlSec: number): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec }),
  );
  const sig = crypto.createHmac("sha256", config.jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = crypto
    .createHmac("sha256", config.jwtSecret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---- Token pairs with refresh rotation ----

export function issueTokenPair(user: UserRecord): { accessToken: string; refreshToken: string } {
  const accessToken = signJwt({ sub: user.id }, config.accessTokenTtlSec);
  const refreshToken = crypto.randomBytes(32).toString("base64url");
  user.refreshTokens.push({
    token: refreshToken,
    expiresAt: new Date(Date.now() + config.refreshTokenTtlSec * 1000).toISOString(),
  });
  // Keep only the most recent few refresh tokens per user.
  user.refreshTokens = user.refreshTokens
    .filter((t) => t.expiresAt > new Date().toISOString())
    .slice(-5);
  persist();
  return { accessToken, refreshToken };
}

export function rotateRefreshToken(refreshToken: string): { user: UserRecord; pair: ReturnType<typeof issueTokenPair> } | null {
  for (const user of Object.values(db.users)) {
    const idx = user.refreshTokens.findIndex((t) => t.token === refreshToken);
    if (idx >= 0) {
      const entry = user.refreshTokens[idx];
      user.refreshTokens.splice(idx, 1); // rotation: single use
      if (entry.expiresAt < new Date().toISOString()) return null;
      return { user, pair: issueTokenPair(user) };
    }
  }
  return null;
}

// ---- Fastify auth hook ----

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token ? verifyJwt(token) : null;
  const userId = payload?.sub as string | undefined;
  if (!userId || !db.users[userId]) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  req.userId = userId;
}
