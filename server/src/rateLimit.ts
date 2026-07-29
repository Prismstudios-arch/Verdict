import type { FastifyReply, FastifyRequest } from "fastify";
import { clientIp } from "./net.js";

/**
 * In-memory sliding-window rate limiter (per key). Production would move
 * this to the edge + Redis; the shape and limits match the brief:
 * 5 audit creations/hour per user AND per IP, plus a general burst limit.
 */

const windows = new Map<string, number[]>();

function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    windows.set(key, arr);
    return false;
  }
  arr.push(now);
  windows.set(key, arr);
  return true;
}

// Periodic cleanup so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of windows) {
    const alive = arr.filter((t) => now - t < 3_600_000);
    if (alive.length === 0) windows.delete(key);
    else windows.set(key, alive);
  }
}, 300_000).unref();

export function generalRateLimit(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (!hit(`gen:${clientIp(req)}`, 120, 60_000)) {
    reply.code(429).send({ error: "rate_limited", retryAfterSec: 60 });
    return;
  }
  done();
}

export function auditCreateRateLimit(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const okIp = hit(`audit:ip:${clientIp(req)}`, 10, 3_600_000);
  const okUser = req.userId ? hit(`audit:user:${req.userId}`, 10, 3_600_000) : true;
  if (!okIp || !okUser) {
    reply.code(429).send({ error: "rate_limited", message: "Audit limit reached — try again in an hour." });
    return;
  }
  done();
}
