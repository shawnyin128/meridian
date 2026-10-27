import { forwardRef, Fragment } from 'react'
import type { ReactNode, Ref } from 'react'
import type { ReorderItemProps } from '../hooks/useDragReorder.js'
import { AddAction } from './AddAction.js'
import { ExternalMark } from './EntityLink.js'
import { FadeText } from './FadeText.js'
import { IconButton } from './IconButton.js'
import { IconCross, IconPencil } from './icons.js'
import { RowActions } from './Item.js'
import { tagClass } from './Tag.js'
import { Tooltip } from './Tooltip.js'
import './ChipList.css'

/** One chip of a ChipList. */
export type ChipListItem = {
  /** The chip's key among its list's, and its id for `reorder`. */
  id: string
  name: ReactNode
  /** Opens what the chip names: the name becomes the chip's button, and a click anywhere on the chip opens it. */
  onOpen?: () => void
  /** The tooltip of the name, such as the web address a chip opens. */
  tooltip?: string
  /** Ends the name with the external mark: the chip opens a page in the browser. */
  external?: boolean
  /** The pencil that opens the chip's editor. */
  edit?: { label: string; onEdit: () => void }
  /** The × that takes the chip out of its list. */
  remove: { label: string; onRemove: () => void }
  /** Data attributes that mark the chip for its host, such as the page or paper it names. */
  data?: { [key: `data-${string}`]: string | undefined }
  /** Shown in the chip's place while it is edited, such as an input holding its value. */
  editor?: ReactNode
}

/** The ＋ after the chips. */
export type ChipListAdd = {
  label: string
  onAdd: () => void
  /** Shown in the ＋'s place while a value is being added, such as the input that takes it. */
  draft?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

/**
 * The one list of removable chips, each a neutral chip. A chip's name opens what it names when it has
 * `onOpen`; its pencil and its ×, which hand the chip to `edit.onEdit` and `remove.onRemove`, sit in the
 * chip's row-actions slot and show just past the chip's end while the chip or they are hovered or hold
 * focus, over whatever follows the chip, which keeps its width; at rest the chip is as wide as its name
 * and padding.
 * With `reorder`, each chip is dragged by itself and takes the reorder's item attributes. `add` ends
 * the list with the ＋ that adds a value, at the chip's height; with `reveal="hover"` the ＋ sits in
 * the row's actions slot and shows with the row's other actions, as in a table row. With `label` the
 * list is a relation row: the label, then `before` (such as the draft of a new chip), then the chips,
 * wrapping when they run out of room; the ref goes to the row. Without it the chips and the ＋ flow in
 * their host, a table cell or a property value. A click on a chip or its controls stays with the chip.
 */
export const ChipList = forwardRef<HTMLDivElement, {
  chips: readonly ChipListItem[]
  reorder?: ((id: string) => ReorderItemProps) | undefined
  add?: ChipListAdd | undefined
  reveal?: 'rest' | 'hover' | undefined
  label?: string | undefined
  before?: ReactNode
  data?: { [key: `data-${string}`]: string | undefined }
}>(function ChipList({ chips, reorder, add, reveal = 'rest', label, before, data }, ref) {
  const items = (
    <>
      {chips.map((chip) => (chip.editor !== undefined ? <Fragment key={chip.id}>{chip.editor}</Fragment> : (
        <span
          key={chip.id} className={tagClass(undefined, 'chip', 'tagchip')} data-row-actions=""
          data-actionable={chip.onOpen === undefined ? undefined : ''} {...chip.data}
          {...reorder?.(chip.id)}
          onClick={chip.onOpen === undefined ? undefined : (event) => { event.stopPropagation(); chip.onOpen!() }}
        >
          {chip.onOpen === undefined
            ? <FadeText className="tagchip-text">{chip.name}</FadeText>
            : (
              <Tooltip label={chip.tooltip}>
                <button type="button" className="tagchip-open">
                  <FadeText className="tagchip-text">{chip.name}</FadeText>
                  {chip.external === true ? <ExternalMark /> : null}
                </button>
              </Tooltip>
            )}
          <RowActions>
            {chip.edit === undefined ? null : (
              <IconButton
                label={chip.edit.label} size="inline" className="tagchip-edit"
                onClick={(event) => { event.stopPropagation(); chip.edit!.onEdit() }}
              ><IconPencil /></IconButton>
            )}
            <IconButton
              label={chip.remove.label} size="inline" className="rx"
              onClick={(event) => { event.stopPropagation(); chip.remove.onRemove() }}
            ><IconCross sw={2.5} /></IconButton>
          </RowActions>
        </span>
      )))}
      {add === undefined ? null : add.draft ?? <ChipAdd add={add} reveal={reveal} />}
    </>
  )
  if (label === undefined) return items
  return (
    <div className="wkrel" ref={ref} {...data}>
      <span className="rl">{label}</span>
      {before}
      {items}
    </div>
  )
})

/** The ＋ at the end of a ChipList, alone or in the row's actions slot. */
function ChipAdd({ add, reveal }: { add: ChipListAdd; reveal: 'rest' | 'hover' }) {
  const plus = (
    <AddAction
      size="chip" ref={add.ref} className="tagchip tagadd" label={add.label}
      onClick={(event) => { event.stopPropagation(); add.onAdd() }}
    />
  )
  return reveal === 'rest' ? plus : <RowActions>{plus}</RowActions>
}
