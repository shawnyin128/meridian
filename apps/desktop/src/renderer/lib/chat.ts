import { composing } from './keyboard.js'

/** The default chat session id shared by the feed's conflict entries and the global chat. */
export const CONFLICT_THREAD = 'conflict'

/** The draft a chat's rename from its title is kept under, with its chat, so it reopens where it was typed. */
export const CHAT_TITLE_RENAME = 'title-rename'

/**
 * Whether a keydown in a text box that Enter sends, a chat composer or the reader's note box, sends its
 * text: Enter without Shift. Shift+Enter breaks the line, and an Enter that confirms an input method's
 * composition belongs to the input method.
 */
export function sendsMessage(key: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing'>): boolean {
  return key.key === 'Enter' && !key.shiftKey && !composing(key)
}
