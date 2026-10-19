import { useEffect, useMemo } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { Parent, Root } from 'mdast'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import type { WikiRef } from '../../shared/contract.js'
import { commitsMultiline, composing } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { remarkPaperText } from './paper/paper-text.js'

/** Two kinds of marks: `[[id|Text]]` / `[[id]]` are in-page links, and `(p.N)` is a source anchor. */
const WIKI_LINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g
const CITE_MARK = /\(p\.(\d+)\)/g

/** Rewritten links are told apart by prefix; starting with `#` lets them pass react-markdown's URL filter. */
const WIKI = '#wiki:'
const CITE = '#cite:'

/**
 * Rewrites both marks into standard Markdown links: `[[id|text]]` → `[text](<#wiki:id>)`, where the
 * text of `[[id]]` is the title of `titles[id]`, or the id when absent; `(p.N)` → `[p.N](<#cite:N>)`.
 * When `titles` is given, an id missing from it is not a page in the vault and its mark stays as
 * written; without `titles` (a remark), every mark becomes a link.
 * The rewrite runs on the whole source before parsing, so marks in code blocks, inline code and
 * formulas are rewritten too. Marks never span lines and the rewrite adds, removes or splits no
 * line breaks, so line numbers stay the same.
 */
const desugar = (src: string, titles: Record<string, WikiRef> | undefined): string => src
  .replace(WIKI_LINK, (m: string, id: string, label?: string) =>
    (titles !== undefined && titles[id] === undefined ? m : `[${label ?? titles?.[id]?.title ?? id}](<${WIKI}${id}>)`))
  .replace(CITE_MARK, (_m: string, n: string) => `[p.${n}](<${CITE}${n}>)`)

/** remark plugin: gives each heading the id `h-<line number>`, as headingsOf does for the table of contents. */
function remarkHeadingIds() {
  const visit = (node: Parent): void => {
    for (const child of node.children) {
      if (child.type === 'heading') {
        Object.assign(child, { data: { ...child.data, hProperties: { id: `h-${child.position!.start.line}` } } })
      }
      if ('children' in child) visit(child as Parent)
    }
  }
  return (tree: Root) => visit(tree)
}

/**
 * Links render three ways: an in-page link is a `.wl` that shows the page's full title from `titles`
 * on hover and, given `onOpen`, is a link that opens the page; a source anchor is a `.cite`, and any
 * other link opens in a new window.
 */
function components(
  onOpen: ((id: string) => void) | undefined,
  citePage: (page: string) => string,
  titles: Record<string, WikiRef> | undefined,
): Components {
  return {
    a: ({ href, children }) => {
      // urlTransform empties URLs with protocols such as javascript:; an emptied link must not render as one
      if (!href) return <>{children}</>
      if (href.startsWith(WIKI)) {
        const id = href.slice(WIKI.length)
        const page = titles?.[id]
        const title = page?.fullTitle ?? page?.title
        if (onOpen === undefined) return <span className="wl" data-wk={id} title={title}>{children}</span>
        return (
          <a
            className="wl" href={href} data-wk={id} title={title}
            onClick={(event) => { event.preventDefault(); onOpen(id) }}
          >{children}</a>
        )
      }
      if (href.startsWith(CITE)) {
        return <span className="cite" title={citePage(href.slice(CITE.length))}>{children}</span>
      }
      return <a href={href} target="_blank" rel="noreferrer">{children}</a>
    },
  }
}

/**
 * Renders a piece of Markdown: GFM (tables and so on) renders as GFM, and raw HTML is escaped as
 * text. `[[id|text]]`, `[[id]]` and `(p.N)` are recognized anywhere in the text, code included. The
 * first two are in-page links that call `onOpen(id)` on click; the last is a source anchor.
 * Ordinary links open in a new window. `$…$` is an inline formula and a block between `$$` lines
 * is a display formula, both rendered with KaTeX; `$$...$$` within one line is inline under
 * remark-math's syntax rules, not a display formula. Each heading's id is `h-` followed by its
 * line number in `src`. `[[id]]` without an alias shows the title of `titles[id]`, or the id when
 * absent. When `titles` is given, an id missing from it is not a page in the vault and its mark
 * stays as written; without `titles` (a remark), every mark becomes a link. With `latexText`, the
 * text outside code and formulas renders LaTeX text commands as `PaperText` does, and a single `~`
 * is a no-break space rather than strikethrough.
 */
export function Markdown({ src, onOpen, titles, latexText = false }: {
  src: string
  onOpen?: (id: string) => void
  titles?: Record<string, WikiRef>
  latexText?: boolean
}) {
  const m = useMessages()
  const parts = useMemo(() => components(onOpen, m.common.markdown.citePage, titles), [onOpen, m, titles])
  return (
    <ReactMarkdown
      remarkPlugins={latexText
        ? [[remarkGfm, { singleTilde: false }], remarkMath, remarkHeadingIds, remarkPaperText]
        : [remarkGfm, remarkMath, remarkHeadingIds]}
      rehypePlugins={[rehypeKatex]} components={parts}
    >
      {desugar(src, titles)}
    </ReactMarkdown>
  )
}

/** A table-of-contents entry: heading level, source text, and the id of the rendered heading element. */
export type Heading = { depth: number; text: string; id: string }

/**
 * The level one to three ATX headings in `src`, in order of appearance; lines inside fenced code
 * blocks do not count, and a trailing `#` sequence is removed. `id` is `h-` plus the line number,
 * the same as on the heading element Markdown renders.
 */
export function headingsOf(src: string): Heading[] {
  const out: Heading[] = []
  let fenced = false
  src.split('\n').forEach((line, at) => {
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced
      return
    }
    const m = fenced ? null : /^(#{1,3})\s+(.*?)(?:\s+#+)?\s*$/.exec(line)
    if (m) out.push({ depth: m[1]!.length, text: m[2]!, id: `h-${at + 1}` })
  })
  return out
}

/**
 * One container that switches between the rendered result and the Markdown source: with `editing`
 * false it renders `text` as Markdown (`empty` when the string is empty); with it true it is a
 * contentEditable holding the source, focused on entry, where Esc calls `onCancel` and ⌘Enter or
 * Ctrl+Enter calls `onSave`, unless an input method is composing.
 * The caller places EditActions and reads `box`'s `innerText` on save. `className` is appended to the
 * container.
 */
export function MarkdownBox({ text, editing, box, onCancel, onSave, onOpen, titles, empty, className }: {
  text: string
  editing: boolean
  box: RefObject<HTMLDivElement | null>
  onCancel: () => void
  /** Called on ⌘Enter or Ctrl+Enter while editing. */
  onSave: () => void
  onOpen?: (id: string) => void
  titles?: Record<string, WikiRef>
  empty: ReactNode
  className?: string
}) {
  useEffect(() => { if (editing) box.current?.focus() }, [editing, box])
  const classes = `md${editing ? ' src' : ''}${className === undefined ? '' : ` ${className}`}`
  return editing
    ? (
      <div
        className={classes} contentEditable suppressContentEditableWarning ref={box}
        onKeyDown={(e) => {
          if (commitsMultiline(e.nativeEvent)) {
            e.preventDefault()
            onSave()
            return
          }
          if (e.key !== 'Escape') return
          e.stopPropagation()
          if (!composing(e.nativeEvent)) onCancel()
        }}
      >{text}</div>
    )
    // Under exactOptionalPropertyTypes an absent onOpen cannot be passed as undefined; it must be left out.
    : (
      <div className={classes}>
        {text === ''
          ? empty
          : (
            <Markdown
              src={text} {...(onOpen === undefined ? {} : { onOpen })} {...(titles === undefined ? {} : { titles })}
            />
          )}
      </div>
    )
}
