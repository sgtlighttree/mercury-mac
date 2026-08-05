/** Composite key for the live-notification map: sender + page-assigned id.
 *  The page's id counter resets on reload, so id alone could collide. */
export function notificationKey(senderId: number, id: number): string {
  return `${senderId}:${id}`;
}
