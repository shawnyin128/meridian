import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { FadeText } from './FadeText.js'
import { FoldToggle } from './FoldToggle.js'
import { HeadingCount, headingText } from './HeadingCount.js'
import { InlineMessage } from './InlineMessage.js'
import { ScrollArea } from './ScrollArea.js'
import './PageShell.css'

const classes = (base: string, className: string | undefined) =>
  `${base}${className ? ` ${className}` : ''}`

/** Page-level scrolling and region skeleton; pages only compose the header, body, footer and popovers. */
export const PageShell = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PageShell({ className, ...props }, ref) {
    return <div ref={ref} className={classes('desk', className)} {...props} />
  },
)

/**
 * Fixed-height page identity bar: the back button when the page has one and the title, as children,
 * and `actions`, everything that acts on the whole page, at its right end. Page actions are default-size
 * buttons, the primary one last. `size: 'pane'` heads a pane beside the page, such as the reader's paper
 * chat and rail panels: the same bar on the pane's ground, its title a step smaller.
 */
export const PageHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  actions?: ReactNode
  size?: 'page' | 'pane'
}>(
  function PageHeader({ className, children, actions, size = 'page', ...props }, ref) {
    return (
      <div ref={ref} className={classes(size === 'pane' ? 'desk-head desk-head--pane' : 'desk-head', className)} {...props}>
        {children}
        {actions === undefined ? null : <div className="page-actions">{actions}</div>}
      </div>
    )
  },
)

/** A line of state among a page or pane head's actions, such as when the page last refreshed. */
export function PageNote({ children }: { children: ReactNode }) {
  return <span className="page-note">{children}</span>
}

/**
 * The one place for switching between peer views of the page, with the filters that go with them, at the body's start.
 * `align: 'center'` centres them over the stream of entries the toolbar heads, whose own gap spaces it.
 */
export const PageToolbar = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'center' }>(
  function PageToolbar({ className, align = 'start', ...props }, ref) {
    return <div ref={ref} className={classes(align === 'center' ? 'page-toolbar page-toolbar--center' : 'page-toolbar', className)} {...props} />
  },
)

/**
 * The page's title on one line: when it does not fit it fades out at its end and the tooltip shows it
 * whole. `label` is that whole text, for a title that is not a plain string. `count` follows the title
 * as ` · N`.
 */
export function PageTitle({ children, label, count, className, ...props }: {
  children: ReactNode
  label?: string | undefined
  count?: number | undefined
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>) {
  const whole = label ?? (typeof children === 'string' ? children : undefined)
  return (
    <FadeText className={classes('t', className)} label={whole === undefined ? undefined : headingText(whole, count)} {...props}>
      {children}<HeadingCount count={count} />
    </FadeText>
  )
}

/**
 * The only main scrolling area of the page; its top and bottom fade while content is hidden past them.
 * Its content keeps to the page's column: `column: 'page'` for list screens, `prose` for pages that are
 * read, such as a Wiki page or a project. A `fill` body does not scroll: its content takes its height
 * and scrolls inside, as a table does.
 */
export const PageBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  column?: 'page' | 'prose'
  fill?: boolean
}>(
  function PageBody({ className, column = 'page', fill = false, ...props }, ref) {
    const own = `desk-body${column === 'prose' ? ' desk-body--prose' : ''}`
    if (fill) return <div ref={ref} className={classes(`${own} desk-body--fill`, className)} {...props} />
    return <ScrollArea axis="y" fill gutter paint ref={ref} className={classes(own, className)} {...props} />
  },
)

/** The footer always shown at the bottom of the page; `bare` suits pagination and light hints. */
export const PageFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { bare?: boolean }>(
  function PageFooter({ bare = false, className, ...props }, ref) {
    const own = bare ? 'desk-foot bare' : 'desk-foot'
    return <div ref={ref} className={classes(own, className)} {...props} />
  },
)

/**
 * Unified landing point for IPC/loading errors: the error box of InlineMessage. `page` sits in the page
 * gutter; `section` sits flush inside a content section, above what failed to load.
 */
export function PageError({ error, variant = 'page' }: {
  error: string | null | undefined
  variant?: 'page' | 'section'
}) {
  return error
    ? <InlineMessage tone="error" variant="box" className={`page-error page-error--${variant}`}>{error}</InlineMessage>
    : null
}

/**
 * The one heading of a section or a group, below the page title. `level` is its level: `section`
 * heads a section of a page's body, and `group` heads anything one step below: a group of items, a
 * card, or a section of a side rail or a detail panel. Each level has one type, one height and one
 * space above and below. `count` follows the title as ` · N`. `meta` follows the title on its line
 * in the meta type, such as when a card's subject was last checked. With `fold`, the title is the
 * fold toggle of the content whose id is `fold.controls`, its caret after the title. `actions` holds
 * everything that acts on the section, never toggles it, and sits at the heading's end without
 * making the heading taller.
 */
export const SectionHeading = forwardRef<HTMLDivElement, {
  children: ReactNode
  actions?: ReactNode
  count?: number | undefined
  meta?: ReactNode
  fold?: { open: boolean; onToggle: () => void; controls?: string } | undefined
  level?: 'section' | 'group'
} & HTMLAttributes<HTMLDivElement>>(
  function SectionHeading({ children, actions, count, meta, fold, className, level = 'section', ...rest }, ref) {
    // The heading is a flex row, so a count and a meta share the title's span instead of becoming items of their own.
    const title = count === undefined && meta === undefined ? children : (
      <span>
        {children}<HeadingCount count={count} />
        {meta === undefined ? null : <span className="section-heading-meta">{meta}</span>}
      </span>
    )
    return (
      <div ref={ref} className={classes(`section-heading section-heading--${level}`, className)} {...rest}>
        {fold === undefined ? title : (
          <FoldToggle open={fold.open} onToggle={fold.onToggle} {...(fold.controls === undefined ? {} : { controls: fold.controls })}>
            {title}
          </FoldToggle>
        )}
        {actions === undefined ? null : <div className="section-heading-actions">{actions}</div>}
      </div>
    )
  },
)

/**
 * The page that stands in when a screen cannot be shown: what broke, and the one way forward.
 * Both a library that will not open and a screen that threw while rendering land here, so the two
 * failures read the same. `action` is the single recovery control.
 */
export function PageFailure({ title, error, action, className }: {
  title: ReactNode
  error: string | null | undefined
  action: ReactNode
  className?: string
}) {
  return (
    <PageShell className={classes('page-failure', className)}>
      <PageHeader><PageTitle>{title}</PageTitle></PageHeader>
      <PageBody>
        <PageError error={error} />
        {action}
      </PageBody>
    </PageShell>
  )
}
