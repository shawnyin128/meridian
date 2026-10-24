import { useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, RefObject } from 'react'
import type { PaperColumn } from '../../../shared/contract.js'
import type { KeptText } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionPopover } from '../ActionPopover.js'
import { InlineDraftInput } from '../InlineDraftInput.js'
import { IconMulti, IconSelect, IconText } from '../icons.js'
import { Tooltip } from '../Tooltip.js'

/** Each column type's icon, in type-button order; its name comes from the catalog's `papers.columnType`. */
const TYPES = [
  { type: 'text', Icon: IconText },
  { type: 'select', Icon: IconSelect },
  { type: 'multi', Icon: IconMulti },
] as const satisfies readonly { type: PaperColumn['type']; Icon: () => ReactElement }[]

/**
 * Text / single-choice / multi-choice radio group (`role="radiogroup"`, each button `role="radio"` +
 * `aria-checked`): the `type` option is selected and is the only one in the Tab order. Clicking an
 * option hands it to `onPick`, then moves focus to `focusAfterClick` (if given); the arrow keys move
 * from the `type` option to its neighbour, hand that one to `onPick`, and focus its button. Other
 * keys go to `onKeyDown`. When `buttons` is given, it receives the three buttons in order. Styled as
 * `.ctrow` / `.ctbtn`.
 */
export function ColumnTypePicker({ type, onPick, onKeyDown, buttons, focusAfterClick }: {
  type: PaperColumn['type']
  onPick: (type: PaperColumn['type']) => void
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void
  buttons?: RefObject<(HTMLButtonElement | null)[]>
  focusAfterClick?: RefObject<HTMLElement | null>
}) {
  const m = useMessages()
  // Without `buttons`, collect them here. Indexes match TYPES by position and do not follow the
  // selected option.
  const ownButtons = useRef<(HTMLButtonElement | null)[]>([])
  const refs = buttons ?? ownButtons
  return (
    <div
      className="mi-in ctrow" role="radiogroup" aria-label={m.papers.columnAdd.typeGroupAria}
      onKeyDown={(e) => {
        const i = TYPES.findIndex(({ type: t }) => t === type)
        let next: number
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + TYPES.length) % TYPES.length
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % TYPES.length
        else { onKeyDown?.(e); return }
        e.preventDefault()
        onPick(TYPES[next]!.type)
        refs.current[next]?.focus()
      }}
    >
      {TYPES.map(({ type: t, Icon }, i) => (
        <Tooltip key={t} label={m.papers.columnType[t]}>
          <button
            type="button" ref={(el) => { refs.current[i] = el }}
            className={t === type ? 'ctbtn on' : 'ctbtn'} aria-label={m.papers.columnType[t]}
            role="radio" aria-checked={t === type} tabIndex={t === type ? 0 : -1}
            onClick={() => { onPick(t); focusAfterClick?.current?.focus() }}
          ><Icon /></button>
        </Tooltip>
      ))}
    </div>
  )
}

/** The icon of a column type. */
export function ColumnTypeIcon({ type }: { type: PaperColumn['type'] }) {
  const { Icon } = TYPES.find((t) => t.type === type)!
  return <Icon />
}

/**
 * The draft that opens at the end of the table header: Enter, a press outside `cell` and the type
 * popover, or focus moving outside both hands the trimmed column name, with the type selected at that
 * moment, to `onCreate` once; with no name typed, leaving closes the draft, and Esc always does.
 * `onCreate` returns whether the draft is consumed. `triggers` are entry buttons that do not count as
 * outside when pressed or focused.
 * With `pickType` (passed only by the paper table), three type buttons pop up below the draft,
 * defaulting to "Text"; clicking one selects it while focus stays in the column name input. Without
 * it, as on the Wiki aggregation page, every column is created as text.
 * The type buttons are a radio group (`role="radiogroup"`, each button `role="radio"` +
 * `aria-checked`): Tab in the column name input enters the selected option, and the arrow keys move
 * among the three, selecting as focus moves and keeping focus in the group. A mouse press dragged
 * away before release is no click; it still gives focus to the pressed button, selected or not. The
 * arrow keys then still start from the selected option, and Space / Enter only return focus to the
 * column name input instead of selecting, since which button has focus is not even visible then.
 * Shift+Tab in the group also returns to the column name input, and Esc in the group cancels
 * outright, as it does in the input.
 */
export function NewColumnHead({ cell, triggers, onCreate, onCancel, pickType, kept }: {
  cell: RefObject<HTMLTableCellElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  onCreate: (label: string, type: PaperColumn['type']) => boolean | Promise<boolean>
  onCancel: () => void
  pickType?: boolean
  /** Keeps the name being typed as a draft there; see `InlineDraftInput`. */
  kept?: KeptText | undefined
}) {
  const m = useMessages()
  const input = useRef<HTMLInputElement>(null)
  // The three type buttons; indexes match TYPES by position and do not follow the selected option.
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [type, setType] = useState<PaperColumn['type']>('text')
  const th = (
    <th className="th-new" ref={cell}>
      <InlineDraftInput
        className="celledit" ref={input} scopeRef={cell} triggers={triggers}
        placeholder={m.papers.columnAdd.namePlaceholder} onSubmit={(label) => onCreate(label, type)} onCancel={onCancel}
        kept={kept}
        onKeyDown={(e) => {
          // The type popover is portaled to the end of the body, out of reach of the native Tab order,
          // so focus is moved there by hand.
          if (e.key === 'Tab' && !e.shiftKey) {
            const btn = btnRefs.current[TYPES.findIndex(({ type: t }) => t === type)]
            if (btn) { e.preventDefault(); btn.focus() }
          }
        }}
      />
    </th>
  )
  if (!pickType) return th
  return (
    <ActionPopover
      open anchor={th} side="bottom" align="end" sideOffset={4} sticky="always"
      // Focus is already in the column name input; opening this popover must not take it.
      contentProps={{ onOpenAutoFocus: (event) => event.preventDefault() }}
    >
      <ColumnTypePicker
        type={type} buttons={btnRefs} focusAfterClick={input}
        onPick={setType}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            input.current?.focus()
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          } else if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault()
            input.current?.focus()
          }
        }}
      />
    </ActionPopover>
  )
}
