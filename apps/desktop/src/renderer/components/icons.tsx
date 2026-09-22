import type { ReactNode } from 'react'

/** Icons shared in many places are copied from desktop/design/platform-shell-demo.html one by one. */

/** The selected check mark in the menu row is the same as the ICON_CK in the demo. */
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

/** The file level of the new column: text column. */
export const IconText = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 6h14M12 6v13" />
  </svg>
)

/** New column level: select column (single selection). */
export const IconSelect = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" /><path d="M8 11l3 3 5-5" />
  </svg>
)

/** New column level: multi-select column. */
export const IconMulti = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M3 7l2 2 3-3M3 16l2 2 3-3M12 8h9M12 17h9" />
  </svg>
)

/** The only gear in the entire application: the settings of a view or section—which columns to display, what groups to group by, and what follows to subscribe to. */
// This one is calculated based on the 16-frame viewport, which is different from the other 24-frame icons in this file; changing the viewport requires recalculating the entire path.
export const IconGear = () => (
  <svg
    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M14.52 6.97L14.52 9.03L12.35 9.16L11.9 10.25L13.34 11.88L11.88 13.34L10.25 11.9L9.16 12.35L9.03 14.52L6.97 14.52L6.84 12.35L5.75 11.9L4.12 13.34L2.66 11.88L4.1 10.25L3.65 9.16L1.48 9.03L1.48 6.97L3.65 6.84L4.1 5.75L2.66 4.12L4.12 2.66L5.75 4.1L6.84 3.65L6.97 1.48L9.03 1.48L9.16 3.65L10.25 4.1L11.88 2.66L13.34 4.12L11.9 5.75L12.35 6.84Z" />
    <circle cx="8" cy="8" r="1.9" />
  </svg>
)

/** A collapsible button that expands options on a row of columns. */
export const IconChevron = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/** The renaming pen at the end of the line is the same as the one in the demo column menu. */
export const IconPencil = () => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </svg>
)

/** The column sorting handle of the paper header; only start dragging from this small target to prevent the entire column header from generating browser smear. */
export const IconGrip = () => (
  <svg viewBox="0 0 12 16" fill="currentColor" stroke="none">
    <circle cx="3" cy="3" r="1" /><circle cx="9" cy="3" r="1" />
    <circle cx="3" cy="8" r="1" /><circle cx="9" cy="8" r="1" />
    <circle cx="3" cy="13" r="1" /><circle cx="9" cy="13" r="1" />
  </svg>
)

/** Common shell for multiple icons: 24-frame viewport, stroke current color. */
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

/** Discover the entrance to the North Star. The four long axes fill the 24-frame viewport, and the small bevel makes it still look like a compass star at the sidebar size. */
export const IconNorthStar = () => (
  <Icon sw={2}>
    <path d="M12 2l2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1L12 2z" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
)

/** Public path to the plus sign; bare icons and wherever a generic Icon shell is required take shape from here. */
export const PLUS_PATH = 'M12 5v14M5 12h14'

/** The plus sign added in place: + at the end of the table header, + at the end of the label grid, the "New" line in the association layer, and the magnification of the reader. */
export const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d={PLUS_PATH} />
  </svg>
)

/** That fork is closed/removed. `sw` is the stroke thickness: inline action 2, column menu 2.2, chip subscript 2.5. */
export const IconCross = ({ sw = 2 }: { sw?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

/** Inline... Three dots for the menu. */
export const IconDots = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
  </svg>
)

/** Small trash can for delete actions. */
export const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14M10 11v6M14 11v6" />
  </svg>
)

/** Download progress shown inside an icon-sized action. */
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
