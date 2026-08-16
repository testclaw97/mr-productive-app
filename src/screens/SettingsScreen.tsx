// Settings / Privacy — GDPR self-service, at parity with the extension's options page.
//
// Shows the anonymous install id, a two-click "Delete my data" that calls
// /api/v2/data/delete, the Privacy Policy link, and a one-line data explainer.
//
// DELETE SEMANTICS (mirror the extension's deleteMyData):
//   · success → clear the LOCAL server-derived state (the AI-consent flag) so the
//     coach notice re-shows before any future message; PRESERVE the block list + the
//     install id (the user's own local artefacts — never "our" data).
//   · network/backend failure → change NOTHING locally, show a safe retryable line.
//
// SHARED-SAFE: pure React Native + Linking; no native-only calls. Every dynamic string
// (the install id) is rendered through <Text> only.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { deleteData } from "../api/coach";
import { getInstallId } from "../api/install";
import { clearAiConsent } from "../storage/consent";
import { colors, radius, space } from "../theme";
import PressableScale from "../ui/PressableScale";
import {
  DELETE_CANCEL,
  DELETE_CONFIRM_COPY,
  DELETE_CONFIRM_YES,
  DELETE_DELETING,
  DELETE_DONE,
  DELETE_FAILED,
  DELETE_NOTE,
  DELETE_TITLE,
  PRIVACY_URL,
  SETTINGS_DATA_EXPLAINER,
  SETTINGS_INSTALL_LABEL,
  SETTINGS_PRIVACY_LINK,
} from "../copy";

type DeleteState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "deleting" }
  | { kind: "done" }
  | { kind: "error" };

export default function SettingsScreen() {
  const [installId, setInstallId] = useState<string | null>(null);
  const [del, setDel] = useState<DeleteState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getInstallId();
      if (!cancelled) setInstallId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPrivacy = useCallback(() => {
    void Linking.openURL(PRIVACY_URL);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!installId) return;
    setDel({ kind: "deleting" });
    const res = await deleteData(installId);
    if (res.ok) {
      // Server rows are gone — clear only the local server-derived state. The block
      // list and install id are deliberately kept (mirrors the extension).
      await clearAiConsent();
      setDel({ kind: "done" });
    } else {
      // Fail closed: nothing was touched locally. Offer a retry.
      setDel({ kind: "error" });
    }
  }, [installId]);

  const busy = del.kind === "deleting";

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Settings</Text>

      {/* Anonymous identity */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{SETTINGS_INSTALL_LABEL}</Text>
        {installId === null ? (
          <ActivityIndicator color={colors.accent} style={styles.idLoading} />
        ) : (
          <Text style={styles.idValue} selectable testID="settings-install-id">
            {installId}
          </Text>
        )}
        <Text style={styles.explainer}>{SETTINGS_DATA_EXPLAINER}</Text>
      </View>

      {/* Privacy policy link */}
      <PressableScale
        style={styles.linkRow}
        onPress={openPrivacy}
        accessibilityRole="link"
        testID="settings-privacy-link"
      >
        <Text style={styles.linkText}>{SETTINGS_PRIVACY_LINK}</Text>
        <Text style={styles.linkChevron}>→</Text>
      </PressableScale>

      {/* Delete my data — GDPR self-service, two-click confirm */}
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>{DELETE_TITLE}</Text>
        <Text style={styles.dangerNote}>{DELETE_NOTE}</Text>

        {del.kind === "done" ? (
          <Text style={styles.okLine} testID="delete-status">
            {DELETE_DONE}
          </Text>
        ) : del.kind === "confirming" || del.kind === "deleting" ? (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmCopy}>{DELETE_CONFIRM_COPY}</Text>
            <View style={styles.confirmRow}>
              <PressableScale
                style={[styles.dangerBtn, busy && styles.btnDisabled]}
                onPress={confirmDelete}
                disabled={busy}
                accessibilityRole="button"
                testID="delete-confirm-yes"
              >
                {busy ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.dangerBtnText}>{DELETE_CONFIRM_YES}</Text>
                )}
              </PressableScale>
              <Pressable
                style={[styles.ghostBtn, busy && styles.btnDisabled]}
                onPress={() => setDel({ kind: "idle" })}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.ghostBtnText}>{DELETE_CANCEL}</Text>
              </Pressable>
            </View>
            {busy && <Text style={styles.deletingLine}>{DELETE_DELETING}</Text>}
          </View>
        ) : (
          <>
            <PressableScale
              style={styles.dangerBtn}
              onPress={() => setDel({ kind: "confirming" })}
              accessibilityRole="button"
              testID="data-delete"
            >
              <Text style={styles.dangerBtnText}>{DELETE_TITLE}</Text>
            </PressableScale>
            {del.kind === "error" && (
              <Text style={styles.errLine} testID="delete-status">
                {DELETE_FAILED}
              </Text>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.s2, gap: 14, paddingBottom: space.s4 },

  h1: { color: colors.fg, fontSize: 24, fontWeight: "800" },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    gap: 8,
  },
  cardLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  idLoading: { alignSelf: "flex-start" },
  idValue: {
    color: colors.fg2,
    fontSize: 13,
    // "monospace" resolves on Android + web; iOS falls back to the system face — the
    // id stays legible either way without pulling in a font module.
    fontFamily: "monospace",
  },
  explainer: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },

  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  linkText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  linkChevron: { color: colors.accent, fontSize: 16 },

  dangerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    gap: 10,
  },
  dangerTitle: { color: colors.fg, fontSize: 16, fontWeight: "700" },
  dangerNote: { color: colors.fg2, fontSize: 13, lineHeight: 19 },
  dangerBtn: {
    backgroundColor: colors.warnSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warnLine,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: "center",
  },
  dangerBtnText: { color: colors.warn, fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },

  confirmBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 14,
    gap: 12,
  },
  confirmCopy: { color: colors.fg2, fontSize: 13, lineHeight: 19 },
  confirmRow: { flexDirection: "row", gap: 10 },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: { color: colors.muted, fontSize: 15, fontWeight: "600" },
  deletingLine: { color: colors.muted, fontSize: 13 },

  okLine: { color: colors.good, fontSize: 14, fontWeight: "600" },
  errLine: { color: colors.warn, fontSize: 13 },
});
