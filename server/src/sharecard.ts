import type { AuditReport } from "./store.js";

/**
 * Server-rendered share card as self-contained SVG (1080×1350 portrait and
 * 1200×630 landscape). Production would rasterize to PNG (satori/resvg or
 * Playwright) for OG-image compatibility; SVG keeps the dev server dep-free.
 */

const BG = "#0B0D10";
const FG = "#F2F4F6";
const DIM = "#8A929C";
const ACCENT = "#C6FF3D";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function gradeColor(score: number): string {
  if (score >= 75) return ACCENT;
  if (score >= 55) return "#FFC53D";
  return "#FF5D5D";
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars) {
      lines.push(line.trim());
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  if (words.join(" ").length > lines.join(" ").length && lines.length === maxLines) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{3}$/, "") + "…";
  }
  return lines;
}

export function renderShareCard(report: AuditReport, variant: "portrait" | "landscape" = "portrait"): string {
  const W = variant === "portrait" ? 1080 : 1200;
  const H = variant === "portrait" ? 1350 : 630;
  const score = report.scores.overall;
  const color = gradeColor(score);
  const cx = W / 2;
  const ringY = variant === "portrait" ? 480 : 300;
  const r = variant === "portrait" ? 210 : 150;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  const verdictLines = wrap(report.verdictLine, variant === "portrait" ? 34 : 46, 3);
  const fontStack = `-apple-system, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

  const verdictText = verdictLines
    .map(
      (l, i) =>
        `<text x="${cx}" y="${(variant === "portrait" ? 860 : 500) + i * (variant === "portrait" ? 56 : 44)}" text-anchor="middle" fill="${FG}" font-family="${fontStack}" font-size="${variant === "portrait" ? 44 : 34}" font-style="italic">${i === 0 ? "“" : ""}${esc(l)}${i === verdictLines.length - 1 ? "”" : ""}</text>`,
    )
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <text x="${cx}" y="${variant === "portrait" ? 120 : 80}" text-anchor="middle" fill="${DIM}" font-family="${fontStack}" font-size="30" letter-spacing="6">VERDICT</text>
  <text x="${cx}" y="${variant === "portrait" ? 190 : 140}" text-anchor="middle" fill="${FG}" font-family="${fontStack}" font-size="44" font-weight="700">${esc(report.domain)}</text>
  <circle cx="${cx}" cy="${ringY}" r="${r}" fill="none" stroke="#1C2128" stroke-width="26"/>
  <circle cx="${cx}" cy="${ringY}" r="${r}" fill="none" stroke="${color}" stroke-width="26" stroke-linecap="round"
    stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${cx} ${ringY})"/>
  <text x="${cx}" y="${ringY + 24}" text-anchor="middle" fill="${FG}" font-family="${fontStack}" font-size="${r * 0.85}" font-weight="800">${score}</text>
  <text x="${cx}" y="${ringY + r + (variant === "portrait" ? 90 : 70)}" text-anchor="middle" fill="${color}" font-family="${fontStack}" font-size="60" font-weight="800">${esc(report.scores.grade)}</text>
  ${verdictText}
  <text x="${cx}" y="${H - 60}" text-anchor="middle" fill="${DIM}" font-family="${fontStack}" font-size="28">Judged on a phone · verdict.app</text>
</svg>`;
}
