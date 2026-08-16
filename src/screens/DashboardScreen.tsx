// Home — the calm status screen the app lands on after onboarding (NOT the raw coach).
//
// It answers "am I okay?" at a glance: a reassuring "You're protected" hero with the
// count of guarded apps/sites, today's LIVE budget with a remaining bar, a couple of
// stat tiles, and where today's time went. It is the app's default surface; the coach is
// reached from here (or its tab) at its natural moment.
//
// HONESTY ABOUT WHAT'S REAL: the backend's /api/v2/state is the source of truth for the
// budget (limit / spent / remaining) and the per-site breakdown — those are LIVE. The
// guarded count is the LOCAL block list. Sessions / streak are LOCAL counters the app
// doesn't track yet (they land with the on-device blocker) — shown as "—" with a note,
// never invented. On web the app can't enforce blocking itself, so the hero says so
// plainly under the reassurance rather than overclaiming.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getState, type StateResponse } from "../api/coach";
import { getInstallId } from "../api/install";
import { getBlocklist } from "../storage/blocklist";
import { blocker } from "../native/Blocker";
import { colors, radius, shadow, space, type } from "../theme";
import { COPY } from "../copy";
import PressableScale from "../ui/PressableScale";
import Mascot from "../ui/Mascot";

type NavTarget = "coach" | "blocklist" | "protect";

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; state: StateResponse };

export default function DashboardScreen({
  onNavigate,
}: {
  onNavigate?: (target: NavTarget) => void;
}) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [guarded, setGuarded] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const supported = blocker.isSupported();

  const fetchState = useCallback(async () => {
    const installId = await getInstallId();
    const [state, list] = await Promise.all([getState(installId), getBlocklist()]);
    setGuarded(list.length);
    if (!state.ok) {
      setLoad({
        kind: "error",
        message: state.error === "BACKEND_UNREACHABLE" ? COPY.unreachable : COPY.generic,
      });
      return;
    }
    setLoad({ kind: "ready", state });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchState();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchState]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchState();
    setRefreshing(false);
  }, [fetchState]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
  );

  if (load.kind === "loading") {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>Loading your day…</Text>
      </View>
    );
  }

  // Hero — reassuring status. "Protected" once anything is guarded; a gentle nudge if not.
  const isProtected = guarded > 0;
  const heroTitle = isProtected ? "You're protected" : "Let's set you up";
  const heroSub = isProtected
    ? `Guarding ${guarded} ${guarded === 1 ? "app or site" : "apps & sites"}`
    : "Add a few distractions and your coach takes it from there.";

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={refreshControl}
    >
      <Text style={styles.h1}>Home</Text>

      {/* Hero status card */}
      <View style={styles.hero}>
        <Mascot size={60} />
        <View style={styles.heroBadge}>
          <View style={[styles.dot, isProtected ? styles.dotOn : styles.dotIdle]} />
          <Text style={[styles.heroBadgeText, isProtected ? styles.heroBadgeOn : styles.heroBadgeIdle]}>
            {isProtected ? "Active" : "Not set up"}
          </Text>
        </View>
        <Text style={styles.heroTitle}>{heroTitle}</Text>
        <Text style={styles.heroSub}>{heroSub}</Text>
        {!supported && isProtected && (
          <Text style={styles.heroNote}>
            Real blocking runs on the Android app and the Chrome extension. Here you can set
            your budget with the coach and manage your list.
          </Text>
        )}
        <View style={styles.heroActions}>
          <PressableScale
            onPress={() => onNavigate?.("coach")}
            accessibilityRole="button"
            accessibilityLabel="Talk to your coach"
            testID="home-open-coach"
            style={styles.heroPrimary}
          >
            <Text style={styles.heroPrimaryText}>Talk to your coach</Text>
          </PressableScale>
          <PressableScale
            onPress={() => onNavigate?.("blocklist")}
            accessibilityRole="button"
            accessibilityLabel="Edit your blocklist"
            testID="home-open-blocklist"
            style={styles.heroSecondary}
          >
            <Text style={styles.heroSecondaryText}>Edit list</Text>
          </PressableScale>
        </View>
      </View>

      {load.kind === "error" ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{load.message}</Text>
          <PressableScale
            onPress={onRefresh}
            accessibilityRole="button"
            style={styles.retryBtn}
            testID="home-retry"
          >
            <Text style={styles.retryText}>Retry</Text>
          </PressableScale>
        </View>
      ) : (
        <BudgetSection state={load.state} onNavigate={onNavigate} />
      )}

      {/* Stat tiles — Streak / Sessions are LOCAL counters not tracked yet: honest "—". */}
      <View style={styles.tileRow}>
        <StatTile k="Streak" v="—" note="starts with the blocker" />
        <StatTile k="Sessions today" v="—" note="starts with the blocker" />
      </View>

      <Text style={styles.footnote}>
        Budget and spend are live from your coach. Streak and sessions start tracking once
        the on-device blocker is installed.
      </Text>
    </ScrollView>
  );
}

function BudgetSection({
  state,
  onNavigate,
}: {
  state: StateResponse;
  onNavigate?: (target: NavTarget) => void;
}) {
  const needsLimit = state.needsLimit || typeof state.dailyLimitMin !== "number";
  const limit = typeof state.dailyLimitMin === "number" ? state.dailyLimitMin : 0;
  const usedFrac = limit > 0 ? Math.min(1, Math.max(0, state.spentTodayMin / limit)) : 0;
  const remainingFrac = 1 - usedFrac;
  const low = state.remainingMin <= 0;

  const clean = state.spentSites.filter(
    (x) => x && typeof x.site === "string" && Number.isFinite(x.minutes)
  );

  return (
    <>
      <View style={styles.budgetCard}>
        <View style={styles.budgetHead}>
          <Text style={styles.tileK}>Today's budget</Text>
          <Text style={styles.daySub}>{state.day}</Text>
        </View>

        {needsLimit ? (
          <>
            <Text style={styles.budgetBig}>Not set yet</Text>
            <Text style={styles.tileSub}>
              Your coach sets your daily budget the first time you negotiate a session.
            </Text>
            <PressableScale
              onPress={() => onNavigate?.("coach")}
              accessibilityRole="button"
              accessibilityLabel="Set your budget with the coach"
              testID="home-set-budget"
              style={styles.budgetBtn}
            >
              <Text style={styles.budgetBtnText}>Set it with your coach →</Text>
            </PressableScale>
          </>
        ) : (
          <>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetBig}>
                {state.remainingMin}
                <Text style={styles.budgetUnit}> min left</Text>
              </Text>
              <Text style={styles.budgetOf}>
                {state.spentTodayMin} / {limit} used
              </Text>
            </View>
            {/* Remaining bar — the little live data-viz. */}
            <View style={styles.barTrack} accessibilityLabel={`${state.remainingMin} minutes remaining`}>
              <View
                style={[
                  styles.barFill,
                  { width: `${remainingFrac * 100}%` },
                  low && styles.barFillLow,
                ]}
              />
            </View>
          </>
        )}
      </View>

      {/* Where today's time went — LIVE per-site breakdown. */}
      <View style={styles.card}>
        <Text style={styles.tileK}>Where today's time went</Text>
        {clean.length === 0 ? (
          <Text style={styles.tileSub}>No sessions granted yet today.</Text>
        ) : (
          <View style={styles.breakdown}>
            {clean.map((x) => (
              <View key={x.site} style={styles.breakdownRow}>
                <Text style={styles.breakdownSite} numberOfLines={1}>
                  {x.site}
                </Text>
                <Text style={styles.breakdownMin}>{x.minutes}m</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );
}

function StatTile({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <View style={[styles.card, styles.tileHalf]}>
      <Text style={styles.tileK}>{k}</Text>
      <Text style={styles.tileV}>{v}</Text>
      <Text style={styles.tileNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.s2, gap: 14, paddingBottom: space.s4 },
  center: { alignItems: "center", justifyContent: "center", gap: 10, flex: 1 },
  dim: { color: colors.muted, fontSize: 13 },

  h1: { ...type.title, color: colors.fg },

  // Hero
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s3,
    alignItems: "center",
    gap: space.s1,
    ...shadow.card,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginTop: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { backgroundColor: colors.good },
  dotIdle: { backgroundColor: colors.warn },
  heroBadgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  heroBadgeOn: { color: colors.good },
  heroBadgeIdle: { color: colors.warn },
  heroTitle: { ...type.title, color: colors.fg, textAlign: "center", marginTop: 2 },
  heroSub: { ...type.body, color: colors.fg2, textAlign: "center" },
  heroNote: { ...type.caption, color: colors.muted, textAlign: "center", marginTop: 2 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: space.s1, alignSelf: "stretch" },
  heroPrimary: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: "center",
  },
  heroPrimaryText: { ...type.bodyStrong, color: colors.onAccent },
  heroSecondary: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  heroSecondaryText: { ...type.bodyStrong, color: colors.fg2 },

  // Budget
  budgetCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    gap: 10,
  },
  budgetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  daySub: { color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] },
  budgetRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  budgetBig: { fontSize: 30, lineHeight: 34, fontWeight: "800", color: colors.fg, letterSpacing: -0.5 },
  budgetUnit: { fontSize: 15, fontWeight: "600", color: colors.muted },
  budgetOf: { color: colors.fg2, fontSize: 13, fontVariant: ["tabular-nums"] },
  barTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  barFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.accent },
  barFillLow: { backgroundColor: colors.warn },
  budgetBtn: {
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentLine,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: 2,
  },
  budgetBtnText: { ...type.bodyStrong, color: colors.accent },

  // Cards / tiles
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    gap: 4,
  },
  tileRow: { flexDirection: "row", gap: 12 },
  tileHalf: { flex: 1 },
  tileK: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  tileV: { color: colors.fg, fontSize: 22, fontWeight: "800", marginTop: 2 },
  tileSub: { color: colors.fg2, fontSize: 13, lineHeight: 19 },
  tileNote: { color: colors.muted, fontSize: 10, marginTop: 2 },

  breakdown: { marginTop: 6, gap: 8 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  breakdownSite: { color: colors.fg2, fontSize: 14, flexShrink: 1 },
  breakdownMin: { color: colors.fg, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },

  footnote: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },

  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    gap: 12,
  },
  errorText: { color: colors.fg2, fontSize: 14, lineHeight: 20 },
  retryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  retryText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
});
