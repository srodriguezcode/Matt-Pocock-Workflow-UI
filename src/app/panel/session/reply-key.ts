/** What Enter in the reply box does: `type` leaves the key to the textarea. */
export type ReplyKey = 'send' | 'newline' | 'hold' | 'type';

type KeyPress = Pick<KeyboardEvent, 'key' | 'altKey' | 'shiftKey' | 'isComposing'>;

/** Enter sends and Option or Shift adds a new line, so a reply sends like in a chat tool. */
export function replyKey(event: KeyPress, ready: boolean): ReplyKey {
  if (event.key !== 'Enter' || event.isComposing || event.shiftKey) return 'type';
  if (event.altKey) return 'newline';
  return ready ? 'send' : 'hold';
}
