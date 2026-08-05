export const TARGET_URL = "https://www.messenger.com";

// Hosts kept INSIDE the app (login, 2FA, chat, media CDN). Everything else opens in the browser.
export const ALLOWED_HOSTS = [
  "messenger.com",
  "facebook.com",
  "fbcdn.net",
  "fbsbx.com",
];

// Hosts allowlisted above for IN-PLACE navigation, but never allowed to open as an in-app
// POPUP. facebook.com must stay in ALLOWED_HOSTS so login/2FA/checkpoint redirects can drive
// the main window (verified in docs/MANUAL-TESTS.md §2) — those navigate in place. Facebook
// *content* links behave differently: they arrive as window-open requests already carrying a
// real facebook.com URL (observed 2026-07-27: `https://www.facebook.com/share/r/<id>/`), and
// the app has no facebook.com session — login cookies are scoped to messenger.com — so the
// popup renders a sign-in prompt instead of the post. Hand those to the system browser, where
// the user is already signed in.
//
// NOT affected: voice/video call popups and 1:1 download popups open as `about:blank` (handled
// earlier in decideWindowOpen); group-chat download popups use fbcdn.net/fbsbx.com URLs, which
// are not facebook.com.
export const POPUP_EXTERNAL_HOSTS = ["facebook.com"];
