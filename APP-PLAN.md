# Mr. Productive — Cross-Platform App Plan (Android + Web now, iOS later)

> Goal: ONE TypeScript codebase → Android + Web (iOS later), ~90% shared, so a change
> in one place lands everywhere. Only the OS-level *blocking* differs per platform.

## Stack (decided)
- **Expo (React Native) + TypeScript.** Same language as the extension + Node backend
  (max reuse), one codebase for Android/iOS/web, and Expo **OTA updates** push JS changes
  to everyone instantly without a store review — the "update once, all update" win.
- State/logic in plain TS (shared). UI in React Native components (shared across native + web).

## What is SHARED (write once) vs NATIVE (thin, per-platform)
SHARED (one codebase, all platforms):
- Coach API client → the existing backend (`/api/v2/state|limit/negotiate|session/negotiate|data/delete`).
- Budget/session view-logic, the chat screen, dashboard, blocklist editor, exhausted wall,
  consent gate, "Start browsing" flow — all the UI + logic already designed in the extension,
  re-expressed as RN components.
NATIVE (small module behind one interface `Blocker`):
- **Android:** detect the foreground app via **UsageStatsManager** + draw a **blocking overlay**
  (SYSTEM_ALERT_WINDOW). Avoids AccessibilityService (Play-policy landmine). Website blocking
  optional later via a local VPN.
- **iOS (later):** Screen Time / FamilyControls / ManagedSettings. Needs a Mac + Apple entitlement.
- **Web:** a web app CANNOT block other apps — so "web" = the coach + dashboard + account surface;
  the desktop *blocking* stays the **Chrome extension we already shipped**.

## Reuse from what's built
- Backend: unchanged — the app is just another client of the same coach API. (Public URL:
  `mrproductive.lumieremedia.agency` once live; dev can use the Tailscale URL.)
- Copy: the coach persona, the budget bounds, the exhausted/coffee copy — reuse verbatim.
- The "iron rule" (code clamps every number) already lives server-side → the app inherits it free.

## Requirements & timeline (the real gates)
- **Google Play:** $25 one-time · **gov-ID verification** (24–48h) · target **API 35** · signed `.aab`.
- ⚠️ **Closed test: 12+ testers for 14 continuous days** before production (calendar gate — start early).
- **Disclosures:** data-safety form + a prominent disclosure/consent for the overlay + usage-access
  permission (why we need it). Reuse the extension's consent + privacy policy.
- **iOS (later):** $99/yr Apple account · a Mac to build/sign · Screen Time entitlement request.

## Build discipline (the "safe vibe coding" part)
Every module: worker-built → adversarial review → tests → gate. Same as the extension.
Add static analysis + a real device test before any store submission.

## Sequence
1. **Scaffold** Expo TS app in `app/` (this folder), web target runnable on the VPS. ← starting now
2. **Shared coach client + chat screen** talking to the live backend (verify on web first).
3. **Dashboard + blocklist + exhausted/Start-browsing** screens (ported from the extension).
4. **Android `Blocker` native module** (UsageStats + overlay) + permission onboarding.
5. **Closed test** (12 testers, 14 days) → production.
6. **iOS** when a Mac is available.

## Where it lives
Monorepo under `~/products/mr-productive/`: `extension/` (desktop blocker), `backend/` (shared coach),
`app/` (this — Android/web/iOS). One backend, three front-ends.

---

## Android native blocking layer (`modules/mp-blocker`) — added

Step 4 of the sequence, built as a **local Expo module** (source only; compiled in the
EAS cloud, never on the dev box).

### What it does
- **Foreground service** (`BlockerService.kt`) polls the current foreground app every
  second via `UsageStatsManager.queryEvents`.
- When that app is in the **blocked set** and has **no active grant**, it draws a
  full-screen **overlay** (`WindowManager` / `TYPE_APPLICATION_OVERLAY`): a native
  "Blocked — talk to your coach" screen with "Talk to your coach" (opens the app) and
  "Go to home screen" buttons.
- A **grant** — `openFor(pkg, minutes)`, called from the coach "Start browsing" flow —
  writes an absolute expiry into `BlockerStore` (SharedPreferences). The **service owns
  the countdown**: each tick re-checks `now < expiry`, so the overlay reappears the
  instant a grant lapses. JS is never trusted with the timer (mirrors the extension's
  "opens for the granted minutes, then relocks").

### Why UsageStats + overlay (not AccessibilityService)
Google Play's accessibility policy forbids using the accessibility API for non-
accessibility purposes and rejects blocker-style use. `UsageStatsManager` + a
`SYSTEM_ALERT_WINDOW` overlay is the Play-safe combination — no accessibility API, no
policy landmine.

### Permissions (declared in the module manifest + mirrored in app.json)
| Permission | Why | Grant path |
|---|---|---|
| `PACKAGE_USAGE_STATS` | read the foreground app | Settings ▸ Usage access (special) |
| `SYSTEM_ALERT_WINDOW` | draw the block overlay | Settings ▸ Display over other apps (special) |
| `FOREGROUND_SERVICE` (+ `FOREGROUND_SERVICE_SPECIAL_USE`, API 34+) | keep the poller alive | manifest / normal |
| `POST_NOTIFICATIONS` | ongoing FGS notification (API 33+) | runtime prompt |
| `QUERY_ALL_PACKAGES` | list installed apps for the picker | manifest + Play Console declaration |

### Package id
`agency.lumieremedia.mrproductive` (unchanged — the Lumiere-agency-owned id already set
in app.json; matches the Kotlin namespace `agency.lumieremedia.mrproductive.mpblocker`).

### JS wiring
`src/native/Blocker.ts` selects `AndroidBlocker` (delegates to `modules/mp-blocker`) when
`Platform.OS === "android"` and the native module resolved; otherwise the no-op. The
Blocklist screen syncs its list via `blocker.blockApps(...)`; the coach grant calls
`blocker.openFor(...)`; the new **Protect** tab (`ProtectionScreen.tsx`) walks the two
special-access permissions and starts/stops the service. All no-ops on web/iOS.

### Build + install (EAS cloud — nothing heavy runs locally)
```bash
npm i -g eas-cli
cd app
eas login                                   # free Expo account
eas build -p android --profile preview      # cloud build → installable APK
# download the APK EAS prints → sideload on the phone →
#   open app → Protect tab → grant "Usage access" + "Display over other apps" →
#   tap "Start protecting"
```
`development` profile builds an APK dev-client; `production` builds a signed `.aab` for
Play. The module autolinks (Expo scans `app/modules/` for `expo-module.config.json`).

### ⚠️ Status
The **Kotlin is unverified** — never compiled (no Android SDK on the dev box, by design).
The TypeScript wiring + Protect screen are typechecked and the web build is unaffected
(blocker is a no-op on web). First real compile happens on the initial `eas build`;
expect to iterate there.
