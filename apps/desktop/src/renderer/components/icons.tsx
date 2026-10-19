import type { ReactNode } from 'react'
import './icons.css'

/** Icons shared in many places, copied one by one from e2e/fixtures/platform-shell-demo.html. */

/** The check mark of a selected menu row, the same as the demo's ICON_CK. */
export const IconCheck = () => (
  <svg
    className="cki" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

export const IconRead = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /><path d="M9 13h7M9 17h5" />
  </svg>
)

export const IconDownload = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" />
  </svg>
)

export const IconLater = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M3 9h18v11H3z" /><path d="M3 9l2-5h14l2 5" /><path d="M12 12v5M9.5 14.5L12 17l2.5-2.5" />
  </svg>
)

/** Column type option when adding a column: text. */
export const IconText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 6h14M12 6v13" />
  </svg>
)

/** Column type option when adding a column: select (single choice). */
export const IconSelect = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" /><path d="M8 11l3 3 5-5" />
  </svg>
)

/** Column type option when adding a column: multi-select. */
export const IconMulti = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M3 7l2 2 3-3M3 16l2 2 3-3M12 8h9M12 17h9" />
  </svg>
)

/** The app's one gear: a view's or section's settings, such as shown columns, grouping, subscriptions. */
// Drawn on a 16-unit viewBox, unlike this file's 24-unit icons; changing it means recomputing the path.
export const IconGear = () => (
  <svg
    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M14.52 6.97L14.52 9.03L12.35 9.16L11.9 10.25L13.34 11.88L11.88 13.34L10.25 11.9L9.16 12.35L9.03 14.52L6.97 14.52L6.84 12.35L5.75 11.9L4.12 13.34L2.66 11.88L4.1 10.25L3.65 9.16L1.48 9.03L1.48 6.97L3.65 6.84L4.1 5.75L2.66 4.12L4.12 2.66L5.75 4.1L6.84 3.65L6.97 1.48L9.03 1.48L9.16 3.65L10.25 4.1L11.88 2.66L13.34 4.12L11.9 5.75L12.35 6.84Z" />
    <circle cx="8" cy="8" r="1.9" />
  </svg>
)

/** The chevron of a fold toggle, such as the one that expands a column's options in its row. */
export const IconChevron = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/** Steps to the previous month or period. */
export const IconPrevious = () => <Icon sw={2.2}><path d="M15 18l-6-6 6-6" /></Icon>

/** Steps to the next month or period. */
export const IconNext = () => <Icon sw={2.2}><path d="M9 18l6-6-6-6" /></Icon>

/** The rename pencil at the end of a row, the same as in the demo's column menu. */
export const IconPencil = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </svg>
)

/** The paper table's column reorder handle; drags start only here, so the header leaves no drag ghost. */
export const IconGrip = () => (
  <svg viewBox="0 0 12 16" fill="currentColor" stroke="none">
    <circle cx="3" cy="3" r="1" /><circle cx="9" cy="3" r="1" />
    <circle cx="3" cy="8" r="1" /><circle cx="9" cy="8" r="1" />
    <circle cx="3" cy="13" r="1" /><circle cx="9" cy="13" r="1" />
  </svg>
)

/** Shared shell for many icons: a 24-unit viewBox, stroked in currentColor. */
export const Icon = ({ sw = 1.8, children }: { sw?: number; children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round"
  >{children}</svg>
)

/** Directory selection action used by every path picker. */
export const IconFolder = () => (
  <Icon sw={1.7}>
    <path d="M3 6h6l2 2h10v10H3z" />
  </Icon>
)

/** Discovery's North Star: four long arms fill the viewBox; small bevels keep it a star at sidebar size. */
export const IconNorthStar = () => (
  <Icon sw={2}>
    <path d="M12 2l2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1L12 2z" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
)

/** The plus sign's path, shared by the bare IconPlus and anything drawing it in the generic Icon shell. */
export const PLUS_PATH = 'M12 5v14M5 12h14'

/** Zooms out, in the reader and on the project graph. */
export const IconMinus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M5 12h14" />
  </svg>
)

/** The in-place add +: table header end, tag cell end, a picker's "Create" row, and the zoom in. */
export const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d={PLUS_PATH} />
  </svg>
)

/**
 * The ×: closes a panel or takes something out of a place without deleting it, such as a link or a
 * paper in the read-later queue. `sw` is the stroke width.
 */
export const IconCross = ({ sw = 2 }: { sw?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

/** The three dots of an inline … menu. */
export const IconDots = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
  </svg>
)

/** An open eye: "already known", the discovery feedback that hides a paper the reader has seen. */
export const IconSeen = () => (
  <Icon sw={2}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
  </Icon>
)

/** Small trash can for every action that moves something to the trash or deletes it. */
export const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14M10 11v6M14 11v6" />
  </svg>
)

/**
 * Download progress shown inside an icon-sized action. Without a known total it turns instead,
 * which makes it the app's one sign that a job is running.
 */
export const DownloadRing = ({ progress }: {
  progress: { received: number; total: number | null } | null
}) => {
  const ratio = progress !== null && progress.total !== null && progress.total > 0
    ? Math.min(progress.received / progress.total, 1)
    : null
  return (
    <svg className={ratio === null ? 'ring spin' : 'ring'} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--sep)" strokeWidth="2.4" />
      <circle
        className="arc" cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeDasharray="56.5" strokeDashoffset={56.5 * (1 - (ratio ?? 0.25))}
        transform="rotate(-90 12 12)"
      />
    </svg>
  )
}

/** The one running indicator: the ring that turns while a job runs, in the colour of the text around it. */
export const RunningRing = () => <DownloadRing progress={null} />
