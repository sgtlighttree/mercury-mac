/**
 * True if the page title announces a ringing incoming call. messenger.com's
 * ring UI is an IN-PAGE dialog (no popup until the call is accepted), but the
 * title switches to "<name> is calling" while it rings (observed 2026-07-12,
 * screenshot in docs/HANDOFF.md notes) — that's the only main-process-visible
 * ring signal, and we already watch the title for the unread badge.
 * The variant patterns mirror the set used by apotenza92/facebook-messenger-desktop
 * (src/shared/incoming-call-evidence.ts), the one other wrapper found doing
 * title-based ring detection — cross-checked via web research 2026-07-12.
 * Post-call titles ("Missed video call", "Call ended", "Ongoing call") must NOT
 * match: none of them contain these ring-only phrasings.
 */
const RING_TITLE_PATTERNS: readonly RegExp[] = [
  /\bis calling\b/i, // "Hugh is calling" — the empirically observed form
  /\bcalling you\b/i,
  /\bincoming (?:audio |video )?call\b/i,
  /\b(?:audio|video) call from\b/i,
  /\bwants to (?:video )?call\b/i,
];

export function isIncomingCallTitle(title: string): boolean {
  return RING_TITLE_PATTERNS.some((p) => p.test(title));
}
