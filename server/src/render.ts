import { getBrowser } from "./pipeline/capture.js";
import type { AuditReport } from "./store.js";

/** Browser-backed rendering: HTML→PDF and SVG→PNG, reusing the crawler's Chromium. */

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await ctx.close();
  }
}

export async function svgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;padding:0}</style>${svg}`,
      { waitUntil: "networkidle" },
    );
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
    return Buffer.from(png);
  } finally {
    await ctx.close();
  }
}

// ---- Print-optimized PDF report (light, professional, client-ready) ----

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function gradeColor(score: number): string {
  if (score >= 75) return "#3E9C3E";
  if (score >= 55) return "#C89A2B";
  return "#D14343";
}

const SUB_LABELS: Array<[keyof AuditReport["scores"], string, string]> = [
  ["clarity", "Clarity", "25%"],
  ["copy", "Copy & conversion", "25%"],
  ["mobile", "Mobile experience", "20%"],
  ["performance", "Performance", "15%"],
  ["trust", "Trust", "10%"],
  ["accessibility", "Accessibility", "5%"],
];

export function pdfReportHtml(report: AuditReport): string {
  const color = gradeColor(report.scores.overall);
  const subs = SUB_LABELS.map(([k, label, weight]) => {
    const v = report.scores[k] as number;
    return `<tr>
      <td class="sublabel">${label} <span class="weight">${weight}</span></td>
      <td class="subbar"><div class="track"><div class="fill" style="width:${v}%;background:${gradeColor(v)}"></div></div></td>
      <td class="subval" style="color:${gradeColor(v)}">${v}</td>
    </tr>`;
  }).join("");

  const findingBlock = (sev: string, title: string) => {
    const items = report.findings.filter((f) => f.severity === sev);
    if (!items.length) return "";
    return `<h3 class="sev ${sev}">${title} · ${items.length}</h3>` + items
      .map(
        (f) => `<div class="finding">
          <div class="fissue">${esc(f.issue)}</div>
          ${f.evidence ? `<div class="fev">“${esc(f.evidence)}”</div>` : ""}
          <div class="ffix">${esc(f.fix)}</div>
          ${f.rewriteAfter ? `<div class="rewrite"><span class="before">${esc(f.rewriteBefore)}</span><span class="after">${esc(f.rewriteAfter)}</span></div>` : ""}
        </div>`,
      )
      .join("");
  };

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1A1F26; margin: 0; font-size: 12px; line-height: 1.5; }
  .brand { color: #6A7480; letter-spacing: 4px; font-size: 11px; font-weight: 700; }
  h1 { font-size: 26px; margin: 4px 0 2px; letter-spacing: -0.5px; }
  .url { color: #6A7480; font-size: 12px; margin-bottom: 18px; }
  .hero { display: flex; align-items: center; gap: 20px; border: 1px solid #E4E8EC; border-radius: 14px; padding: 18px 22px; margin-bottom: 18px; }
  .score { font-size: 54px; font-weight: 800; line-height: 1; }
  .out { color: #9AA3AD; font-size: 16px; font-weight: 600; }
  .grade { font-size: 22px; font-weight: 800; margin-top: 2px; }
  .verdict { font-style: italic; font-size: 15px; border-left: 3px solid ${color}; padding-left: 14px; margin: 4px 0 0; }
  h2 { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #6A7480; margin: 24px 0 10px; }
  table.subs { width: 100%; border-collapse: collapse; }
  table.subs td { padding: 5px 0; vertical-align: middle; }
  .sublabel { font-weight: 600; width: 38%; }
  .weight { color: #AEB6BF; font-weight: 400; }
  .track { background: #EEF1F4; border-radius: 4px; height: 8px; width: 100%; }
  .fill { height: 8px; border-radius: 4px; }
  .subbar { padding-left: 12px; padding-right: 12px; }
  .subval { text-align: right; font-weight: 800; width: 8%; }
  .para { margin: 6px 0 0; }
  .who { color: #4A5561; margin-top: 10px; }
  .who b { color: #1A1F26; }
  h3.sev { font-size: 12px; letter-spacing: 1px; margin: 16px 0 8px; padding-left: 8px; border-left: 4px solid #999; }
  h3.critical { border-color: #D14343; color: #D14343; }
  h3.major { border-color: #C89A2B; color: #B8860B; }
  h3.minor { border-color: #9AA3AD; color: #6A7480; }
  .finding { border: 1px solid #E4E8EC; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .fissue { font-weight: 700; }
  .fev { color: #6A7480; font-style: italic; margin: 3px 0; }
  .ffix { }
  .rewrite { margin-top: 6px; background: #F6F8FA; border-radius: 8px; padding: 8px 10px; }
  .rewrite .before { display: block; color: #D14343; text-decoration: line-through; }
  .rewrite .after { display: block; color: #2E7D32; font-weight: 600; }
  .metrics { display: flex; gap: 10px; margin-top: 8px; }
  .metric { flex: 1; border: 1px solid #E4E8EC; border-radius: 10px; padding: 10px; text-align: center; }
  .metric b { display: block; font-size: 15px; }
  .metric span { color: #9AA3AD; font-size: 10px; letter-spacing: 1px; }
  footer { margin-top: 26px; color: #9AA3AD; font-size: 10px; text-align: center; border-top: 1px solid #EEF1F4; padding-top: 12px; }
</style></head><body>
  <div class="brand">VERDICT</div>
  <h1>${esc(report.domain)}</h1>
  <div class="url">${esc(report.finalUrl)}</div>
  <div class="hero">
    <div>
      <span class="score" style="color:${color}">${report.scores.overall}</span><span class="out">/100</span>
      <div class="grade" style="color:${color}">${esc(report.scores.grade)}</div>
    </div>
    <div style="flex:1">
      <div class="verdict">“${esc(report.verdictLine)}”</div>
    </div>
  </div>

  <h2>The verdict</h2>
  <div class="para">${esc(report.verdictParagraph)}</div>
  <div class="who"><b>Reads as:</b> ${esc(report.whatIsThis)}<br><b>Aimed at:</b> ${esc(report.whoIsItFor)}</div>

  <h2>Score breakdown</h2>
  <table class="subs">${subs}</table>

  <h2>Findings</h2>
  ${findingBlock("critical", "Critical")}
  ${findingBlock("major", "Major")}
  ${findingBlock("minor", "Minor")}

  <h2>Measured on mobile</h2>
  <div class="metrics">
    <div class="metric"><b>${report.metrics.ttfbMs}ms</b><span>TTFB</span></div>
    <div class="metric"><b>${report.metrics.lcpMs ? (report.metrics.lcpMs / 1000).toFixed(1) + "s" : "—"}</b><span>LCP</span></div>
    <div class="metric"><b>${(report.metrics.totalKb / 1024).toFixed(1)}MB</b><span>WEIGHT</span></div>
    <div class="metric"><b>${report.metrics.requestCount}</b><span>REQUESTS</span></div>
  </div>

  <footer>Judged the way visitors actually see it — on a phone.&nbsp; Generated ${new Date(report.fetchedAt).toLocaleString()} by Verdict.</footer>
</body></html>`;
}
