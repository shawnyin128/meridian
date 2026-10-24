import { READ_PAPER, READING_PAPER } from '../../shared/vocabulary.js'
import { FadeText } from './FadeText.js'
import { StatusDot } from './StatusDot.js'
import './ReadDots.css'

/** The fill of each dot for `states`: `READ_PAPER` full, `READING_PAPER` half, any other state a ring, in that order. */
export function readDotFills(states: readonly string[]): ('full' | 'half' | 'ring')[] {
  const fill = (state: string) => (state === READ_PAPER ? 'full' : state === READING_PAPER ? 'half' : 'ring')
  const rank = { full: 0, half: 1, ring: 2 }
  return states.map(fill).sort((left, right) => rank[left] - rank[right])
}

/**
 * One neutral dot per reading state in `states`, ordered as `readDotFills` orders them, on one line that
 * fades out at its end when it is wider than its box. `label` is the line's accessible name; the line
 * shows no text.
 */
export function ReadDots({ states, label }: { states: readonly string[]; label: string }) {
  return (
    <FadeText className="read-dots" role="img" aria-label={label}>
      {readDotFills(states).map((fill, index) => <StatusDot key={index} tone="neutral" fill={fill} />)}
    </FadeText>
  )
}
