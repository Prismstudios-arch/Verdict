import type { FastifyRequest } from "fastify";

/**
 * Spoof-resistant client IP for per-IP limits.
 *
 * `trustProxy` makes Fastify read X-Forwarded-For, but the leftmost XFF entry
 * is attacker-controlled — a farmer could rotate fake IPs to dodge the
 * per-IP new-user cap. Platform headers are set by the edge and overwrite any
 * client-supplied value, so prefer them:
 *   - Fly.io:  Fly-Client-IP
 *   - Render / others: X-Real-IP (set by their proxy)
 * Fall back to req.ip only when neither is present.
 */
export function clientIp(req: FastifyRequest): string {
  const fly = req.headers["fly-client-ip"];
  if (typeof fly === "string" && fly) return fly;
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real) return real;
  return req.ip;
}
