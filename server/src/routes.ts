import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { issueTokenPair, requireAuth, rotateRefreshToken } from "./auth.js";
import { auditCreateRateLimit, generalRateLimit } from "./rateLimit.js";
import { addLedgerEntry, auditsForUser, db, findUserByDevice, persist, type AuditRecord } from "./store.js";
import { assertPublicUrl, SsrfBlockedError } from "./ssrf.js";
import { sbDownload, supabaseEnabled } from "./supabase.js";
import { clientIp } from "./net.js";
import { enqueueAudit } from "./pipeline/run.js";
import { signFilePath, verifyFileToken } from "./signing.js";
import { renderShareCard } from "./sharecard.js";
import { htmlToPdf, pdfReportHtml, svgToPng } from "./render.js";
import { sampleAuditSummary } from "./sample.js";

const urlBody = z.object({ url: z.string().min(4).max(2048) });
const deviceBody = z.object({ deviceId: z.string().min(8).max(128) });
const refreshBody = z.object({ refreshToken: z.string().min(10).max(256) });

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

function serializeAudit(a: AuditRecord, full: boolean) {
  const base = {
    id: a.id,
    url: a.url,
    status: a.status,
    step: a.step,
    percent: a.percent,
    createdAt: a.createdAt,
    error: a.error ?? null,
    score: a.report?.scores.overall ?? null,
    grade: a.report?.scores.grade ?? null,
    domain: a.report?.domain ?? safeDomain(a.url),
    verdictLine: a.report?.verdictLine ?? null,
  };
  if (!full || !a.report) return base;
  const r = a.report;
  return {
    ...base,
    report: {
      ...r,
      screenshots: {
        mobileFold: r.screenshots.mobileFold ? signFilePath(r.screenshots.mobileFold) : null,
        mobileFull: r.screenshots.mobileFull ? signFilePath(r.screenshots.mobileFull) : null,
        desktopFold: r.screenshots.desktopFold ? signFilePath(r.screenshots.desktopFold) : null,
        walk: r.screenshots.walk.map((w) => ({ ...w, path: w.path ? signFilePath(w.path) : null })),
      },
      shareUrl: `/r/${a.id}`,
      shareCardUrl: `/r/${a.id}/card.svg`,
    },
  };
}

function safeDomain(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Content-Security-Policy for the public HTML pages: blocks ALL script
// execution (script-src falls back to default-src 'none'), so even a
// hypothetical unescaped value can never run JS. Inline styles are allowed
// (the pages use a <style> block); images come from self + data URIs.
const HTML_CSP =
  "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", (req, reply, done) => generalRateLimit(req, reply, done));

  // Baseline security headers on every response.
  app.addHook("onSend", (_req, reply, payload, done) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    const ct = String(reply.getHeader("content-type") ?? "");
    if (ct.includes("text/html")) reply.header("content-security-policy", HTML_CSP);
    done(null, payload);
  });

  app.get("/healthz", async () => ({ ok: true, uptime: process.uptime() }));

  // Curated sample verdict — shown on the home screen so new users see the
  // value before spending a credit. No auth, no credit.
  app.get("/v1/sample", async () => sampleAuditSummary);

  // ---- Auth: anonymous device flow with refresh rotation ----
  // GAP vs brief: Apple App Attest verification requires a real app identity
  // and does not exist inside Expo Go — the deviceId here is app-generated.
  app.post("/v1/auth/anonymous", async (req, reply) => {
    const parsed = deviceBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    let user = findUserByDevice(parsed.data.deviceId);
    if (!user) {
      // Anti-abuse: the Keychain device id (client side) already survives
      // reinstalls. As a backstop against bulk farming from one network,
      // cap how many NEW free-credit grants a single IP gets per day. Over
      // the cap, the account is still created — just with 0 free credits, so
      // a real user can still buy, but a farmer can't mint endless trials.
      let grantCredits = config.freeCredits;
      if (config.newUserIpCapPerDay > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const ip = clientIp(req);
        let byIp = db.newUsersByIp ?? {};
        // Reset the whole map on a new day so it can't grow without bound.
        if (byIp.__date && byIp.__date.date !== today) byIp = {};
        byIp.__date = { date: today, count: 0 };
        db.newUsersByIp = byIp;
        const entry = byIp[ip];
        const current = entry && entry.date === today ? entry.count : 0;
        if (current >= config.newUserIpCapPerDay) {
          grantCredits = 0;
          req.log.warn({ ip }, "new-user IP cap hit — granting 0 free credits");
        } else {
          byIp[ip] = { date: today, count: current + 1 };
        }
      }
      user = {
        id: crypto.randomUUID(),
        deviceId: parsed.data.deviceId,
        createdAt: new Date().toISOString(),
        credits: 0,
        entitlement: "free",
        entitlementExpiresAt: null,
        refreshTokens: [],
      };
      db.users[user.id] = user;
      persist();
      if (grantCredits > 0) addLedgerEntry(user.id, grantCredits, "welcome credits");
    }
    const pair = issueTokenPair(user);
    return { userId: user.id, ...pair };
  });

  app.post("/v1/auth/refresh", async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const rotated = rotateRefreshToken(parsed.data.refreshToken);
    if (!rotated) return reply.code(401).send({ error: "invalid_refresh_token" });
    return { userId: rotated.user.id, ...rotated.pair };
  });

  // Account/data deletion (App Store guideline 5.1.1(v) + GDPR): wipes the
  // user, their audits, ledger entries, and screenshot files.
  app.delete("/v1/me", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    for (const audit of Object.values(db.audits)) {
      if (audit.userId !== userId) continue;
      delete db.audits[audit.id];
      fs.rmSync(path.join(config.storageDir, audit.id), { recursive: true, force: true });
    }
    db.ledger = db.ledger.filter((l) => l.userId !== userId);
    delete db.users[userId];
    persist();
    req.log.info({ userId }, "user data deleted");
    return { ok: true };
  });

  app.get("/v1/me", { preHandler: requireAuth }, async (req) => {
    const user = db.users[req.userId!];
    const active =
      user.entitlement === "pro" &&
      (!user.entitlementExpiresAt || user.entitlementExpiresAt > new Date().toISOString());
    return {
      userId: user.id,
      credits: user.credits,
      entitlement: active ? "pro" : "free",
      entitlementExpiresAt: user.entitlementExpiresAt,
      ledger: db.ledger.filter((l) => l.userId === user.id).slice(-20).reverse(),
    };
  });

  // ---- Audits ----
  app.post(
    "/v1/audits",
    { preHandler: [requireAuth, auditCreateRateLimit] },
    async (req, reply) => {
      const parsed = urlBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_url" });
      const url = normalizeUrl(parsed.data.url);

      try {
        await assertPublicUrl(url);
      } catch (err) {
        const msg = err instanceof SsrfBlockedError ? err.message : "URL rejected";
        return reply.code(422).send({ error: "url_rejected", message: msg });
      }

      const user = db.users[req.userId!];
      if (user.credits <= 0) {
        return reply.code(402).send({ error: "no_credits", message: "You're out of audit credits." });
      }

      // Global daily cap — protects free-tier AI quotas when running on a
      // free stack (MAX_AUDITS_PER_DAY in .env; 0 = unlimited).
      if (config.maxAuditsPerDay > 0) {
        const today = new Date().toISOString().slice(0, 10);
        if (!db.dailyCounter || db.dailyCounter.date !== today) {
          db.dailyCounter = { date: today, count: 0 };
        }
        if (db.dailyCounter.count >= config.maxAuditsPerDay) {
          return reply.code(429).send({
            error: "capacity",
            message: "Verdict is at full capacity today — your credit wasn't used. Try again tomorrow.",
          });
        }
        db.dailyCounter.count++;
      }

      const audit: AuditRecord = {
        id: crypto.randomUUID(),
        userId: user.id,
        url,
        status: "queued",
        step: "Queued",
        percent: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.audits[audit.id] = audit;
      addLedgerEntry(user.id, -1, "audit", audit.id);
      enqueueAudit(audit.id);
      req.log.info({ auditId: audit.id, domain: safeDomain(url) }, "audit enqueued");
      return reply.code(201).send(serializeAudit(audit, false));
    },
  );

  app.get("/v1/audits", { preHandler: requireAuth }, async (req) => {
    return { audits: auditsForUser(req.userId!).slice(0, 50).map((a) => serializeAudit(a, false)) };
  });

  app.get("/v1/audits/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const audit = db.audits[id];
    if (!audit || audit.userId !== req.userId) return reply.code(404).send({ error: "not_found" });
    return serializeAudit(audit, true);
  });

  app.get("/v1/audits/:id/share-card", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const audit = db.audits[id];
    if (!audit || audit.userId !== req.userId || !audit.report) {
      return reply.code(404).send({ error: "not_found" });
    }
    return { shareUrl: `/r/${id}`, cardUrl: `/r/${id}/card.svg`, cardUrlWide: `/r/${id}/card-wide.svg` };
  });

  // ---- Push tokens + weekly monitoring (Pro) ----
  const pushTokenBody = z.object({ token: z.string().min(10).max(200) });
  app.post("/v1/push-token", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = pushTokenBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    db.users[req.userId!].pushToken = parsed.data.token;
    persist();
    return { ok: true };
  });

  const serializeMonitor = (m: import("./store.js").MonitorRecord) => ({
    id: m.id,
    url: m.url,
    domain: m.domain,
    createdAt: m.createdAt,
    lastRunAt: m.lastRunAt,
    lastScore: m.lastScore,
  });

  app.get("/v1/monitors", { preHandler: requireAuth }, async (req) => {
    const monitors = Object.values(db.monitors ?? {})
      .filter((m) => m.userId === req.userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { monitors: monitors.map(serializeMonitor) };
  });

  const monitorBody = z.object({ url: z.string().min(4).max(500) });
  app.post("/v1/monitors", { preHandler: requireAuth }, async (req, reply) => {
    const user = db.users[req.userId!];
    if (user.entitlement !== "pro") {
      return reply.code(403).send({ error: "pro_required", message: "Weekly monitoring is a Pro feature." });
    }
    const parsed = monitorBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });

    let url: string;
    let domain: string;
    try {
      url = normalizeUrl(parsed.data.url);
      await assertPublicUrl(url);
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return reply.code(422).send({ error: "invalid_url", message: "That URL can't be monitored." });
    }

    const mine = Object.values(db.monitors ?? {}).filter((m) => m.userId === user.id);
    const existing = mine.find((m) => m.domain === domain);
    if (existing) return { monitor: serializeMonitor(existing) };
    if (mine.length >= config.maxMonitorsPerUser) {
      return reply.code(400).send({
        error: "monitor_limit",
        message: `You can monitor up to ${config.maxMonitorsPerUser} sites. Remove one in Settings first.`,
      });
    }

    // Baseline = the user's most recent completed audit of this site, so the
    // first weekly run can already report a change.
    const latest = auditsForUser(user.id).find(
      (a) => a.status === "complete" && a.report?.domain === domain,
    );
    const monitor: import("./store.js").MonitorRecord = {
      id: crypto.randomUUID(),
      userId: user.id,
      url,
      domain,
      createdAt: new Date().toISOString(),
      lastRunAt: new Date().toISOString(),
      lastScore: latest?.report?.scores.overall ?? null,
      pendingAuditId: null,
    };
    (db.monitors ??= {})[monitor.id] = monitor;
    persist();
    req.log.info({ domain }, "monitor created");
    return { monitor: serializeMonitor(monitor) };
  });

  app.delete("/v1/monitors/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const monitor = db.monitors?.[id];
    if (!monitor || monitor.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }
    delete db.monitors![id];
    persist();
    return { ok: true };
  });

  // ---- Signed screenshot files ----
  app.get("/v1/files/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const abs = verifyFileToken(token);
    if (!abs) return reply.code(404).send({ error: "not_found" });
    // Ephemeral-disk hosts: if the local file was wiped by a restart,
    // restore it from the Supabase mirror and cache it back to disk.
    if (!fs.existsSync(abs) && supabaseEnabled()) {
      const rel = path.relative(config.storageDir, abs).replace(/\\/g, "/");
      const buf = await sbDownload(`shots/${rel}`);
      if (buf) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, buf);
      }
    }
    if (!fs.existsSync(abs)) return reply.code(404).send({ error: "not_found" });
    reply.header("cache-control", "private, max-age=300");
    reply.type(abs.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream");
    return reply.send(fs.createReadStream(abs));
  });

  // ---- Public read-only report page + share card (growth surface) ----
  app.get("/r/:id/card.svg", async (req, reply) => {
    const { id } = req.params as { id: string };
    const audit = db.audits[id];
    if (!audit?.report) return reply.code(404).send("Not found");
    reply.type("image/svg+xml").header("cache-control", "public, max-age=3600");
    return renderShareCard(audit.report, "portrait");
  });

  app.get("/r/:id/card-wide.svg", async (req, reply) => {
    const { id } = req.params as { id: string };
    const audit = db.audits[id];
    if (!audit?.report) return reply.code(404).send("Not found");
    reply.type("image/svg+xml").header("cache-control", "public, max-age=3600");
    return renderShareCard(audit.report, "landscape");
  });

  // PNG cards — social platforms (X, iMessage, LinkedIn) don't render SVG OG
  // images, so these rasterized versions are what actually preview.
  app.get("/r/:id/card.png", async (req, reply) => {
    const { id } = req.params as { id: string };
    const audit = db.audits[id];
    if (!audit?.report) return reply.code(404).send("Not found");
    const png = await svgToPng(renderShareCard(audit.report, "portrait"), 1080, 1350);
    reply.type("image/png").header("cache-control", "public, max-age=86400");
    return reply.send(png);
  });

  app.get("/r/:id/card-wide.png", async (req, reply) => {
    const { id } = req.params as { id: string };
    const audit = db.audits[id];
    if (!audit?.report) return reply.code(404).send("Not found");
    const png = await svgToPng(renderShareCard(audit.report, "landscape"), 1200, 630);
    reply.type("image/png").header("cache-control", "public, max-age=86400");
    return reply.send(png);
  });

  // PDF export — the client-ready deliverable (agencies/freelancers).
  app.get("/r/:id/pdf", async (req, reply) => {
    const { id } = req.params as { id: string };
    const audit = db.audits[id];
    if (!audit?.report) return reply.code(404).send("Not found");
    const pdf = await htmlToPdf(pdfReportHtml(audit.report));
    reply
      .type("application/pdf")
      .header("cache-control", "public, max-age=3600")
      .header("content-disposition", `inline; filename="verdict-${audit.report.domain}.pdf"`);
    return reply.send(pdf);
  });

  app.get("/r/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const audit = db.audits[id];
    if (!audit?.report) return reply.code(404).type("text/html").send("<h1>Report not found</h1>");
    reply.type("text/html");
    return publicReportHtml(audit);
  });

  // ---- Legal pages (App Store requires these URLs for subscription apps) ----
  app.get("/privacy", async (_req, reply) => {
    reply.type("text/html").header("cache-control", "public, max-age=3600");
    return legalPage("Privacy Policy", PRIVACY_HTML);
  });

  app.get("/terms", async (_req, reply) => {
    reply.type("text/html").header("cache-control", "public, max-age=3600");
    return legalPage("Terms of Use", TERMS_HTML);
  });

  // ---- RevenueCat webhook (server-side entitlements) ----
  app.post("/v1/webhooks/revenuecat", async (req, reply) => {
    const auth = req.headers.authorization ?? "";
    if (!config.rcWebhookSecret || !timingSafeEqualStr(auth, `Bearer ${config.rcWebhookSecret}`)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = req.body as { event?: Record<string, unknown> };
    const event = body?.event;
    if (!event || typeof event !== "object") return reply.code(400).send({ error: "invalid_body" });
    applyRevenueCatEvent(event);
    return { ok: true };
  });

  // ---- Dev-only: simulate a purchase (Expo Go can't run native IAP) ----
  if (config.devMode) {
    app.post("/v1/dev/simulate-purchase", { preHandler: requireAuth }, async (req, reply) => {
      const parsed = z
        .object({ product: z.enum(["pro_monthly", "pro_yearly", "credits_5"]) })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
      const product = parsed.data.product;
      applyRevenueCatEvent({
        id: crypto.randomUUID(),
        type: product === "credits_5" ? "NON_RENEWING_PURCHASE" : "INITIAL_PURCHASE",
        app_user_id: req.userId,
        product_id: product,
        entitlement_ids: product === "credits_5" ? [] : ["pro"],
        expiration_at_ms:
          product === "credits_5"
            ? null
            : Date.now() + (product === "pro_yearly" ? 365 : 30) * 24 * 3600 * 1000,
      });
      req.log.info({ userId: req.userId, product }, "dev purchase simulated");
      return { ok: true };
    });
  }
}

// Constant-time string compare (avoids leaking the secret via response timing).
function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function applyRevenueCatEvent(event: Record<string, unknown>): void {
  const eventId = String(event.id ?? "");
  if (eventId && db.processedWebhookEvents.includes(eventId)) return;
  if (eventId) {
    db.processedWebhookEvents.push(eventId);
    if (db.processedWebhookEvents.length > 2000) db.processedWebhookEvents.splice(0, 1000);
  }

  const userId = String(event.app_user_id ?? "");
  const user = db.users[userId];
  if (!user) return;

  const type = String(event.type ?? "");
  const productId = String(event.product_id ?? "");
  const expiration = typeof event.expiration_at_ms === "number" ? new Date(event.expiration_at_ms).toISOString() : null;

  switch (type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE": {
      if (productId.startsWith("pro")) {
        user.entitlement = "pro";
        user.entitlementExpiresAt = expiration;
        addLedgerEntry(userId, config.proMonthlyCredits, `pro ${type.toLowerCase()} (${productId})`);
      }
      break;
    }
    case "NON_RENEWING_PURCHASE": {
      addLedgerEntry(userId, config.creditPackSize, `credit pack (${productId})`);
      break;
    }
    case "EXPIRATION": {
      user.entitlement = "free";
      user.entitlementExpiresAt = null;
      break;
    }
    // CANCELLATION: access continues until EXPIRATION — nothing to do.
  }
  persist();
}

function esc(s: string): string {
  // Escape for both text and attribute contexts (quotes included).
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ⚠️ Before App Store submission: replace the placeholder contact address
// below with a real one you monitor (Apple checks the privacy policy URL).
const CONTACT_EMAIL = "VerdictAI2026@outlook.com";

const PRIVACY_HTML = `
<p><em>Last updated: 15 July 2026</em></p>
<h2>What we collect</h2>
<ul>
  <li><strong>URLs you audit</strong> and the screenshots, text and measurements our crawler captures from those public websites — kept so you can revisit your reports.</li>
  <li><strong>A random device identifier</strong> created on first launch, used to keep your audit history and credits without requiring an account, email, or name.</li>
  <li><strong>Purchase state</strong> (subscription/credit status), processed by Apple and RevenueCat. We never see your payment details.</li>
</ul>
<h2>What we don't do</h2>
<ul>
  <li>No selling or sharing of your data with third parties for their own purposes.</li>
  <li>No advertising, no tracking across other apps or websites.</li>
  <li>No collection of names, emails, contacts, or location.</li>
</ul>
<h2>AI processing</h2>
<p>Screenshots and text extracted from the websites you audit are sent to an AI provider (Anthropic or Google) solely to generate your report.</p>
<h2>Deletion</h2>
<p>Settings → “Delete my data” permanently removes your audits, screenshots, credits, and identifier from our servers, immediately.</p>
<h2>Contact</h2>
<p>${CONTACT_EMAIL}</p>`;

const TERMS_HTML = `
<p><em>Last updated: 15 July 2026</em></p>
<ul>
  <li><strong>The service.</strong> Verdict audits publicly accessible websites you ask us to review and produces automated reports. Reports are opinions generated by software and AI — use your own judgment before acting on them.</li>
  <li><strong>Acceptable use.</strong> Only audit websites you own or are permitted to review. Don't use Verdict to attack, scrape, or overload sites.</li>
  <li><strong>Credits & subscriptions.</strong> Each audit uses one credit. Failed or blocked audits are refunded automatically. Verdict Pro renews automatically until cancelled in your Apple ID settings; payment is charged to your Apple account. Prices are shown in the app before purchase.</li>
  <li><strong>No warranty.</strong> The service is provided “as is”, without warranties of any kind. Scores can change between runs as websites and models change.</li>
  <li><strong>Liability.</strong> To the maximum extent permitted by law, our liability is limited to the amount you paid in the last 12 months.</li>
</ul>
<h2>Contact</h2>
<p>${CONTACT_EMAIL}</p>`;

function legalPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Verdict</title>
<style>
  body{background:#0B0D10;color:#F2F4F6;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px;max-width:680px;margin-inline:auto;line-height:1.6}
  h1{letter-spacing:-0.5px} h2{margin-top:28px} a{color:#C6FF3D}
  em{color:#8A929C} li{margin-bottom:10px}
</style></head><body>
<p style="color:#8A929C;letter-spacing:4px">VERDICT</p>
<h1>${title}</h1>
${body}
</body></html>`;
}

function publicReportHtml(audit: AuditRecord): string {
  const r = audit.report!;
  const findingsHtml = r.findings
    .map(
      (f) => `<div class="finding ${f.severity}">
      <div class="sev">${f.severity.toUpperCase()}</div>
      <h3>${esc(f.issue)}</h3>
      <p class="ev">${esc(f.evidence)}</p>
      <p>${esc(f.fix)}</p>
      ${f.rewriteAfter ? `<div class="rewrite"><del>${esc(f.rewriteBefore)}</del><ins>${esc(f.rewriteAfter)}</ins></div>` : ""}
    </div>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.domain)} scored ${r.scores.overall}/100 — Verdict</title>
<meta property="og:title" content="${esc(r.domain)} scored ${r.scores.overall}/100 (${esc(r.scores.grade)}) on Verdict">
<meta property="og:description" content="${esc(r.verdictLine)}">
<meta property="og:image" content="${config.publicUrl}/r/${audit.id}/card-wide.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(r.domain)} scored ${r.scores.overall}/100 on Verdict">
<meta name="twitter:description" content="${esc(r.verdictLine)}">
<meta name="twitter:image" content="${config.publicUrl}/r/${audit.id}/card-wide.png">
<style>
  body{background:#0B0D10;color:#F2F4F6;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px;max-width:680px;margin-inline:auto}
  .score{font-size:96px;font-weight:800;color:#C6FF3D;margin:0}
  .grade{font-size:28px;color:#C6FF3D;font-weight:700}
  .dim{color:#8A929C}
  .verdict{font-size:20px;font-style:italic;border-left:3px solid #C6FF3D;padding-left:16px;margin:24px 0}
  .finding{background:#12161B;border-radius:14px;padding:16px 18px;margin:12px 0;border-left:4px solid #555}
  .finding.critical{border-left-color:#FF5D5D}.finding.major{border-left-color:#FFC53D}.finding.minor{border-left-color:#8A929C}
  .sev{font-size:11px;letter-spacing:2px;color:#8A929C}
  .ev{color:#8A929C;font-style:italic}
  .rewrite del{color:#FF5D5D;display:block;text-decoration:line-through}
  .rewrite ins{color:#C6FF3D;display:block;text-decoration:none}
  h3{margin:6px 0}
  footer{margin:48px 0;color:#8A929C;text-align:center}
</style></head><body>
<p class="dim" style="letter-spacing:4px">VERDICT</p>
<h1>${esc(r.domain)}</h1>
<p class="score">${r.scores.overall}<span class="dim" style="font-size:32px">/100</span> <span class="grade">${esc(r.scores.grade)}</span></p>
<p class="verdict">“${esc(r.verdictLine)}”</p>
<p>${esc(r.verdictParagraph)}</p>
<p class="dim">Clarity ${r.scores.clarity} · Copy ${r.scores.copy} · Mobile ${r.scores.mobile} · Performance ${r.scores.performance} · Trust ${r.scores.trust} · Accessibility ${r.scores.accessibility}</p>
<h2>Findings</h2>
${findingsHtml || '<p class="dim">No findings recorded.</p>'}
<footer>Judged the way visitors actually see it — on a phone.<br>Get your score with Verdict.</footer>
</body></html>`;
}
