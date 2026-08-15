// App shell — a minimal, dependency-light tab switcher between the four surfaces.
//
// NAV APPROACH: deliberately NOT react-navigation / expo-router. The app has flat,
// peer surfaces (Coach, Dashboard, Blocklist, Settings) with no stacks, params, or
// deep links yet, so a single `useState` tab index + a bottom tab bar is the whole
// requirement — works identically on web and native, and trivial to swap for a real
// router when nested navigation actually arrives. Each screen is kept MOUNTED
// (rendered, toggled with `display`) rather than remounted on every tab press, so an
// in-progress coach negotiation isn't lost when the user peeks at another tab.
//
// SAFE AREAS: react-native-safe-area-context (Expo-supported) supplies the notch /
// home-indicator insets so the header clears the top cutout and the tab bar clears
// the bottom gesture bar on every device. SafeAreaView from react-native is a no-op on
// Android — this package is the cross-platform one.
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import { colors } from "./src/theme";

type Tab = "coach" | "dashboard" | "blocklist" | "protect" | "settings";

const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: "coach", label: "Coach", glyph: "💬" },
  { key: "dashboard", label: "Dashboard", glyph: "📊" },
  { key: "blocklist", label: "Blocklist", glyph: "🛡️" },
  // Protect = the Android permission-onboarding + service control. On web/iOS it shows
  // an honest "Android only" note (the blocker is a no-op off Android).
  { key: "protect", label: "Protect", glyph: "🔒" },
  { key: "settings", label: "Settings", glyph: "⚙️" },
];

function AppShell() {
  const [tab, setTab] = useState<Tab>("coach");
  const insets = useSafeAreaInsets();

  return (
    // Pad the top by the notch inset so every screen's header clears the cutout.
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Light status-bar glyphs over the dark UI. */}
      <StatusBar style="light" />

      {/* All screens stay mounted; only the active one is visible. This keeps a live
          coach negotiation intact while the user checks another tab. */}
      <View style={styles.body}>
        <View style={[styles.page, tab !== "coach" && styles.hidden]}>
          <CoachScreen />
        </View>
        <View style={[styles.page, tab !== "dashboard" && styles.hidden]}>
          <DashboardScreen />
        </View>
        <View style={[styles.page, tab !== "blocklist" && styles.hidden]}>
          <BlocklistScreen />
        </View>
        <View style={[styles.page, tab !== "protect" && styles.hidden]}>
          <ProtectionScreen />
        </View>
        <View style={[styles.page, tab !== "settings" && styles.hidden]}>
          <SettingsScreen />
        </View>
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
              <Text style={[styles.tabGlyph, active && styles.tabGlyphActive]}>{t.glyph}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  // Absolute-fill each page so the inactive (display:none) ones don't consume layout.
  page: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  hidden: { display: "none" },

  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 2 },
  tabItemPressed: { opacity: 0.6 },
  tabGlyph: { fontSize: 20, opacity: 0.5 },
  tabGlyphActive: { opacity: 1 },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  tabLabelActive: { color: colors.accent },
});
