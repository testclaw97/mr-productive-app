// First-run AI-consent persistence — the app-side of the extension's acceptAiConsent.
//
// The extension stores an `aiChatAcceptedAt` timestamp and re-reads it on every boot
// so the notice is shown exactly once, ever. This is the same idea over the shared
// kv store: a finite timestamp means "accepted"; null/absent keeps the gate up. The
// gate is LOCAL — it gates the UI before any message is sent; the backend keeps its
// own record independently, so losing this just re-shows the one-time notice.
import { kv } from "./kv";

const CONSENT_KEY = "mp.aiChatAcceptedAt";

/** Has the user acknowledged the AI-consent notice on this install? */
export async function hasAcceptedAiConsent(): Promise<boolean> {
  const raw = await kv.getItem(CONSENT_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  return Number.isFinite(ts) && ts > 0;
}

/** Record the acknowledgement (idempotent). Best-effort — kv.setItem never throws. */
export async function acceptAiConsent(): Promise<void> {
  await kv.setItem(CONSENT_KEY, String(Date.now()));
  notify(true);
}

/**
 * Clear the acknowledgement — used by the GDPR "Delete my data" flow so the notice
 * is shown again before any future message reaches the coach (mirrors the extension,
 * which resets consent.aiChatAcceptedAt on delete). Best-effort; never throws.
 */
export async function clearAiConsent(): Promise<void> {
  await kv.removeItem(CONSENT_KEY);
  notify(false);
}

// --- live subscription ------------------------------------------------------------
//
// The three screens stay mounted for the whole session (see App.tsx), so the Coach
// screen — which reads consent once at boot — needs to hear about a consent change
// made on the Settings screen (a data-delete clears it). A tiny synchronous pub/sub
// lets the composer re-lock behind the notice the instant data is deleted, without
// pulling in a state-management library.
type ConsentListener = (accepted: boolean) => void;
const listeners = new Set<ConsentListener>();

function notify(accepted: boolean): void {
  for (const cb of listeners) {
    try {
      cb(accepted);
    } catch {
      /* a listener throwing must not break the others */
    }
  }
}

/** Subscribe to consent changes. Returns an unsubscribe function. */
export function subscribeAiConsent(cb: ConsentListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
