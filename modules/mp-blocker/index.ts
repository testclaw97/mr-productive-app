// JS entry for the local Expo module `mp-blocker`.
//
// This is the ONLY place JS reaches for the native Kotlin side. It resolves the native
// module registered as "MpBlocker" (see MpBlockerModule.kt's `Name("MpBlocker")`).
//
// `requireOptionalNativeModule` returns `null` — instead of throwing — when the native
// module isn't present. That is the normal case on **web and iOS**: this module ships
// Android code only, so on every other platform `Native` is null and callers fall back
// to the no-op path (see src/native/Blocker.ts). That's why nothing here imports React
// Native's Platform — the null check IS the platform check, and it keeps the web bundle
// clean (the web build of expo-modules-core provides a stub that just returns null).
import { requireOptionalNativeModule } from "expo-modules-core";

/** One launchable app, as returned by the native app picker. */
export interface InstalledApp {
  /** Human-readable name, e.g. "Instagram". */
  label: string;
  /** Android package id, e.g. "com.instagram.android" — the value the blocker keys on. */
  packageName: string;
}

/** The exact surface implemented by MpBlockerModule.kt. Kept in lockstep with the Kotlin. */
export interface MpBlockerNativeModule {
  /** Has the user granted "Usage access" in Settings? */
  hasUsageAccess(): Promise<boolean>;
  /** Open the Usage-access Settings screen (no runtime dialog exists for it). */
  requestUsageAccess(): Promise<void>;
  /** Has the user granted "Display over other apps"? */
  hasOverlayPermission(): Promise<boolean>;
  /** Open the overlay-permission Settings screen for our package. */
  requestOverlayPermission(): Promise<void>;
  /** Launchable apps (label + package), sorted, minus our own app. */
  listInstalledApps(): Promise<InstalledApp[]>;
  /** Replace the blocked-package set the service enforces. */
  setBlockedApps(packages: string[]): Promise<void>;
  /** Open `pkg` for `minutes`; the SERVICE re-blocks it when the timer expires. */
  openFor(pkg: string, minutes: number): Promise<void>;
  /** Start the foreground polling+overlay service. */
  startService(): Promise<void>;
  /** Stop the foreground service (and tear down any overlay). */
  stopService(): Promise<void>;
}

// `null` on web / iOS (no native module registered), the real module on Android.
const Native = requireOptionalNativeModule<MpBlockerNativeModule>("MpBlocker");

/** Whether the native Android blocker is actually present on this platform/build. */
export function isAvailable(): boolean {
  return Native != null;
}

export default Native;
