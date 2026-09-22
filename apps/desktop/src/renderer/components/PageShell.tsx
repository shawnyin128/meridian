import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import './PageShell.css'

const classes = (base: string, className: string | undefined) =>
  `${base}${className ? ` ${className}` : ''}`

/** Page-level scrolling and regional skeleton; business pages only combine header, body text, footer and floating layer. */
export const PageShell = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PageShell({ className, ...props }, ref) {
    return <div ref={ref} className={classes('desk', className)} {...props} />
  },
)

/** Fixed-height page identity bar. Page actions belong in `PageToolbar`, not beside the title. */
export const PageHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PageHeader({ className, ...props }, ref) {
    return <div ref={ref} className={classes('desk-head', className)} {...props} />
  },
)

/** Shared in-content row for page actions and peer-view switches. */
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

/** Permanent in the bottom area; bare suitable for paging and lightweight prompts. */
export const PageFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { bare?: boolean }>(
  function PageFooter({ bare = false, className, ...props }, ref) {
    const own = bare ? 'desk-foot bare' : 'desk-foot'
    return <div ref={ref} className={classes(own, className)} {...props} />
  },
)

/** Unified page-level landing point for IPC/loading errors. */
export function PageError({ error }: { error: string | null | undefined }) {
  return error ? <div className="ipcerror" role="alert">{error}</div> : null
}

/** The one section heading in the app. `variant` picks the weight; `actions` is the only right-hand slot. */
export const SectionHeading = forwardRef<HTMLDivElement, {
  children: ReactNode
  actions?: ReactNode
  variant?: 'page' | 'content' | 'group' | 'rail'
} & HTMLAttributes<HTMLDivElement>>(
  function SectionHeading({ children, actions, className, variant = 'page', ...rest }, ref) {
    const own = `section-heading section-heading--${variant}${actions === undefined ? '' : ' flexh'}`
    return (
      <div ref={ref} className={classes(own, className)} {...rest}>
        {children}
        {actions}
      </div>
    )
  },
)

/**
 * The page that stands in when a screen cannot be shown: what broke, and the one way forward.
 * Both a library that will not open and a screen that threw while rendering land here, so the two
 * failures read the same. `action` is the single recovery control.
 */
export function PageFailure({ title, error, note, action, className }: {
  title: ReactNode
  error: string | null | undefined
  note: ReactNode
  action: ReactNode
  className?: string
}) {
  return (
    <PageShell className={classes('page-failure', className)}>
      <PageHeader><PageTitle>{title}</PageTitle></PageHeader>
      <PageBody>
        <PageError error={error} />
        <p className="page-failure-note">{note}</p>
        {action}
      </PageBody>
    </PageShell>
  )
}
