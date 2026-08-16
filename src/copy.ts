// The coach's voice — one shared copy file, mirrored VERBATIM from the extension
// (extension/blocked/blocked.js) so the app and the desktop blocker speak with the
// same words. Warm, non-shaming; never a permanent cage. Plain string constants →
// framework-agnostic, imported by every screen (web + native).
//
// The two PLACEHOLDER URLs (DONATE_URL, PRIVACY_URL) are the exact placeholders the
// extension ships; TJ swaps them for the real URLs before shipping. They are plain
// external links opened via Linking — nothing is ever collected in-app.

// --- first-run onboarding (app-only; not shared with the extension) ----------------
//
// Four screens, one purpose each, value BEFORE commitment. The hook is a "focus report"
// stat (Opal / one sec style) that reframes phone time as life time; the CTAs are warm,
// low-friction, foot-in-the-door invitations.

export const ONB_SKIP = "Skip";
export const ONB_BACK = "Back";
export const ONB_NEXT = "Next";

// Screen 1 — welcome / hook
export const ONB_WELCOME_KICKER = "Mr. Productive";
export const ONB_WELCOME_TITLE = "Take your time back.";
export const ONB_WELCOME_STAT_BIG = "4 hours a day";
export const ONB_WELCOME_STAT_LEAD = "The average person spends about";
export const ONB_WELCOME_STAT_TAIL =
  "on their phone — roughly 9 years of a lifetime. Mr. Productive helps you spend it on purpose.";
export const ONB_WELCOME_CTA = "Ready to take your time back?";

// Screen 2 — pick distractions
export const ONB_PICK_TITLE = "What steals your time?";
export const ONB_PICK_SUB =
  "Pick the apps that pull you in. Your coach guards these — you decide when they're worth it.";
export const ONB_PICK_WEB_NOTE =
  "On the web these are a preview. On Android, Mr. Productive guards the real apps on your phone; on desktop the Chrome extension guards the sites.";
export const ONB_PICK_CTA = "These steal my time";
export const ONB_PICK_SKIP = "I'll choose later";

// The usual suspects, with friendly labels. Selecting one adds its domain to the block
// list (dedup-safe) so the choice isn't lost when the flow ends.
export const ONBOARDING_APPS: { label: string; glyph: string; entry: string }[] = [
  { label: "Instagram", glyph: "📸", entry: "instagram.com" },
  { label: "TikTok", glyph: "🎵", entry: "tiktok.com" },
  { label: "YouTube", glyph: "▶️", entry: "youtube.com" },
  { label: "X", glyph: "✖️", entry: "x.com" },
  { label: "Reddit", glyph: "👽", entry: "reddit.com" },
  { label: "Facebook", glyph: "👍", entry: "facebook.com" },
  { label: "Snapchat", glyph: "👻", entry: "snapchat.com" },
  { label: "Netflix", glyph: "🎬", entry: "netflix.com" },
];

// Screen 3 — turn on protection
export const ONB_PROTECT_TITLE = "Turn on protection";
export const ONB_PROTECT_SUB =
  "Blocking for real needs two Android permissions. You grant each one in Settings — we only take you there, and nothing turns on without you.";
export const ONB_PROTECT_USAGE_TITLE = "See which app is open";
export const ONB_PROTECT_USAGE_WHY =
  "So Mr. Productive knows when to step in. It never reads what you do inside an app — only which one is in front.";
export const ONB_PROTECT_OVERLAY_TITLE = "Draw the block screen";
export const ONB_PROTECT_OVERLAY_WHY =
  "So Mr. Productive can hold the door on a blocked app until you've earned time from your coach.";
export const ONB_PROTECT_WEB_TITLE = "Protection runs on Android";
export const ONB_PROTECT_WEB_BODY =
  "On Android, Mr. Productive blocks the apps on your phone. On desktop the Chrome extension does the blocking. Here on the web you can set your budget with the coach and build your list — install the Android app to switch real blocking on.";
export const ONB_PROTECT_CTA = "Continue";

// Screen 4 — you're protected (celebratory)
export const ONB_DONE_TITLE = "You're all set.";
export const ONB_DONE_BODY =
  "When you open a blocked app, your coach helps you decide if it's worth it — and hands you a fair, timed session if it is. No shame, no permanent cage.";
export const ONB_DONE_CTA = "Enter Mr. Productive";

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

// The live Privacy Policy (hosted alongside the coach backend). Opened as a plain
// external link via Linking — the app never collects anything in-app.
export const PRIVACY_URL = "https://mrproductive.lumieremedia.agency/privacy";

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

// --- blocklist: Android installed-app picker --------------------------------------
export const BLOCKLIST_APP_INTRO =
  "Choose which installed apps Mr. Productive should guard. Toggle an app on to block it — the on-device blocker enforces your choices.";
export const BLOCKLIST_SEARCH_PLACEHOLDER = "Search your apps…";
export const BLOCKLIST_BLOCKED_LABEL = "Blocked";
export const BLOCKLIST_ALL_APPS_LABEL = "Your apps";
export const BLOCKLIST_APPS_LOADING = "Reading your installed apps…";
export const BLOCKLIST_NONE_BLOCKED = "No apps blocked yet. Toggle any app below to guard it.";
export const BLOCKLIST_NO_MATCHES = "No apps match your search.";
// Listing installed apps needs no permission, but be defensive if the query comes back empty.
export const BLOCKLIST_APPS_EMPTY_HINT =
  "Couldn't read your installed apps. If this keeps happening, open the Protect tab and grant Usage access, then come back.";

// --- blocklist: web / iOS (no native blocker) -------------------------------------
export const BLOCKLIST_UNSUPPORTED_TITLE = "App blocking is available on Android";
export const BLOCKLIST_UNSUPPORTED_BODY =
  "On Android, Mr. Productive can block the apps you install on your phone. On the web the desktop blocker stays with the Mr. Productive Chrome extension — you can still keep a list of sites/apps to guard below.";

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
