// The shared design tokens — the extension's dark, premium palette (accent #6c5cff),
// grown into a full design system: a layered surface stack, a type scale, a spacing
// scale, radius + shadow tokens. Every screen imports from here; a palette change is a
// one-file edit. Plain constants → zero platform assumptions, shared everywhere.
//
// The original token names (colors.bg/surface/surface2/line, space.s1…s5, radius sm/md/lg)
// are PRESERVED verbatim so existing screens keep compiling; the new tokens layer on top.
import type { TextStyle } from "react-native";

export const colors = {
  // --- surface stack (darkest → lightest) — layered depth, not one flat plane --------
  bg: "#0b0b10", // app ground (a touch deeper than before for more contrast)
  bgSoft: "#0f0f16", // gradient partner / raised ground
  surface: "#15151d", // cards
  surface2: "#1b1b25", // nested surfaces / inputs
  surface3: "#22222e", // elevated / hover
  line: "#24242e", // hairline borders
  lineStrong: "#30303c", // stronger dividers / input focus

  fg: "#f4f4f8",
  fg2: "#c8c8d4",
  muted: "#8b8b9a",
  faint: "#5f5f6e",

  accent: "#6c5cff",
  accent2: "#8f83ff", // lighter accent for gradients / highlights
  accentDeep: "#5546e6",
  accentSoft: "rgba(108, 92, 255, 0.13)",
  accentSofter: "rgba(108, 92, 255, 0.07)",
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

// The extension's 8px spacing scale (--s1…--s5), plus a fine step (s0) and a large one
// (s6) so paddings/gaps line up 1:1 with the desktop blocker and scale to hero layouts.
export const space = {
  s0: 4,
  s1: 8,
  s2: 16,
  s3: 24,
  s4: 32,
  s5: 48,
  s6: 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

// A single soft-depth system. On web react-native-web maps shadow* → box-shadow; on
// Android `elevation` supplies the depth; on iOS the shadow* fields do. One token, three
// platforms — kept restrained (premium ≠ heavy drop shadows).
export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 8,
  },
  soft: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  accent: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

// A proper type scale — one place for the whole hierarchy. Spread into a StyleSheet
// entry (`{ ...type.heading, color: colors.fg }`). Typed as TextStyle so the literal
// fontWeight / letterSpacing values stay assignable to RN's Text styles.
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.3 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.2 },
  subheading: { fontSize: 17, lineHeight: 23, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: "400" },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
} as const satisfies Record<string, TextStyle>;
