import type { ReactElement, ReactNode, Ref } from 'react'
import { EmptyState } from './EmptyState.js'
import { PageError, SectionHeading } from './PageShell.js'
import { SegmentedControl, type SegmentedControlOption } from './SegmentedControl.js'

/** One tab: its switch segment and what it shows; while `content` is null the tab shows the section empty state. */
export type TabbedSectionTab<Value extends string> = SegmentedControlOption<Value> & { content: ReactNode }

/**
 * The one section whose content switches between peer tabs: the heading, its switch first in the
 * actions slot and then `actions`, and under it the panel of the picked tab. A tab whose content is
 * null shows the section empty state; that state and every row of the list a tab shows are one list
 * row high, so a tab with one row and an empty tab are the same height.
 * `error` shows above whichever tab is picked. Throws when `value` names no tab.
 */
export function TabbedSection<Value extends string>({
  heading, label, value, tabs, onChange, onReselect, actions, level = 'section', error, panelClassName, headingRef, panelRef,
}: {
  heading: ReactNode
  /** The switch's accessible name. */
  label: string
  value: Value
  tabs: readonly TabbedSectionTab<Value>[]
  onChange: (value: Value) => void
  /** Called when the picked tab is picked again. */
  onReselect?: (() => void) | undefined
  actions?: ReactNode
  level?: 'section' | 'group'
  error?: string | null | undefined
  panelClassName?: string
  headingRef?: Ref<HTMLDivElement>
  panelRef?: Ref<HTMLDivElement>
}): ReactElement {
  const picked = tabs.find((tab) => tab.value === value)
  if (picked === undefined) throw new Error(`TabbedSection has no tab ${value}`)
  return (
    <>
      <SectionHeading
        ref={headingRef} level={level}
        actions={(
          <>
            <SegmentedControl size="sm" label={label} value={value} options={tabs} onChange={onChange} onReselect={onReselect} />
            {actions}
          </>
        )}
      >{heading}
      </SectionHeading>
      <div ref={panelRef} className={`tabbed-section-panel${panelClassName === undefined ? '' : ` ${panelClassName}`}`}>
        <PageError error={error} variant="section" />
        {picked.content ?? <EmptyState variant="section" />}
      </div>
    </>
  )
}
