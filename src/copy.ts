// The coach's voice — one shared copy file, mirrored VERBATIM from the extension
// (extension/blocked/blocked.js) so the app and the desktop blocker speak with the
// same words. Warm, non-shaming; never a permanent cage. Plain string constants →
// framework-agnostic, imported by every screen (web + native).
//
// The two PLACEHOLDER URLs (DONATE_URL, PRIVACY_URL) are the exact placeholders the
// extension ships; TJ swaps them for the real URLs before shipping. They are plain
// external links opened via Linking — nothing is ever collected in-app.

// --- negotiation openers ----------------------------------------------------------

export const LIMIT_OPENER =
  "Before I hand you any time, let's set a fair daily budget. What does your day look like?";

// OVERTIME — borrowed time, firmly framed. The opener is spoken locally (the backend
// needs the user's ask before it will negotiate); the banner stays up for the phase.
export const OVERTIME_BANNER = "Overtime — this is borrowed time, let's keep it short.";
export const OVERTIME_OPENER =
  "Your budget's already spent, so this is overtime — a few minutes at most. What do you need it for?";

// --- first-run AI-consent (shown once, before the first message reaches the coach) -

export const CONSENT_LEAD =
  "Mr. Productive's coach is powered by AI. The messages you type to the coach are " +
  "sent to our server and an AI provider to generate replies, and stored to help " +
  "improve the coach. We don't collect your identity, browsing history, or the " +
  "contents of pages you visit. ";
export const CONSENT_LINK_TEXT = "See our Privacy Policy";
export const CONSENT_CONTINUE = "I understand — continue";

// PLACEHOLDER — TJ swaps this for the real Privacy Policy URL before shipping.
export const PRIVACY_URL = "https://PRIVACY_URL_PLACEHOLDER";

// --- exhausted wall ---------------------------------------------------------------

export const COFFEE_ASK =
  "☕ If this helped you stay productive, buy us a coffee — it helps us keep going and building this further.";

// PLACEHOLDER — TJ sets the real Buy Me a Coffee URL before shipping.
export const DONATE_URL = "https://buymeacoffee.com/PLACEHOLDER";

export const COME_BACK_TOMORROW = "Come back tomorrow.";
export const OVERTIME_OPTIN = "I need a few more minutes";
export const COFFEE_BTN = "Buy us a coffee";

// --- blocklist --------------------------------------------------------------------

export const BLOCKLIST_INTRO =
  "The apps and sites you want Mr. Productive to guard. Add anything that eats your day.";
// Honest note: the app can't enforce blocking on its own — the enforcer is per-OS.
export const BLOCKLIST_ANDROID_NOTE =
  "On Android, an app-picker will fill this from your installed apps, and the on-device blocker enforces it. On the web, desktop blocking stays with the Mr. Productive Chrome extension.";
export const BLOCKLIST_EMPTY = "Nothing guarded yet. Add a site or app above.";
export const BLOCKLIST_SUGGESTIONS = ["instagram.com", "tiktok.com", "youtube.com", "x.com", "reddit.com"];

// --- settings / privacy -----------------------------------------------------------

export const SETTINGS_DATA_EXPLAINER =
  "Mr. Productive keys everything to one anonymous install id — no name, email, or browsing history. Your coach conversations and session history live on our server; your block list stays only on this device.";
export const SETTINGS_INSTALL_LABEL = "Anonymous install id";
export const SETTINGS_PRIVACY_LINK = "Privacy Policy";
export const DELETE_TITLE = "Delete my data";
export const DELETE_NOTE =
  "Deletes your coach conversations and session history from our server, and clears local stats. Your block list stays.";
export const DELETE_CONFIRM_COPY =
  "This permanently deletes your coach conversations and session history from our server, and resets your local stats. Your block list is kept. This can't be undone.";
export const DELETE_CONFIRM_YES = "Yes, delete it";
export const DELETE_CANCEL = "Cancel";
export const DELETE_DELETING = "Deleting…";
export const DELETE_DONE = "Your data was deleted.";
export const DELETE_FAILED = "Couldn't reach the server. Try again.";

// --- status / error copy ----------------------------------------------------------

export const COPY = {
  exhausted: "Today's budget is gone. Come back tomorrow.",
  exhaustedGraceful: "Your budget for today is spent. Come back tomorrow.",
  unreachable:
    "Can't reach your coach right now — check your connection. The wall stays up.",
  generic: "Something went sideways. Give it another try in a moment.",
} as const;
