import * as RadixToggleGroup from '@radix-ui/react-toggle-group'
import * as RadixToolbar from '@radix-ui/react-toolbar'
import { createContext, forwardRef, useContext } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactElement, ReactNode, Ref } from 'react'

type Orientation = 'horizontal' | 'vertical'

/** The orientation of the toolbar a control renders in, or null outside one. */
const InToolbar = createContext<Orientation | null>(null)

/**
 * A group of controls that is one Tab stop: Tab enters it at the control focused in it last, at its
 * first control the first time; the arrow keys of its `orientation` move between its controls, and
 * Home and End go to its ends. `children` is the one element that is the group; it must take a ref
 * and spread its props, as a DOM element does. Its controls join it through `useToolbarItem`, which
 * IconButton, AddAction, ChoicePicker and NavRow use, and `ToggleGroup`. A toolbar inside a toolbar
 * of the same orientation is no group of its own: it renders `children` as they are, and its
 * controls join the outer one. `label` names the group.
 */
export const Toolbar = forwardRef<HTMLElement, {
  label?: string
  orientation?: Orientation
  children: ReactElement
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'dir'>>(function Toolbar(
  { label, orientation = 'horizontal', children, ...props }, ref,
) {
  const outer = useContext(InToolbar)
  if (outer === orientation) return children
  return (
    <InToolbar.Provider value={orientation}>
      <RadixToolbar.Root
        asChild orientation={orientation} aria-label={label}
        {...props as Omit<HTMLAttributes<HTMLDivElement>, 'dir'>} ref={ref as Ref<HTMLDivElement>}
      >{children}</RadixToolbar.Root>
    </InToolbar.Provider>
  )
})

/**
 * What a menu, popover or dialog shows: it floats out of the toolbar it was opened from, so its
 * controls are not that toolbar's controls. Each floating layer wraps its content in it.
 */
export function OutsideToolbar({ children }: { children: ReactNode }) {
  return <InToolbar.Provider value={null}>{children}</InToolbar.Provider>
}

/**
 * Returns a function that makes one focusable element a control of the toolbar this component
 * renders in, and leaves it as it is outside a toolbar. The element must take a ref and spread its
 * props, as a DOM element does; a disabled one is skipped by the arrow keys.
 */
export function useToolbarItem(): (element: ReactElement<ButtonHTMLAttributes<HTMLElement>>) => ReactElement {
  const inside = useContext(InToolbar) !== null
  return (element) => (inside
    ? <RadixToolbar.Button asChild disabled={element.props.disabled}>{element}</RadixToolbar.Button>
    : element)
}

/** A plain button that is one of the controls of the toolbar it renders in, and a button as any outside one. */
export const ToolbarButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function ToolbarButton({ type = 'button', ...props }, ref) {
    return useToolbarItem()(<button {...props} ref={ref} type={type} />)
  },
)

/**
 * A row of toggles that picks one `value` (`''` for none) and reports the picked one, or `''` when
 * the picked toggle is pressed again. On its own it is one Tab stop with the arrow keys inside, the
 * picked toggle taking focus first; inside a toolbar its toggles join the toolbar's controls.
 * `label` names it; with `asChild`, the one element in `children` is the group.
 */
export function ToggleGroup({ label, value, onValueChange, disabled = false, asChild = false, className, children }: {
  label: string
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  asChild?: boolean
  className?: string
  children: ReactNode
}) {
  const props = { type: 'single' as const, 'aria-label': label, value, onValueChange, disabled, asChild, className, children }
  return useContext(InToolbar) === null ? <RadixToggleGroup.Root {...props} /> : <RadixToolbar.ToggleGroup {...props} />
}

/** One toggle of a `ToggleGroup`, standing for `value`; with `asChild`, the one element in `children` is the toggle. */
export const ToggleItem = forwardRef<HTMLButtonElement, { value: string; asChild?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>(
  function ToggleItem(props, ref) {
    return useContext(InToolbar) === null
      ? <RadixToggleGroup.Item {...props} ref={ref} />
      : <RadixToolbar.ToggleItem {...props} ref={ref} />
  },
)
