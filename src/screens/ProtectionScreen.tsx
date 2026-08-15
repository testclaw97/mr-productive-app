// Protect — the Android permission-onboarding + service-control screen.
//
// Real app-blocking on Android needs TWO "special access" permissions that CANNOT be
// granted by an ordinary runtime dialog — the OS only lets the user flip them on inside
// Settings:
//   1. Usage access        → so we can see which app is in the foreground.
//   2. Display over other apps → so we can draw the block overlay on top of it.
// This screen explains WHY each is needed, deep-links into the right Settings screen via
// the native module, and — once both are on — starts the foreground blocker service.
//
// PLATFORM: the whole blocking layer is Android-only. On web/iOS `blocker.isSupported()`
// is false, so this screen shows an honest "Android only" note instead of dead buttons.
// It re-checks permission state every time the app returns to the foreground (the user
// leaves to Settings and comes back), so the statuses stay live without a manual refresh.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { blocker } from "../native/Blocker";
import { getBlocklist } from "../storage/blocklist";
import { colors, radius, space } from "../theme";

// Onboarding copy is Android-specific (NOT shared with the extension), so it lives here
// rather than in the shared copy.ts.
const INTRO =
  "To block apps for real, Mr. Productive needs two Android permissions. You grant each " +
  "one in Settings — we only take you there; nothing is turned on without you.";

type PermState = {
  supported: boolean;
  usage: boolean;
  overlay: boolean;
  running: boolean;
};

const UNKNOWN: PermState = {
  supported: false,
  usage: false,
  overlay: false,
  running: false,
};

export default function ProtectionScreen() {
  const [state, setState] = useState<PermState>(UNKNOWN);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);
  const runningRef = useRef(false);

  // Re-read the live permission state from the native module. Safe on every platform:
  // the no-op blocker resolves these to false.
  const refresh = useCallback(async () => {
    const supported = blocker.isSupported();
    if (!supported) {
      setState(UNKNOWN);
      setLoaded(true);
      return;
    }
    const [usage, overlay] = await Promise.all([
      blocker.hasUsageAccess(),
      blocker.hasOverlayPermission(),
    ]);
    setState({ supported, usage, overlay, running: runningRef.current });
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    // The user leaves to Settings to grant a permission and comes back — re-check then.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const grantUsage = useCallback(() => {
    void blocker.requestUsageAccess();
  }, []);

  const grantOverlay = useCallback(() => {
    void blocker.requestOverlayPermission();
  }, []);

  const startProtecting = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    try {
      // Push the current blocklist into the native store before the service starts, so
      // it has something to guard from the first tick.
      const list = await getBlocklist();
      await blocker.blockApps(list);
      await blocker.startService();
      runningRef.current = true;
      setState((s) => ({ ...s, running: true }));
    } finally {
      setStarting(false);
    }
  }, [starting]);

  const stopProtecting = useCallback(async () => {
    await blocker.stopService();
    runningRef.current = false;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const bothGranted = state.usage && state.overlay;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Protect</Text>

      {!state.supported ? (
        // Web / iOS: no native blocking layer. Say so plainly rather than showing
        // buttons that do nothing.
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Android only</Text>
          <Text style={styles.cardBody} testID="protect-unsupported">
            App blocking runs on Android. On the web the desktop blocker is the Chrome
            extension; here you can still set your budget with the coach and manage your
            blocklist. Install the Android app to turn on real blocking.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.intro}>{INTRO}</Text>

          {/* Permission 1 — Usage access */}
          <PermissionCard
            step={1}
            title="Usage access"
            why="Lets Mr. Productive see which app is open, so it knows when to step in. It never reads what you do inside an app — only which one is in front."
            granted={state.usage}
            onGrant={grantUsage}
            testID="perm-usage"
          />

          {/* Permission 2 — Display over other apps */}
          <PermissionCard
            step={2}
            title="Display over other apps"
            why="Lets Mr. Productive draw the block screen on top of a blocked app until you've earned time from your coach."
            granted={state.overlay}
            onGrant={grantOverlay}
            testID="perm-overlay"
          />

          {/* Start / stop the service */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {state.running ? "Protection is on" : "Start protecting"}
            </Text>
            <Text style={styles.cardBody}>
              {bothGranted
                ? state.running
                  ? "Mr. Productive is watching your blocked apps. You can stop any time."
                  : "Both permissions are on. Turn on protection to start guarding your blocklist."
                : "Grant both permissions above first."}
            </Text>
            {state.running ? (
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={stopProtecting}
                accessibilityRole="button"
                testID="protect-stop"
              >
                <Text style={styles.btnGhostText}>Stop protecting</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.btn, styles.btnPrimary, (!bothGranted || starting) && styles.btnDisabled]}
                onPress={startProtecting}
                disabled={!bothGranted || starting}
                accessibilityRole="button"
                testID="protect-start"
              >
                <Text style={styles.btnPrimaryText}>
                  {starting ? "Starting…" : "Start protecting"}
                </Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {loaded ? null : (
        <Text style={styles.loading} testID="protect-loading">
          Checking permissions…
        </Text>
      )}
    </ScrollView>
  );
}

function PermissionCard(props: {
  step: number;
  title: string;
  why: string;
  granted: boolean;
  onGrant: () => void;
  testID: string;
}) {
  return (
    <View style={styles.card} testID={props.testID}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>
          {props.step}. {props.title}
        </Text>
        <View style={[styles.badge, props.granted ? styles.badgeGood : styles.badgeNeeded]}>
          <Text style={[styles.badgeText, props.granted ? styles.badgeGoodText : styles.badgeNeededText]}>
            {props.granted ? "Granted" : "Needed"}
          </Text>
        </View>
      </View>
      <Text style={styles.cardBody}>{props.why}</Text>
      {!props.granted && (
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={props.onGrant}
          accessibilityRole="button"
          testID={`${props.testID}-grant`}
        >
          <Text style={styles.btnPrimaryText}>Open Settings</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.s2, gap: 14, paddingBottom: space.s4 },

  h1: { color: colors.fg, fontSize: 24, fontWeight: "800" },
  intro: { color: colors.fg2, fontSize: 14, lineHeight: 20, marginTop: -4 },
  loading: { color: colors.muted, fontSize: 13 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    gap: 10,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: { color: colors.fg, fontSize: 16, fontWeight: "700", flexShrink: 1 },
  cardBody: { color: colors.fg2, fontSize: 13, lineHeight: 19 },

  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeGood: { backgroundColor: colors.goodSoft, borderColor: colors.goodLine },
  badgeNeeded: { backgroundColor: colors.warnSoft, borderColor: colors.warnLine },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  badgeGoodText: { color: colors.good },
  badgeNeededText: { color: colors.warn },

  btn: {
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
  btnGhost: {
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  btnGhostText: { color: colors.fg2, fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.45 },
});
