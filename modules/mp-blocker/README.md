# mp-blocker (local Expo module, Android-only)

The native blocking layer behind the app's `Blocker` seam (`app/src/native/Blocker.ts`).
On web/iOS it does not exist and callers fall back to a no-op; on Android it enforces the
blocklist for real.

## What it does

- **Foreground service** (`BlockerService.kt`) polls the current foreground app once per
  second via `UsageStatsManager.queryEvents`.
- When the foreground app is in the **blocked set** and has **no active grant**, it draws
  a full-screen **overlay** (`WindowManager`, `TYPE_APPLICATION_OVERLAY`) — a native
  "Blocked — talk to your coach" screen with buttons to open Mr. Productive or go home.
- A **grant** (`openFor(pkg, minutes)`) writes an absolute expiry into `BlockerStore`
  (SharedPreferences). The **service** owns the countdown: every tick it re-checks
  `now < expiry`, so the overlay reappears the moment a grant lapses — the JS layer is
  never trusted with the timer. This mirrors the extension's "opens for the granted
  minutes, then relocks" invariant.

## Why UsageStats + overlay (not AccessibilityService)

An `AccessibilityService` could also detect the foreground app, but Google Play's
accessibility policy forbids using that API for non-accessibility purposes and rejects
blocker-style use. `UsageStatsManager` + a `SYSTEM_ALERT_WINDOW` overlay is the Play-safe
combination, so we never touch the accessibility API.

## Permissions (all declared in `android/src/main/AndroidManifest.xml`)

| Permission | Why | How granted |
|---|---|---|
| `PACKAGE_USAGE_STATS` | read which app is foregrounded | Settings ▸ Usage access (special) |
| `SYSTEM_ALERT_WINDOW` | draw the block overlay | Settings ▸ Display over other apps (special) |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE` | keep the poller alive (API 34+ needs the typed variant) | normal / manifest |
| `POST_NOTIFICATIONS` | the ongoing FGS notification (API 33+) | runtime prompt |
| `QUERY_ALL_PACKAGES` | list installed apps for the picker | manifest + Play Console declaration |

The two "special access" permissions cannot be granted by a normal runtime dialog — the
app deep-links the user into the relevant Settings screen (`requestUsageAccess`,
`requestOverlayPermission`), which the Protect onboarding screen walks them through.

## JS API (`index.ts`)

`requireOptionalNativeModule("MpBlocker")` → `null` on web/iOS, the module on Android.
Methods: `hasUsageAccess`, `requestUsageAccess`, `hasOverlayPermission`,
`requestOverlayPermission`, `listInstalledApps`, `setBlockedApps`, `openFor`,
`startService`, `stopService`. Consumed through `src/native/Blocker.ts`.

## ⚠️ Build status

The Kotlin here is **unverified** — it has never been compiled. There is no Android SDK on
the dev box (deliberately: it runs live payments on tight disk). The TypeScript wiring is
typechecked; the Kotlin is first compiled by the **EAS cloud build**. Expect to iterate on
the first `eas build`.

## Building it (EAS cloud — nothing heavy runs locally)

```bash
npm i -g eas-cli
cd app
eas login                                   # free Expo account
eas build -p android --profile preview      # cloud build → installable APK
# download the APK from the URL EAS prints, then on the phone:
#   sideload it, open the app → Protect tab
#   grant "Usage access" and "Display over other apps"
#   tap "Start protecting"
```

The module autolinks: Expo scans `app/modules/` (the default `nativeModulesDir`) and picks
up any folder with an `expo-module.config.json`. No manual registration needed.
