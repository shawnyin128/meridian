import { Fragment } from 'react'
import { FadeText } from './FadeText.js'
import { Tooltip } from './Tooltip.js'
import './Breadcrumb.css'

/** A breadcrumb segment. One with `onClick` that is not last is a link back. */
export type CrumbSeg = { text: string; onClick?: () => void }

/**
 * The trail that tells where the user is: `trail`'s segments with a separator between them. Every
 * segment before the last that has `onClick` is a link back, a button whose tooltip shows it whole when
 * it does not fit; the last one is where the user is and never a link. A segment that does not fit fades
 * out at its end. An empty trail draws nothing.
 */
export function Breadcrumb({ trail, id }: { trail: readonly CrumbSeg[]; id?: string }) {
  return (
    <div className="crumb" id={id}>
      {trail.map((segment, at) => (
        <Fragment key={`${at}${segment.text}`}>
          {at > 0 ? <span className="csep">›</span> : null}
          {segment.onClick !== undefined && at < trail.length - 1
            ? (
              <Tooltip label={segment.text} whenClipped>
                <button type="button" className="cseg link" onClick={segment.onClick}><FadeText>{segment.text}</FadeText></button>
              </Tooltip>
            )
            // A segment that is not a link drags the window, which takes its pointer, so it has no tooltip.
            : <FadeText className="cseg">{segment.text}</FadeText>}
        </Fragment>
      ))}
    </div>
  )
}
