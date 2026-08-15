// The user's block list — persisted, platform-agnostic, over the shared kv store.
//
// This is the user's OWN local artefact (mirrors the extension's `rules`): the set of
// apps/sites they want Mr. Productive to guard. It is stored locally as a JSON array of
// normalized strings and is DELIBERATELY preserved by the GDPR "Delete my data" flow —
// it is not "our" server data, so a data-deletion must never nuke it.
//
// On Android the native Blocker consumes this list (blocker.blockApps) and an
// app-picker will later populate it from installed apps; on web it is inert (the
// Chrome extension owns desktop blocking). Nothing here is native-only — it is pure
// TypeScript over the kv seam, so it runs identically on every platform.
import { kv } from "./kv";

const BLOCKLIST_KEY = "mp.blocklist";

/** Normalize a raw input into a stored entry, or null if it is empty/junk. Lower-cases
 *  and trims; strips a leading scheme + `www.` and any path so "https://www.Instagram.com/x"
 *  and "instagram.com" collapse to the same entry. Kept intentionally simple — the
 *  Android app-picker will contribute exact package names later. */
export function normalizeEntry(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let v = raw.trim().toLowerCase();
  if (v === "") return null;
  v = v.replace(/^[a-z]+:\/\//, ""); // strip scheme
  v = v.replace(/^www\./, ""); // strip www.
  v = v.split("/")[0]; // drop any path/query
  v = v.trim();
  return v === "" ? null : v;
}

/** Read the persisted block list. Never throws; a corrupt value yields an empty list. */
export async function getBlocklist(): Promise<string[]> {
  const raw = await kv.getItem(BLOCKLIST_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defence in depth: keep only non-empty strings, de-duped, order preserved.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const v = item.trim();
      if (v === "" || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  } catch {
    return [];
  }
}

async function save(list: string[]): Promise<void> {
  await kv.setItem(BLOCKLIST_KEY, JSON.stringify(list));
}

/**
 * Replace the whole block list with an explicit set. Used by the Android app-picker,
 * which owns the full set of blocked package names at once (toggle on/off). Entries are
 * kept VERBATIM (no host normalization) — package ids are case-sensitive — but trimmed,
 * de-duped, and order-preserved. Returns the cleaned, persisted list.
 */
export async function setBlocklist(list: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const v = item.trim();
    if (v === "" || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  await save(out);
  return out;
}

/**
 * Add an entry. Returns the new list plus a `status`:
 *   "added"     — accepted and persisted
 *   "duplicate" — already present (no change)
 *   "invalid"   — empty/unparseable input (no change)
 */
export async function addToBlocklist(
  raw: string
): Promise<{ list: string[]; status: "added" | "duplicate" | "invalid"; entry: string | null }> {
  const entry = normalizeEntry(raw);
  const list = await getBlocklist();
  if (entry === null) return { list, status: "invalid", entry: null };
  if (list.includes(entry)) return { list, status: "duplicate", entry };
  const next = [...list, entry];
  await save(next);
  return { list: next, status: "added", entry };
}

/** Remove an entry (removals are allowed for now — the extension's add-only lock is a
 *  desktop-enforcement concern that does not apply here yet). Returns the new list. */
export async function removeFromBlocklist(entry: string): Promise<string[]> {
  const list = await getBlocklist();
  const next = list.filter((x) => x !== entry);
  await save(next);
  return next;
}
