// Set today's deadline — the QUICK PICKER that replaces the coach's limit negotiation.
//
// THE PRODUCT DECISION: the user picks their own daily distraction budget themselves,
// with a slider — no chat, no brain call. The coach now ONLY negotiates unblocking a
// specific app/site for X minutes (a session). The daily deadline is set here, directly,
// via POST /api/v2/limit/set — which CLAMPS to [10,120] and FREEZES the value for the
// local day (a same-day re-set returns the stored value, unchanged).
//
// This screen is surfaced at every "needs a deadline" moment (app open on a new day, the
// Home CTA, the Coach's "set your deadline first" gate). On a successful lock — or when
// the day's deadline is already frozen — it hands control back to the parent via onDone,
// which routes the user onward (to Home, or back to the coach for the session they came
// for).
//
// SHARED-SAFE + SAFETY parity with the rest of the app: pure React Native (the one dep is
// the Expo-supported community Slider, which renders on web via react-native-web). Every
// dynamic string renders through <Text> — never markup. The server is the single source
// of truth for the number; we render only what it hands back and never invent a budget.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getState, setLimit } from "../api/coach";
import { getInstallId } from "../api/install";
import { colors, radius, shadow, space, type } from "../theme";
import { COPY } from "../copy";
import PressableScale from "../ui/PressableScale";
import Mascot from "../ui/Mascot";
import {
  DEADLINE_COMMITMENT,
  DEADLINE_CONTINUE,
  DEADLINE_FROZEN_LABEL,
  DEADLINE_FROZEN_NOTE,
  DEADLINE_FROZEN_RESET,
  DEADLINE_LOCK_CTA,
  DEADLINE_LOCKED_SUB,
  DEADLINE_LOCKED_TITLE,
  DEADLINE_LOCKING,
  DEADLINE_PRESETS,
  DEADLINE_SUB,
  DEADLINE_TITLE,
  DEADLINE_UNIT,
} from "../copy";

// The server's hard clamp — mirrored here only to bound the slider UI. The BACKEND is
// still the authority: whatever it returns is what we render.
const MIN = 10;
const MAX = 120;
const STEP = 5;
const DEFAULT = 60;

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n / STEP) * STEP));

// What the parent needs to know when the picker is finished.
export interface DeadlineDoneResult {
  /** True when THIS session locked the value in; false when it was already frozen. */
  locked: boolean;
  /** The day's stored deadline (server truth), or null if we couldn't set/read it. */
  dailyLimitMin: number | null;
}

type Phase = "loading" | "picker" | "locked" | "frozen" | "error";

export default function SetDeadlineScreen({
  onDone,
  onClose,
  doneLabel = DEADLINE_CONTINUE,
}: {
  /** Called when the user finishes — after a lock, or after acknowledging a frozen day. */
  onDone: (result: DeadlineDoneResult) => void;
  /** Optional soft dismiss ("Not now"). When absent, no close affordance is shown. */
  onClose?: () => void;
  /** Label for the terminal Continue button (e.g. "Talk to your coach"). */
  doneLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("loading");
  const [minutes, setMinutes] = useState<number>(DEFAULT);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // The server's stored value for the terminal (locked / frozen) states.
  const [storedMin, setStoredMin] = useState<number | null>(null);
  const installIdRef = useRef<string | null>(null);

  // --- boot: know if today's deadline is already frozen before showing the picker ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const installId = await getInstallId();
      if (cancelled) return;
      installIdRef.current = installId;

      const state = await getState(installId);
      if (cancelled) return;

      if (!state.ok) {
        setStatus(state.error === "BACKEND_UNREACHABLE" ? COPY.unreachable : COPY.generic);
        setPhase("error");
        return;
      }

      // Already set today (needsLimit false / a real number) → read-only frozen view.
      if (!state.needsLimit && typeof state.dailyLimitMin === "number") {
        setStoredMin(state.dailyLimitMin);
        setPhase("frozen");
        return;
      }
      setPhase("picker");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSlide = useCallback((v: number) => setMinutes(clamp(v)), []);
  const step = useCallback(
    (delta: number) => setMinutes((m) => clamp(m + delta)),
    []
  );
  const pickPreset = useCallback((v: number) => setMinutes(clamp(v)), []);

  // --- lock it in: the single direct set (clamped + frozen server-side) --------------
  const lockIn = useCallback(async () => {
    if (busy) return;
    const installId = installIdRef.current;
    if (!installId) return;
    setBusy(true);
    setStatus("");
    const res = await setLimit(installId, minutes);
    setBusy(false);
    if (!res.ok) {
      setStatus(res.error === "BACKEND_UNREACHABLE" ? COPY.unreachable : COPY.generic);
      return;
    }
    // The server returns the STORED value — which may differ from what we asked for if
    // the day was already frozen. Either way we show the truth and proceed.
    setStoredMin(res.dailyLimitMin);
    setPhase(res.dailyLimitMin === minutes ? "locked" : "frozen");
  }, [busy, minutes]);

  const finish = useCallback(
    (locked: boolean) => onDone({ locked, dailyLimitMin: storedMin }),
    [onDone, storedMin]
  );

  // ---------------------------------------------------------------------------------
  if (phase === "loading") {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>One moment…</Text>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <TopBar onClose={onClose} />
        <View style={[styles.center, styles.flex]}>
          <Text style={styles.errorText}>{status}</Text>
          <PressableScale
            onPress={() => {
              setStatus("");
              setPhase("loading");
              // Re-run boot by nudging the effect: simplest is a fresh state read here.
              void (async () => {
                const installId = installIdRef.current ?? (await getInstallId());
                installIdRef.current = installId;
                const s = await getState(installId);
                if (!s.ok) {
                  setStatus(s.error === "BACKEND_UNREACHABLE" ? COPY.unreachable : COPY.generic);
                  setPhase("error");
                  return;
                }
                if (!s.needsLimit && typeof s.dailyLimitMin === "number") {
                  setStoredMin(s.dailyLimitMin);
                  setPhase("frozen");
                  return;
                }
                setPhase("picker");
              })();
            }}
            accessibilityRole="button"
            style={styles.primaryBtn}
            testID="deadline-retry"
          >
            <Text style={styles.primaryBtnText}>Retry</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  // Terminal read-only states (just-locked, or already-frozen from an earlier set).
  if (phase === "locked" || phase === "frozen") {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.terminalScroll} showsVerticalScrollIndicator={false}>
          <LockedCard
            justLocked={phase === "locked"}
            minutes={storedMin ?? minutes}
          />
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
          <PressableScale
            onPress={() => finish(phase === "locked")}
            accessibilityRole="button"
            accessibilityLabel={doneLabel}
            style={styles.primaryBtn}
            testID="deadline-continue"
          >
            <Text style={styles.primaryBtnText}>{doneLabel}</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  // --- the picker -------------------------------------------------------------------
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TopBar onClose={onClose} />
      <ScrollView contentContainerStyle={styles.pickerScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <Mascot size={68} />
        </View>
        <Text style={styles.title}>{DEADLINE_TITLE}</Text>
        <Text style={styles.sub}>{DEADLINE_SUB}</Text>

        {/* The big live readout — with fine −/+ steppers flanking it. */}
        <View style={styles.readoutCard}>
          <PressableScale
            onPress={() => step(-STEP)}
            disabled={minutes <= MIN}
            accessibilityRole="button"
            accessibilityLabel="Less time"
            style={[styles.stepBtn, minutes <= MIN && styles.stepBtnDisabled]}
            testID="deadline-minus"
          >
            <Text style={styles.stepBtnText}>−</Text>
          </PressableScale>

          <View style={styles.readout}>
            <Text style={styles.readoutNum} testID="deadline-readout" accessibilityLabel={`${minutes} minutes`}>
              {minutes}
            </Text>
            <Text style={styles.readoutUnit}>{DEADLINE_UNIT}</Text>
          </View>

          <PressableScale
            onPress={() => step(STEP)}
            disabled={minutes >= MAX}
            accessibilityRole="button"
            accessibilityLabel="More time"
            style={[styles.stepBtn, minutes >= MAX && styles.stepBtnDisabled]}
            testID="deadline-plus"
          >
            <Text style={styles.stepBtnText}>+</Text>
          </PressableScale>
        </View>

        {/* The slider — 10 → 120, step 5. */}
        <View style={styles.sliderWrap}>
          <Slider
            style={styles.slider}
            minimumValue={MIN}
            maximumValue={MAX}
            step={STEP}
            value={minutes}
            onValueChange={onSlide}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.surface3}
            thumbTintColor={Platform.OS === "android" ? colors.accent : colors.accent2}
            accessibilityLabel="Daily distraction budget in minutes"
            testID="deadline-slider"
          />
          <View style={styles.sliderScale}>
            <Text style={styles.sliderScaleText}>{MIN}</Text>
            <Text style={styles.sliderScaleText}>{MAX} min</Text>
          </View>
        </View>

        {/* Preset chips — quick jumps. */}
        <View style={styles.presetRow}>
          {DEADLINE_PRESETS.map((p) => {
            const on = minutes === p;
            return (
              <PressableScale
                key={p}
                onPress={() => pickPreset(p)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${p} minutes`}
                style={[styles.presetChip, on && styles.presetChipOn]}
                testID={`deadline-preset-${p}`}
              >
                <Text style={[styles.presetText, on && styles.presetTextOn]}>{p}</Text>
              </PressableScale>
            );
          })}
        </View>

        {status !== "" && <Text style={styles.status}>{status}</Text>}
      </ScrollView>

      {/* Lock it in — the deliberate commitment. */}
      <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
        <Text style={styles.commitment}>{DEADLINE_COMMITMENT}</Text>
        <PressableScale
          onPress={lockIn}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={DEADLINE_LOCK_CTA}
          style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
          testID="deadline-lock"
        >
          {busy ? (
            <View style={styles.lockBusy}>
              <ActivityIndicator color={colors.onAccent} />
              <Text style={styles.primaryBtnText}>{DEADLINE_LOCKING}</Text>
            </View>
          ) : (
            <Text style={styles.primaryBtnText}>{DEADLINE_LOCK_CTA}</Text>
          )}
        </PressableScale>
      </View>
    </View>
  );
}

// A minimal top bar with an optional soft dismiss (a down chevron / "Not now").
function TopBar({ onClose }: { onClose?: () => void }) {
  if (!onClose) return <View style={styles.topBarSpacer} />;
  return (
    <View style={styles.topBar}>
      <PressableScale
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={10}
        style={styles.closeBtn}
        testID="deadline-close"
      >
        <Text style={styles.closeText}>Not now</Text>
      </PressableScale>
    </View>
  );
}

// The terminal card — a small celebratory beat when just locked, calm when already frozen.
function LockedCard({ justLocked, minutes }: { justLocked: boolean; minutes: number }) {
  const scale = useRef(new Animated.Value(justLocked ? 0 : 1)).current;
  useEffect(() => {
    if (!justLocked) return;
    Animated.sequence([
      Animated.delay(80),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 7, bounciness: 12 }),
    ]).start();
  }, [justLocked, scale]);

  return (
    <View style={styles.lockedWrap}>
      <Animated.View style={[styles.lockedCheck, { transform: [{ scale }] }]}>
        <Text style={styles.lockedCheckMark}>{justLocked ? "✓" : "🔒"}</Text>
      </Animated.View>
      <Text style={styles.lockedTitle}>
        {justLocked ? DEADLINE_LOCKED_TITLE : DEADLINE_FROZEN_LABEL}
      </Text>
      <View style={styles.lockedNumRow}>
        <Text style={styles.lockedNum}>{minutes}</Text>
        <Text style={styles.lockedUnit}> {DEADLINE_UNIT} · {DEADLINE_FROZEN_RESET}</Text>
      </View>
      <Text style={styles.lockedSub}>
        {justLocked ? DEADLINE_LOCKED_SUB : DEADLINE_FROZEN_NOTE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  dim: { color: colors.muted, fontSize: 13 },
  errorText: { color: colors.fg2, fontSize: 14, lineHeight: 20, textAlign: "center", paddingHorizontal: space.s3 },

  topBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space.s2, paddingTop: space.s1, height: 44 },
  topBarSpacer: { height: 44 + 8 },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 8 },
  closeText: { ...type.bodyStrong, color: colors.muted },

  pickerScroll: { flexGrow: 1, padding: space.s3, paddingTop: space.s1, alignItems: "stretch" },
  heroWrap: { alignItems: "center", marginBottom: space.s2 },
  title: { ...type.title, color: colors.fg, textAlign: "center" },
  sub: { ...type.body, color: colors.fg2, textAlign: "center", marginTop: 6, marginBottom: space.s3 },

  // Big readout
  readoutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: space.s3,
    paddingHorizontal: space.s3,
    ...shadow.card,
  },
  readout: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", flex: 1 },
  readoutNum: { fontSize: 72, lineHeight: 76, fontWeight: "800", color: colors.fg, letterSpacing: -2, fontVariant: ["tabular-nums"] },
  readoutUnit: { fontSize: 22, fontWeight: "700", color: colors.muted, marginLeft: 8 },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: { color: colors.fg, fontSize: 30, lineHeight: 34, fontWeight: "700" },

  // Slider
  sliderWrap: { marginTop: space.s3 },
  slider: { width: "100%", height: 40 },
  sliderScale: { flexDirection: "row", justifyContent: "space-between", marginTop: -4, paddingHorizontal: 4 },
  sliderScaleText: { ...type.caption, color: colors.muted, fontVariant: ["tabular-nums"] },

  // Presets
  presetRow: { flexDirection: "row", gap: 10, marginTop: space.s3 },
  presetChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  presetChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  presetText: { ...type.subheading, color: colors.fg2, fontVariant: ["tabular-nums"] },
  presetTextOn: { color: colors.accent },

  status: { color: colors.warn, fontSize: 14, marginTop: space.s2, textAlign: "center" },

  // Footer / primary
  footer: {
    paddingHorizontal: space.s2,
    paddingTop: space.s2,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  commitment: { ...type.caption, color: colors.muted, textAlign: "center" },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: "center",
    ...shadow.accent,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { ...type.subheading, color: colors.onAccent },
  lockBusy: { flexDirection: "row", alignItems: "center", gap: 10 },

  // Terminal (locked / frozen)
  terminalScroll: { flexGrow: 1, justifyContent: "center", padding: space.s3 },
  lockedWrap: { alignItems: "center", gap: space.s1 },
  lockedCheck: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.s1,
    ...shadow.accent,
  },
  lockedCheckMark: { color: colors.onAccent, fontSize: 44, lineHeight: 50, fontWeight: "800" },
  lockedTitle: { ...type.label, color: colors.accent, marginTop: space.s1 },
  lockedNumRow: { flexDirection: "row", alignItems: "baseline" },
  lockedNum: { fontSize: 56, lineHeight: 60, fontWeight: "800", color: colors.fg, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  lockedUnit: { ...type.subheading, color: colors.muted },
  lockedSub: { ...type.body, color: colors.fg2, textAlign: "center", marginTop: space.s1, paddingHorizontal: space.s2 },
});
