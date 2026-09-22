import { useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, RefObject } from 'react'
import type { PaperColumn } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionPopover } from '../ActionPopover.js'
import { InlineDraftInput } from '../InlineDraftInput.js'
import { IconMulti, IconSelect, IconText } from '../icons.js'

/** The icons for each of the three types of gears are in the order of the gear buttons; the name comes from the catalog's `papers.columnType`. */
const TYPES = [
  { type: 'text', Icon: IconText },
  { type: 'select', Icon: IconSelect },
  { type: 'multi', Icon: IconMulti },
] as const satisfies readonly { type: PaperColumn['type']; Icon: () => ReactElement }[]

/**
 * Text / radio selection / multi-select radio group (`role="radiogroup"`, each button `role="radio"` +
 * `aria-checked`): `type` That file is selected, and only it is in the Tab order. Click a gear to hand that gear to `onPick`,
 * Then give the focus to `focusAfterClick` (if given); the arrow keys move between the three gears starting from the `type` gear, and move to
 * That file is handed over to `onPick`, and the focus moves to its button. Handle other keys to `onKeyDown`. Press gear when `buttons` are given
 * Receive three buttons in order. Vision is `.ctrow` / `.ctbtn`.
 */
export function ColumnTypePicker({ type, onPick, onKeyDown, buttons, focusAfterClick }: {
  type: PaperColumn['type']
  onPick: (type: PaperColumn['type']) => void
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void
  buttons?: RefObject<(HTMLButtonElement | null)[]>
  focusAfterClick?: RefObject<HTMLElement | null>
}) {
  const m = useMessages()
  // If buttons are not given, it will be collected by itself; the subscript is aligned with TYPES - it will not be changed according to the selected gear, but will be taken according to the position.
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
        <button
          key={t} type="button" ref={(el) => { refs.current[i] = el }}
          className={t === type ? 'ctbtn on' : 'ctbtn'} title={m.papers.columnType[t]}
          role="radio" aria-checked={t === type} tabIndex={t === type ? 0 : -1}
          onClick={() => { onPick(t); focusAfterClick?.current?.focus() }}
        ><Icon /></button>
      ))}
    </div>
  )
}

/** This type of icon. */
export function ColumnTypeIcon({ type }: { type: PaperColumn['type'] }) {
  const { Icon } = TYPES.find((t) => t.type === type)!
  return <Icon />
}

/**
 * The placeholder that grows out at the end of the table header: fill in the column name, and press Enter to give the name with the leading and trailing blanks removed together with the type selected at the moment.
 * `onCreate`, once built; Esc, click outside the `cell` and type layer, and cancel when the focus moves outside the two. `onCreate`
 * Return to see if the placeholder has been used up. `triggers` are those entry buttons that are not considered "extra" when clicked or focused.
 * When `pickType` is true (only for paper table transfer), pop up three more type buttons below the placeholder. The default is "Text". Click which one to change.
 * Which, the focus is still on the column name input box; if it is not passed, it will be like the aggregation page, where all text columns are created.
 * The type button group is a radio group(`role="radiogroup"`, each button `role="radio"` +
 * `aria-checked`): Press Tab in the column name input box to enter the currently selected gear; use the arrow keys to move between the three gears and select them.
 * The focus moves and stays in the group. If you press the mouse and then move it away without letting go, it will not be clicked. In that case, the focus will be given to the clicked one first.
 * Regardless of whether it is selected or not - the arrow keys still press the selected gear to calculate the starting point, and Space / Enter still only returns the focus to the column name input box.
 * Instead of selecting it, you don’t even see which button the focus is on at this moment; Shift+Tab in the group also returns the column name input box; pressing in the group
 * Esc gives up completely as in the input box.
 */
export function NewColumnHead({ cell, triggers, onCreate, onCancel, pickType }: {
  cell: RefObject<HTMLTableCellElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  onCreate: (label: string, type: PaperColumn['type']) => boolean | Promise<boolean>
  onCancel: () => void
  pickType?: boolean
}) {
  const m = useMessages()
  const input = useRef<HTMLInputElement>(null)
  // References to the three types of buttons, the subscripts are aligned with TYPES - do not change with the selected gear, get them according to the position
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [type, setType] = useState<PaperColumn['type']>('text')
  const th = (
    <th className="th-new" ref={cell}>
      <InlineDraftInput
        className="celledit" ref={input} scopeRef={cell} triggers={triggers}
        placeholder={m.papers.columnAdd.namePlaceholder} onSubmit={(label) => onCreate(label, type)} onCancel={onCancel}
        onKeyDown={(e) => {
          // The type layer portal is at the end of the body. The native Tab order cannot reach it. Here, the focus is manually sent there.
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
      // The focus is already on the column name input box. If this layer pops up, it will not be grabbed.
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
