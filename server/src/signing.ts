import crypto from "node:crypto";
import path from "node:path";
import { config } from "./config.js";

/**
 * Short-lived signed URLs for screenshot files. Nothing under storage/ is
 * served without a valid HMAC token; tokens embed a relative path + expiry.
 * (Production equivalent: R2/S3 presigned URLs.)
 */

export function signFilePath(relPath: string, ttlSec = 3600): string {
  const payload = JSON.stringify({ p: relPath, e: Date.now() + ttlSec * 1000 });
  const body = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", config.fileSecret).update(body).digest("base64url");
  return `/v1/files/${body}.${sig}`;
}

export function verifyFileToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", config.fileSecret).update(body).digest();
  const actual = Buffer.from(sig, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const { p, e } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof p !== "string" || typeof e !== "number" || e < Date.now()) return null;
    // Confine to the storage directory. Trailing-separator check so a sibling
    // dir like "storage-evil" can't satisfy a naive startsWith("…/storage").
    const baseDir = path.resolve(config.storageDir);
    const abs = path.resolve(baseDir, p);
    if (abs !== baseDir && !abs.startsWith(baseDir + path.sep)) return null;
    return abs;
  } catch {
    return null;
  }
}
