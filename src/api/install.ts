// The anonymous install identity.
//
// The backend keys EVERYTHING (budget, sessions, conversations, GDPR delete) off a
// single opaque `installId`. It carries no personal data — it's a random UUID minted
// once on first run and persisted via the platform-agnostic kv store. Every API call
// threads it; losing it just looks like a brand-new install (fresh budget).
import * as Crypto from "expo-crypto";
import { kv } from "../storage/kv";

const INSTALL_ID_KEY = "mp.installId";

// In-flight de-dupe: two screens booting at once must not mint two ids.
let pending: Promise<string> | null = null;

// Generate a v4 UUID. Prefer the runtime's own crypto.randomUUID (present in modern
// browsers + Node) and fall back to expo-crypto on native where it may be absent.
function newUuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  return Crypto.randomUUID();
}

/**
 * Return this install's id, creating + persisting one on first call. Concurrent
 * callers share the same in-flight promise, so the id is minted at most once.
 */
export async function getInstallId(): Promise<string> {
  if (pending) return pending;
  pending = (async () => {
    const existing = await kv.getItem(INSTALL_ID_KEY);
    if (existing && existing.length > 0) return existing;
    const id = newUuid();
    await kv.setItem(INSTALL_ID_KEY, id);
    return id;
  })();
  return pending;
}
