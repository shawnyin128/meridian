import {
  forwardRef,
  useCallback,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { FadeText } from './FadeText.js'
import { HeadingCount, headingText } from './HeadingCount.js'
import { InlineMessage } from './InlineMessage.js'
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

/** The only main scrolling area of the page; its top and bottom fade while content is hidden past them. */
export const PageBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PageBody({ className, ...props }, ref) {
    const fade = useScrollFade('y')
    const attach = useCallback((node: HTMLDivElement | null) => {
      fade(node)
      if (typeof ref === 'function') ref(node)
      else if (ref !== null) ref.current = node
    }, [fade, ref])
    return <div ref={attach} className={classes('desk-body', className)} data-fade-paint="" {...props} />
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
 * The one section heading in the app. `variant` is its role: `page` heads a section of a page's body,
 * `group` heads a group inside a section or a card, and `rail` heads a section of a side rail or a
 * detail panel. `count` follows the title as ` · N`. `actions` holds everything that acts on the
 * section and sits at the heading's end.
 */
export const SectionHeading = forwardRef<HTMLDivElement, {
  children: ReactNode
  actions?: ReactNode
  count?: number | undefined
  variant?: 'page' | 'group' | 'rail'
} & HTMLAttributes<HTMLDivElement>>(
  function SectionHeading({ children, actions, count, className, variant = 'page', ...rest }, ref) {
    return (
      <div ref={ref} className={classes(`section-heading section-heading--${variant}`, className)} {...rest}>
        {/* The heading is a flex row, so a count shares the title's span instead of becoming an item of its own. */}
        {count === undefined ? children : <span>{children}<HeadingCount count={count} /></span>}
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
