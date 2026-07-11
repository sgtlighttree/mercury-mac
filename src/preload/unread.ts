/** Extract the unread count from the page title, e.g. "(3) Messenger" → 3, "(12+) Messenger" → 12. */
export function parseUnreadCount(title: string): number {
  const match = title.match(/^\((\d+)\+?\)/);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : 0;
}
