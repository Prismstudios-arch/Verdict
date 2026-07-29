import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { config } from "../config.js";
import { createHostGate, SsrfBlockedError } from "../ssrf.js";

export interface CtaInfo {
  text: string;
  href: string;
  tag: string;
  widthPx: number;
  heightPx: number;
  aboveFold: boolean;
}

export interface PageExtract {
  title: string;
  metaDescription: string;
  ogTags: Record<string, string>;
  hasViewportMeta: boolean;
  h1s: string[];
  h2s: string[];
  headingLevels: number[];
  bodyText: string;
  bodyFontPx: number;
  horizontalScroll: boolean;
  imgCount: number;
  imgWithAlt: number;
  inputCount: number;
  inputsWithLabel: number;
  ctas: CtaInfo[];
}

export interface WalkResult {
  label: string;
  url: string;
  ok: boolean;
  status: number;
  title: string;
  note: string;
  screenshotPath: string;
}

export interface CaptureResult {
  finalUrl: string;
  blocked: boolean;
  blockReason: string;
  metrics: {
    ttfbMs: number;
    lcpMs: number | null;
    totalBytes: number;
    requestCount: number;
    httpStatus: number;
  };
  extract: PageExtract;
  shots: {
    mobileFold: string; // relative paths under storage/
    mobileFull: string;
    desktopFold: string;
  };
  walk: WalkResult[];
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let browserPromise: Promise<Browser> | null = null;
export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
    browserPromise.then((b) => b.on("disconnected", () => (browserPromise = null)));
  }
  return browserPromise;
}

function shotDir(auditId: string): string {
  const dir = path.join(config.storageDir, auditId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const BLOCK_MARKERS = [
  "verify you are human", "verifying you are human", "checking your browser",
  "access denied", "attention required", "cloudflare", "just a moment",
  "captcha", "are you a robot", "request blocked",
];

function looksBotBlocked(status: number, title: string, bodyText: string): string {
  if (status === 403 || status === 429 || status === 503) return `HTTP ${status}`;
  const hay = (title + " " + bodyText.slice(0, 600)).toLowerCase();
  const marker = BLOCK_MARKERS.find((m) => hay.includes(m));
  if (marker && bodyText.length < 1500) return `bot wall ("${marker}")`;
  return "";
}

const EXTRACT_FN = `(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const og = {};
  document.querySelectorAll('meta[property^="og:"]').forEach((m) => {
    og[m.getAttribute("property")] = m.getAttribute("content") || "";
  });
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(vis);
  const ctaEls = [...document.querySelectorAll('a,button,[role="button"],input[type="submit"]')]
    .filter(vis)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ");
      return {
        text: text.slice(0, 80),
        href: el.href || "",
        tag: el.tagName.toLowerCase(),
        widthPx: Math.round(r.width),
        heightPx: Math.round(r.height),
        aboveFold: r.top < innerHeight,
        area: r.width * r.height,
        weight: (getComputedStyle(el).fontWeight >= 600 ? 1 : 0) + (el.tagName === "BUTTON" ? 1 : 0),
      };
    })
    .filter((c) => c.text.length > 0 && c.text.length < 60)
    .sort((a, b) => (b.aboveFold - a.aboveFold) || (b.weight - a.weight) || (b.area - a.area))
    .slice(0, 12);
  const inputs = [...document.querySelectorAll("input,textarea,select")].filter(
    (i) => vis(i) && i.type !== "hidden"
  );
  const labelled = inputs.filter(
    (i) => i.labels?.length || i.getAttribute("aria-label") || i.getAttribute("aria-labelledby") || i.getAttribute("placeholder")
  );
  const imgs = [...document.querySelectorAll("img")].filter(vis);
  let bodyFontPx = 16;
  const p = [...document.querySelectorAll("p,li")].filter(vis)[0];
  if (p) bodyFontPx = parseFloat(getComputedStyle(p).fontSize) || 16;
  return {
    title: document.title || "",
    metaDescription: document.querySelector('meta[name="description"]')?.content || "",
    ogTags: og,
    hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
    h1s: headings.filter((h) => h.tagName === "H1").map((h) => h.innerText.trim().slice(0, 200)),
    h2s: headings.filter((h) => h.tagName === "H2").map((h) => h.innerText.trim().slice(0, 200)).slice(0, 10),
    headingLevels: headings.map((h) => Number(h.tagName[1])),
    bodyText: (document.body?.innerText || "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 9000),
    bodyFontPx,
    horizontalScroll: document.documentElement.scrollWidth > innerWidth + 2,
    imgCount: imgs.length,
    imgWithAlt: imgs.filter((i) => (i.getAttribute("alt") || "").trim().length > 0).length,
    inputCount: inputs.length,
    inputsWithLabel: labelled.length,
    ctas: ctaEls.map(({ area, weight, ...rest }) => rest),
  };
})()`;

async function newContext(browser: Browser, mobile: boolean): Promise<BrowserContext> {
  return browser.newContext(
    mobile
      ? {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          userAgent: IPHONE_UA,
        }
      : { viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA },
  );
}

async function guardContext(ctx: BrowserContext, gate: ReturnType<typeof createHostGate>): Promise<void> {
  // Every request (including redirect targets and sub-resources) must pass
  // the SSRF host gate; anything private/link-local/metadata is aborted.
  await ctx.route("**/*", async (route) => {
    const ok = await gate(route.request().url());
    if (ok) await route.continue();
    else await route.abort("blockedbyclient");
  });
}

export async function captureSite(auditId: string, targetUrl: string): Promise<CaptureResult> {
  const browser = await getBrowser();
  const gate = createHostGate();
  const dir = shotDir(auditId);
  const rel = (name: string) => path.join(auditId, name);

  const mobileCtx = await newContext(browser, true);
  await guardContext(mobileCtx, gate);
  const page = await mobileCtx.newPage();

  let totalBytes = 0;
  let requestCount = 0;
  page.on("response", async (res) => {
    requestCount++;
    try {
      const len = res.headers()["content-length"];
      if (len) totalBytes += parseInt(len, 10) || 0;
      else if (res.request().resourceType() !== "media") {
        const body = await res.body().catch(() => null);
        if (body) totalBytes += body.length;
      }
    } catch {
      /* response bodies of aborted/redirect requests are unavailable */
    }
  });

  await page.addInitScript(`
    window.__lcp = null;
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) window.__lcp = entries[entries.length - 1].startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {}
  `);

  const started = Date.now();
  let ttfbMs = 0;
  let httpStatus = 0;
  try {
    const resp = await page.goto(targetUrl, { timeout: 15_000, waitUntil: "domcontentloaded" });
    ttfbMs = Date.now() - started;
    httpStatus = resp?.status() ?? 0;
    await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(2_000); // settle: fonts, hero images, LCP
  } catch (err) {
    await mobileCtx.close();
    if (err instanceof SsrfBlockedError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("blockedbyclient") || msg.includes("ERR_BLOCKED_BY_CLIENT")) {
      throw new SsrfBlockedError("Navigation blocked: target resolved to a private address");
    }
    return {
      finalUrl: targetUrl,
      blocked: true,
      blockReason: msg.includes("Timeout") ? "The site took too long to respond (15s timeout)." : `Could not load the site: ${msg.slice(0, 140)}`,
      metrics: { ttfbMs: 0, lcpMs: null, totalBytes: 0, requestCount: 0, httpStatus: 0 },
      extract: emptyExtract(),
      shots: { mobileFold: "", mobileFull: "", desktopFold: "" },
      walk: [],
    };
  }

  const finalUrl = page.url();
  const lcpMs = (await page.evaluate("window.__lcp").catch(() => null)) as number | null;
  const extract = ((await page.evaluate(EXTRACT_FN).catch(() => null)) ?? emptyExtract()) as PageExtract;

  const blockReason = looksBotBlocked(httpStatus, extract.title, extract.bodyText);
  if (blockReason) {
    await mobileCtx.close();
    return {
      finalUrl,
      blocked: true,
      blockReason: `The site blocked our crawler (${blockReason}).`,
      metrics: { ttfbMs, lcpMs, totalBytes, requestCount, httpStatus },
      extract,
      shots: { mobileFold: "", mobileFull: "", desktopFold: "" },
      walk: [],
    };
  }

  // Screenshots — CSS-pixel scale keeps LLM image tokens low.
  await page.screenshot({ path: path.join(dir, "mobile-fold.jpg"), type: "jpeg", quality: 72, scale: "css" });
  await page
    .screenshot({ path: path.join(dir, "mobile-full.jpg"), type: "jpeg", quality: 60, fullPage: true, scale: "css" })
    .catch(async () => {
      await page.screenshot({ path: path.join(dir, "mobile-full.jpg"), type: "jpeg", quality: 60, scale: "css" });
    });

  // Interaction walk: follow up to 3 primary CTA destinations (same-origin
  // http(s) only; every hop re-passes the SSRF gate via context routing).
  const walk: WalkResult[] = [];
  const walkDeadline = Date.now() + 60_000;
  const seen = new Set<string>([normalize(finalUrl)]);
  const candidates = extract.ctas
    .filter((c) => c.href.startsWith("http") && !seen.has(normalize(c.href)))
    .filter((c) => sameSite(c.href, finalUrl))
    .slice(0, 3);
  for (const [i, cta] of candidates.entries()) {
    if (Date.now() > walkDeadline) break;
    if (seen.has(normalize(cta.href))) continue;
    seen.add(normalize(cta.href));
    const p2 = await mobileCtx.newPage();
    try {
      const r = await p2.goto(cta.href, { timeout: 12_000, waitUntil: "domcontentloaded" });
      await p2.waitForTimeout(800);
      const status = r?.status() ?? 0;
      const title = await p2.title().catch(() => "");
      const forms = await p2
        .evaluate(
          `(() => { const i=[...document.querySelectorAll("input,textarea,select")].filter(x=>x.type!=="hidden"); return { inputs: i.length, labelled: i.filter(x=>x.labels?.length||x.getAttribute("aria-label")||x.getAttribute("placeholder")).length }; })()`,
        )
        .catch(() => ({ inputs: 0, labelled: 0 }));
      const f = forms as { inputs: number; labelled: number };
      const shotName = `walk-${i}.jpg`;
      await p2.screenshot({ path: path.join(dir, shotName), type: "jpeg", quality: 65, scale: "css" });
      walk.push({
        label: cta.text,
        url: cta.href,
        ok: status > 0 && status < 400,
        status,
        title,
        note:
          f.inputs > 0
            ? `${f.inputs} form field(s), ${f.labelled} labelled`
            : status >= 400
              ? `broken — HTTP ${status}`
              : "loaded ok",
        screenshotPath: rel(shotName),
      });
    } catch (err) {
      walk.push({
        label: cta.text,
        url: cta.href,
        ok: false,
        status: 0,
        title: "",
        note: `failed to load (${err instanceof Error ? err.message.slice(0, 80) : "error"})`,
        screenshotPath: "",
      });
    } finally {
      await p2.close().catch(() => {});
    }
  }
  await mobileCtx.close();

  // Desktop capture.
  const desktopCtx = await newContext(browser, false);
  await guardContext(desktopCtx, gate);
  const dPage = await desktopCtx.newPage();
  try {
    await dPage.goto(targetUrl, { timeout: 15_000, waitUntil: "domcontentloaded" });
    await dPage.waitForTimeout(1_500);
    await dPage.screenshot({ path: path.join(dir, "desktop-fold.jpg"), type: "jpeg", quality: 70, scale: "css" });
  } catch {
    /* desktop capture is best-effort; mobile is the headline */
  }
  await desktopCtx.close();

  return {
    finalUrl,
    blocked: false,
    blockReason: "",
    metrics: { ttfbMs, lcpMs, totalBytes, requestCount, httpStatus },
    extract,
    shots: {
      mobileFold: rel("mobile-fold.jpg"),
      mobileFull: rel("mobile-full.jpg"),
      desktopFold: fs.existsSync(path.join(dir, "desktop-fold.jpg")) ? rel("desktop-fold.jpg") : "",
    },
    walk,
  };
}

function normalize(u: string): string {
  try {
    const url = new URL(u);
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    return u;
  }
}

function sameSite(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, "");
    const hb = new URL(b).hostname.replace(/^www\./, "");
    return ha === hb || ha.endsWith("." + hb) || hb.endsWith("." + ha);
  } catch {
    return false;
  }
}

function emptyExtract(): PageExtract {
  return {
    title: "",
    metaDescription: "",
    ogTags: {},
    hasViewportMeta: false,
    h1s: [],
    h2s: [],
    headingLevels: [],
    bodyText: "",
    bodyFontPx: 16,
    horizontalScroll: false,
    imgCount: 0,
    imgWithAlt: 0,
    inputCount: 0,
    inputsWithLabel: 0,
    ctas: [],
  };
}
