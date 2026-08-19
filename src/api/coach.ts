// Shared coach API client — framework-agnostic plain TypeScript.
//
// This is the SHARED half of the app: it has ZERO React / React Native imports and
// hits the exact same `/api/v2/*` endpoints the Chrome extension's service worker
// calls. Web, Android and (later) iOS all reuse this one file — a backend contract
// change is fixed in exactly one place.
//
// The request/response shapes below are modelled directly off backend/src/server.js:
//   POST /api/v2/state             → stateRoute
//   POST /api/v2/limit/negotiate   → limitNegotiateRoute
//   POST /api/v2/session/negotiate → sessionNegotiateRoute (+ overtime branch)
//
// THE IRON RULE lives server-side: the backend clamps every number, so the client
// simply trusts and renders what it is handed. We never compute a budget here.
import { BACKEND_URL } from "../config";

// --- wire types (mirror backend/src/server.js exactly) ----------------------------

/** One entry in a per-site spend breakdown, most-first. */
export interface SpentSite {
  site: string;
  minutes: number;
}

/** A granted, metered session — the only thing that unlocks a site. */
export interface Grant {
  site: string;
  minutes: number;
  endsAt: number; // epoch ms when the session expires
  overtime?: boolean; // true when granted from the borrowed-time (overtime) flow
}

/** POST /api/v2/state response. `needsLimit` drives which conversation the UI opens. */
export interface StateResponse {
  ok: true;
  dailyLimitMin: number | null; // null when a limit must still be negotiated
  spentTodayMin: number;
  remainingMin: number;
  day: string; // local day, e.g. "2026-08-15"
  needsLimit: boolean;
  spentSites: SpentSite[];
  overtimeAvailable: boolean;
}

/** POST /api/v2/limit/negotiate success response. */
export interface LimitNegotiateResponse {
  ok: true;
  reply: string;
  turns: number;
  done: boolean;
  conversationId: string;
  dailyLimitMin?: number; // present only when the negotiation concluded WITH a set limit
}

/** POST /api/v2/session/negotiate success response (covers the overtime branch too). */
export interface SessionNegotiateResponse {
  ok: true;
  reply: string;
  turns: number;
  done: boolean;
  conversationId: string;
  grant?: Grant; // present only on a concluded grant
  // Overtime-only extras (present when the session ran in borrowed-time mode):
  overtime?: boolean;
  overtimeCap?: number;
  spentSites?: SpentSite[];
}

/**
 * Any `{ok:false, error, ...}` the backend can return. NEEDS_LIMIT / BUDGET_EXHAUSTED
 * are business states (not transport failures); BAD_REQUEST / RATE_LIMITED / INTERNAL
 * are protocol/infra. The caller switches on `error`.
 */
export interface ErrorResponse {
  ok: false;
  error: string; // e.g. "NEEDS_LIMIT" | "BUDGET_EXHAUSTED" | "BAD_REQUEST" | "RATE_LIMITED"
  dailyLimitMin?: number;
  spentSites?: SpentSite[];
  overtimeAvailable?: boolean;
}

// A synthetic error the CLIENT raises when the network/coach can't be reached at all.
// It mirrors the extension's fail-closed "wall stays up" behaviour: the caller treats
// it exactly like a backend error and never opens a site.
export const BACKEND_UNREACHABLE = "BACKEND_UNREACHABLE";

// Discriminated-union results: callers narrow on `.ok`.
export type LimitResult = LimitNegotiateResponse | ErrorResponse;
export type SessionResult = SessionNegotiateResponse | ErrorResponse;
export type StateResult = StateResponse | ErrorResponse;

// --- helpers ----------------------------------------------------------------------

/**
 * tzOffsetMin, the way the backend wants it: minutes to ADD to UTC to reach local
 * time. JS `getTimezoneOffset()` returns the opposite sign, so negate it. Passed on
 * every call so the server computes the correct local day (budget resets at local
 * midnight). Defaulting to the device's real offset matches the extension.
 */
export function deviceTzOffsetMin(): number {
  return -new Date().getTimezoneOffset();
}

/** POST JSON to a `/api/v2/*` path and parse the JSON reply. Never throws — a network
 *  failure resolves to a synthetic BACKEND_UNREACHABLE error so callers fail closed. */
async function postJson<T>(path: string, body: unknown): Promise<T | ErrorResponse> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // The backend always answers JSON (even for 4xx/5xx). Parse defensively.
    const data = (await res.json()) as T | ErrorResponse;
    return data;
  } catch {
    return { ok: false, error: BACKEND_UNREACHABLE };
  }
}

// --- the three shared calls -------------------------------------------------------

/**
 * GET the install's current budget. Drives the whole UI: `needsLimit` → open the
 * limit conversation; otherwise the session conversation (or the exhausted wall when
 * remaining is 0).
 */
export function getState(installId: string, tzOffsetMin = deviceTzOffsetMin()): Promise<StateResult> {
  return postJson<StateResponse>("/api/v2/state", { installId, tzOffsetMin });
}

/** Arguments common to a negotiation turn. `conversationId` is absent on turn 1 (the
 *  server mints one and echoes it back) and threaded on every subsequent turn. */
export interface NegotiateLimitArgs {
  installId: string;
  text: string;
  conversationId?: string;
  tzOffsetMin?: number;
}

/** Send one turn of the set-the-daily-limit conversation. On `done` WITH
 *  `dailyLimitMin`, the limit is set (code-clamped) and the UI moves to the session. */
export function negotiateLimit(args: NegotiateLimitArgs): Promise<LimitResult> {
  const { installId, text, conversationId, tzOffsetMin = deviceTzOffsetMin() } = args;
  const body: Record<string, unknown> = { installId, text, tzOffsetMin };
  if (conversationId) body.conversationId = conversationId;
  return postJson<LimitNegotiateResponse>("/api/v2/limit/negotiate", body);
}

/** Arguments for one turn of the grant-a-session conversation. `overtime:true` opts
 *  into the borrowed-time flow once the daily budget is spent. */
export interface NegotiateSessionArgs {
  installId: string;
  site: string;
  text: string;
  conversationId?: string;
  tzOffsetMin?: number;
  overtime?: boolean;
}

/** Send one turn of the grant-a-metered-session conversation. On `done` WITH `grant`,
 *  the backend has recorded the session; the UI shows "Start browsing". */
export function negotiateSession(args: NegotiateSessionArgs): Promise<SessionResult> {
  const { installId, site, text, conversationId, tzOffsetMin = deviceTzOffsetMin(), overtime } = args;
  const body: Record<string, unknown> = { installId, site, text, tzOffsetMin };
  if (conversationId) body.conversationId = conversationId;
  if (overtime) body.overtime = true;
  return postJson<SessionNegotiateResponse>("/api/v2/session/negotiate", body);
}

/**
 * POST /api/v2/limit/set success response — the DIRECT daily-deadline set (the quick
 * picker; no coach, no brain call). The server clamps `minutes` to [10,120] and freezes
 * it for the local day: a same-day re-set returns the ALREADY-stored value, so
 * `dailyLimitMin` may differ from what was requested. The caller compares the two to
 * detect "already locked today".
 */
export interface LimitSetResponse {
  ok: true;
  dailyLimitMin: number; // the stored, clamped, frozen-for-day value
  spentTodayMin: number;
  remainingMin: number;
}

export type LimitSetResult = LimitSetResponse | ErrorResponse;

/**
 * Set today's daily deadline DIRECTLY (the quick picker replaces the coach limit
 * negotiation). The server clamps to [10,120] and freezes it for the local day — a
 * re-set the same day returns the stored value unchanged, so callers must treat the
 * returned `dailyLimitMin` (not the requested `minutes`) as the truth.
 */
export function setLimit(
  installId: string,
  minutes: number,
  tzOffsetMin = deviceTzOffsetMin()
): Promise<LimitSetResult> {
  return postJson<LimitSetResponse>("/api/v2/limit/set", { installId, minutes, tzOffsetMin });
}

/** POST /api/v2/data/delete success response. `deleted` is the server's row count. */
export interface DataDeleteResponse {
  ok: true;
  deleted?: unknown;
}

export type DataDeleteResult = DataDeleteResponse | ErrorResponse;

/**
 * GDPR self-service: ask the backend to purge ALL of this install's server-side rows
 * (conversations, sessions, archived transcripts), keyed on the install's OWN
 * anonymous id. Not rate-limited and spends no API credit. Fails closed — a network
 * failure resolves to BACKEND_UNREACHABLE so the caller can leave local state untouched
 * and show a retryable error (mirrors the extension's fail-soft delete).
 */
export function deleteData(installId: string): Promise<DataDeleteResult> {
  return postJson<DataDeleteResponse>("/api/v2/data/delete", { installId });
}
