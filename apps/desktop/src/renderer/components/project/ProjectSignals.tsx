import { AGENT_PREFIX } from '../../../shared/project-signals.js'
import type { ProjectDecisionItem } from '../../../shared/project-signals.js'
import { DateChip } from '../DateTimeDisplay.js'
import { StructuredRow } from '../StructuredList.js'
import './ProjectSignals.css'

/** Stable type column shared by project and overview decision rows. */
export function ProjectSignalKind({ tone, children }: {
  tone: ProjectDecisionItem['tone']
  children: string
}) {
  return (
    <span className="project-signal-kind">
      <span className={`ak ${tone}`}>{children}</span>
    </span>
  )
}

/** Stable date column shared by project and overview decision rows. */
export function ProjectSignalDate({ date }: { date: string | undefined }) {
  return (
    <span className="project-signal-date">
      {date === undefined ? null : <DateChip date={date} />}
    </span>
  )
}

export function EventText({ text }: { text: string }) {
  return text.startsWith(AGENT_PREFIX)
    ? <><span className="agtag">agent</span>{text.slice(AGENT_PREFIX.length)}</>
    : <>{text}</>
}

/** One research event row with a stable text column and trailing date metadata. */
export function ProjectEventRow({ text, date, dateLabel }: {
  text: string
  date: string
  dateLabel: string
}) {
  return (
    <StructuredRow className="tlrow project-event-row">
      <span className="project-event-text"><EventText text={text} /></span>
      <time className="tm project-event-date" dateTime={date}>{dateLabel}</time>
    </StructuredRow>
  )
}
