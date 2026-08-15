// The dashboard — a read-only glance at today's budget, mirroring the extension's
// options-page tiles (Daily budget / Sessions today / Streak / Reclaimed) plus the
// per-site spend breakdown.
//
// HONESTY ABOUT WHAT'S REAL: the backend's /api/v2/state is the source of truth for
// the budget tile (limit / spent / remaining) and the spentSites breakdown — those are
// LIVE. The other three counters (sessions today, streak, reclaimed minutes) are
// LOCAL, event-driven stats the Chrome extension keeps in its own storage as sessions
// are granted; the app has no local-stats store yet (it lands with the Android
// Blocker, which is the thing that grants sessions on device). Rather than invent
// numbers, those tiles show "—" with a one-line note. When the Blocker ships, this
// screen reads the same local counters and the placeholders fill in — no layout change.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getState, type StateResponse } from "../api/coach";
import { getInstallId } from "../api/install";
import { colors, radius, space } from "../theme";
import { COPY } from "../copy";

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; state: StateResponse };

export default function DashboardScreen() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const fetchState = useCallback(async () => {
    const installId = await getInstallId();
    const state = await getState(installId);
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

  if (load.kind === "loading") {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>Loading your dashboard…</Text>
      </View>
    );
  }

  if (load.kind === "error") {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <Text style={styles.h1}>Dashboard</Text>
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{load.message}</Text>
          <Pressable style={styles.retryBtn} onPress={onRefresh} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const s = load.state;
  const needsLimit = s.needsLimit || typeof s.dailyLimitMin !== "number";
  // Budget tile — LIVE from the backend.
  const budgetValue = needsLimit
    ? "Not set yet"
    : `${s.spentTodayMin} of ${s.dailyLimitMin} min used`;
  const budgetSub = needsLimit
    ? "Your coach sets your daily budget the first time you negotiate a session."
    : `${s.remainingMin} min left`;

  const clean = s.spentSites.filter(
    (x) => x && typeof x.site === "string" && Number.isFinite(x.minutes)
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <Text style={styles.h1}>Dashboard</Text>
      <Text style={styles.daySub}>{s.day}</Text>

      {/* Wide LIVE tile: today's budget. */}
      <View style={[styles.tile, styles.tileWide]}>
        <Text style={styles.tileK}>Daily budget</Text>
        <Text style={styles.tileV}>{budgetValue}</Text>
        <Text style={styles.tileSub}>{budgetSub}</Text>
      </View>

      {/* Three stat tiles. Sessions / Streak / Reclaimed are LOCAL counters not yet
          tracked by the app — shown as placeholders (never invented numbers). */}
      <View style={styles.tileRow}>
        <StatTile k="Sessions today" v="—" note="with the blocker" />
        <StatTile k="Streak" v="—" note="with the blocker" />
        <StatTile k="Reclaimed" v="—" note="with the blocker" />
      </View>

      {/* Per-site spend breakdown — LIVE from the backend. */}
      <View style={[styles.tile, styles.tileWide]}>
        <Text style={styles.tileK}>Where today's time went</Text>
        {clean.length === 0 ? (
          <Text style={styles.tileSub}>No sessions granted yet today.</Text>
        ) : (
          <View style={styles.breakdown}>
            {clean.map((x) => (
              <View key={x.site} style={styles.breakdownRow}>
                {/* Untrusted site name → <Text> only, never markup. */}
                <Text style={styles.breakdownSite}>{x.site}</Text>
                <Text style={styles.breakdownMin}>{x.minutes}m</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={styles.footnote}>
        Budget and spend are live from your coach. Sessions, streak and reclaimed time
        start tracking once the on-device blocker is installed.
      </Text>
    </ScrollView>
  );
}

function StatTile({ k, v, note }: { k: string; v: string; note: string }) {
  return (
    <View style={[styles.tile, styles.tileThird]}>
      <Text style={styles.tileK}>{k}</Text>
      <Text style={styles.tileV}>{v}</Text>
      <Text style={styles.tileNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.s2, paddingTop: space.s2, gap: 12, paddingBottom: space.s4 },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  dim: { color: colors.muted, fontSize: 13 },

  h1: { color: colors.fg, fontSize: 24, fontWeight: "800" },
  daySub: { color: colors.muted, fontSize: 13, marginTop: -6, fontVariant: ["tabular-nums"] },

  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    gap: 4,
  },
  tileWide: { width: "100%" },
  tileRow: { flexDirection: "row", gap: 12 },
  tileThird: { flex: 1, paddingHorizontal: 10 },
  tileK: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  tileV: { color: colors.fg, fontSize: 20, fontWeight: "800", marginTop: 2 },
  tileSub: { color: colors.fg2, fontSize: 13 },
  tileNote: { color: colors.muted, fontSize: 10, marginTop: 2 },

  breakdown: { marginTop: 6, gap: 8 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  breakdownSite: { color: colors.fg2, fontSize: 14, flexShrink: 1 },
  breakdownMin: { color: colors.fg, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },

  footnote: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },

  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
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
