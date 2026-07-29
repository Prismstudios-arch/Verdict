import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, "..");

// Minimal .env loader (server/.env) — avoids a dotenv dependency.
const envPath = path.join(SERVER_ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// Data + screenshot directories. Override with DATA_DIR / STORAGE_DIR so a
// single mounted volume can hold both (e.g. on Fly: one volume at /data,
// DATA_DIR=/data/state STORAGE_DIR=/data/screens).
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(SERVER_ROOT, "data");
const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(SERVER_ROOT, "storage");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(STORAGE_DIR, { recursive: true });

function persistentSecret(name: string): string {
  // Generate once and persist so tokens survive restarts. In production set
  // JWT_SECRET / FILE_SECRET as real env secrets so they're stable even
  // without a persistent disk.
  const file = path.join(DATA_DIR, `.${name}`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, secret);
  return secret;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  model: process.env.VERDICT_MODEL ?? "claude-sonnet-4-6",
  // Free alternative: Google AI Studio key (aistudio.google.com/apikey).
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  // "anthropic" | "gemini" | "" (auto: anthropic if keyed, else gemini)
  aiProvider: process.env.AI_PROVIDER ?? "",
  // Public base URL of this server (e.g. https://verdict-jonny.fly.dev).
  // Used to build absolute OG image URLs for social link previews.
  publicUrl: (process.env.PUBLIC_URL ?? "").replace(/\/$/, ""),
  // Optional Supabase mirror (free persistence on ephemeral-disk hosts).
  supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? "",
  supabaseBucket: process.env.SUPABASE_BUCKET ?? "verdict",
  // Global daily audit cap (0 = unlimited). Protects free-tier AI quotas:
  // Gemini free tier allows ~250 req/day on 2.5-flash (~80 audits) or
  // ~1000/day on 2.5-flash-lite (~330 audits).
  maxAuditsPerDay: Number(process.env.MAX_AUDITS_PER_DAY ?? 0),
  // Anti-abuse backstop: max NEW anonymous users that may receive free
  // credits from one IP per day (0 = unlimited). The primary defence is the
  // Keychain device id (survives reinstall); this catches bulk farming.
  newUserIpCapPerDay: Number(process.env.NEW_USER_IP_CAP_PER_DAY ?? 25),
  // Weekly re-scan monitoring (Pro): how often each monitored site re-runs.
  // Override with a small value (e.g. 20000) for local testing.
  monitorPeriodMs: Number(process.env.MONITOR_PERIOD_MS ?? 7 * 24 * 3600 * 1000),
  maxMonitorsPerUser: Number(process.env.MAX_MONITORS_PER_USER ?? 3),
  // Minimum score movement before a push alert fires (AI scores jitter ±1-2).
  monitorAlertThreshold: Number(process.env.MONITOR_ALERT_THRESHOLD ?? 3),
  // Trust the platform proxy (Fly/Render/Cloud Run) so req.ip is the real
  // client IP, not the proxy. MUST be on in production or all per-IP limits
  // collapse to a single shared IP.
  trustProxy: (process.env.TRUST_PROXY ?? "true") === "true",
  jwtSecret: process.env.JWT_SECRET ?? persistentSecret("jwt-secret"),
  fileSecret: process.env.FILE_SECRET ?? persistentSecret("file-secret"),
  rcWebhookSecret: process.env.RC_WEBHOOK_SECRET ?? "",
  // Dev mode enables the simulated-purchase endpoint used by the app when
  // running inside Expo Go (where native IAP is unavailable).
  devMode: (process.env.DEV_MODE ?? "true") === "true",
  freeCredits: Number(process.env.FREE_AUDIT_CREDITS ?? 3),
  proMonthlyCredits: 30,
  creditPackSize: 5,
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  dataDir: DATA_DIR,
  storageDir: STORAGE_DIR,
  accessTokenTtlSec: 15 * 60,
  refreshTokenTtlSec: 30 * 24 * 3600,
};
