// The shared design tokens — the extension's dark, premium palette (accent #6c5cff),
// lifted verbatim from extension/blocked/blocked.css so the app and the desktop
// blocker read as one product. Every screen imports from here; a palette change is
// a one-file edit. Plain constants → zero platform assumptions, shared everywhere.

export const colors = {
  bg: "#0d0d12",
  surface: "#15151d",
  surface2: "#1b1b25",
  line: "#24242e",

  fg: "#f3f3f6",
  fg2: "#c8c8d4",
  muted: "#8b8b9a",

  accent: "#6c5cff",
  accentSoft: "rgba(108, 92, 255, 0.13)",
  accentLine: "rgba(108, 92, 255, 0.4)",
  onAccent: "#ffffff",

  good: "#2ecc71",
  goodSoft: "rgba(46, 204, 113, 0.12)",
  goodLine: "rgba(46, 204, 113, 0.4)",
  onGood: "#04210f",

  warn: "#e0a838",
  warnSoft: "rgba(224, 168, 56, 0.1)",
  warnLine: "rgba(224, 168, 56, 0.35)",
} as const;

// The extension's 8px spacing scale (--s1…--s5), so paddings/gaps line up 1:1.
export const space = {
  s1: 8,
  s2: 16,
  s3: 24,
  s4: 32,
  s5: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;
