// Single source of truth for where the coach lives.
//
// The whole app (every platform: web, Android, later iOS) reads BACKEND_URL from
// here, so pointing at a different backend is a one-line change. The backend is
// the SAME coach-budget server the Chrome extension already talks to — the app is
// just another client of `/api/v2/*`.
//
// DEV (reachable from this VPS + a headless browser on the Tailnet):
//   http://100.123.255.8:4022
// PROD (once live, behind TLS):
//   https://mrproductive.lumieremedia.agency
//
// Swap the constant (or wire it to an env/EAS build profile later) when shipping.
// NOW LIVE behind Cloudflare + nginx → the coach backend, so the app works on any
// phone without Tailscale. (Was http://100.123.255.8:4022 — Tailscale-only.)
export const BACKEND_URL = "https://mrproductive.lumieremedia.agency";

// The old Tailnet-only dev URL, kept for reference.
export const DEV_BACKEND_URL = "http://100.123.255.8:4022";

// The "n of 3" soft hint shown next to the turn counter. The BACKEND hard-caps the
// negotiation (NEGOTIATION_MAX_TURNS); this is only the cosmetic ceiling the coach
// screen shows, kept byte-identical to the extension's SOFT_CAP.
export const SOFT_CAP = 3;
