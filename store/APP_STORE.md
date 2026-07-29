# App Store Metadata Pack

Everything to paste into App Store Connect. Review before submitting â€” especially the contact email and server URLs.

## Basics

| Field | Value |
|---|---|
| Name | **Verdict: AI Website Audit** |
| Subtitle | **Score & fix your landing page** |
| Bundle ID | `com.jonnywilson.verdict` (change in `mobile/app.json` if taken) |
| Primary category | Developer Tools |
| Secondary category | Business |
| Age rating | 4+ (no objectionable content) |
| Price | Free (with in-app purchases) |
| Privacy Policy URL | `https://YOUR-SERVER/privacy` (served by the API) |
| Terms of Use | `https://YOUR-SERVER/terms` (also linked inside the paywall) |

## Keywords (100 chars max)

```
website,audit,landing page,conversion,roast,checker,CRO,SEO,copywriting,mobile,speed,score
```

## Promotional text (170 chars)

> The web tools judge your site on a desktop. Verdict judges it the way visitors actually see it â€” on a phone. Get your score in about a minute.

## Description

> **Your website. Judged.**
>
> Paste a URL and Verdict visits your site the way a real first-time visitor does â€” on a phone. It loads your pages on an iPhone-sized screen, taps your buttons, measures your speed, and tells you exactly what's costing you visitors.
>
> **What you get in about a minute:**
> â€¢ One overall score (0â€“100) and a letter grade
> â€¢ Six sub-scores: clarity, copy & conversion, mobile experience, performance, trust, accessibility
> â€¢ A verdict you'll want to share â€” and specific findings that quote YOUR actual copy
> â€¢ Exact rewrites, not vibes: "Submit" becomes "Get my free plan". Copy any fix with one tap
> â€¢ Mobile vs desktop screenshots, so you see what we saw
> â€¢ Real measurements: load time, page weight, tap-target sizes, missing labels
>
> **Honest by design.** Progress you see is real pipeline state, not a fake bar. If a site blocks our crawler, we say so and refund your credit automatically.
>
> **Anonymous by default.** No account, no email. Your first audits are free.
>
> **Know when your score drops.** Verdict Pro re-scans your sites every week and sends you an alert the moment a score changes — "yoursite.com dropped 71 → 64" — with a report showing exactly what regressed.
>
> **Verdict Pro** (optional): 30 audits a month, weekly monitoring with alerts, progress tracking between scans, and client-ready PDF exports — built for freelancers and agencies. Prefer no subscription? Grab a 5-audit pack. Subscriptions renew automatically and can be cancelled anytime in your Apple ID settings.
>
> Verdict Pro is an auto-renewable subscription. Payment is charged to your Apple ID at purchase confirmation. It renews automatically unless cancelled at least 24 hours before the end of the period; manage or cancel anytime in your device Settings. Prices are shown in the app before purchase.
>
> Terms of Use (EULA): https://verdict-jonny.fly.dev/terms
> Privacy Policy: https://verdict-jonny.fly.dev/privacy

> ⚠️ **REQUIRED to pass Guideline 3.1.2(c):** the description MUST end with the two lines above (functional Terms of Use / Privacy Policy URLs). This was the reason for the first rejection — it's metadata-only, no rebuild needed.

## In-App Purchases

| Product ID | Type | Price (UK) | Display name |
|---|---|---|---|
| `pro_yearly` | Auto-renewable (group: Verdict Pro) | Â£39.99/yr | Verdict Pro Yearly |
| `pro_monthly` | Auto-renewable (group: Verdict Pro) | Â£4.99/mo | Verdict Pro Monthly |
| `credits_5` | Consumable | Â£3.99 | 5 Audit Pack |

Both subscriptions attach to the RevenueCat entitlement **`pro`**.

## Privacy nutrition labels (App Privacy section)

Answer "Do you collect data?" â†’ **Yes**, then:

| Data type | Collected? | Linked to identity? | Tracking? | Purpose |
|---|---|---|---|---|
| Identifiers â†’ Device ID | Yes (random app-generated ID, not IDFA) | No | No | App functionality |
| User content â†’ Other (audited URLs + captured screenshots) | Yes | No | No | App functionality |
| Purchases â†’ Purchase history | Yes (via RevenueCat) | No | No | App functionality |

Everything else: **not collected**. Tracking (ATT): **none** â€” do not show the ATT prompt.

## Review notes (paste into App Review Information)

> No demo account needed â€” the app is anonymous by design. On first launch it mints a device identity and grants 1 free audit credit.
>
> To test: complete onboarding, paste any public website URL (e.g. example.com) on the home screen, tap "Get the verdict". The audit takes ~60â€“90s and produces a scored report.
>
> In-app purchases are processed by StoreKit via RevenueCat; entitlements are validated server-side through the RevenueCat webhook. "Delete my data" (Settings â†’ Danger zone) permanently removes all server-side data for the device.
>
> Backend: [YOUR SERVER URL]. The crawler only visits publicly accessible URLs supplied by the user and refuses private/internal addresses.

## Screenshots (6, telling the story â€” capture on iPhone 15 Pro Max sim/device)

1. **Hook:** Home screen â€” "Your website. Judged."
2. **Score reveal:** Report screen mid-count-up (ring + grade stamp)
3. **The rewrite:** a FindingCard with before/after copy + Copy button
4. **Sub-scores:** the score breakdown bars
5. **What we saw:** mobile vs desktop screenshot gallery
6. **Paywall:** Verdict Pro pricing (transparent per-audit math)

Preview video (optional, 15s): paste URL â†’ progress timeline â†’ score reveal moment.

