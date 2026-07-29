/**
 * Weighted composite score. Weights per the product brief:
 * clarity 25, conversion/copy 25, mobile 20, performance 15, trust 10, accessibility 5.
 */

export interface SubScores {
  clarity: number;
  copy: number;
  mobile: number;
  performance: number;
  trust: number;
  accessibility: number;
}

const WEIGHTS: Record<keyof SubScores, number> = {
  clarity: 25,
  copy: 25,
  mobile: 20,
  performance: 15,
  trust: 10,
  accessibility: 5,
};

export function compositeScore(s: SubScores): number {
  let total = 0;
  for (const key of Object.keys(WEIGHTS) as Array<keyof SubScores>) {
    total += s[key] * WEIGHTS[key];
  }
  return Math.round(total / 100);
}

export function letterGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C-";
  if (score >= 50) return "D+";
  if (score >= 45) return "D";
  return "F";
}
