# Build Notes — Verdict v0.1

What was built, what was verified, where it deviates from the original brief, and what's still open. Honest engineering: nothing below is hand-waved.

## Your two overrides (vs the brief)

1. **Expo Go SDK 54 instead of Swift/SwiftUI** — the whole app is React Native (Expo Router, Reanimated, RN SVG) and runs in Expo Go today. The design language follows the brief: near-black `#0B0D10`, acid green `#C6FF3D`, dark-first, spring animations, haptics on the score reveal.
2. **RevenueCat instead of raw StoreKit 2** — `react-native-purchases` is integrated behind `mobile/src/purchases.ts`. Expo Go cannot run native IAP, so inside Expo Go the paywall runs in labeled test mode (simulated via a dev-only server endpoint that drives the same entitlement path as the real webhook). A dev build + RC keys flips it to real StoreKit purchases with no code changes.

## Verified working (ran, not assumed)

- **88 server tests green** (exhaustive SSRF suite + scoring determinism); server + mobile typecheck clean; ESLint clean; Metro iOS bundle exports successfully.
- **End-to-end audit against expo.dev (live site):** mobile 390×844@3x + desktop 1440×900 capture, TTFB/LCP/weight/request metrics, DOM extraction (headings, CTAs, tap targets, labels, alt text), 3-page CTA walk with form detection, screenshots, deterministic scores, composite + grade, signed screenshot URLs, public report page, share card SVG.
- **Hostile URLs rejected at the API** (live test): `localhost`, `169.254.169.254`, `192.168.x`, `[::1]`, `db.internal`, `file://` → all 422. Test suite additionally caught + fixed a real hole: WHATWG URL normalizes IPv4-mapped IPv6 to hex form (`::ffff:a00:1`), now decoded and blocked.
- **Purchase → entitlement flow:** simulate-purchase → `pro` + 30 credits granted server-side; forged webhook without secret → 401; duplicate webhook events deduped by event id.
- **Failure honesty:** blocked/unreachable/error audits set `failed_blocked`/`failed_error`, auto-refund the credit as a ledger entry, and the app says so plainly.

## Architecture decisions (dev-focused, with production path)

| Area | Now (local dev) | Production path |
|---|---|---|
| Queue | In-process queue, concurrency cap 2 (`pipeline/run.ts`) | BullMQ + Upstash Redis; same step/state contract |
| DB | JSON file store (`store.ts`) mirroring the intended schema (users/audits/ledger/entitlements) | Postgres + Drizzle behind the same interface |
| Screenshots | Local `storage/` + HMAC signed URLs (1h expiry) | Cloudflare R2 presigned URLs |
| Share card | Self-contained SVG | Rasterize to PNG (satori/resvg) — needed for OG images (most crawlers ignore SVG `og:image`) |
| Auth | Anonymous device id → JWT 15min + single-use rotating refresh tokens | Add Sign in with Apple exchange + anonymous→account merge |
| Hosting | Your PC | Fly.io/Railway container (Playwright needs a real container, not serverless) |

## LLM pipeline (per brief §Phase 2)

Three focused `claude-sonnet-4-6` calls, not one prompt: (a) first impression from the mobile above-fold screenshot only, (b) copy & conversion from extracted text + CTA inventory (produces the verdict paragraph + exact rewrites), (c) trust & flow from the interaction-walk results. All calls: JSON-schema-constrained output (`output_config.format`), re-validated with zod before storage, system prompt frames all site content as untrusted data. Screenshots captured at CSS scale to keep image tokens low. Cost logged per audit. No API key → labeled demo mode with neutral placeholder sub-scores (never fabricated judgments).

Weights per brief: clarity 25 / copy 25 / mobile 20 / performance 15 / trust 10 / accessibility 5.

## App Store readiness (added in the publication pass)

- **Free AI option:** Gemini (Google AI Studio free tier) is a first-class provider alongside Claude — `GEMINI_API_KEY` in `server/.env`, auto-selected when no Anthropic key. Same three-call pipeline, same zod validation, £0.00.
- **Restart safety:** audits interrupted by a server/PC shutdown are detected at next boot, marked failed, and auto-refunded.
- **Compliance:** `/privacy` + `/terms` pages served by the API (linked from the paywall per guideline 3.1.2); "Delete my data" in Settings → `DELETE /v1/me` wipes user, audits, ledger, screenshots (guideline 5.1.1(v)); no ATT needed (no tracking).
- **App icon:** real icon set generated (ring-gauge at 3/4, acid green on near-black, per the brief) — iOS 1024, splash, Android adaptive (fg/bg/monochrome), favicon. Regenerate anytime: `cd server && node scripts/generate-icons.mjs`.
- **Production config:** `mobile/eas.json` (dev/preview/production profiles, `EXPO_PUBLIC_API_URL` + RC key baked at build time), `server/Dockerfile` + `.dockerignore` for Railway/Fly/VPS.
- **Docs:** `store/APP_STORE.md` (metadata, privacy labels, review notes, screenshot plan) and `store/PUBLISHING.md` (step-by-step to submission).

## Anti-abuse (free-credit farming)

Three layers, in order of strength:
1. **Keychain device id** (`mobile/src/device.ts`, `expo-secure-store`) — the device id lives in the iOS Keychain, which is **not** wiped on uninstall. A user who deletes + reinstalls to get another free credit gets the same id back, so the server treats them as returning (no new grant). This closes the exploit for essentially all normal users. AsyncStorage is a wiped-on-uninstall mirror kept only for migration/fallback.
2. **Per-IP new-user cap** (`NEW_USER_IP_CAP_PER_DAY`, default 25) — backstop against bulk farming from one network; over the cap, new accounts are created with 0 free credits (they can still buy). Uses the spoof-resistant `Fly-Client-IP`/`X-Real-IP` header, not the client-settable XFF. Tested live.
3. **Per-IP/per-user rate limits + global daily audit cap** — existing throttles, now correct behind a proxy (`trustProxy`).

Still farmable by a determined attacker who factory-resets or rotates real devices+IPs; the gold-standard fix is Apple **DeviceCheck/App Attest** (per-device bit that survives even a wipe), which needs a native module + the dev build — deferred (see gap 1).

## Known gaps (deliberately deferred, in rough priority order)

1. **App Attest / DeviceCheck** — the un-farmable device signal; needs a native module (not in Expo Go). The Keychain id + per-IP cap above cover the casual case; add this post-launch for hardened anti-abuse. `FREE_AUDIT_CREDITS=1` in production keeps the blast radius small regardless.
2. **Sign in with Apple** — everything is device-anonymous (which also means no account-creation requirement from Apple). History carries per device, not per account; lost device = lost history.
3. ~~Push notifications + automatic re-scan monitoring~~ **BUILT into v1**: `server/src/monitor.ts` + `push.ts` + `expo-notifications`. Pro-only, max 3 sites/user, weekly period (`MONITOR_PERIOD_MS`), doesn't debit credits, alert threshold ±3 points (`MONITOR_ALERT_THRESHOLD`) so AI score jitter doesn't spam users. Smoke-tested end-to-end with a 20s test period. Requires the EAS push credential (answer YES during `eas build`).
4. **Competitor compare** (Pro feature) — side-by-side compare not built; re-scan diff exists.
5. **Widgets, share extension, App Intents** (brief Phase 5) — all need a dev build; not started.
6. **Accessibility contrast sampling** — a11y score covers alt text, labels, heading hierarchy, tap targets; contrast is not yet sampled.
7. **robots.txt** — entry page is always fetched (industry-standard for user-requested audits); the CTA walk does not yet consult robots.txt for depth.
8. **DNS rebinding** — mitigated (per-host re-resolution + per-request interception + private-range aborts), not fully pinned (would need proxy-level IP pinning).
9. **Blurred second-audit teaser on the paywall** (brief Phase 4.3) — paywall shows after credits run out; teaser art not built.

## Post-v0.1 features added (before first TestFlight)

- **PDF export** (`GET /r/:id/pdf`, `render.ts` → `pdfReportHtml` + Playwright `page.pdf()`) — light, client-ready layout; Pro-gated in the app (`report/[id].tsx` `exportPdf`). The agency/freelancer selling point.
- **PNG share cards** (`GET /r/:id/card.png` + `card-wide.png`, SVG→PNG via `render.ts svgToPng`) — fixes social link previews; OG/Twitter tags now point at the PNG. `PUBLIC_URL` env makes those absolute (set in fly.toml). Tested — card renders correctly.
- **Sample verdict** (`GET /v1/sample`, `sample.ts`) — curated example (fictional "lumina.app") shown on Home via "See a sample verdict — no credit"; the app renders it through the normal report screen (`getAudit("sample")`), with share/re-scan/PDF hidden and an "Audit your own site" CTA.
- **Re-scan diff** (`run.ts computeDiff`, `report.diff`) — a re-scan of the same site by the same user shows "▲ +9 since your last scan (77 · B, date) · critical issues 2 → 1". Tested live (77 → 67 captured a −10 delta).
10. **State is a JSON snapshot, not Postgres rows** — with Supabase configured, the snapshot + screenshots are mirrored to Supabase Storage (survives ephemeral-disk hosts; single-instance only). A crash between debounced saves can lose the last ~1s of writes; boot recovery refunds interrupted audits. Migrate to real Postgres tables (the schema shapes in `store.ts` map 1:1) when past ~low-thousands of users. Note: the Supabase mirror code is defensive but was written without live Supabase credentials — verify once with your project before launch (start the server, run an audit, check the bucket has `state/db.json` + `shots/…`).
11. **Crash monitoring** (Sentry) — optional post-launch item in PUBLISHING.md.
12. **Placeholder contact email** in `server/src/routes.ts` (`CONTACT_EMAIL`) must be replaced before submission.

## File map

```
server/src/
  ssrf.ts + ssrf.test.ts     SSRF guard (the security-critical piece, 70+ cases)
  pipeline/capture.ts        Playwright: mobile+desktop capture, CTA walk, metrics
  pipeline/deterministic.ts  measured perf / a11y / mobile-readiness scores
  pipeline/llm.ts            3 Claude calls, schema-constrained, untrusted-data framing
  pipeline/score.ts(.test)   weighted composite + grades
  pipeline/run.ts            job queue + honest step/percent state machine
  routes.ts                  auth, audits, files, webhooks, public report
  sharecard.ts               1080×1350 + 1200×630 SVG cards
mobile/
  app/                       index (Home), onboarding, auditing/[id], report/[id],
                             history, settings, paywall (modal)
  src/components/            ScoreRing (haptic count-up), GradeBadge, FindingCard
                             (copy-rewrite + copy button), ProgressTimeline,
                             SubScoreBars, Skeleton, PrimaryButton, AuditRow
  src/api.ts                 auto LAN discovery, token refresh rotation
  src/purchases.ts           RevenueCat wrapper with Expo Go fallback
```
