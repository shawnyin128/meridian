import type { Rectangle } from 'electron'

/** The window as it was when it last closed: its normal (not maximized) bounds, and whether it was maximized. */
export type WindowState = Rectangle & { maximized: boolean }

/** The size the window opens at when nothing was saved or the saved size is unreadable. */
export const DEFAULT_WINDOW = { width: 1440, height: 900 }

/** The least of the window's title bar, in px, that must lie on a display for a saved position to be kept. */
const VISIBLE_GRIP = 100

const isLength = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * The window state stored in `text`, or null when it is not one: the JSON of an object with numeric
 * `x`, `y`, a positive `width` and `height`, and a boolean `maximized`. Other keys are ignored.
 */
export function readWindowState(text: string): WindowState | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { x, y, width, height, maximized } = value as Record<string, unknown>
  if (!isLength(x) || !isLength(y) || !isLength(width) || !isLength(height) || width <= 0 || height <= 0) return null
  if (typeof maximized !== 'boolean') return null
  return { x, y, width, height, maximized }
}

/**
 * The bounds to open the window at from `saved` on displays whose work areas are `areas`: the saved
 * size, no larger than the largest work area, at the saved position when the first 100px of its title
 * bar lie on one of them, otherwise with no position, which centres it. Without a saved state, the
 * default size with no position.
 */
export function placeWindow(saved: WindowState | null, areas: readonly Rectangle[]): Partial<Rectangle> & { width: number; height: number } {
  if (saved === null) return { ...DEFAULT_WINDOW }
  const width = Math.min(saved.width, Math.max(...areas.map((area) => area.width)))
  const height = Math.min(saved.height, Math.max(...areas.map((area) => area.height)))
  const grip = { x: saved.x, y: saved.y, width: Math.min(width, VISIBLE_GRIP), height: 1 }
  const shown = areas.some((area) => grip.x >= area.x && grip.x + grip.width <= area.x + area.width
    && grip.y >= area.y && grip.y < area.y + area.height)
  return shown ? { x: saved.x, y: saved.y, width, height } : { width, height }
}
