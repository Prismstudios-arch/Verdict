/**
 * Generates 5 captioned App Store screenshots (1284×2778 — accepted 6.5" size)
 * into store/screenshots/, using the crawler's Playwright Chromium.
 *
 * Style: dark brand (#0B0D10), acid-green accents, big caption, phone mockup
 * with a faithful recreation of the app UI.
 *
 * Run from server/:  node scripts/generate-appstore-shots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "..", "store", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

const W = 1284;
const H = 2778;

const C = {
  bg: "#0B0D10",
  surface: "#12161B",
  surface2: "#1A1F26",
  border: "#232A33",
  text: "#F2F4F6",
  dim: "#8A929C",
  faint: "#4A5561",
  accent: "#C6FF3D",
  red: "#FF5D5D",
  amber: "#FFC53D",
};

const scoreColor = (n) => (n >= 75 ? C.accent : n >= 55 ? C.amber : C.red);

function ring(score, size = 420, stroke = 38) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const col = scoreColor(score);
  return `<div style="position:relative;width:${size}px;height:${size}px;margin:0 auto">
    <svg width="${size}" height="${size}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${C.surface2}" stroke-width="${stroke}"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${(score / 100) * circ} ${circ}" transform="rotate(-90 ${c} ${c})"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="font-size:${size * 0.3}px;font-weight:800;color:${col};letter-spacing:-2px">${score}</div>
      <div style="color:${C.dim};font-size:30px;font-weight:600;margin-top:-8px">/100</div>
    </div>
  </div>`;
}

const greenBtn = (label) =>
  `<div style="background:${C.accent};color:#0B0D10;border-radius:40px;height:108px;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800">${label}</div>`;

const ghostBtn = (label) =>
  `<div style="background:${C.surface};border:2px solid ${C.border};color:${C.text};border-radius:40px;height:108px;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700">${label}</div>`;

// ---- Screen contents (recreations of the real app UI) ----

const homeScreen = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:64px">
    <div style="font-size:44px;font-weight:800;color:${C.text}">Verdict<span style="color:${C.accent}">.</span></div>
    <div style="color:${C.dim};font-size:40px">⚙︎</div>
  </div>
  <div style="font-size:76px;font-weight:800;color:${C.text};letter-spacing:-1.5px;line-height:1.08">Your website.<br>Judged.</div>
  <div style="color:${C.dim};font-size:31px;line-height:1.45;margin:28px 0 52px">Paste a URL and get scored the way visitors actually see you — on a phone. Verdict in about a minute.</div>
  <div style="background:${C.surface};border:2px solid ${C.border};border-radius:40px;height:116px;display:flex;align-items:center;padding:0 38px;color:${C.faint};font-size:36px">yoursite.com</div>
  <div style="height:26px"></div>
  ${greenBtn("Get the verdict")}
  <div style="text-align:center;color:${C.dim};font-size:27px;margin-top:34px">1 audit left&nbsp;&nbsp;·&nbsp;&nbsp;Get more →</div>
  <div style="text-align:center;color:${C.accent};font-size:27px;font-weight:700;margin-top:26px">See a sample verdict — no credit →</div>
  <div style="color:${C.dim};font-size:24px;letter-spacing:3px;font-weight:700;margin:72px 0 24px">RECENT VERDICTS</div>
  <div style="background:${C.surface};border-radius:28px;padding:32px 36px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="color:${C.text};font-size:31px;font-weight:700">stripe.com</div>
      <div style="color:${C.dim};font-size:24px;margin-top:6px">16/07/2026</div>
    </div>
    <div style="border:4px solid ${C.amber};border-radius:999px;width:88px;height:88px;display:flex;align-items:center;justify-content:center;color:${C.amber};font-size:30px;font-weight:800">70</div>
  </div>`;

const scoreScreen = `
  <div style="text-align:center;color:${C.dim};font-size:26px;letter-spacing:4px;font-weight:700;margin-top:8px">THE VERDICT ON</div>
  <div style="text-align:center;color:${C.text};font-size:56px;font-weight:800;margin:10px 0 56px">yoursite.com</div>
  ${ring(82)}
  <div style="display:flex;justify-content:center;margin-top:44px">
    <div style="border:6px solid ${C.accent};border-radius:22px;padding:8px 30px;color:${C.accent};font-size:52px;font-weight:900;transform:rotate(-4deg)">B+</div>
  </div>
  <div style="border-left:6px solid ${C.accent};padding-left:30px;margin-top:64px;color:${C.text};font-size:37px;font-style:italic;font-weight:600;line-height:1.4">“Beautiful hero, buried value — your best line is three scrolls deep.”</div>
  <div style="display:flex;gap:22px;margin-top:56px">
    <div style="flex:1">${greenBtn("Share verdict")}</div>
    <div style="flex:1">${ghostBtn("Copy link")}</div>
  </div>`;

const rewriteScreen = `
  <div style="color:${C.dim};font-size:24px;letter-spacing:3px;font-weight:700;margin-bottom:24px">FIX THESE FIRST</div>
  <div style="background:${C.surface};border-radius:30px;overflow:hidden;display:flex;margin-bottom:30px">
    <div style="width:10px;background:${C.red}"></div>
    <div style="padding:36px 38px;flex:1">
      <div style="display:flex;justify-content:space-between;margin-bottom:14px">
        <span style="color:${C.red};font-size:23px;font-weight:800;letter-spacing:2px">CRITICAL</span>
        <span style="color:${C.faint};font-size:23px">First impression</span>
      </div>
      <div style="color:${C.text};font-size:32px;font-weight:700;line-height:1.35">The headline says nothing concrete — a visitor can't tell what you do</div>
      <div style="color:${C.dim};font-size:27px;font-style:italic;margin-top:14px">“Work, reimagined.”</div>
    </div>
  </div>
  <div style="background:${C.surface};border-radius:30px;overflow:hidden;display:flex">
    <div style="width:10px;background:${C.amber}"></div>
    <div style="padding:36px 38px;flex:1">
      <div style="display:flex;justify-content:space-between;margin-bottom:14px">
        <span style="color:${C.amber};font-size:23px;font-weight:800;letter-spacing:2px">MAJOR</span>
        <span style="color:${C.faint};font-size:23px">Copy & conversion</span>
      </div>
      <div style="color:${C.text};font-size:32px;font-weight:700;line-height:1.35">The call-to-action is generic</div>
      <div style="color:${C.dim};font-size:27px;font-style:italic;margin:14px 0 8px">“Get Started”</div>
      <div style="background:${C.bg};border:2px solid ${C.border};border-radius:22px;padding:28px 32px;margin-top:20px">
        <div style="color:${C.red};font-size:28px;text-decoration:line-through">Get Started</div>
        <div style="color:${C.accent};font-size:30px;font-weight:700;margin-top:12px">Start free — no card needed</div>
        <div style="display:flex;justify-content:flex-end;margin-top:18px">
          <div style="background:${C.surface2};border-radius:16px;padding:10px 26px;color:${C.accent};font-size:24px;font-weight:800">Copy</div>
        </div>
      </div>
    </div>
  </div>`;

function bar(label, weight, value) {
  const col = scoreColor(value);
  return `<div style="margin-bottom:42px">
    <div style="display:flex;justify-content:space-between;margin-bottom:14px">
      <span style="color:${C.text};font-size:30px;font-weight:600">${label} <span style="color:${C.faint};font-size:25px;font-weight:400">${weight}</span></span>
      <span style="color:${col};font-size:32px;font-weight:800">${value}</span>
    </div>
    <div style="background:${C.surface2};border-radius:10px;height:18px"><div style="background:${col};border-radius:10px;height:18px;width:${value}%"></div></div>
  </div>`;
}

const breakdownScreen = `
  <div style="color:${C.dim};font-size:24px;letter-spacing:3px;font-weight:700;margin-bottom:40px">SCORE BREAKDOWN</div>
  ${bar("Clarity", "25%", 84)}
  ${bar("Copy & conversion", "25%", 72)}
  ${bar("Mobile experience", "20%", 91)}
  ${bar("Performance", "15%", 78)}
  ${bar("Trust", "10%", 66)}
  ${bar("Accessibility", "5%", 88)}
  <div style="display:flex;gap:20px;margin-top:26px">
    ${["612ms|TTFB", "1.8s|LCP", "2.1MB|WEIGHT", "43|REQUESTS"]
      .map((m) => {
        const [v, l] = m.split("|");
        return `<div style="flex:1;background:${C.surface};border-radius:26px;padding:30px 0;text-align:center">
          <div style="color:${C.text};font-size:32px;font-weight:800">${v}</div>
          <div style="color:${C.faint};font-size:20px;letter-spacing:2px;margin-top:8px">${l}</div>
        </div>`;
      })
      .join("")}
  </div>`;

// No prices anywhere (regional pricing varies — a known App Review snag).
const monitorScreen = `
  <div style="background:rgba(40,46,54,0.92);border:2px solid #333C46;border-radius:34px;padding:30px 34px;margin-bottom:56px;box-shadow:0 24px 60px rgba(0,0,0,0.55)">
    <div style="display:flex;align-items:center;gap:22px">
      <div style="width:74px;height:74px;border-radius:20px;background:#0B0D10;display:flex;align-items:center;justify-content:center">
        <svg width="46" height="46"><circle cx="23" cy="23" r="15" fill="none" stroke="${C.accent}" stroke-width="7" stroke-linecap="round" stroke-dasharray="70 95" transform="rotate(135 23 23)"/></svg>
      </div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between">
          <span style="color:${C.text};font-size:26px;font-weight:700">VERDICT</span>
          <span style="color:${C.dim};font-size:23px">now</span>
        </div>
        <div style="color:${C.text};font-size:28px;font-weight:700;margin-top:6px">yoursite.com dropped 📉 71 → 64</div>
        <div style="color:${C.dim};font-size:24px;margin-top:4px">Weekly re-scan: tap to see what changed.</div>
      </div>
    </div>
  </div>
  <div style="color:${C.dim};font-size:24px;letter-spacing:3px;font-weight:700;margin-bottom:24px">AFTER YOU FIX IT</div>
  <div style="background:${C.surface};border-radius:28px;padding:34px 38px;display:flex;align-items:center;gap:26px;margin-bottom:52px">
    <span style="color:${C.accent};font-size:46px;font-weight:800;white-space:nowrap">▲&nbsp;+9</span>
    <span style="color:${C.dim};font-size:26px;line-height:1.45">since your last scan (73&nbsp;·&nbsp;B)<br>critical issues 2&nbsp;→&nbsp;0</span>
  </div>
  ${greenBtn("Share verdict")}
  <div style="height:24px"></div>
  ${ghostBtn("Export PDF")}
  <div style="height:24px"></div>
  ${ghostBtn("Monitoring weekly ✓")}
  <div style="color:${C.faint};font-size:24px;text-align:center;margin-top:44px;line-height:1.5">Verdict re-scans your sites every week<br>and pings you the moment a score moves.</div>`;

// ---- Page template ----

function page({ caption, sub, screen }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI', -apple-system, Roboto, sans-serif; }
    body { width:${W}px; height:${H}px; background:${C.bg}; overflow:hidden; }
    .glow { position:absolute; width:1600px; height:1600px; border-radius:50%;
      background:radial-gradient(circle, rgba(198,255,61,0.07) 0%, rgba(198,255,61,0) 62%);
      top:600px; left:50%; transform:translateX(-50%); }
  </style></head><body>
  <div class="glow"></div>
  <div style="position:relative;padding:150px 100px 0;text-align:center">
    <div style="color:${C.text};font-size:92px;font-weight:800;letter-spacing:-2px;line-height:1.12">${caption}</div>
    <div style="color:${C.dim};font-size:37px;margin-top:34px;line-height:1.4">${sub}</div>
  </div>
  <div style="position:absolute;left:50%;transform:translateX(-50%);top:660px;width:960px;height:2050px;
    background:#0E1116;border:8px solid #262E38;border-radius:120px;overflow:hidden;
    box-shadow:0 60px 160px rgba(0,0,0,0.75), 0 0 120px rgba(198,255,61,0.10)">
    <div style="position:absolute;top:32px;left:50%;transform:translateX(-50%);width:280px;height:56px;background:#000;border-radius:32px"></div>
    <div style="padding:150px 58px 0;height:100%;background:${C.bg}">${screen}</div>
  </div>
  </body></html>`;
}

const SHOTS = [
  {
    file: "1-hook.png",
    caption: `Your website. <span style="color:${C.accent}">Judged.</span>`,
    sub: "Scored the way visitors actually see it — on a phone.",
    screen: homeScreen,
  },
  {
    file: "2-score.png",
    caption: `A verdict in about<br>a <span style="color:${C.accent}">minute</span>`,
    sub: "One score, a letter grade, and a roast worth sharing.",
    screen: scoreScreen,
  },
  {
    file: "3-rewrites.png",
    caption: `Fixes that quote<br><span style="color:${C.accent}">your</span> copy`,
    sub: "Exact rewrites, not vibes. Copy any fix with one tap.",
    screen: rewriteScreen,
  },
  {
    file: "4-breakdown.png",
    caption: `Six scores.<br><span style="color:${C.accent}">Zero</span> guesswork`,
    sub: "Clarity, copy, mobile, speed, trust, accessibility — all measured.",
    screen: breakdownScreen,
  },
  {
    file: "5-monitoring.png",
    caption: `Know when your<br>score <span style="color:${C.accent}">drops</span>`,
    sub: "Weekly re-scans with alerts, progress tracking, and client-ready PDFs.",
    screen: monitorScreen,
  },
];

const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
for (const shot of SHOTS) {
  await pg.setContent(page(shot), { waitUntil: "networkidle" });
  await pg.screenshot({ path: path.join(OUT, shot.file) });
  console.log(`wrote ${shot.file}`);
}
await browser.close();
console.log(`\nDone → ${OUT}`);
