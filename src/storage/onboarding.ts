// First-run onboarding flag — persisted once over the shared kv store so the welcome
// flow is shown exactly once, ever. Absent/"0" → show onboarding; "1" → skip straight to
// the app. Mirrors the consent/blocklist pattern: pure TypeScript over the kv seam, so it
// runs identically on web and native. Deliberately independent of the AI-consent flag and
// the block list, and NOT cleared by "Delete my data" (finishing onboarding is a UI fact,
// not server data).
import { kv } from "./kv";

const ONBOARDING_KEY = "mp.onboardingDone";

/** Has the user finished the first-run onboarding on this install? */
export async function hasCompletedOnboarding(): Promise<boolean> {
  const raw = await kv.getItem(ONBOARDING_KEY);
  return raw === "1";
}

/** Record that onboarding is done (idempotent). Best-effort — kv.setItem never throws. */
export async function completeOnboarding(): Promise<void> {
  await kv.setItem(ONBOARDING_KEY, "1");
}

/** Clear the flag so onboarding shows again — used by the Settings "Replay intro" action. */
export async function resetOnboarding(): Promise<void> {
  await kv.removeItem(ONBOARDING_KEY);
}
