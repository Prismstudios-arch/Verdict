import type { AuditReport } from "./store.js";

/**
 * A curated sample verdict shown on the home screen so new users see the
 * value before spending a credit. Uses a fictional startup ("Lumina") so no
 * real company's copy is misrepresented, but demonstrates the real output:
 * a spicy verdict, specific findings, and exact copy rewrites.
 */

const report: AuditReport = {
  url: "https://lumina.app",
  finalUrl: "https://lumina.app",
  domain: "lumina.app",
  fetchedAt: "2026-07-16T12:00:00.000Z",
  aiAnalysis: true,
  scores: {
    overall: 58,
    grade: "C-",
    clarity: 44,
    copy: 52,
    mobile: 71,
    performance: 78,
    trust: 40,
    accessibility: 66,
  },
  verdictLine:
    "Gorgeous gradient, mystery product — I scrolled for ten seconds and still couldn't tell you what Lumina actually does.",
  verdictParagraph:
    "Lumina's design instincts are strong — the hero looks like a funded startup. But the copy is doing none of the work. \"Work, reimagined\" tells a first-time visitor nothing, there's no proof anyone uses this, and the only button says \"Get Started\" with no sense of what you're starting. You'll lose people in the first five seconds not because the product is bad, but because they never found out what it is.",
  whatIsThis: "A sleek SaaS landing page for some kind of productivity or workflow tool — but the specifics are hidden behind abstract language.",
  whoIsItFor: "Unclear from the page — possibly teams, possibly freelancers. The copy never names its audience.",
  findings: [
    {
      source: "first_impression",
      severity: "critical",
      issue: "The headline says nothing concrete — a visitor can't tell what the product does",
      evidence: "Work, reimagined.",
      fix: "Lead with the specific outcome the product delivers, not an abstract slogan. Name the problem you solve in plain words.",
      rewriteBefore: "Work, reimagined.",
      rewriteAfter: "Turn scattered client feedback into a clean, prioritised to-do list — automatically.",
    },
    {
      source: "copy",
      severity: "major",
      issue: "The primary call-to-action is generic and low-commitment-clarity",
      evidence: "Get Started",
      fix: "Say what happens next and remove the perceived risk. Specific, benefit-led CTAs consistently outperform \"Get Started\".",
      rewriteBefore: "Get Started",
      rewriteAfter: "Start free — no card needed",
    },
    {
      source: "trust",
      severity: "major",
      issue: "No social proof anywhere above the fold — nothing signals that real people use this",
      evidence: "The first screen has a headline, a subhead and a button, but no logos, testimonials, user counts, or ratings.",
      fix: "Add a lightweight trust strip under the CTA: a row of recognisable customer logos, a star rating, or a \"used by 3,000+ teams\" line.",
      rewriteBefore: "",
      rewriteAfter: "",
    },
    {
      source: "copy",
      severity: "minor",
      issue: "The subheadline repeats the headline instead of adding detail",
      evidence: "The future of productivity, today.",
      fix: "Use the subhead to answer the question the headline raises: who it's for and how it works in one sentence.",
      rewriteBefore: "The future of productivity, today.",
      rewriteAfter: "Built for agencies drowning in Slack messages, email threads and \"quick calls.\"",
    },
    {
      source: "trust",
      severity: "minor",
      issue: "Pricing is hidden behind a \"Contact us\" — a friction point for self-serve buyers",
      evidence: "Pricing → Contact us",
      fix: "Show at least a starting price or a free tier. Hiding pricing signals \"expensive\" and filters out exactly the users a self-serve product wants.",
      rewriteBefore: "Contact us for pricing",
      rewriteAfter: "Free for solo users · Teams from £8/seat",
    },
  ],
  fixFirst: [],
  metrics: { ttfbMs: 210, lcpMs: 1900, totalKb: 1340, requestCount: 41 },
  screenshots: { mobileFold: null as unknown as string, mobileFull: null as unknown as string, desktopFold: "", walk: [] },
  costUsd: 0,
};

// Top 3 by severity for the "fix first" list.
report.fixFirst = report.findings.slice(0, 3);

export const sampleAuditSummary = {
  id: "sample",
  url: report.url,
  status: "complete" as const,
  step: "Done",
  percent: 100,
  createdAt: report.fetchedAt,
  error: null,
  score: report.scores.overall,
  grade: report.scores.grade,
  domain: report.domain,
  verdictLine: report.verdictLine,
  report: {
    ...report,
    screenshots: { mobileFold: null, mobileFull: null, desktopFold: null, walk: [] },
    shareUrl: "/r/sample",
    shareCardUrl: "/r/sample/card.png",
    isSample: true,
  },
};
