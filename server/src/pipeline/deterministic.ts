import type { CaptureResult } from "./capture.js";
import type { Finding } from "../store.js";

/**
 * Deterministic sub-scores (no LLM). Same input → same numbers, always.
 */

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export interface DeterministicResult {
  performance: number;
  accessibility: number;
  mobile: number;
  findings: Finding[];
}

export function deterministicChecks(cap: CaptureResult): DeterministicResult {
  const findings: Finding[] = [];
  const { metrics, extract } = cap;
  const kb = metrics.totalBytes / 1024;

  // --- Performance: TTFB, LCP, page weight, request count ---
  let perf = 100;
  if (metrics.ttfbMs > 800) perf -= Math.min(25, (metrics.ttfbMs - 800) / 80);
  if (metrics.lcpMs !== null) {
    if (metrics.lcpMs > 2500) perf -= Math.min(35, (metrics.lcpMs - 2500) / 100);
  }
  if (kb > 1500) perf -= Math.min(25, (kb - 1500) / 200);
  if (metrics.requestCount > 80) perf -= Math.min(15, (metrics.requestCount - 80) / 8);
  perf = clamp(perf);

  if (metrics.lcpMs !== null && metrics.lcpMs > 4000) {
    findings.push({
      source: "deterministic",
      severity: "major",
      issue: "Slow largest contentful paint on mobile",
      evidence: `LCP ≈ ${(metrics.lcpMs / 1000).toFixed(1)}s (good is under 2.5s)`,
      fix: "Compress the hero image, preload it, and cut render-blocking scripts so the main content paints under 2.5s.",
      rewriteBefore: "",
      rewriteAfter: "",
    });
  }
  if (kb > 3000) {
    findings.push({
      source: "deterministic",
      severity: "major",
      issue: "Very heavy page for mobile connections",
      evidence: `Total transfer ≈ ${(kb / 1024).toFixed(1)} MB across ${metrics.requestCount} requests`,
      fix: "Serve responsive images (srcset/WebP), lazy-load below-the-fold media, and defer non-critical JS.",
      rewriteBefore: "",
      rewriteAfter: "",
    });
  }

  // --- Accessibility: alt text, labels, heading hierarchy, tap targets ---
  let a11y = 100;
  const altRatio = extract.imgCount === 0 ? 1 : extract.imgWithAlt / extract.imgCount;
  a11y -= (1 - altRatio) * 30;
  const labelRatio = extract.inputCount === 0 ? 1 : extract.inputsWithLabel / extract.inputCount;
  a11y -= (1 - labelRatio) * 25;
  if (extract.h1s.length === 0) a11y -= 15;
  if (extract.h1s.length > 1) a11y -= 8;
  let skips = 0;
  for (let i = 1; i < extract.headingLevels.length; i++) {
    if (extract.headingLevels[i] - extract.headingLevels[i - 1] > 1) skips++;
  }
  a11y -= Math.min(12, skips * 4);
  const smallTaps = extract.ctas.filter((c) => c.heightPx > 0 && c.heightPx < 40).length;
  a11y -= Math.min(18, smallTaps * 4);
  a11y = clamp(a11y);

  if (altRatio < 0.7 && extract.imgCount > 2) {
    findings.push({
      source: "deterministic",
      severity: "minor",
      issue: "Images missing alt text",
      evidence: `${extract.imgCount - extract.imgWithAlt} of ${extract.imgCount} visible images have no alt attribute`,
      fix: "Add descriptive alt text to meaningful images (and empty alt to decorative ones) for screen readers and SEO.",
      rewriteBefore: "",
      rewriteAfter: "",
    });
  }
  if (extract.h1s.length === 0) {
    findings.push({
      source: "deterministic",
      severity: "minor",
      issue: "No H1 heading found",
      evidence: "The page renders without a top-level heading",
      fix: "Give the page a single H1 that states the core value proposition.",
      rewriteBefore: "",
      rewriteAfter: "",
    });
  }

  // --- Mobile readiness: viewport meta, overflow, font size, tap targets, CTA in fold ---
  let mob = 100;
  if (!extract.hasViewportMeta) mob -= 35;
  if (extract.horizontalScroll) mob -= 20;
  if (extract.bodyFontPx < 15) mob -= Math.min(20, (15 - extract.bodyFontPx) * 5);
  const foldCtas = extract.ctas.filter((c) => c.aboveFold);
  if (foldCtas.length === 0) mob -= 15;
  mob -= Math.min(15, smallTaps * 5);
  mob = clamp(mob);

  if (!extract.hasViewportMeta) {
    findings.push({
      source: "deterministic",
      severity: "critical",
      issue: "No viewport meta tag — the site renders as a shrunken desktop page on phones",
      evidence: '<meta name="viewport"> is missing from the document head',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and adopt a responsive layout.',
      rewriteBefore: "",
      rewriteAfter: "",
    });
  }
  if (extract.horizontalScroll) {
    findings.push({
      source: "deterministic",
      severity: "major",
      issue: "Horizontal scrolling on mobile",
      evidence: "Page content is wider than the 390px viewport",
      fix: "Find the overflowing element (often a fixed-width image, table, or embed) and constrain it with max-width: 100%.",
      rewriteBefore: "",
      rewriteAfter: "",
    });
  }
  if (extract.bodyFontPx < 15) {
    findings.push({
      source: "deterministic",
      severity: "major",
      issue: "Body text too small to read comfortably on a phone",
      evidence: `Body text renders at ${extract.bodyFontPx.toFixed(0)}px (aim for 15–17px)`,
      fix: "Raise base font size to at least 16px on mobile breakpoints.",
      rewriteBefore: "",
      rewriteAfter: "",
    });
  }
  if (smallTaps > 0) {
    const worst = extract.ctas.filter((c) => c.heightPx > 0 && c.heightPx < 40)[0];
    findings.push({
      source: "deterministic",
      severity: "minor",
      issue: "Tap targets below the 44pt minimum",
      evidence: `"${worst.text}" is only ${worst.heightPx}px tall`,
      fix: "Give buttons and links at least 44×44px of tappable area with padding.",
      rewriteBefore: "",
      rewriteAfter: "",
    });
  }

  return { performance: perf, accessibility: a11y, mobile: mob, findings };
}
