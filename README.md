# Verdict — AI Website Audit

Paste a URL → get judged the way real visitors see you: **on a phone**. Score, grade, spicy verdict line, specific copy rewrites, and a shareable report — in about a minute.

Two parts:

| Folder | What | Stack |
|---|---|---|
| `mobile/` | iOS app, runs in **Expo Go (SDK 54)** | Expo Router, Reanimated, RN SVG, RevenueCat |
| `server/` | Audit engine + API | Node 20+, Fastify, Playwright (Chromium), Claude Sonnet 4.6 |

---

## Quick start (test on your phone in ~3 minutes)

### 1. Start the server (this PC)

```powershell
cd server
copy .env.example .env
# Edit .env → add ONE AI key:
#   GEMINI_API_KEY     — FREE: https://aistudio.google.com/apikey (recommended to start)
#   ANTHROPIC_API_KEY  — paid, higher quality (~£0.05-0.10/audit)
# With neither, the server runs in demo mode: real measured scores, AI
# judgment off and clearly labeled.
npm install          # already done if you're reading this after the build
npm run dev
```

The API listens on `http://0.0.0.0:8787`. Keep this terminal open.

> First run only: `npx playwright install chromium` (already installed during the build).

### 2. Start the app

```powershell
cd mobile
npx expo start
```

Scan the QR code with your iPhone camera → opens in **Expo Go**.

**Zero config networking:** the app auto-derives the server address from Metro (your PC's LAN IP + port 8787). Phone and PC must be on the same Wi-Fi. If it can't connect, allow Node through Windows Firewall (private networks), or set the server address manually in the app's **Settings** screen.

### 3. Judge a site

Paste any URL on the Home screen. You get 3 free credits per device (configurable via `FREE_AUDIT_CREDITS`).

---

## Payments (RevenueCat)

- **In Expo Go:** native IAP cannot run, so the paywall runs in clearly-labeled **test mode** — purchases are simulated through the server's dev-only endpoint and grant entitlements exactly like the real webhook would. The whole credits/entitlement flow is testable end to end.
- **In a dev/production build:** install → `eas build`, set `EXPO_PUBLIC_RC_IOS_KEY` (RevenueCat public iOS SDK key) in `mobile/.env`, and configure products in RevenueCat + App Store Connect:
  - `pro_monthly` (£4.99/mo) and `pro_yearly` (£39.99/yr) in one subscription group, entitlement `pro`
  - `credits_5` consumable (£3.99)
- **Server side:** point a RevenueCat webhook at `POST /v1/webhooks/revenuecat` with an `Authorization: Bearer <RC_WEBHOOK_SECRET>` header (set the same value in `server/.env`). Entitlements and credits are granted **server-side only**; forged webhooks are rejected. Set `DEV_MODE=false` in production to disable simulated purchases.
- The RevenueCat `app_user_id` is the server's `userId` (the app configures Purchases with it automatically).

## Useful endpoints

| Endpoint | What |
|---|---|
| `POST /v1/audits` | create audit (auth, rate-limited, SSRF-checked, debits credit) |
| `GET /v1/audits/:id` | poll status — step + percent are real job state |
| `GET /r/:id` | public read-only report page (share/growth surface) |
| `GET /r/:id/card.svg` | share card (1080×1350; `card-wide.svg` for 1200×630) |
| `GET /v1/me` | credits, entitlement, ledger |

## Tests

```powershell
cd server
npm test        # 88 tests — exhaustive SSRF guard suite + scoring
npx tsc --noEmit
```

The SSRF guard blocks: private/loopback/link-local/CGNAT/metadata IPv4+IPv6 ranges (including IPv4-mapped IPv6 in both dotted and hex form), internal hostnames, redirects and sub-requests into private space (via per-request interception), non-http(s) schemes, and credentials-in-URL.

## Costs

One audit = 3 focused LLM calls (1 vision + 2 text), JSON-schema-constrained:

- **Gemini (free tier):** £0.00 — Google AI Studio key, ~10 requests/min limit (each audit is 3 requests). Great for development. Note: Google may use free-tier inputs for model improvement.
- **Claude Sonnet 4.6:** typically **$0.05–$0.12 ≈ £0.04–£0.10** per audit — the quality option for launch. Cost logged per audit in server logs.

If both keys are set, Anthropic wins (override with `AI_PROVIDER=gemini`). Failed/blocked audits are auto-refunded in the credit ledger — including audits interrupted by a server restart or PC shutdown, which are refunded automatically at next boot.

## Running 24/7 & shipping to the App Store

Your PC being off = the app can't audit (it needs this server). For always-on there's a **completely free stack**: Render free tier (runs the Dockerfile) + Supabase free tier (the server mirrors its state and screenshots there, surviving Render's disk wipes) + Gemini free tier (AI). Set `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` and it activates automatically; add `MAX_AUDITS_PER_DAY` to stay inside free AI quotas. Paid path (~$5–7/mo) removes cold starts. Bake the deployed URL into the app via `mobile/eas.json`.

- **[store/PUBLISHING.md](store/PUBLISHING.md)** — exact step-by-step from this repo to "Waiting for Review" (server deploy, Apple Developer, IAP setup, RevenueCat, EAS build, TestFlight, submission)
- **[store/APP_STORE.md](store/APP_STORE.md)** — ready-to-paste metadata, keywords, description, privacy nutrition labels, review notes, screenshot plan

See `BUILD_NOTES.md` for architecture decisions, deviations from the original brief, and the known-gaps list.
