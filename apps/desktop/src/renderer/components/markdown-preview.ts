import type { Extension, Text } from '@codemirror/state'
import { EditorSelection, Prec, StateField } from '@codemirror/state'
import type { Command } from '@codemirror/view'
import { Decoration, EditorView, keymap, WidgetType } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { Line, MarkdownConfig } from '@lezer/markdown'
import { GFM, parser } from '@lezer/markdown'

/** One block of the source, line-aligned: `from` starts its first line and `to` ends its last. */
export type MarkdownBlock = { from: number; to: number }

/** Where the editor puts each rendered block's element, for the host to render the block's source into. */
export type PreviewSlots = { add: (dom: HTMLElement, source: string) => void; remove: (dom: HTMLElement) => void }

/**
 * The length of the `$` run that starts `line` when the line is a display-formula fence as
 * remark-math reads one (two or more `$`, then nothing holding a `$`), else -1.
 */
function mathFence(line: Line): number {
  if (line.indent - line.baseIndent >= 4) return -1
  let end = line.pos
  while (line.text.charCodeAt(end) === 36) end += 1
  return end - line.pos >= 2 && !line.text.includes('$', end) ? end - line.pos : -1
}

/**
 * A top-level display formula, from its `$$` fence through the closing fence or the end of the
 * source, so the lines of one formula stay one block. Inside a list item or a quote the formula
 * already belongs to that block.
 */
const DisplayMath: MarkdownConfig = {
  defineNodes: [{ name: 'DisplayMath', block: true }],
  parseBlock: [{
    name: 'DisplayMath',
    before: 'FencedCode',
    parse(cx, line) {
      const open = mathFence(line)
      if (open < 0 || cx.parentType().name !== 'Document') return false
      const from = cx.lineStart + line.pos
      while (cx.nextLine()) {
        const close = mathFence(line)
        if (close >= open && line.skipSpace(line.pos + close) === line.text.length) {
          cx.nextLine()
          break
        }
      }
      cx.addElement(cx.elt('DisplayMath', from, cx.prevLineEnd()))
      return true
    },
    endLeaf: (cx, line) => mathFence(line) >= 0 && cx.parentType().name === 'Document',
  }],
}

const markdown = parser.configure([GFM, DisplayMath])

/**
 * The blocks of `doc` that render one at a time: each top-level Markdown block, except that a list
 * renders item by item, an item keeping the lists nested in it. Blank lines between blocks belong
 * to none.
 */
export function markdownBlocks(doc: Text): MarkdownBlock[] {
  const nodes: SyntaxNode[] = []
  for (let node = markdown.parse(doc.toString()).topNode.firstChild; node !== null; node = node.nextSibling) {
    if (node.name === 'BulletList' || node.name === 'OrderedList') nodes.push(...node.getChildren('ListItem'))
    else nodes.push(node)
  }
  return nodes.map((node) => ({ from: doc.lineAt(node.from).from, to: doc.lineAt(node.to).to }))
}

/** The blocks that render under `selection`: those no selection range touches. The rest show their source. */
export function renderedBlocks(blocks: readonly MarkdownBlock[], selection: EditorSelection): MarkdownBlock[] {
  return blocks.filter((block) => !selection.ranges.some((range) => range.from <= block.to && range.to >= block.from))
}

/** A rendered block in the editor: an empty element that `slots` fills with the rendering of `source`. */
class RenderedBlock extends WidgetType {
  constructor(readonly source: string, readonly slots: PreviewSlots) { super() }

  override eq(other: RenderedBlock): boolean { return other.source === this.source }

  toDOM(): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'md-block'
    this.slots.add(dom, this.source)
    return dom
  }

  override destroy(dom: HTMLElement): void { this.slots.remove(dom) }

  // A click in a rendered block puts the cursor on it, which brings its source back.
  override ignoreEvent(): boolean { return false }
}

/**
 * ArrowUp (`forward` false) or ArrowDown that would carry a lone cursor over a rendered block,
 * which holds no cursor, stopping on the block's nearest line instead, where its source shows.
 */
function stepOntoBlock(blocks: StateField<MarkdownBlock[]>, forward: boolean): Command {
  return (view) => {
    const { state } = view
    const cursor = state.selection.main
    const line = state.doc.lineAt(cursor.head)
    const next = line.number + (forward ? 1 : -1)
    if (state.selection.ranges.length > 1 || !cursor.empty || next < 1 || next > state.doc.lines) return false
    if (Math.abs(state.doc.lineAt(view.moveVertically(cursor, forward).head).number - line.number) <= 1) return false
    const onto = state.doc.line(next)
    if (!renderedBlocks(state.field(blocks), state.selection).some((block) => block.from <= onto.from && onto.to <= block.to)) {
      return false
    }
    view.dispatch({
      selection: EditorSelection.cursor(onto.from + Math.min(cursor.head - line.from, onto.length)),
      scrollIntoView: true, userEvent: 'select',
    })
    return true
  }
}

/**
 * Live preview for a Markdown source editor: every block of `markdownBlocks` that `renderedBlocks`
 * keeps shows rendered in place of its lines, through an element handed to `slots`.
 */
export function livePreview(slots: PreviewSlots): Extension {
  const blocks = StateField.define<MarkdownBlock[]>({
    create: (state) => markdownBlocks(state.doc),
    update: (value, transaction) => (transaction.docChanged ? markdownBlocks(transaction.state.doc) : value),
  })
  return [
    blocks,
    // Blocks that replace whole lines must come straight from the state, not from a view plugin.
    EditorView.decorations.compute([blocks, 'selection'], (state) => Decoration.set(
      renderedBlocks(state.field(blocks), state.selection).map(({ from, to }) =>
        Decoration.replace({ widget: new RenderedBlock(state.sliceDoc(from, to), slots), block: true }).range(from, to)),
    )),
    Prec.high(keymap.of([
      { key: 'ArrowUp', run: stepOntoBlock(blocks, false) },
      { key: 'ArrowDown', run: stepOntoBlock(blocks, true) },
    ])),
  ]
}
