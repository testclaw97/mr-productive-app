// First-run onboarding — the #1 retention fix.
//
// The app used to open COLD on the coach mid-conversation, behind an AI-consent notice,
// with nothing set up. This flow replaces that first impression with value BEFORE
// commitment: a warm hook, a focus-report stat, a low-friction "what steals your time?"
// pick, a plain-spoken permissions primer, and a small celebratory payoff. Four screens,
// one purpose each (Hick's Law), progress dots (Zeigarnik), foot-in-the-door CTAs.
//
// It is shown ONCE — `hasCompletedOnboarding()` gates it at the app root; finishing sets
// the flag and lands the user on Home (never the raw coach). The AI-consent gate is left
// exactly where it was (inside the coach screen), so it now appears at the coach's natural
// first use rather than as the app's cold open.
//
// SHARED-SAFE: pure React Native + the kv / Blocker seams. Android-only permission wiring
// is live on Android and shown as an honest note on web/iOS. Every dynamic string renders
// through <Text> — never markup.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { blocker } from "../native/Blocker";
import { addToBlocklist } from "../storage/blocklist";
import { completeOnboarding } from "../storage/onboarding";
import { colors, radius, shadow, space, type } from "../theme";
import PressableScale from "../ui/PressableScale";
import ProgressDots from "../ui/ProgressDots";
import FadeIn from "../ui/FadeIn";
import Mascot from "../ui/Mascot";
import {
  ONB_BACK,
  ONB_DONE_BODY,
  ONB_DONE_CTA,
  ONB_DONE_TITLE,
  ONB_PICK_CTA,
  ONB_PICK_SUB,
  ONB_PICK_TITLE,
  ONB_PICK_WEB_NOTE,
  ONB_PROTECT_CTA,
  ONB_PROTECT_OVERLAY_TITLE,
  ONB_PROTECT_OVERLAY_WHY,
  ONB_PROTECT_SUB,
  ONB_PROTECT_TITLE,
  ONB_PROTECT_USAGE_TITLE,
  ONB_PROTECT_USAGE_WHY,
  ONB_PROTECT_WEB_BODY,
  ONB_PROTECT_WEB_TITLE,
  ONB_SKIP,
  ONB_WELCOME_CTA,
  ONB_WELCOME_KICKER,
  ONB_WELCOME_STAT_BIG,
  ONB_WELCOME_STAT_LEAD,
  ONB_WELCOME_STAT_TAIL,
  ONB_WELCOME_TITLE,
  ONBOARDING_APPS,
} from "../copy";

const TOTAL = 4;
const CTA_LABELS = [ONB_WELCOME_CTA, ONB_PICK_CTA, ONB_PROTECT_CTA, ONB_DONE_CTA];

export default function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);

  // Persist the chosen distractions (dedup-safe) so the pick isn't lost, then mark
  // onboarding done and hand control back to the app root (→ Home).
  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    for (const entry of picks) {
      await addToBlocklist(entry);
    }
    await completeOnboarding();
    onDone();
  }, [finishing, picks, onDone]);

  const goNext = useCallback(() => {
    if (step < TOTAL - 1) setStep((s) => s + 1);
    else void finish();
  }, [step, finish]);

  const goBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const togglePick = useCallback((entry: string) => {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(entry)) next.delete(entry);
      else next.add(entry);
      return next;
    });
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Top bar — progress + a light-touch skip (hidden on the final payoff screen). */}
      <View style={styles.topBar}>
        <ProgressDots total={TOTAL} index={step} />
        {step < TOTAL - 1 ? (
          <PressableScale
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            testID="onb-skip"
            style={styles.skipBtn}
          >
            <Text style={styles.skipText}>{ONB_SKIP}</Text>
          </PressableScale>
        ) : (
          <View style={styles.skipBtn} />
        )}
      </View>

      {/* Step content — each step mounts fresh, so FadeIn re-runs its entrance. */}
      <View style={styles.body}>
        {step === 0 && <WelcomeStep key="s0" />}
        {step === 1 && (
          <PickStep key="s1" picks={picks} onToggle={togglePick} />
        )}
        {step === 2 && <ProtectStep key="s2" />}
        {step === 3 && <DoneStep key="s3" />}
      </View>

      {/* Nav — Back (once past the first screen) + the primary advance CTA. */}
      <View style={[styles.nav, { paddingBottom: 14 + insets.bottom }]}>
        {step > 0 ? (
          <PressableScale
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={ONB_BACK}
            testID="onb-back"
            style={styles.backBtn}
          >
            <Text style={styles.backText}>{ONB_BACK}</Text>
          </PressableScale>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <PressableScale
          onPress={goNext}
          disabled={finishing}
          accessibilityRole="button"
          accessibilityLabel={CTA_LABELS[step]}
          testID="onb-next"
          style={[styles.cta, finishing && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>{CTA_LABELS[step]}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------
// Screen 1 — welcome / hook
// ---------------------------------------------------------------------------------------

function WelcomeStep() {
  return (
    <ScrollView contentContainerStyle={styles.heroScroll} showsVerticalScrollIndicator={false}>
      <FadeIn style={styles.heroCenter}>
        <Mascot size={104} />
        <Text style={styles.kicker}>{ONB_WELCOME_KICKER}</Text>
        <Text style={styles.heroTitle}>{ONB_WELCOME_TITLE}</Text>

        {/* The focus-report hook — the number is the moment. */}
        <View style={styles.statCard}>
          <Text style={styles.statLead}>{ONB_WELCOME_STAT_LEAD}</Text>
          <Text style={styles.statBig}>{ONB_WELCOME_STAT_BIG}</Text>
          <Text style={styles.statTail}>{ONB_WELCOME_STAT_TAIL}</Text>
        </View>
      </FadeIn>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------
// Screen 2 — pick your distractions
// ---------------------------------------------------------------------------------------

function PickStep({
  picks,
  onToggle,
}: {
  picks: Set<string>;
  onToggle: (entry: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.stepScroll} showsVerticalScrollIndicator={false}>
      <FadeIn>
        <Text style={styles.stepTitle}>{ONB_PICK_TITLE}</Text>
        <Text style={styles.stepSub}>{ONB_PICK_SUB}</Text>

        <View style={styles.pickGrid}>
          {ONBOARDING_APPS.map((app) => {
            const on = picks.has(app.entry);
            return (
              <PressableScale
                key={app.entry}
                onPress={() => onToggle(app.entry)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={app.label}
                testID={`onb-pick-${app.entry}`}
                style={[styles.pickChip, on && styles.pickChipOn]}
              >
                <Text style={styles.pickGlyph}>{app.glyph}</Text>
                <Text style={[styles.pickLabel, on && styles.pickLabelOn]}>{app.label}</Text>
                <View style={[styles.pickTick, on && styles.pickTickOn]}>
                  {on && <Text style={styles.pickTickMark}>✓</Text>}
                </View>
              </PressableScale>
            );
          })}
        </View>

        {Platform.OS === "web" && (
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>{ONB_PICK_WEB_NOTE}</Text>
          </View>
        )}
      </FadeIn>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------
// Screen 3 — turn on protection (reuses the Protect content, primed to grant)
// ---------------------------------------------------------------------------------------

function ProtectStep() {
  const supported = blocker.isSupported();
  const [usage, setUsage] = useState(false);
  const [overlay, setOverlay] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) return;
    const [u, o] = await Promise.all([
      blocker.hasUsageAccess(),
      blocker.hasOverlayPermission(),
    ]);
    setUsage(u);
    setOverlay(o);
  }, [supported]);

  useEffect(() => {
    void refresh();
    // The user leaves to Settings and comes back — re-check the live grant state.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <ScrollView contentContainerStyle={styles.stepScroll} showsVerticalScrollIndicator={false}>
      <FadeIn>
        <Text style={styles.stepTitle}>{ONB_PROTECT_TITLE}</Text>

        {supported ? (
          <>
            <Text style={styles.stepSub}>{ONB_PROTECT_SUB}</Text>
            <PermissionRow
              glyph="👀"
              title={ONB_PROTECT_USAGE_TITLE}
              why={ONB_PROTECT_USAGE_WHY}
              granted={usage}
              onGrant={() => void blocker.requestUsageAccess()}
              testID="onb-perm-usage"
            />
            <PermissionRow
              glyph="🪟"
              title={ONB_PROTECT_OVERLAY_TITLE}
              why={ONB_PROTECT_OVERLAY_WHY}
              granted={overlay}
              onGrant={() => void blocker.requestOverlayPermission()}
              testID="onb-perm-overlay"
            />
          </>
        ) : (
          <View style={styles.webCard}>
            <Text style={styles.webCardTitle}>{ONB_PROTECT_WEB_TITLE}</Text>
            <Text style={styles.webCardBody}>{ONB_PROTECT_WEB_BODY}</Text>
          </View>
        )}
      </FadeIn>
    </ScrollView>
  );
}

function PermissionRow({
  glyph,
  title,
  why,
  granted,
  onGrant,
  testID,
}: {
  glyph: string;
  title: string;
  why: string;
  granted: boolean;
  onGrant: () => void;
  testID: string;
}) {
  return (
    <View style={styles.permCard} testID={testID}>
      <View style={styles.permHead}>
        <Text style={styles.permGlyph}>{glyph}</Text>
        <Text style={styles.permTitle}>{title}</Text>
        <View style={[styles.permBadge, granted ? styles.permBadgeOn : styles.permBadgeOff]}>
          <Text style={[styles.permBadgeText, granted ? styles.permBadgeTextOn : styles.permBadgeTextOff]}>
            {granted ? "On" : "Needed"}
          </Text>
        </View>
      </View>
      <Text style={styles.permWhy}>{why}</Text>
      {!granted && (
        <PressableScale
          onPress={onGrant}
          accessibilityRole="button"
          accessibilityLabel={`Open Settings for ${title}`}
          testID={`${testID}-grant`}
          style={styles.permBtn}
        >
          <Text style={styles.permBtnText}>Open Settings</Text>
        </PressableScale>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------
// Screen 4 — you're protected (the small celebratory moment)
// ---------------------------------------------------------------------------------------

function DoneStep() {
  // The one delightful beat: the check springs in, then the mascot + copy fade up.
  const checkScale = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const ringOpacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.spring(checkScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 6,
          bounciness: 12,
        }),
        // A single soft pulse ring behind the check.
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.5,
            duration: 620,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 620,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [checkScale, ringScale, ringOpacity]);

  return (
    <ScrollView contentContainerStyle={styles.heroScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCenter}>
        <View style={styles.checkWrap}>
          <Animated.View
            style={[
              styles.checkRing,
              { transform: [{ scale: ringScale }], opacity: ringOpacity },
            ]}
          />
          <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
            <Text style={styles.checkMark}>✓</Text>
          </Animated.View>
        </View>

        <FadeIn delay={260} style={styles.heroCenter}>
          <Text style={styles.doneTitle}>{ONB_DONE_TITLE}</Text>
          <Text style={styles.doneBody}>{ONB_DONE_BODY}</Text>
        </FadeIn>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.s2,
    paddingTop: space.s2,
    paddingBottom: space.s1,
  },
  skipBtn: { paddingVertical: 6, paddingHorizontal: 8, minWidth: 52, alignItems: "flex-end" },
  skipText: { ...type.bodyStrong, color: colors.muted },

  body: { flex: 1 },

  heroScroll: { flexGrow: 1, justifyContent: "center", padding: space.s3 },
  heroCenter: { alignItems: "center", gap: space.s2 },

  kicker: {
    ...type.label,
    color: colors.accent,
    marginTop: space.s1,
  },
  heroTitle: { ...type.display, color: colors.fg, textAlign: "center" },

  statCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s3,
    alignItems: "center",
    gap: 6,
    marginTop: space.s1,
    ...shadow.soft,
  },
  statLead: { ...type.caption, color: colors.muted, textAlign: "center" },
  statBig: { fontSize: 40, lineHeight: 46, fontWeight: "800", color: colors.accent, letterSpacing: -0.5 },
  statTail: { ...type.body, color: colors.fg2, textAlign: "center" },

  stepScroll: { flexGrow: 1, padding: space.s3, gap: space.s2 },
  stepTitle: { ...type.title, color: colors.fg },
  stepSub: { ...type.body, color: colors.fg2, marginTop: -4, marginBottom: space.s1 },

  pickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pickChip: {
    width: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  pickChipOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  pickGlyph: { fontSize: 20 },
  pickLabel: { ...type.bodyStrong, color: colors.fg2, flexShrink: 1 },
  pickLabelOn: { color: colors.fg },
  pickTick: {
    marginLeft: "auto",
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  pickTickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pickTickMark: { color: colors.onAccent, fontSize: 13, fontWeight: "800", lineHeight: 16 },

  noteCard: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    marginTop: space.s1,
  },
  noteText: { ...type.caption, color: colors.muted },

  // Protect step
  webCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentLine,
    padding: space.s3,
    gap: space.s1,
  },
  webCardTitle: { ...type.heading, color: colors.fg },
  webCardBody: { ...type.body, color: colors.fg2 },

  permCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    gap: 10,
    marginBottom: 12,
  },
  permHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  permGlyph: { fontSize: 20 },
  permTitle: { ...type.subheading, color: colors.fg, flexShrink: 1 },
  permBadge: {
    marginLeft: "auto",
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  permBadgeOn: { backgroundColor: colors.goodSoft, borderColor: colors.goodLine },
  permBadgeOff: { backgroundColor: colors.warnSoft, borderColor: colors.warnLine },
  permBadgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  permBadgeTextOn: { color: colors.good },
  permBadgeTextOff: { color: colors.warn },
  permWhy: { ...type.caption, color: colors.fg2 },
  permBtn: {
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  permBtnText: { ...type.bodyStrong, color: colors.fg },

  // Done step
  checkWrap: { width: 120, height: 120, alignItems: "center", justifyContent: "center" },
  checkRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.accentLine,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.accent,
  },
  checkMark: { color: colors.onAccent, fontSize: 48, fontWeight: "800", lineHeight: 54 },
  doneTitle: { ...type.title, color: colors.fg, textAlign: "center", marginTop: space.s1 },
  doneBody: { ...type.body, color: colors.fg2, textAlign: "center" },

  // Nav
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: space.s2,
    paddingTop: space.s1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  backBtn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  backText: { ...type.bodyStrong, color: colors.fg2 },
  backSpacer: { width: 0 },
  cta: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: "center",
    ...shadow.accent,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { ...type.subheading, color: colors.onAccent },
});
