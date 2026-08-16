// Blocklist — the set of things Mr. Productive guards. This screen has TWO faces,
// picked at the Blocker seam (blocker.isSupported()), because "block a thing" means
// something different per platform:
//
//   * Android (isSupported() === true): you block installed APPS. The native module
//     lists launchable apps (blocker.listInstalledApps) and enforces a package-name set
//     (blocker.blockApps → native setBlockedApps). This screen is an installed-app
//     PICKER: search, a "Blocked" summary at the top, and a toggle per app. Every
//     change is persisted to the shared kv store AND synced to the native layer.
//
//   * Web / iOS (isSupported() === false): there is no on-device app blocker, so we say
//     so plainly ("App blocking is available on Android") and keep the lightweight
//     site/app text-entry list — the user's own local artefact — as a still-useful note.
//
// SHARED-SAFE: pure React Native + the kv/Blocker seams. Every dynamic string (app
// labels, package names, user-entered entries) is rendered through <Text> only — never
// markup — so untrusted content can never become HTML.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addToBlocklist,
  getBlocklist,
  removeFromBlocklist,
  setBlocklist,
  normalizeEntry,
} from "../storage/blocklist";
import { blocker } from "../native/Blocker";
import type { InstalledApp } from "../native/Blocker";
import { colors, radius, space } from "../theme";
import PressableScale from "../ui/PressableScale";
import {
  BLOCKLIST_ALL_APPS_LABEL,
  BLOCKLIST_ANDROID_NOTE,
  BLOCKLIST_APP_INTRO,
  BLOCKLIST_APPS_EMPTY_HINT,
  BLOCKLIST_APPS_LOADING,
  BLOCKLIST_BLOCKED_LABEL,
  BLOCKLIST_EMPTY,
  BLOCKLIST_INTRO,
  BLOCKLIST_NONE_BLOCKED,
  BLOCKLIST_NO_MATCHES,
  BLOCKLIST_SEARCH_PLACEHOLDER,
  BLOCKLIST_SUGGESTIONS,
  BLOCKLIST_UNSUPPORTED_BODY,
  BLOCKLIST_UNSUPPORTED_TITLE,
} from "../copy";

// The seam decides the face ONCE at mount: true only on Android with the native module.
export default function BlocklistScreen() {
  return blocker.isSupported() ? <AndroidAppPicker /> : <WebBlocklist />;
}

// ============================ ANDROID: installed-app picker ============================

export function AndroidAppPicker() {
  // The set of blocked package names (the persisted artefact + what the native layer
  // guards). null = still loading from kv.
  const [blocked, setBlocked] = useState<Set<string> | null>(null);
  // Installed launchable apps. null = still querying; [] = queried, none returned.
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [query, setQuery] = useState("");

  // Boot: load the persisted set (and sync it to native so the overlay guards it from
  // the first tick), and query the installed apps. The two are independent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getBlocklist();
      if (cancelled) return;
      setBlocked(new Set(saved));
      // Fire-and-forget: keep native in lockstep with what's persisted.
      void blocker.blockApps(saved);
    })();
    (async () => {
      try {
        const installed = await blocker.listInstalledApps();
        if (!cancelled) setApps(installed);
      } catch {
        if (!cancelled) setApps([]); // defensive: treat a failed query as "none read"
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Toggle one package on/off. Persist the whole set and sync it to the native blocker
  // on EVERY change (the seam maps blockApps → native setBlockedApps).
  const toggle = useCallback(
    async (pkg: string) => {
      setBlocked((prev) => {
        const base = prev ?? new Set<string>();
        const next = new Set(base);
        if (next.has(pkg)) next.delete(pkg);
        else next.add(pkg);
        const list = [...next];
        void (async () => {
          const persisted = await setBlocklist(list);
          void blocker.blockApps(persisted);
        })();
        return next;
      });
    },
    []
  );

  // A lookup so a blocked package can show its human label even while the list is huge.
  const labelByPkg = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of apps ?? []) map.set(a.packageName, a.label);
    return map;
  }, [apps]);

  const blockedSet = blocked ?? new Set<string>();

  // Blocked apps, resolved to {label, packageName}. An entry we can't resolve to an
  // installed app (uninstalled since, or list still loading) still shows by package.
  const blockedApps: InstalledApp[] = useMemo(
    () =>
      [...blockedSet].map((pkg) => ({
        packageName: pkg,
        label: labelByPkg.get(pkg) ?? pkg,
      })),
    [blockedSet, labelByPkg]
  );

  // The searchable "all apps" list (case-insensitive over label + package).
  const filtered: InstalledApp[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = apps ?? [];
    if (q === "") return all;
    return all.filter(
      (a) =>
        a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q)
    );
  }, [apps, query]);

  const header = (
    <View style={styles.headerWrap}>
      <Text style={styles.h1}>Blocklist</Text>
      <Text style={styles.intro}>{BLOCKLIST_APP_INTRO}</Text>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder={BLOCKLIST_SEARCH_PLACEHOLDER}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        accessibilityLabel="Search your apps"
        testID="blocklist-search"
      />

      {/* Currently-blocked apps, up top so they're always visible. */}
      <Text style={styles.sectionLabel}>
        {BLOCKLIST_BLOCKED_LABEL} ({blockedApps.length})
      </Text>
      {blockedApps.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{BLOCKLIST_NONE_BLOCKED}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {blockedApps.map((a) => (
            <AppRow
              key={`blocked-${a.packageName}`}
              app={a}
              blocked
              onToggle={() => toggle(a.packageName)}
            />
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>{BLOCKLIST_ALL_APPS_LABEL}</Text>
    </View>
  );

  // Loading state for the installed-apps query.
  if (apps === null) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          {header}
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.dim}>{BLOCKLIST_APPS_LOADING}</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={filtered}
      keyExtractor={(a) => a.packageName}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <AppRow
          app={item}
          blocked={blockedSet.has(item.packageName)}
          onToggle={() => toggle(item.packageName)}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      ListEmptyComponent={
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            {/* Empty could mean "no search match" OR "couldn't read installed apps". */}
            {apps.length === 0
              ? BLOCKLIST_APPS_EMPTY_HINT
              : query.trim() !== ""
                ? BLOCKLIST_NO_MATCHES
                : BLOCKLIST_APPS_EMPTY_HINT}
          </Text>
        </View>
      }
    />
  );
}

// One installed-app row: label + package + a checkbox reflecting blocked state.
function AppRow({
  app,
  blocked,
  onToggle,
}: {
  app: InstalledApp;
  blocked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      style={styles.appRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: blocked }}
      accessibilityLabel={`${blocked ? "Unblock" : "Block"} ${app.label}`}
      testID={`app-${app.packageName}`}
    >
      <View style={styles.appMeta}>
        {/* App label + package are untrusted device strings → <Text> only. */}
        <Text style={styles.appLabel} numberOfLines={1}>
          {app.label}
        </Text>
        <Text style={styles.appPkg} numberOfLines={1}>
          {app.packageName}
        </Text>
      </View>
      <View style={[styles.checkbox, blocked && styles.checkboxOn]}>
        {blocked && <Text style={styles.checkboxTick}>✓</Text>}
      </View>
    </Pressable>
  );
}

// ============================ WEB / iOS: text-entry note ================================
//
// Kept as-is (the user's own local artefact) but fronted with an honest "Android only"
// notice, since nothing on web actually enforces the list — the Chrome extension owns
// desktop blocking.
export function WebBlocklist() {
  const [list, setList] = useState<string[] | null>(null); // null = still loading
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await getBlocklist();
      if (!cancelled) {
        setList(loaded);
        // No-op on web/iOS, but keep the seam honest.
        void blocker.blockApps(loaded);
      }
    })();
    return () => {
      cancelled = true;
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const flash = useCallback((text: string) => {
    setFeedback(text);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(""), 2200);
  }, []);

  const add = useCallback(
    async (raw: string) => {
      const res = await addToBlocklist(raw);
      setList(res.list);
      void blocker.blockApps(res.list);
      if (res.status === "added") {
        setInput("");
        flash(`Added ${res.entry}`);
      } else if (res.status === "duplicate") {
        setInput("");
        flash(`${res.entry} is already on your list`);
      } else {
        flash("Type a site or app to add");
      }
    },
    [flash]
  );

  const remove = useCallback(async (entry: string) => {
    const next = await removeFromBlocklist(entry);
    setList(next);
    void blocker.blockApps(next);
  }, []);

  const trimmed = normalizeEntry(input);
  const suggestions = BLOCKLIST_SUGGESTIONS.filter((s) => !(list ?? []).includes(s));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.h1}>Blocklist</Text>

      {/* Honest, up-front: real app blocking is Android-only. */}
      <View style={styles.unsupportedCard}>
        <Text style={styles.unsupportedTitle} testID="blocklist-unsupported">
          {BLOCKLIST_UNSUPPORTED_TITLE}
        </Text>
        <Text style={styles.unsupportedBody}>{BLOCKLIST_UNSUPPORTED_BODY}</Text>
      </View>

      <Text style={styles.intro}>{BLOCKLIST_INTRO}</Text>

      {/* Add row */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="instagram.com"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          onSubmitEditing={() => add(input)}
          returnKeyType="done"
          accessibilityLabel="Site or app to block"
          testID="blocklist-input"
        />
        <PressableScale
          style={[styles.addBtn, !trimmed && styles.addBtnDisabled]}
          onPress={() => add(input)}
          disabled={!trimmed}
          accessibilityRole="button"
          testID="blocklist-add"
        >
          <Text style={styles.addBtnText}>Add</Text>
        </PressableScale>
      </View>

      {feedback !== "" && (
        <Text style={styles.feedback} accessibilityLiveRegion="polite">
          {feedback}
        </Text>
      )}

      {/* Quick-add chips (the usual suspects) */}
      {suggestions.length > 0 && (
        <View style={styles.suspects}>
          <Text style={styles.suspectsLabel}>The usual suspects</Text>
          <View style={styles.chips}>
            {suggestions.map((s) => (
              <PressableScale
                key={s}
                style={styles.chip}
                onPress={() => add(s)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${s}`}
              >
                <Text style={styles.chipText}>+ {s}</Text>
              </PressableScale>
            ))}
          </View>
        </View>
      )}

      {/* The live list */}
      {list === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{BLOCKLIST_EMPTY}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {list.map((entry) => (
            <View key={entry} style={styles.listRow}>
              {/* User-entered — <Text> only, never markup. */}
              <Text style={styles.listSite} numberOfLines={1}>
                {entry}
              </Text>
              <Pressable
                style={styles.removeBtn}
                onPress={() => remove(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${entry}`}
                hitSlop={8}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Honest note about who actually enforces the block. */}
      <View style={styles.note}>
        <Text style={styles.noteText}>{BLOCKLIST_ANDROID_NOTE}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.s2, gap: 12, paddingBottom: space.s4 },
  headerWrap: { gap: 12 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 24, gap: 10 },
  dim: { color: colors.muted, fontSize: 13 },

  h1: { color: colors.fg, fontSize: 24, fontWeight: "800" },
  intro: { color: colors.fg2, fontSize: 14, lineHeight: 20, marginTop: -4 },

  sectionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },

  // --- Android app picker ---
  search: {
    height: 46,
    color: colors.fg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  appMeta: { flexShrink: 1, gap: 2 },
  appLabel: { color: colors.fg, fontSize: 15, fontWeight: "600" },
  appPkg: { color: colors.muted, fontSize: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxTick: { color: colors.onAccent, fontSize: 15, fontWeight: "800", lineHeight: 18 },
  sep: { height: 8 },

  // --- web / iOS unsupported note ---
  unsupportedCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentLine,
    padding: space.s2,
    gap: 6,
  },
  unsupportedTitle: { color: colors.fg, fontSize: 16, fontWeight: "700" },
  unsupportedBody: { color: colors.fg2, fontSize: 13, lineHeight: 19 },

  // --- shared list / add row (web face) ---
  addRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  input: {
    flex: 1,
    height: 46,
    color: colors.fg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDisabled: { opacity: 0.45 },
  addBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 15 },

  feedback: { color: colors.accent, fontSize: 13, marginTop: -4 },

  suspects: { gap: 8, marginTop: 2 },
  suspectsLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentLine,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  chipText: { color: colors.accent, fontSize: 13, fontWeight: "600" },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s3,
    alignItems: "center",
  },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },

  list: { gap: 8 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  listSite: { color: colors.fg, fontSize: 15, flexShrink: 1, fontWeight: "600" },
  removeBtn: { paddingVertical: 2, paddingHorizontal: 2 },
  removeBtnText: { color: colors.muted, fontSize: 13, textDecorationLine: "underline" },

  note: {
    marginTop: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 14,
  },
  noteText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
