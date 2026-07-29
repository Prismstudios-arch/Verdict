import { config } from "./config.js";
import { db, persist, type AuditRecord } from "./store.js";
import { enqueueAudit, onAuditFinished } from "./pipeline/run.js";
import { sendPush } from "./push.js";

/**
 * Weekly re-scan monitoring (Verdict Pro).
 *
 * Every MONITOR_PERIOD (default 7 days) each monitored site is re-audited
 * automatically — free for Pro users (it does not debit credits; it's the
 * perk that makes the subscription worth renewing). When the score changes
 * vs the previous scan, the user gets a push: "yoursite.com dropped 71 → 64".
 *
 * Volume is naturally bounded: max 3 monitors per Pro user, one run per week.
 */

const TICK_MS = Math.min(config.monitorPeriodMs, 15 * 60 * 1000);

export function startMonitorScheduler(): void {
  onAuditFinished(handleAuditFinished);
  setInterval(checkDueMonitors, TICK_MS).unref();
  setTimeout(checkDueMonitors, 30_000).unref(); // first pass shortly after boot
  console.log(
    `[monitor] scheduler started (period ${(config.monitorPeriodMs / 3_600_000).toFixed(1)}h, tick ${(TICK_MS / 1000).toFixed(0)}s)`,
  );
}

function isTerminal(status: AuditRecord["status"]): boolean {
  return status === "complete" || status === "failed_blocked" || status === "failed_error";
}

export function checkDueMonitors(): void {
  const now = Date.now();
  for (const mon of Object.values(db.monitors ?? {})) {
    const user = db.users[mon.userId];
    if (!user) continue;
    if (user.entitlement !== "pro") continue; // Pro perk — paused if sub lapses

    // Self-heal: clear a pending pointer whose audit finished or vanished
    // (e.g. the server restarted mid-run and boot recovery failed it).
    if (mon.pendingAuditId) {
      const pending = db.audits[mon.pendingAuditId];
      if (pending && !isTerminal(pending.status)) continue;
      mon.pendingAuditId = null;
    }

    const last = mon.lastRunAt ? Date.parse(mon.lastRunAt) : 0;
    if (now - last < config.monitorPeriodMs) continue;

    const audit: AuditRecord = {
      id: crypto.randomUUID(),
      userId: mon.userId,
      url: mon.url,
      status: "queued",
      step: "Queued",
      percent: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.audits[audit.id] = audit;
    mon.pendingAuditId = audit.id;
    mon.lastRunAt = new Date().toISOString();
    persist();
    enqueueAudit(audit.id);
    console.log(`[monitor] weekly re-scan started for ${mon.domain}`);
  }
}

function handleAuditFinished(audit: AuditRecord): void {
  const mon = Object.values(db.monitors ?? {}).find((m) => m.pendingAuditId === audit.id);
  if (!mon) return;
  mon.pendingAuditId = null;

  if (audit.status !== "complete" || !audit.report) {
    persist();
    console.log(`[monitor] re-scan of ${mon.domain} did not complete (${audit.status})`);
    return;
  }

  const newScore = audit.report.scores.overall;
  const prevScore = mon.lastScore;
  mon.lastScore = newScore;
  persist();

  const user = db.users[mon.userId];
  if (!user?.pushToken) {
    console.log(`[monitor] ${mon.domain}: ${prevScore} → ${newScore} (no push token)`);
    return;
  }
  // AI sub-scores naturally jitter a point or two between runs — only alert
  // on meaningful movement, or weekly pings become noise users ignore.
  const delta = prevScore === null ? 0 : newScore - prevScore;
  if (prevScore === null || Math.abs(delta) < config.monitorAlertThreshold) {
    console.log(`[monitor] ${mon.domain}: ${prevScore} → ${newScore} — below alert threshold`);
    return;
  }
  void sendPush(
    user.pushToken,
    delta > 0 ? `${mon.domain} improved 📈` : `${mon.domain} dropped 📉`,
    `Score ${prevScore} → ${newScore} (${delta > 0 ? "+" : ""}${delta}). Tap to see what changed.`,
    { auditId: audit.id },
  );
}
