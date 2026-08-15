// The NATIVE half of the SHARED-vs-NATIVE seam.
//
// Everything else in this app is portable TypeScript/React that runs identically on
// every platform. The ONE thing that is irreducibly per-OS is actually BLOCKING other
// apps/sites — and each platform does it in a completely different way:
//
//   * Android: detect the foreground app via UsageStatsManager + draw a blocking
//     overlay (SYSTEM_ALERT_WINDOW). Implemented by the local Expo module
//     `modules/mp-blocker` (Kotlin) and selected here when running on Android.
//   * iOS (later): Screen Time / FamilyControls / ManagedSettings.
//   * Web: a web page CANNOT block other apps at all — the desktop blocker stays the
//     Chrome extension we already shipped. So on web this is a no-op.
//
// The rest of the app compiles and runs against THIS interface only. The Android module
// implements `Blocker` behind this same seam — no screen or view-logic changes when it
// is (or isn't) present. That's the whole point of the interface.
import { Platform } from "react-native";
import MpBlocker, { isAvailable, InstalledApp } from "../../modules/mp-blocker";

export type { InstalledApp };

/** The list of things a platform can block (Android package names, or hosts later). */
export interface Blocker {
  /**
   * Replace the current blocklist. On Android this is the set of app package names
   * (e.g. "com.instagram.android") the overlay will guard. On web it is inert.
   */
  blockApps(list: string[]): Promise<void>;

  /**
   * Temporarily allow `pkg` for `minutes` — the "grant" fired after the coach approves
   * a session. On Android this lifts the overlay for that app until the timer expires
   * (the native SERVICE owns the countdown). On web it is inert (the extension owns
   * desktop blocking).
   */
  openFor(pkg: string, minutes: number): Promise<void>;

  /** Whether this platform can actually enforce blocking. False on web/iOS. */
  isSupported(): boolean;

  // --- permission onboarding (Android special-access permissions) -------------------
  // These are meaningful only where `isSupported()` is true. On the no-op platforms
  // they resolve to safe defaults so the onboarding screen can render one code path.

  /** Has the user granted "Usage access"? (false where unsupported). */
  hasUsageAccess(): Promise<boolean>;
  /** Deep-link to the Usage-access Settings screen (no-op where unsupported). */
  requestUsageAccess(): Promise<void>;
  /** Has the user granted "Display over other apps"? (false where unsupported). */
  hasOverlayPermission(): Promise<boolean>;
  /** Deep-link to the overlay-permission Settings screen (no-op where unsupported). */
  requestOverlayPermission(): Promise<void>;
  /** Launchable apps to choose from ([] where unsupported). */
  listInstalledApps(): Promise<InstalledApp[]>;
  /** Start the foreground blocker service (no-op where unsupported). */
  startService(): Promise<void>;
  /** Stop the foreground blocker service (no-op where unsupported). */
  stopService(): Promise<void>;
}

// Web / iOS / default implementation: no-op. It logs so the coach screen's "Start
// browsing" flow is visibly wired end-to-end during development, but it enforces
// nothing, and every query resolves to a safe "nothing available" default.
class NoopBlocker implements Blocker {
  async blockApps(list: string[]): Promise<void> {
    console.log(`[Blocker:noop] blockApps(${list.length} apps) — no-op on this platform`);
  }

  async openFor(pkg: string, minutes: number): Promise<void> {
    console.log(`[Blocker:noop] openFor(${pkg}, ${minutes}m) — no-op on this platform`);
  }

  isSupported(): boolean {
    return false;
  }

  async hasUsageAccess(): Promise<boolean> {
    return false;
  }
  async requestUsageAccess(): Promise<void> {}
  async hasOverlayPermission(): Promise<boolean> {
    return false;
  }
  async requestOverlayPermission(): Promise<void> {}
  async listInstalledApps(): Promise<InstalledApp[]> {
    return [];
  }
  async startService(): Promise<void> {}
  async stopService(): Promise<void> {}
}

// Android implementation: a thin delegate over the native module. Constructed ONLY when
// the native module actually resolved (see selection below), so `native` is non-null and
// every call forwards straight to Kotlin. `blockApps` maps to the native `setBlockedApps`
// (the seam keeps the extension-era name; the module speaks package-sets).
class AndroidBlocker implements Blocker {
  constructor(private readonly native: NonNullable<typeof MpBlocker>) {}

  blockApps(list: string[]): Promise<void> {
    return this.native.setBlockedApps(list);
  }
  openFor(pkg: string, minutes: number): Promise<void> {
    return this.native.openFor(pkg, minutes);
  }
  isSupported(): boolean {
    return true;
  }
  hasUsageAccess(): Promise<boolean> {
    return this.native.hasUsageAccess();
  }
  requestUsageAccess(): Promise<void> {
    return this.native.requestUsageAccess();
  }
  hasOverlayPermission(): Promise<boolean> {
    return this.native.hasOverlayPermission();
  }
  requestOverlayPermission(): Promise<void> {
    return this.native.requestOverlayPermission();
  }
  listInstalledApps(): Promise<InstalledApp[]> {
    return this.native.listInstalledApps();
  }
  startService(): Promise<void> {
    return this.native.startService();
  }
  stopService(): Promise<void> {
    return this.native.stopService();
  }
}

// Select the real blocker only on Android AND only when the native module is present
// (it is absent in the managed Expo Go client and on web/iOS). Everywhere else: no-op.
export const blocker: Blocker =
  Platform.OS === "android" && isAvailable() && MpBlocker != null
    ? new AndroidBlocker(MpBlocker)
    : new NoopBlocker();
