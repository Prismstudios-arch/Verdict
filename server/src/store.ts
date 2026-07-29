import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { sbDownload, sbUpload, supabaseEnabled } from "./supabase.js";

/**
 * Dev persistence: a single JSON file loaded into memory with debounced
 * writes. The shapes mirror the intended Postgres schema (users, audits,
 * entitlements, usage_ledger) so a Drizzle/Postgres store can slot in
 * behind the same interface for production.
 */

export type AuditStatus =
  | "queued"
  | "crawling"
  | "analyzing"
  | "scoring"
  | "complete"
  | "failed_blocked"
  | "failed_error";

export interface Finding {
  source: "first_impression" | "copy" | "trust" | "deterministic";
  severity: "critical" | "major" | "minor";
  issue: string;
  evidence: string;
  fix: string;
  rewriteBefore: string;
  rewriteAfter: string;
}

export interface AuditReport {
  url: string;
  finalUrl: string;
  domain: string;
  fetchedAt: string;
  aiAnalysis: boolean;
  scores: {
    overall: number;
    grade: string;
    clarity: number;
    copy: number;
    mobile: number;
    performance: number;
    trust: number;
    accessibility: number;
  };
  verdictLine: string;
  verdictParagraph: string;
  whatIsThis: string;
  whoIsItFor: string;
  findings: Finding[];
  fixFirst: Finding[];
  metrics: {
    ttfbMs: number;
    lcpMs: number | null;
    totalKb: number;
    requestCount: number;
  };
  screenshots: {
    mobileFold: string;
    mobileFull: string;
    desktopFold: string;
    walk: Array<{ label: string; path: string; url: string; ok: boolean; note: string }>;
  };
  // Present when a previous audit of the same site exists (re-scan diff).
  diff?: {
    prevScore: number;
    prevGrade: string;
    prevAt: string;
    deltaScore: number;
    prevLcpMs: number | null;
    prevCriticalCount: number;
    criticalCount: number;
  };
  costUsd: number;
}

export interface AuditRecord {
  id: string;
  userId: string;
  url: string;
  status: AuditStatus;
  step: string;
  percent: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
  report?: AuditReport;
}

export interface UserRecord {
  id: string; // also the RevenueCat app_user_id
  deviceId: string;
  createdAt: string;
  credits: number;
  entitlement: "free" | "pro";
  entitlementExpiresAt: string | null;
  refreshTokens: Array<{ token: string; expiresAt: string }>;
  // Expo push token for score-change alerts (null until user grants).
  pushToken?: string | null;
}

/** A Pro user's weekly re-scan subscription for one site. */
export interface MonitorRecord {
  id: string;
  userId: string;
  url: string;
  domain: string;
  createdAt: string;
  lastRunAt: string | null;
  lastScore: number | null;
  // Audit currently in flight for this monitor (guards double-runs).
  pendingAuditId?: string | null;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  auditId?: string;
  createdAt: string;
}

interface Db {
  users: Record<string, UserRecord>;
  audits: Record<string, AuditRecord>;
  ledger: LedgerEntry[];
  processedWebhookEvents: string[];
  dailyCounter?: { date: string; count: number };
  // Per-IP count of new anonymous users granted free credits today.
  newUsersByIp?: Record<string, { date: string; count: number }>;
  monitors?: Record<string, MonitorRecord>;
  savedAt?: string;
}

const DB_PATH = path.join(config.dataDir, "db.json");
const SNAPSHOT_KEY = "state/db.json";

function loadLocal(): Db | null {
  if (fs.existsSync(DB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as Db;
    } catch {
      // fall through on corruption
    }
  }
  return null;
}

async function load(): Promise<Db> {
  // On ephemeral-disk hosts the Supabase snapshot is the source of truth;
  // prefer whichever copy was saved most recently.
  const local = loadLocal();
  if (supabaseEnabled()) {
    const remoteBuf = await sbDownload(SNAPSHOT_KEY);
    if (remoteBuf) {
      try {
        const remote = JSON.parse(remoteBuf.toString("utf8")) as Db;
        if (!local || (remote.savedAt ?? "") >= (local.savedAt ?? "")) {
          console.log("[store] restored state from Supabase snapshot");
          return remote;
        }
      } catch {
        console.warn("[store] Supabase snapshot unreadable — using local state");
      }
    }
  }
  return local ?? { users: {}, audits: {}, ledger: [], processedWebhookEvents: [] };
}

export const db: Db = await load();

let persistTimer: NodeJS.Timeout | null = null;
export function persist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    db.savedAt = new Date().toISOString();
    const json = JSON.stringify(db);
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, DB_PATH);
    if (supabaseEnabled()) {
      void sbUpload(SNAPSHOT_KEY, json, "application/json");
    }
  }, 250);
}

export function findUserByDevice(deviceId: string): UserRecord | undefined {
  return Object.values(db.users).find((u) => u.deviceId === deviceId);
}

export function creditBalance(user: UserRecord): number {
  return user.credits;
}

export function addLedgerEntry(
  userId: string,
  delta: number,
  reason: string,
  auditId?: string,
): void {
  const user = db.users[userId];
  if (!user) return;
  user.credits += delta;
  db.ledger.push({
    id: crypto.randomUUID(),
    userId,
    delta,
    reason,
    auditId,
    createdAt: new Date().toISOString(),
  });
  persist();
}

export function auditsForUser(userId: string): AuditRecord[] {
  return Object.values(db.audits)
    .filter((a) => a.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
