// Blocklist — a real, persisted list editor over the shared kv store.
//
// The user adds sites/apps to guard and sees the live list; removal is allowed for
// now. The list is the user's OWN local artefact (preserved by the data-delete flow)
// and is what the native Android Blocker will consume (blocker.blockApps). On web
// nothing enforces it (the Chrome extension owns desktop blocking) — so an honest note
// says so, rather than pretending this page guards anything on its own yet.
//
// SHARED-SAFE: pure React Native + the kv seam, no native-only calls. Every dynamic
// string (user-entered entries) is rendered through <Text> only — never markup.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  normalizeEntry,
} from "../storage/blocklist";
import { blocker } from "../native/Blocker";
import { colors, radius, space } from "../theme";
import { BLOCKLIST_ANDROID_NOTE, BLOCKLIST_EMPTY, BLOCKLIST_INTRO, BLOCKLIST_SUGGESTIONS } from "../copy";

export default function BlocklistScreen() {
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
        // Push the persisted list into the native blocker so the Android overlay guards
        // it. No-op on web/iOS. Fire-and-forget: the UI never blocks on it.
        void blocker.blockApps(loaded);
      }
    })();
    return () => {
      cancelled = true;
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  // A transient confirmation line that clears itself (mirrors the extension's "Added x").
  const flash = useCallback((text: string) => {
    setFeedback(text);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(""), 2200);
  }, []);

  const add = useCallback(
    async (raw: string) => {
      const res = await addToBlocklist(raw);
      setList(res.list);
      // Keep the native blocker's guarded set in sync with every change. No-op off Android.
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
  // A suggestion is offered only if it isn't already on the list.
  const suggestions = BLOCKLIST_SUGGESTIONS.filter((s) => !(list ?? []).includes(s));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.h1}>Blocklist</Text>
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
        <Pressable
          style={[styles.addBtn, !trimmed && styles.addBtnDisabled]}
          onPress={() => add(input)}
          disabled={!trimmed}
          accessibilityRole="button"
          testID="blocklist-add"
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
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
              <Pressable
                key={s}
                style={styles.chip}
                onPress={() => add(s)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${s}`}
              >
                <Text style={styles.chipText}>+ {s}</Text>
              </Pressable>
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
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 24 },

  h1: { color: colors.fg, fontSize: 24, fontWeight: "800" },
  intro: { color: colors.fg2, fontSize: 14, lineHeight: 20, marginTop: -4 },

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
  emptyText: { color: colors.muted, fontSize: 14, textAlign: "center" },

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
