import { Platform } from "react-native";

/** Verdict design tokens — dark-first, near-black base, acid-green accent. */

export const colors = {
  bg: "#0B0D10",
  surface: "#12161B",
  surface2: "#1A1F26",
  border: "#232A33",
  text: "#F2F4F6",
  dim: "#8A929C",
  faint: "#4A5561",
  accent: "#C6FF3D",
  accentPressed: "#A8E32A",
  onAccent: "#0B0D10",
  red: "#FF5D5D",
  amber: "#FFC53D",
  green: "#C6FF3D",
};

export const severityColors: Record<string, string> = {
  critical: colors.red,
  major: colors.amber,
  minor: colors.dim,
};

export function scoreColor(score: number): string {
  if (score >= 75) return colors.green;
  if (score >= 55) return colors.amber;
  return colors.red;
}

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { s: 10, m: 14, l: 20, xl: 28 } as const;

export const fonts = {
  // SF Pro on iOS via the system stack; SF Rounded for numbers/scores.
  display: Platform.select({ ios: "System", default: "sans-serif" })!,
  rounded: Platform.select({ ios: "SF Pro Rounded", default: "sans-serif" })!,
};

export const type = {
  hero: { fontSize: 34, fontWeight: "800" as const, color: colors.text, letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: "800" as const, color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 19, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.text, lineHeight: 22 },
  dim: { fontSize: 14, fontWeight: "400" as const, color: colors.dim, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: "600" as const, color: colors.dim, letterSpacing: 1.2, textTransform: "uppercase" as const },
};
