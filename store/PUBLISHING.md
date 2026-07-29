# Publishing Checklist â€” from this repo to the App Store

Work top to bottom. Steps marked ðŸ’³ need an account/payment only you can set up. Everything code-side is already done.

---

## 0. Deploy the server on Fly.io (your choice â€” ~$5â€“6/mo, always on)

The app is only as alive as the API. For the App Store it must run 24/7 on a public HTTPS URL â€” reviewers will use it. Your Gemini key is already in `server/.env` for local testing; below puts it on Fly.

Everything is pre-configured in `server/fly.toml` and `server/Dockerfile`. You just run the commands.

**One-time setup (do these once):**

1. **Install the Fly CLI** (PowerShell):
   ```powershell
   pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```
   Close and reopen your terminal after it installs.

2. **Log in:** `fly auth login` (opens your browser).

3. **Pick your app name.** Open `server/fly.toml` and change the first line `app = "verdict-api"` to something unique (e.g. `app = "verdict-jonny"`). Remember what you chose.

**Deploy (from the `server` folder):**

```powershell
cd c:\Users\Jonny\Desktop\Verdict\server

# Create the app (use the SAME name you put in fly.toml)
fly apps create verdict-jonny

# Create the persistent disk (London region, 3GB â€” holds users + screenshots)
fly volumes create verdict_data --region lhr --size 3 --yes

# Set your secrets (the values NOT in fly.toml). Generate two random strings
# for JWT_SECRET/FILE_SECRET â€” any long gibberish is fine.
fly secrets set `
  GEMINI_API_KEY="AQ.Ab8RN6K2WHdqQHOMFYfeyRVrfZW46_oPzaR6iMZSka-KCMwlLw" `
  RC_WEBHOOK_SECRET="pick-a-long-random-string-here" `
  JWT_SECRET="another-long-random-string" `
  FILE_SECRET="a-third-long-random-string"

# Ship it
fly deploy
```

When it finishes, `fly deploy` prints your URL â€” it'll be `https://verdict-jonny.fly.dev`. That's **`YOUR-SERVER`** everywhere below.

**Sanity check:** open `https://YOUR-SERVER/healthz` â†’ `{"ok":true}`, and `https://YOUR-SERVER/privacy` renders. Then in the phone app: Settings â†’ Server â†’ paste the URL â†’ run an audit with your PC off. ðŸŽ‰

**Notes for your setup:**
- **No Supabase needed** â€” the Fly volume (`verdict_data`) persists everything. (Supabase is only the free-host alternative; ignore it.)
- **Cost:** shared-cpu-1x / 2GB always-on â‰ˆ $5â€“6/mo + ~$0.45/mo for the 3GB volume. That matches the ~Â£10 you expected.
- **Memory:** 2GB handles 2 concurrent audits. If you ever see out-of-memory in `fly logs`, either bump `memory` in fly.toml to `"4gb"` or set `WORKER_CONCURRENCY = "1"`.
- **Free AI quota:** `MAX_AUDITS_PER_DAY = "300"` in fly.toml keeps you inside Gemini's free tier â€” the 301st audit that day gets a polite "full capacity" message and **no credit is charged**. When revenue comes in, add an `ANTHROPIC_API_KEY` secret (~5â€“10p/audit, sharper analysis) and raise/remove the cap â€” one Pro subscriber covers it.
- **To redeploy after any change:** just `fly deploy` again.

âš ï¸ **Before you deploy for real:** edit `CONTACT_EMAIL` in `server/src/routes.ts` to a real address you monitor (Apple opens your privacy page and checks it). Tell me your email and I'll set it.

## 1. Apple Developer Program ðŸ’³

- Enroll at developer.apple.com ($99/Â£79 per year). Takes up to 48h.
- In App Store Connect â†’ **Agreements, Tax and Banking** â†’ accept the **Paid Applications** agreement and complete banking/tax. **IAP products cannot be created or tested until this is done** â€” do it first, it's the slowest step.
- Optional but recommended: apply for the **App Store Small Business Program** (15% commission instead of 30%) once enrolled.

## 2. Create the app record

App Store Connect â†’ My Apps â†’ **+** â†’ New App: platform iOS, name **Verdict: AI Website Audit**, bundle ID `com.jonnywilson.verdict` (register it at developer.apple.com â†’ Identifiers first; if the ID is taken, pick another and update `mobile/app.json` â†’ `ios.bundleIdentifier`).

## 3. Create the in-app purchases

In the app record â†’ Monetization:
- Subscription group **"Verdict Pro"** â†’ add `pro_monthly` (Â£4.99/mo) and `pro_yearly` (Â£39.99/yr).
- In-App Purchases â†’ consumable `credits_5` (Â£3.99).
- Fill in localized display names/descriptions (see `store/APP_STORE.md`) and add a review screenshot for each (can be the paywall screenshot).

## 4. RevenueCat ðŸ’³ (free up to $2.5k MTR)

1. app.revenuecat.com â†’ new project â†’ add an **App Store app** with bundle ID `com.jonnywilson.verdict`. Connect App Store Connect (In-App Purchase key + issuer ID, per RC's wizard).
2. **Entitlement:** create `pro`, attach `pro_monthly` and `pro_yearly`.
3. **Offering:** default offering containing both subscription packages + `credits_5`.
4. **Webhook:** Project settings â†’ Integrations â†’ Webhooks â†’ URL `https://YOUR-SERVER/v1/webhooks/revenuecat`, Authorization header value `Bearer <RC_WEBHOOK_SECRET>` (the exact string you set on the server, prefixed with `Bearer `).
5. Copy the **public Apple API key** (`appl_â€¦`) â†’ paste into `mobile/eas.json` (all three profiles).

## 5. Build with EAS ðŸ’³ (Expo account, free tier works)

```powershell
npm i -g eas-cli
cd mobile
eas login
eas init                       # links the project, writes projectId into app.json
# Edit eas.json: replace both REPLACE-WITH placeholders (server URL + RC key)
eas build --platform ios --profile production
```

EAS builds in the cloud (no Mac needed) and handles signing — say yes when it offers to create certificates. **When it asks "Would you like to set up Push Notifications for your project?" answer YES** — this creates the Apple push key that powers the weekly score-change alerts. When the build finishes:

```powershell
eas submit --platform ios --latest
```

## 6. TestFlight pass (do not skip)

Install from TestFlight and verify on a real device:
- [ ] Full flow: onboarding → audit a real site → score reveal with haptics → report
- [ ] Paywall shows **real** App Store prices (sandbox) — no "test mode" banner, yearly listed first
- [ ] Sandbox purchase of `pro_yearly` → Settings shows Pro + 30 credits within seconds (webhook)
- [ ] Cancel + restore purchases works
- [ ] "🔔 Monitor weekly" on a report → notification permission prompt → "Monitoring on" → site appears under Settings → Monitoring
- [ ] Export PDF opens the client-ready PDF in-app
- [ ] Privacy Policy / Terms open as in-app sheets (paywall + Settings)
- [ ] Settings shows NO server section (dev-only)
- [ ] Settings → Delete my data works
- [ ] A blocked site (try a bank) fails politely with credit refund
- [ ] Airplane-mode launch shows the connection error state, not a crash

## 7. Submit for review

- Fill all metadata from `store/APP_STORE.md` (screenshots: 6.9" iPhone required; 6.5" optional).
- App Privacy answers per the nutrition-labels table.
- Attach the review notes (they explain the anonymous auth â€” this prevents the most common rejection question).
- Add the IAPs to the same submission (first-time IAPs are reviewed with the app binary).
- Submit. First reviews typically take 1â€“3 days; if rejected, the resolution center message + `store/APP_STORE.md` usually covers the fix.

## Post-launch hardening (recommended, not blocking)

- **App Attest** device gating for free credits (needs the dev build you now have) â€” until then bots could farm free audits; `FREE_AUDIT_CREDITS=1` + rate limits keep the blast radius small.
- Postgres + Redis instead of the JSON store/in-process queue when traffic grows past a single container.
- Crash monitoring (Sentry `@sentry/react-native` has an Expo config plugin).
- Push notifications for audit-complete + weekly re-scans (Phase 5 of the product brief).
- PNG share cards for social OG images (SVG cards work in-app and on the web report).

