/** Mirrors the server's serialized audit shapes (server/src/routes.ts). */

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

export interface WalkShot {
  label: string;
  path: string | null;
  url: string;
  ok: boolean;
  note: string;
}

export interface Report {
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
  metrics: { ttfbMs: number; lcpMs: number | null; totalKb: number; requestCount: number };
  screenshots: {
    mobileFold: string | null;
    mobileFull: string | null;
    desktopFold: string | null;
    walk: WalkShot[];
  };
  shareUrl: string;
  shareCardUrl: string;
  diff?: {
    prevScore: number;
    prevGrade: string;
    prevAt: string;
    deltaScore: number;
    prevLcpMs: number | null;
    prevCriticalCount: number;
    criticalCount: number;
  };
  isSample?: boolean;
  costUsd: number;
}

export interface AuditSummary {
  id: string;
  url: string;
  status: AuditStatus;
  step: string;
  percent: number;
  createdAt: string;
  error: string | null;
  score: number | null;
  grade: string | null;
  domain: string;
  verdictLine: string | null;
  report?: Report;
}

export interface Me {
  userId: string;
  credits: number;
  entitlement: "free" | "pro";
  entitlementExpiresAt: string | null;
  ledger: { id: string; delta: number; reason: string; createdAt: string }[];
}

export interface Monitor {
  id: string;
  url: string;
  domain: string;
  createdAt: string;
  lastRunAt: string | null;
  lastScore: number | null;
}
