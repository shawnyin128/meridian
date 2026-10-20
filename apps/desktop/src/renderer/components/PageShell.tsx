import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
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
 * buttons, the primary one last.
 */
export const PageHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { actions?: ReactNode }>(
  function PageHeader({ className, children, actions, ...props }, ref) {
    return (
      <div ref={ref} className={classes('desk-head', className)} {...props}>
        {children}
        {actions === undefined ? null : <div className="page-actions">{actions}</div>}
      </div>
    )
  },
)

/** The one place for switching between peer views of the page, with the filters that go with them, at the body's start. */
export const PageToolbar = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PageToolbar({ className, ...props }, ref) {
    return <div ref={ref} className={classes('page-toolbar', className)} {...props} />
  },
)

export function PageTitle({ children, className, ...props }: {
  children: ReactNode
} & HTMLAttributes<HTMLSpanElement>) {
  return <span className={classes('t', className)} {...props}>{children}</span>
}

/** The only main scrolling area of the page. */
export const PageBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PageBody({ className, ...props }, ref) {
    return <div ref={ref} className={classes('desk-body', className)} {...props} />
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
 * Unified landing point for IPC/loading errors. `page` sits in the page gutter; `section` sits flush
 * inside a content section, above what failed to load.
 */
export function PageError({ error, variant = 'page' }: {
  error: string | null | undefined
  variant?: 'page' | 'section'
}) {
  return error ? <div className={`ipcerror ipcerror--${variant}`} role="alert">{error}</div> : null
}

/**
 * The one section heading in the app. `variant` is its role: `page` heads a section of a page's body,
 * `group` heads a group inside a section or a card, and `rail` heads a section of a side rail or a
 * detail panel. `actions` holds everything that acts on the section and sits at the heading's end.
 */
export const SectionHeading = forwardRef<HTMLDivElement, {
  children: ReactNode
  actions?: ReactNode
  variant?: 'page' | 'group' | 'rail'
} & HTMLAttributes<HTMLDivElement>>(
  function SectionHeading({ children, actions, className, variant = 'page', ...rest }, ref) {
    return (
      <div ref={ref} className={classes(`section-heading section-heading--${variant}`, className)} {...rest}>
        {children}
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
