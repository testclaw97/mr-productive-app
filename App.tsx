// App shell — a minimal, dependency-light tab switcher, now fronted by a first-run
// onboarding flow.
//
// ROOT ROUTING: on launch we read the persisted `onboardingDone` flag. First run →
// OnboardingFlow (welcome → pick distractions → protection → done); every later launch →
// straight to the app. Finishing onboarding sets the flag and lands the user on HOME (the
// calm status screen), NOT the raw coach. The AI-consent notice therefore appears at the
// coach's natural first use, not as the app's cold open.
//
// NAV APPROACH: deliberately NOT react-navigation / expo-router. The app has flat, peer
// surfaces (Home, Coach, Blocklist, Protect, Settings) with no stacks/params/deep-links,
// so a single `useState` tab index + a bottom tab bar is the whole requirement — works
// identically on web and native, trivial to swap for a real router later. Each screen is
// kept MOUNTED (toggled with `display`) rather than remounted on tab press, so an
// in-progress coach negotiation isn't lost when the user peeks at another tab. A light
// per-tab fade/slide plays each time a tab becomes active.
//
// IA / ORDER: Home first (reassuring status), then Coach (reached at its natural moment),
// then Blocklist, Protect, Settings.
//
// SAFE AREAS: react-native-safe-area-context supplies the notch / home-indicator insets.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import CoachScreen from "./src/screens/CoachScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import BlocklistScreen from "./src/screens/BlocklistScreen";
import ProtectionScreen from "./src/screens/ProtectionScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import SetDeadlineScreen, { type DeadlineDoneResult } from "./src/screens/SetDeadlineScreen";
import OnboardingFlow from "./src/onboarding/OnboardingFlow";
import { hasCompletedOnboarding } from "./src/storage/onboarding";
import { getState } from "./src/api/coach";
import { getInstallId } from "./src/api/install";
import { DEADLINE_TO_COACH } from "./src/copy";
import { colors, type as typeScale } from "./src/theme";
import Mascot from "./src/ui/Mascot";

type Tab = "home" | "coach" | "blocklist" | "protect" | "settings";

const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: "home", label: "Home", glyph: "🏠" },
  { key: "coach", label: "Coach", glyph: "💬" },
  { key: "blocklist", label: "Blocklist", glyph: "🛡️" },
  // Protect = the Android permission-onboarding + service control. On web/iOS it shows
  // an honest "Android only" note (the blocker is a no-op off Android).
  { key: "protect", label: "Protect", glyph: "🔒" },
  { key: "settings", label: "Settings", glyph: "⚙️" },
];

// A tab page that stays mounted (display-toggled) but plays a gentle fade/slide each time
// it becomes the active tab — a calm arrival without ever remounting its screen.
function TabPage({ active, children }: { active: boolean; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(active ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(active ? 0 : 8)).current;

  useEffect(() => {
    if (!active) return;
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 3 }),
    ]).start();
  }, [active, opacity, translateY]);

  return (
    <View style={[styles.page, !active && styles.hidden]} pointerEvents={active ? "auto" : "none"}>
      <Animated.View style={[styles.pageAnim, { opacity, transform: [{ translateY }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

// Where the deadline picker should return the user once it's finished. `null` = stay
// put (the app-open daily prompt, or the Home CTA — both land back on Home).
type DeadlineState = { visible: boolean; returnTo: Tab | null };

function AppShell() {
  const [tab, setTab] = useState<Tab>("home");
  // Bumped whenever the daily deadline changes, so the mounted Home + Coach screens
  // re-fetch state (they read /api/v2/state only at boot) and reflect the new budget.
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [deadline, setDeadline] = useState<DeadlineState>({ visible: false, returnTo: null });
  const insets = useSafeAreaInsets();

  const navigate = useCallback((target: Tab) => setTab(target), []);

  // Open the quick deadline picker. `returnTo` is the tab to land on after a successful
  // lock (e.g. "coach" when the user came to negotiate a session).
  const openDeadline = useCallback((returnTo: Tab | null) => {
    setDeadline({ visible: true, returnTo });
  }, []);

  // APP-OPEN ROUTING: on launch (post-onboarding) ask the coach backend where we stand.
  // Because the daily budget re-negotiates each new LOCAL day, `needsLimit` is the
  // natural daily prompt — surface the picker over Home so the user sets today's
  // deadline before anything else (this also covers the blocked-app entry, which just
  // opens the app and lands here). Fail-soft: any error just shows the normal Home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const installId = await getInstallId();
      const state = await getState(installId);
      if (cancelled || !state.ok) return;
      if (state.needsLimit) openDeadline(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [openDeadline]);

  const onDeadlineDone = useCallback(
    (_result: DeadlineDoneResult) => {
      const returnTo = deadline.returnTo;
      setDeadline({ visible: false, returnTo: null });
      // Nudge the mounted screens to re-read state so the new budget shows immediately.
      setRefreshSignal((n) => n + 1);
      if (returnTo) setTab(returnTo);
    },
    [deadline.returnTo]
  );

  const closeDeadline = useCallback(() => {
    setDeadline({ visible: false, returnTo: null });
  }, []);

  return (
    // Pad the top by the notch inset so every screen's header clears the cutout.
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.appLayer, { paddingTop: insets.top }]}>
        <View style={styles.body}>
          <TabPage active={tab === "home"}>
            <DashboardScreen
              onNavigate={navigate}
              onSetDeadline={() => openDeadline(null)}
              refreshSignal={refreshSignal}
            />
          </TabPage>
          <TabPage active={tab === "coach"}>
            <CoachScreen
              onNeedDeadline={() => openDeadline("coach")}
              refreshSignal={refreshSignal}
            />
          </TabPage>
          <TabPage active={tab === "blocklist"}>
            <BlocklistScreen />
          </TabPage>
          <TabPage active={tab === "protect"}>
            <ProtectionScreen />
          </TabPage>
          <TabPage active={tab === "settings"}>
            <SettingsScreen />
          </TabPage>
        </View>

        {/* Bottom tab bar — extra bottom padding clears the home indicator / gesture bar. */}
        <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={({ pressed }) => [styles.tabItem, pressed && styles.tabItemPressed]}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t.label}
                testID={`tab-${t.key}`}
              >
                <View style={[styles.tabGlyphWrap, active && styles.tabGlyphWrapActive]}>
                  <Text style={[styles.tabGlyph, active && styles.tabGlyphActive]}>{t.glyph}</Text>
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* The quick deadline picker — a full-screen layer over everything (tab bar too).
          Shown at every "needs a deadline" moment: app open on a new day, the Home CTA,
          the Coach's "set your deadline first" gate. */}
      {deadline.visible && (
        <View style={styles.deadlineLayer}>
          <SetDeadlineScreen
            onDone={onDeadlineDone}
            onClose={closeDeadline}
            doneLabel={deadline.returnTo === "coach" ? DEADLINE_TO_COACH : undefined}
          />
        </View>
      )}
    </View>
  );
}

// The boot splash while we read the onboarding flag — the mascot, gently, so first paint
// is branded rather than a blank flash.
function BootSplash() {
  return (
    <View style={styles.splash}>
      <Mascot size={88} />
      <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
    </View>
  );
}

function Root() {
  // null = still reading the flag; true/false = show onboarding or not.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await hasCompletedOnboarding();
      if (!cancelled) setShowOnboarding(!done);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (showOnboarding === null) return <BootSplash />;
  if (showOnboarding) return <OnboardingFlow onDone={() => setShowOnboarding(false)} />;
  return <AppShell />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appLayer: { flex: 1 },
  // The deadline picker sits above the app (tab bar included) on its own opaque layer.
  deadlineLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 10,
  },
  body: { flex: 1 },
  // Absolute-fill each page so the inactive (display:none) ones don't consume layout.
  page: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  pageAnim: { flex: 1 },
  hidden: { display: "none" },

  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },

  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bgSoft,
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 2 },
  tabItemPressed: { opacity: 0.6 },
  tabGlyphWrap: {
    width: 44,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  tabGlyphWrapActive: { backgroundColor: colors.accentSoft },
  tabGlyph: { fontSize: 19, opacity: 0.5 },
  tabGlyphActive: { opacity: 1 },
  tabLabel: { ...typeScale.label, color: colors.muted, letterSpacing: 0.2, textTransform: "none", fontSize: 11 },
  tabLabelActive: { color: colors.accent },
});
