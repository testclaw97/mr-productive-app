// The coach chat screen — the app's core surface, a faithful React Native port of the
// Chrome extension's blocked/blocked.js negotiation flow. It renders identically on
// web (verified here) and, once the native Blocker lands, on Android.
//
//   boot → getState(installId)
//     · needsLimit             → SET-A-DAILY-LIMIT conversation
//     · limit set, budget left → GRANT-A-SESSION conversation
//     · budget spent           → the exhausted wall (breakdown + coffee + overtime)
//   a turn concludes WITH a grant → "Start browsing" confirmation (Blocker.openFor,
//   a no-op + console.log on web — the native module wires real blocking later).
//
// FIRST-RUN AI-CONSENT: before the very first message can be sent, a disclosure notice
// replaces the composer. Sending is blocked (UI + a belt-and-suspenders guard in
// submitTurn) until the user taps "I understand — continue"; the acknowledgement is
// persisted via kv so the notice never shows again.
//
// SAFETY parity with the extension: EVERY dynamic string (coach replies, user text,
// untrusted site names) is rendered through React Native <Text> only. There is no HTML
// anywhere — no innerHTML/dangerouslySetInnerHTML — so untrusted content can never
// become markup. The server is the single source of truth for every number; this
// screen renders only what it is handed and never computes a budget.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getState,
  negotiateLimit,
  negotiateSession,
  type Grant,
  type SpentSite,
} from "../api/coach";
import { getInstallId } from "../api/install";
import { hasAcceptedAiConsent, acceptAiConsent, subscribeAiConsent } from "../storage/consent";
import { blocker } from "../native/Blocker";
import { SOFT_CAP } from "../config";
import { colors, radius, space } from "../theme";
import {
  COPY,
  COFFEE_ASK,
  COFFEE_BTN,
  COME_BACK_TOMORROW,
  CONSENT_CONTINUE,
  CONSENT_LEAD,
  CONSENT_LINK_TEXT,
  DONATE_URL,
  LIMIT_OPENER,
  OVERTIME_BANNER,
  OVERTIME_OPENER,
  OVERTIME_OPTIN,
  PRIVACY_URL,
} from "../copy";

// On web there is no block-redirect handing us a `?site=`, so we demo the session
// conversation against a representative site. On Android this comes from the
// foreground-app detection (UsageStatsManager) instead.
const DEMO_SITE = "instagram.com";

type Phase = "loading" | "limit" | "session" | "overtime" | "granted" | "exhausted" | "error";
type Who = "coach" | "user";
interface ChatMessage {
  id: string;
  who: Who;
  text: string;
}

// The backend's enriched exhausted-wall state (mirrors the BUDGET_EXHAUSTED payload
// and the state route's own fields): what the day's limit was, what it was spent on,
// and whether the tiny overtime escape valve is offered.
interface WallInfo {
  dailyLimitMin: number | null;
  spentSites: SpentSite[];
  overtimeAvailable: boolean;
}

let bubbleSeq = 0;
const nextId = () => `m${bubbleSeq++}`;

export default function CoachScreen() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState(0);
  const [status, setStatus] = useState("");
  const [grant, setGrant] = useState<Grant | null>(null);
  const [wall, setWall] = useState<WallInfo | null>(null);
  // The AI-consent gate. Starts null ("still loading"), then true/false. While false
  // the consent notice replaces the composer, so NO typed message can reach the coach.
  const [consentAccepted, setConsentAccepted] = useState<boolean | null>(null);

  // Refs for values a stale closure must not capture: the conversation id (threaded
  // across turns), the phase the turn was SENT in (the reply router must decide on the
  // phase that sent, not one a concurrent transition changed), and the live consent
  // flag (submitTurn's belt-and-suspenders guard must read the current value).
  const installIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const consentRef = useRef<boolean>(false);
  const scrollRef = useRef<ScrollView>(null);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const addBubble = useCallback((who: Who, text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), who, text }]);
  }, []);

  // --- boot: load consent, ask the coach where we stand, open the right screen ------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [installId, accepted] = await Promise.all([
        getInstallId(),
        hasAcceptedAiConsent(),
      ]);
      if (cancelled) return;
      installIdRef.current = installId;
      consentRef.current = accepted;
      setConsentAccepted(accepted);

      const state = await getState(installId);
      if (cancelled) return;

      if (!state.ok) {
        setStatus(state.error === "BACKEND_UNREACHABLE" ? COPY.unreachable : COPY.generic);
        setPhaseBoth("error");
        return;
      }

      if (state.needsLimit) {
        conversationIdRef.current = null; // server mints one on turn 1
        addBubble("coach", LIMIT_OPENER);
        setPhaseBoth("limit");
        return;
      }

      if (state.remainingMin <= 0) {
        // The rich wall: name the day's limit, itemize the spend, offer overtime.
        setWall({
          dailyLimitMin: state.dailyLimitMin,
          spentSites: state.spentSites,
          overtimeAvailable: state.overtimeAvailable,
        });
        setPhaseBoth("exhausted");
        return;
      }

      // Limit set, budget left → open the session conversation (coach speaks first).
      conversationIdRef.current = null;
      addBubble(
        "coach",
        `You're at ${DEMO_SITE}. You've got ${state.remainingMin} min left today. ` +
          `How long do you want, and for what?`
      );
      setPhaseBoth("session");
    })();
    return () => {
      cancelled = true;
    };
  }, [addBubble, setPhaseBoth]);

  // Keep the newest turn in view whenever the transcript grows.
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // The screens stay mounted, so a consent change made elsewhere (the Settings
  // "Delete my data" flow clears it) must re-lock the composer here immediately —
  // the notice reappears and no typed message can reach the coach until re-accepted.
  useEffect(() => {
    const unsubscribe = subscribeAiConsent((accepted) => {
      consentRef.current = accepted;
      setConsentAccepted(accepted);
    });
    return unsubscribe;
  }, []);

  // --- AI-consent: acknowledge once, persist, then unlock the composer --------------
  const onAcceptConsent = useCallback(async () => {
    if (consentRef.current) return;
    await acceptAiConsent();
    consentRef.current = true;
    setConsentAccepted(true);
    setStatus("");
  }, []);

  // --- a granted session: wire the (no-op on web) Blocker + show Start browsing -----
  const onGranted = useCallback(
    (g: Grant) => {
      setGrant(g);
      const kind = g.overtime ? "overtime minutes" : "minutes";
      setStatus(`You've got ${g.minutes} ${kind} on ${g.site}.`);
      setPhaseBoth("granted");
    },
    [setPhaseBoth]
  );

  const startBrowsing = useCallback(() => {
    if (!grant) return;
    // On web this logs and does nothing (the Chrome extension owns desktop blocking);
    // on Android the native Blocker will lift the overlay for the granted minutes.
    // The native module implements the SAME `Blocker` seam — no change here.
    void blocker.openFor(grant.site, grant.minutes);
    console.log(
      `[CoachScreen] Start browsing → ${grant.site} for ${grant.minutes}m (no real blocking on web)`
    );
    setStatus(`Browsing ${grant.site} — ${grant.minutes} minutes on the clock.`);
  }, [grant]);

  // --- exhausted-wall actions -------------------------------------------------------
  const openCoffee = useCallback(() => {
    // A plain external link to a constant we control — never untrusted input.
    void Linking.openURL(DONATE_URL);
  }, []);

  const openPrivacy = useCallback(() => {
    void Linking.openURL(PRIVACY_URL);
  }, []);

  // Opt into OVERTIME from the exhausted wall: fresh conversation, firm banner, a
  // locally-spoken opener (the backend needs the user's ask first). From here
  // submitTurn sends negotiateSession with overtime:true.
  const openOvertime = useCallback(() => {
    if (phaseRef.current !== "exhausted") return;
    conversationIdRef.current = null;
    setTurns(0);
    setStatus("");
    setMessages([]);
    addBubble("coach", OVERTIME_OPENER);
    setPhaseBoth("overtime");
  }, [addBubble, setPhaseBoth]);

  // --- submit one typed turn to the active conversation -----------------------------
  const submitTurn = useCallback(async () => {
    if (busy) return;
    // AI-consent gate — belt-and-suspenders: even if the composer somehow rendered,
    // no typed message reaches the coach before the notice is acknowledged.
    if (!consentRef.current) return;
    const sentPhase = phaseRef.current;
    if (sentPhase !== "limit" && sentPhase !== "session" && sentPhase !== "overtime") return;
    const text = input.trim();
    if (text === "") return;
    const installId = installIdRef.current;
    if (!installId) return;

    addBubble("user", text);
    setInput("");
    setBusy(true);
    setStatus("");

    const conversationId = conversationIdRef.current ?? undefined;

    if (sentPhase === "limit") {
      const reply = await negotiateLimit({ installId, text, conversationId });
      setBusy(false);
      if (!reply.ok) {
        setStatus(reply.error === "BACKEND_UNREACHABLE" ? COPY.unreachable : COPY.generic);
        setPhaseBoth("error");
        return;
      }
      conversationIdRef.current = reply.conversationId;
      if (reply.reply) addBubble("coach", reply.reply);
      setTurns(reply.turns);
      // Limit concluded WITH a set value → fresh conversation for the session.
      if (typeof reply.dailyLimitMin === "number") {
        conversationIdRef.current = null;
        setTurns(0);
        addBubble(
          "coach",
          `Your budget's set: ${reply.dailyLimitMin} min a day. You're at ${DEMO_SITE}. ` +
            `How long do you want, and for what?`
        );
        setPhaseBoth("session");
      }
      return;
    }

    // sentPhase === "session" | "overtime". Overtime threads the borrowed-time flag;
    // a grant comes back in the normal shape (plus overtime:true) and is handed off
    // exactly like any other grant.
    const overtime = sentPhase === "overtime";
    const reply = await negotiateSession({
      installId,
      site: DEMO_SITE,
      text,
      conversationId,
      overtime,
    });
    setBusy(false);
    if (!reply.ok) {
      if (reply.error === "NEEDS_LIMIT") {
        // Day rolled over / limit cleared — fall back to the limit conversation.
        conversationIdRef.current = null;
        setTurns(0);
        addBubble("coach", LIMIT_OPENER);
        setPhaseBoth("limit");
        return;
      }
      if (reply.error === "BUDGET_EXHAUSTED") {
        // The rich wall state rides on the error (limit + per-site spend + overtime
        // offer). Even during overtime (the escape valve can run dry) we fall back to
        // the wall rather than dead-ending.
        setWall({
          dailyLimitMin: typeof reply.dailyLimitMin === "number" ? reply.dailyLimitMin : null,
          spentSites: reply.spentSites ?? [],
          overtimeAvailable: reply.overtimeAvailable === true,
        });
        setPhaseBoth("exhausted");
        return;
      }
      setStatus(reply.error === "BACKEND_UNREACHABLE" ? COPY.unreachable : COPY.generic);
      setPhaseBoth("error");
      return;
    }
    conversationIdRef.current = reply.conversationId;
    if (reply.grant) {
      if (reply.reply) addBubble("coach", reply.reply);
      onGranted(reply.grant);
      return;
    }
    if (reply.reply) addBubble("coach", reply.reply);
    setTurns(reply.turns);
  }, [busy, input, addBubble, onGranted, setPhaseBoth]);

  const inConversation = phase === "limit" || phase === "session" || phase === "overtime";
  // The composer shows only during a conversation AND only once consent is accepted;
  // otherwise the consent notice takes its place.
  const showComposer = inConversation && consentAccepted === true;
  const showConsentGate = inConversation && consentAccepted === false;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header — the coach is visibly present, like the extension's mascot. */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>MP</Text>
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Mr. Productive</Text>
          <Text style={styles.headerSubtitle}>your focus coach</Text>
        </View>
        {turns > 0 && (
          <Text style={styles.turnHint} accessibilityLabel={`Turn ${turns} of ${SOFT_CAP}`}>
            {turns} of {SOFT_CAP}
          </Text>
        )}
      </View>

      {/* Borrowed-time banner — up for the whole overtime phase. */}
      {phase === "overtime" && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{OVERTIME_BANNER}</Text>
        </View>
      )}

      {/* Transcript / terminal states */}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
      >
        {phase === "loading" && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.dim}>Reaching your coach…</Text>
          </View>
        )}

        {messages.map((m) => (
          <View
            key={m.id}
            style={[styles.bubbleRow, m.who === "user" ? styles.rowUser : styles.rowCoach]}
          >
            <View style={[styles.bubble, m.who === "user" ? styles.bubbleUser : styles.bubbleCoach]}>
              {/* Text ONLY — no HTML, so untrusted content can never become markup. */}
              <Text style={m.who === "user" ? styles.bubbleUserText : styles.bubbleCoachText}>
                {m.text}
              </Text>
            </View>
          </View>
        ))}

        {status !== "" && <Text style={styles.status}>{status}</Text>}

        {/* Granted → the deliberate "Start browsing" confirmation. The coach's closing
            message stays on screen (rendered above as a bubble); nothing auto-proceeds. */}
        {phase === "granted" && grant && (
          <Pressable
            style={styles.primaryBtn}
            onPress={startBrowsing}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Start browsing →</Text>
          </Pressable>
        )}

        {/* Budget-exhausted wall. */}
        {phase === "exhausted" && wall && (
          <ExhaustedWall
            wall={wall}
            onCoffee={openCoffee}
            onOvertime={openOvertime}
          />
        )}
      </ScrollView>

      {/* First-run AI-consent gate — replaces the composer until acknowledged. */}
      {showConsentGate && (
        <View style={styles.consent}>
          <Text style={styles.consentText}>
            {CONSENT_LEAD}
            <Text style={styles.link} onPress={openPrivacy} accessibilityRole="link">
              {CONSENT_LINK_TEXT}
            </Text>
            .
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={onAcceptConsent}
            accessibilityRole="button"
            testID="consent-continue"
          >
            <Text style={styles.primaryBtnText}>{CONSENT_CONTINUE}</Text>
          </Pressable>
        </View>
      )}

      {/* Composer — only during an active conversation, only after consent. */}
      {showComposer && (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Talk to your coach…"
            placeholderTextColor={colors.muted}
            editable={!busy}
            multiline
            onSubmitEditing={submitTurn}
            returnKeyType="send"
            accessibilityLabel="Message to the coach"
            testID="composer-input"
          />
          <Pressable
            style={[styles.sendBtn, busy && styles.sendBtnDisabled]}
            onPress={submitTurn}
            disabled={busy}
            accessibilityRole="button"
            testID="composer-send"
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// --- the exhausted wall (its own component: it's a self-contained terminal screen) --

function ExhaustedWall({
  wall,
  onCoffee,
  onOvertime,
}: {
  wall: WallInfo;
  onCoffee: () => void;
  onOvertime: () => void;
}) {
  // Normalize the breakdown at the render boundary — defence in depth, matching the
  // extension's cleanSpentSites. A malformed entry is dropped, never shown as junk.
  const clean = wall.spentSites.filter(
    (s) => s && typeof s.site === "string" && Number.isFinite(s.minutes)
  );
  const headline =
    typeof wall.dailyLimitMin === "number"
      ? `Your ${wall.dailyLimitMin}-minute budget is spent`
      : clean.length > 0
        ? "Your budget for today is spent"
        : COPY.exhaustedGraceful;

  return (
    <View style={styles.wall}>
      <Text style={styles.wallHead}>{headline}</Text>

      {clean.length > 0 ? (
        <View style={styles.breakdown}>
          <Text style={styles.breakdownLabel}>Spent on</Text>
          {clean.map((s) => (
            // Each untrusted site name goes through a <Text> — never markup.
            <View key={s.site} style={styles.breakdownRow}>
              <Text style={styles.breakdownSite}>{s.site}</Text>
              <Text style={styles.breakdownMin}>{s.minutes}m</Text>
            </View>
          ))}
          <Text style={styles.comeBack}>{COME_BACK_TOMORROW}</Text>
        </View>
      ) : (
        <Text style={styles.comeBack}>{COME_BACK_TOMORROW}</Text>
      )}

      <Text style={styles.coffeeAsk}>{COFFEE_ASK}</Text>
      <Pressable style={styles.coffeeBtn} onPress={onCoffee} accessibilityRole="button">
        <Text style={styles.coffeeBtnText}>{COFFEE_BTN}</Text>
      </Pressable>

      {/* Overtime is deliberately SECONDARY, and only when the backend offers it. */}
      {wall.overtimeAvailable && (
        <Pressable
          style={styles.overtimeBtn}
          onPress={onOvertime}
          accessibilityRole="button"
          testID="overtime-optin"
        >
          <Text style={styles.overtimeBtnText}>{OVERTIME_OPTIN}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.s2,
    paddingTop: space.s2,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onAccent, fontWeight: "700", fontSize: 14 },
  headerTextWrap: { flex: 1, marginLeft: 12 },
  headerTitle: { color: colors.fg, fontSize: 16, fontWeight: "700" },
  headerSubtitle: { color: colors.muted, fontSize: 12, marginTop: 1 },
  turnHint: { color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] },

  banner: {
    backgroundColor: colors.warnSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.warnLine,
    paddingHorizontal: space.s2,
    paddingVertical: 10,
  },
  bannerText: { color: colors.warn, fontSize: 13, fontWeight: "600", textAlign: "center" },

  chat: { flex: 1 },
  chatContent: { padding: space.s2, paddingBottom: space.s3 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 10 },
  dim: { color: colors.muted, fontSize: 13 },

  bubbleRow: { marginBottom: 10, flexDirection: "row" },
  rowUser: { justifyContent: "flex-end" },
  rowCoach: { justifyContent: "flex-start" },
  bubble: { maxWidth: "82%", paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.lg },
  bubbleCoach: {
    backgroundColor: colors.surface2,
    borderTopLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  bubbleUser: {
    backgroundColor: colors.accentSoft,
    borderTopRightRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentLine,
  },
  bubbleCoachText: { color: colors.fg2, fontSize: 15, lineHeight: 21 },
  bubbleUserText: { color: colors.fg, fontSize: 15, lineHeight: 21 },

  status: { color: colors.fg2, fontSize: 14, marginTop: space.s1, textAlign: "center" },

  primaryBtn: {
    marginTop: space.s2,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },

  // Consent gate
  consent: {
    padding: space.s2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    gap: 4,
  },
  consentText: { color: colors.fg2, fontSize: 13, lineHeight: 19 },
  link: { color: colors.accent, textDecorationLine: "underline" },

  // Exhausted wall
  wall: {
    marginTop: space.s1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.s2,
    gap: 12,
  },
  wallHead: { color: colors.fg, fontSize: 18, fontWeight: "700" },
  breakdown: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 12,
    gap: 6,
  },
  breakdownLabel: {
    color: colors.muted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownSite: { color: colors.fg2, fontSize: 14, flexShrink: 1 },
  breakdownMin: { color: colors.fg, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  comeBack: { color: colors.muted, fontSize: 13, marginTop: 4 },
  coffeeAsk: { color: colors.fg2, fontSize: 14, lineHeight: 20 },
  coffeeBtn: {
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentLine,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  coffeeBtnText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  overtimeBtn: { paddingVertical: 10, alignItems: "center" },
  overtimeBtnText: { color: colors.muted, fontSize: 14, textDecorationLine: "underline" },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    color: colors.fg,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: colors.onAccent, fontWeight: "700", fontSize: 15 },
});
