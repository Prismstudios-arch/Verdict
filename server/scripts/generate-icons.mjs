/**
 * Generates the Verdict app icon set into mobile/assets/images/ by rendering
 * SVG with the Playwright Chromium already installed for the crawler.
 *
 * The mark (per the product brief): a stark ring-gauge at 3/4, acid green
 * #C6FF3D on near-black #0B0D10, no text, reads at 60×60.
 *
 * Run from server/:  node scripts/generate-icons.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "..", "mobile", "assets", "images");

const GREEN = "#C6FF3D";
const DARK = "#0B0D10";

function mark({ size, bg = null, stroke = GREEN, scale = 1 }) {
  const c = size / 2;
  const r = size * 0.323 * scale;
  const sw = size * 0.115 * scale;
  const C = 2 * Math.PI * r;
  const dash = 0.75 * C;
  // Needle points to the 3/4 position of a 270° gauge that starts at 135°.
  const angle = ((135 + 0.75 * 270) * Math.PI) / 180;
  const nLen = r * 0.66;
  const nx = c + Math.cos(angle) * nLen;
  const ny = c + Math.sin(angle) * nLen;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ""}
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${sw}"
    stroke-linecap="round" stroke-dasharray="${dash} ${C}" transform="rotate(135 ${c} ${c})"/>
  <line x1="${c}" y1="${c}" x2="${nx}" y2="${ny}" stroke="${stroke}" stroke-width="${sw * 0.62}" stroke-linecap="round"/>
  <circle cx="${c}" cy="${c}" r="${sw * 0.5}" fill="${stroke}"/>
</svg>`;
}

const SPECS = [
  // iOS App Store icon: opaque, full-bleed (Apple masks the corners).
  { file: "icon.png", size: 1024, svg: mark({ size: 1024, bg: DARK }) },
  // Splash mark: transparent, splash background comes from app.json (#0B0D10).
  { file: "splash-icon.png", size: 512, svg: mark({ size: 512 }) },
  // Android adaptive set.
  { file: "android-icon-foreground.png", size: 512, svg: mark({ size: 512, scale: 0.62 }) },
  { file: "android-icon-background.png", size: 512, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${DARK}"/></svg>` },
  { file: "android-icon-monochrome.png", size: 512, svg: mark({ size: 512, stroke: "#FFFFFF", scale: 0.62 }) },
  // Web favicon.
  { file: "favicon.png", size: 48, svg: mark({ size: 48, bg: DARK }) },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const spec of SPECS) {
  await page.setViewportSize({ width: spec.size, height: spec.size });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;background:transparent}</style>${spec.svg}`,
  );
  const transparent = !spec.svg.includes("<rect");
  await page.screenshot({
    path: path.join(OUT, spec.file),
    omitBackground: transparent,
  });
  console.log(`wrote ${spec.file} (${spec.size}×${spec.size}${transparent ? ", transparent" : ""})`);
}
await browser.close();
