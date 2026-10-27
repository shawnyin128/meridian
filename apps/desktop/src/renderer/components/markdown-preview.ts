import type { Extension, Text } from '@codemirror/state'
import { EditorSelection, Prec, StateField } from '@codemirror/state'
import type { Command } from '@codemirror/view'
import { Decoration, EditorView, keymap, WidgetType } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { Line, MarkdownConfig } from '@lezer/markdown'
import { GFM, parser } from '@lezer/markdown'
import type { WidgetSlots } from './widget-slots.js'

/**
 * The space the read view leaves above a block: `none` for the first block and between two items of
 * one list, `tight` under a heading, `wide` above a heading or a rule and under a rule, and `block`
 * between any other two blocks.
 */
export type BlockSpace = 'none' | 'tight' | 'block' | 'wide'

/**
 * One block of the source, line-aligned: `from` starts its first line and `to` ends its last.
 * `space` is the space the read view leaves above it.
 */
export type MarkdownBlock = { from: number; to: number; space: BlockSpace }

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
  const heading = (node: SyntaxNode) => /Heading\d$/.test(node.name)
  const rule = (node: SyntaxNode) => node.name === 'HorizontalRule'
  const spaceAbove = (node: SyntaxNode, before: SyntaxNode | undefined): BlockSpace => {
    if (before === undefined) return 'none'
    if (heading(node) || rule(node) || rule(before)) return 'wide'
    if (heading(before)) return 'tight'
    return node.name === 'ListItem' && before.parent?.from === node.parent?.from ? 'none' : 'block'
  }
  return nodes.map((node, at) => ({
    from: doc.lineAt(node.from).from, to: doc.lineAt(node.to).to, space: spaceAbove(node, nodes[at - 1]),
  }))
}

/** The blocks that render under `selection`: those no selection range touches. The rest show their source. */
export function renderedBlocks(blocks: readonly MarkdownBlock[], selection: EditorSelection): MarkdownBlock[] {
  return blocks.filter((block) => !selection.ranges.some((range) => range.from <= block.to && range.to >= block.from))
}

/**
 * The start of every blank line of `doc` that collapses under `selection`: a line holding only
 * whitespace that lies in none of `blocks` and that no selection range touches.
 */
export function collapsedLines(doc: Text, blocks: readonly MarkdownBlock[], selection: EditorSelection): number[] {
  const starts: number[] = []
  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number)
    if (line.text.trim() !== '' || blocks.some((block) => block.from <= line.from && line.to <= block.to)) continue
    if (!selection.ranges.some((range) => range.from <= line.to && range.to >= line.from)) starts.push(line.from)
  }
  return starts
}

/** The look of a collapsed blank line, which takes no height. */
const collapsed = Decoration.line({ class: 'md-gap' })

/** The look of the first line of a block that shows its source, which leaves the block's space above it. */
const spaced = (space: BlockSpace) => Decoration.line({ attributes: { 'data-space': space } })

/**
 * A rendered block in the editor: an empty element that `slots` fills with the rendering of
 * `source`, leaving `space` above it.
 */
class RenderedBlock extends WidgetType {
  constructor(readonly source: string, readonly space: BlockSpace, readonly slots: WidgetSlots) { super() }

  override eq(other: RenderedBlock): boolean { return other.source === this.source && other.space === this.space }

  toDOM(): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'md-block'
    dom.dataset.space = this.space
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
 * keeps shows rendered in place of its lines, through an element handed to `slots`. Every block,
 * rendered or not, leaves its `space` above it, and every blank line of `collapsedLines` takes no
 * height, so the blocks stand as far apart as they do when read.
 */
export function livePreview(slots: WidgetSlots): Extension {
  const blocks = StateField.define<MarkdownBlock[]>({
    create: (state) => markdownBlocks(state.doc),
    update: (value, transaction) => (transaction.docChanged ? markdownBlocks(transaction.state.doc) : value),
  })
  return [
    blocks,
    // Blocks that replace whole lines must come straight from the state, not from a view plugin.
    EditorView.decorations.compute([blocks, 'selection'], (state) => {
      const all = state.field(blocks)
      const rendered = renderedBlocks(all, state.selection)
      return Decoration.set([
        ...all.map((block) => (rendered.includes(block)
          ? Decoration.replace({ widget: new RenderedBlock(state.sliceDoc(block.from, block.to), block.space, slots), block: true })
            .range(block.from, block.to)
          : spaced(block.space).range(block.from))),
        ...collapsedLines(state.doc, all, state.selection).map((from) => collapsed.range(from)),
      ], true)
    }),
    Prec.high(keymap.of([
      { key: 'ArrowUp', run: stepOntoBlock(blocks, false) },
      { key: 'ArrowDown', run: stepOntoBlock(blocks, true) },
    ])),
  ]
}
