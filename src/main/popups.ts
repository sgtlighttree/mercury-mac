import { isHttpUrl } from "./links";

/**
 * Popup lifecycle policy, kept pure so it can be unit-tested without Electron.
 * index.ts maps these decisions onto real BrowserWindows.
 *
 * Background: every allowed popup is created HIDDEN (see decideWindowOpen in links.ts) and is
 * revealed only once it commits a real http(s) navigation. A popup that never commits one has
 * nothing to show — revealing it produces the blank white window Matt reported.
 */

/**
 * True when a popup has no real page committed — its URL is still the `about:blank` (or empty)
 * placeholder it was opened with. Such a window can only ever render blank.
 */
export function isUncommittedPopup(currentUrl: string): boolean {
  return !isHttpUrl(currentUrl);
}

export type PopupFallback = "reveal" | "destroy" | "wait";

export interface PopupFallbackState {
  /** webContents.getURL() — "" or "about:blank" until a real navigation commits. */
  currentUrl: string;
  /** webContents.isLoading() — a navigation is still in flight. */
  isLoading: boolean;
  /** Milliseconds elapsed since the popup was created. */
  waitedMs: number;
  /** Past this, stop waiting on a loading popup and reclaim it. */
  maxWaitMs: number;
}

/**
 * Decide what to do with a popup that is still hidden when the reveal fallback fires.
 *
 * - Committed a real page but was never revealed → `reveal` (never leak a usable window hidden).
 * - Nothing committed, but a navigation is still in flight → `wait`. THIS IS THE CALLS GATE:
 *   a voice/video call popup opens as `about:blank` and commits its `messenger.com/groupcall/…`
 *   URL afterwards, so on a slow network it is indistinguishable from a dead popup by URL alone.
 *   `isLoading` is what separates them — never destroy a popup that is still loading.
 * - Nothing committed and nothing in flight → `destroy`. This is the orphan left behind when
 *   `will-navigate` hands the popup's only navigation to the system browser.
 * - Still loading past `maxWaitMs` → `destroy`, so a wedged popup cannot leak forever.
 */
export function decidePopupFallback(state: PopupFallbackState): PopupFallback {
  if (!isUncommittedPopup(state.currentUrl)) return "reveal";
  if (state.isLoading && state.waitedMs < state.maxWaitMs) return "wait";
  return "destroy";
}

export interface ExternalNavigationState {
  /** The window owning the navigating webContents is the app's main window. */
  isMainWindow: boolean;
  /** This popup has been SHOWN to the user (see the settle delay in index.ts watchPopup). */
  hasBeenRevealed: boolean;
}

/**
 * Should a popup be destroyed when a navigation it initiated is handed to the system browser?
 *
 * THE INVARIANT: **never destroy a window the user has actually seen.** Everything else follows.
 *
 * A link-shim popup ("leaving Messenger" redirectors, `…/l.php?u=<target>` and friends) commits a
 * page whose only job is to bounce elsewhere. Because index.ts waits a settle delay before
 * revealing a freshly committed popup, a redirector externalizes while still UNREVEALED — so it is
 * destroyed without ever having been shown, and no blank window appears at any point.
 *
 * A real window — the voice/video call popup above all — survives the settle delay, gets revealed,
 * and from then on is permanently exempt. If its user later clicks an external link, the link goes
 * to the browser and the window stays. That is what `call-external` in
 * tests/harness/popup-lifecycle.js pins, and it is why this is a reveal-state rule rather than a
 * "did it navigate quickly" timing heuristic: timing would have to guess how fast a human clicks.
 *
 * Note this SUBSUMES the earlier "uncommitted popups only" rule — a popup with nothing committed
 * has by definition never been revealed.
 */
export function shouldReclaimOnExternalNavigation(state: ExternalNavigationState): boolean {
  if (state.isMainWindow) return false;
  return !state.hasBeenRevealed;
}
