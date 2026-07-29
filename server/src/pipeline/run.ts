import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { sbUpload, supabaseEnabled } from "../supabase.js";
import { addLedgerEntry, db, persist, type AuditRecord, type AuditReport, type Finding } from "../store.js";
import { captureSite } from "./capture.js";
import { deterministicChecks } from "./deterministic.js";
import { runLlmAnalysis } from "./llm.js";
import { compositeScore, letterGrade } from "./score.js";
import { SsrfBlockedError } from "../ssrf.js";

/**
 * In-process job queue (dev stand-in for BullMQ/Redis) with a global
 * concurrency cap. Each pipeline step updates the audit record so the
 * app's progress UI reflects real state — never a fake progress bar.
 */

const queue: string[] = [];
let running = 0;

// Listeners invoked whenever an audit reaches a terminal state (complete or
// failed). Used by the monitor scheduler to compare scores and send alerts.
type AuditFinishedListener = (audit: AuditRecord) => void;
const finishedListeners: AuditFinishedListener[] = [];
export function onAuditFinished(listener: AuditFinishedListener): void {
  finishedListeners.push(listener);
}

function notifyFinished(audit: AuditRecord): void {
  for (const listener of finishedListeners) {
    try {
      listener(audit);
    } catch (err) {
      console.error("[audit] finished-listener error:", err);
    }
  }
}

/**
 * Called once at boot: any audit left in a non-terminal state (the server —
 * or the whole PC — went down mid-audit) is failed honestly and its credit
 * refunded. The in-process queue does not survive restarts by design.
 */
export function recoverInterruptedAudits(): number {
  let recovered = 0;
  for (const audit of Object.values(db.audits)) {
    if (audit.status === "complete" || audit.status === "failed_blocked" || audit.status === "failed_error") {
      continue;
    }
    audit.status = "failed_error";
    audit.step = "Failed";
    audit.percent = 100;
    audit.error = "This audit was interrupted by a server restart. Your credit was refunded.";
    audit.updatedAt = new Date().toISOString();
    addLedgerEntry(audit.userId, +1, "refund: server restarted mid-audit", audit.id);
    recovered++;
  }
  if (recovered > 0) persist();
  return recovered;
}

export function enqueueAudit(auditId: string): void {
  queue.push(auditId);
  pump();
}

function pump(): void {
  while (running < config.workerConcurrency && queue.length > 0) {
    const id = queue.shift()!;
    running++;
    runAudit(id)
      .catch((err) => console.error(`[audit ${id}] crashed:`, err))
      .finally(() => {
        running--;
        const audit = db.audits[id];
        if (audit) notifyFinished(audit);
        pump();
      });
  }
}

function setStep(audit: AuditRecord, status: AuditRecord["status"], step: string, percent: number): void {
  audit.status = status;
  audit.step = step;
  audit.percent = percent;
  audit.updatedAt = new Date().toISOString();
  persist();
}

const severityRank = { critical: 0, major: 1, minor: 2 } as const;

/**
 * Mirror an audit's screenshots to Supabase Storage so reports survive
 * restarts on ephemeral-disk hosts. Best-effort: failures log and the
 * report still completes (images then live on local disk only).
 */
async function mirrorAuditFiles(auditId: string): Promise<void> {
  if (!supabaseEnabled()) return;
  const dir = path.join(config.storageDir, auditId);
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return;
  }
  await Promise.all(
    files.map((name) =>
      sbUpload(`shots/${auditId}/${name}`, fs.readFileSync(path.join(dir, name)), "image/jpeg"),
    ),
  );
}

/**
 * Finds the most recent previous completed audit of the same site by the
 * same user and returns a diff, so a re-scan shows "+9 since last time".
 */
function computeDiff(
  audit: AuditRecord,
  domain: string,
  overall: number,
  criticalCount: number,
): AuditReport["diff"] | null {
  let prev: AuditRecord | null = null;
  for (const other of Object.values(db.audits)) {
    if (other.id === audit.id) continue;
    if (other.userId !== audit.userId) continue;
    if (other.status !== "complete" || !other.report) continue;
    if (other.report.domain !== domain) continue;
    if (other.createdAt >= audit.createdAt) continue;
    if (!prev || other.createdAt > prev.createdAt) prev = other;
  }
  if (!prev?.report) return null;
  return {
    prevScore: prev.report.scores.overall,
    prevGrade: prev.report.scores.grade,
    prevAt: prev.report.fetchedAt,
    deltaScore: overall - prev.report.scores.overall,
    prevLcpMs: prev.report.metrics.lcpMs,
    prevCriticalCount: prev.report.findings.filter((f) => f.severity === "critical").length,
    criticalCount,
  };
}

async function runAudit(auditId: string): Promise<void> {
  const audit = db.audits[auditId];
  if (!audit) return;
  const startedAt = Date.now();

  const refund = (reason: string) => {
    addLedgerEntry(audit.userId, +1, `refund: ${reason}`, auditId);
  };

  try {
    setStep(audit, "crawling", "Visiting your site", 10);
    const cap = await captureSite(auditId, audit.url);

    if (cap.blocked) {
      audit.error = cap.blockReason;
      setStep(audit, "failed_blocked", "Blocked", 100);
      refund("site blocked or unreachable");
      console.log(`[audit ${auditId}] blocked: ${cap.blockReason}`);
      return;
    }

    setStep(audit, "crawling", "Browsing on a phone", 30);
    const det = deterministicChecks(cap);

    setStep(audit, "analyzing", "Judging", 55);
    const llm = await runLlmAnalysis(cap);

    setStep(audit, "scoring", "Scoring", 85);
    const subs = {
      clarity: llm.clarityScore,
      copy: llm.copyScore,
      mobile: det.mobile,
      performance: det.performance,
      trust: llm.trustScore,
      accessibility: det.accessibility,
    };
    const overall = compositeScore(subs);
    const findings: Finding[] = [...llm.findings, ...det.findings].sort(
      (a, b) => severityRank[a.severity] - severityRank[b.severity],
    );
    const domain = new URL(cap.finalUrl).hostname.replace(/^www\./, "");
    const criticalCount = findings.filter((f) => f.severity === "critical").length;
    const diff = computeDiff(audit, domain, overall, criticalCount);

    audit.report = {
      url: audit.url,
      finalUrl: cap.finalUrl,
      domain,
      fetchedAt: new Date().toISOString(),
      aiAnalysis: llm.ok,
      scores: { overall, grade: letterGrade(overall), ...subs },
      verdictLine: llm.verdictLine,
      verdictParagraph: llm.verdictParagraph,
      whatIsThis: llm.whatIsThis,
      whoIsItFor: llm.whoIsItFor,
      findings,
      fixFirst: findings.slice(0, 3),
      metrics: {
        ttfbMs: cap.metrics.ttfbMs,
        lcpMs: cap.metrics.lcpMs,
        totalKb: Math.round(cap.metrics.totalBytes / 1024),
        requestCount: cap.metrics.requestCount,
      },
      screenshots: {
        mobileFold: cap.shots.mobileFold,
        mobileFull: cap.shots.mobileFull,
        desktopFold: cap.shots.desktopFold,
        walk: cap.walk.map((w) => ({ label: w.label, path: w.screenshotPath, url: w.url, ok: w.ok, note: w.note })),
      },
      ...(diff ? { diff } : {}),
      costUsd: llm.costUsd,
    };
    await mirrorAuditFiles(auditId);
    setStep(audit, "complete", "Done", 100);
    console.log(
      `[audit ${auditId}] complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — score ${overall} (${audit.report.scores.grade}), cost $${llm.costUsd.toFixed(4)}`,
    );
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      audit.error = "That URL points somewhere we can't audit (private or internal address).";
      setStep(audit, "failed_blocked", "Blocked", 100);
      refund("SSRF-blocked URL");
      return;
    }
    audit.error = err instanceof Error ? err.message.slice(0, 200) : "Unknown error";
    setStep(audit, "failed_error", "Failed", 100);
    refund("internal error");
    console.error(`[audit ${auditId}] failed:`, err);
  }
}
