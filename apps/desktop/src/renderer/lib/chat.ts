/** The default chat session id shared by the feed's conflict entries and the global chat. */
export const CONFLICT_THREAD = 'conflict'

/**
 * Whether a keydown in a chat composer sends the message: Enter without Shift. Shift+Enter breaks the
 * line, and an Enter that confirms an input method's composition belongs to the input method.
 */
export function sendsMessage(key: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing'>): boolean {
  return key.key === 'Enter' && !key.shiftKey && !key.isComposing
}
