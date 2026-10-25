import { useEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import type { Parent, Root } from 'mdast'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import type { WikiRef } from '../../shared/contract.js'
import { appMenu } from '../ipc.js'
import { commitsMultiline, composing } from '../lib/keyboard.js'
import { EntityLink } from './EntityLink.js'
import { MarkdownEditor } from './MarkdownEditor.js'
import { remarkPaperText } from './paper/paper-text.js'
import { SourceAnchor } from './SourceAnchor.js'
import './Markdown.css'

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
 * remark plugin: moves the whitespace that ends the text right before a source anchor out of that
 * text and onto the anchor as its `separator`, which the anchor renders inside its no-wrap box.
 */
function remarkAnchorSeparators() {
  const visit = (node: Parent): void => {
    node.children.forEach((child, at) => {
      const before = node.children[at - 1]
      if (child.type === 'link' && child.url.startsWith(CITE) && before?.type === 'text') {
        const space = /\s+$/.exec(before.value)
        if (space !== null) {
          before.value = before.value.slice(0, space.index)
          child.data = { ...child.data, hProperties: { separator: space[0] } }
        }
      }
      if ('children' in child) visit(child as Parent)
    })
  }
  return (tree: Root) => visit(tree)
}

/** A Markdown code block or table, which scrolls sideways when it is too wide and fades the side it hides. */
function Sideways({ as: Element, children }: { as: 'pre' | 'table'; children?: ReactNode }) {
  return <Element ref={useScrollFade('x')}>{children}</Element>
}

/**
 * Links render three ways, all as entity links: an in-page link shows the page's full title from
 * `titles` on hover and, given `onOpen`, opens the page; a source anchor is the anchor control when
 * `onAnchor` opens the source at a page, and plain text otherwise; any other link opens in the browser.
 */
function components(
  onOpen: ((id: string) => void) | undefined,
  onAnchor: ((page: number) => void) | undefined,
  titles: Record<string, WikiRef> | undefined,
): Components {
  return {
    pre: ({ children }) => <Sideways as="pre">{children}</Sideways>,
    table: ({ children }) => <Sideways as="table">{children}</Sideways>,
    a: ({ href, children, node }) => {
      // urlTransform empties URLs with protocols such as javascript:; an emptied link must not render as one
      if (!href) return <>{children}</>
      if (href.startsWith(WIKI)) {
        const id = href.slice(WIKI.length)
        const page = titles?.[id]
        const name = page?.fullTitle ?? page?.title
        // The page's full name, when the link's own text says something else.
        const label = [children].flat().join('') === name ? undefined : name
        return (
          <EntityLink
            kind="page" label={children} title={label} data-wk={id}
            {...(onOpen === undefined ? {} : { href, onOpen: () => onOpen(id) })}
          />
        )
      }
      if (href.startsWith(CITE)) {
        const page = Number(href.slice(CITE.length))
        // Set by remarkAnchorSeparators when whitespace was written before the anchor.
        const separator = node?.properties.separator as string | undefined
        return onAnchor === undefined
          ? <>{separator}{children}</>
          : <SourceAnchor page={page} {...(separator === undefined ? {} : { separator })} onOpen={() => onAnchor(page)} />
      }
      return <EntityLink kind="external" label={children} href={href} />
    },
  }
}

/**
 * Renders a piece of Markdown: GFM (tables and so on) renders as GFM, and raw HTML is escaped as
 * text. `[[id|text]]`, `[[id]]` and `(p.N)` are recognized anywhere in the text, code included. The
 * first two are in-page links that call `onOpen(id)` on click; the last is a source anchor, which
 * calls `onAnchor(N)` when given and is plain text otherwise. Ordinary links open in the browser. `$…$` is an inline formula and a block between `$$` lines
 * is a display formula, both rendered with KaTeX; `$$...$$` within one line is inline under
 * remark-math's syntax rules, not a display formula. Each heading's id is `h-` followed by its
 * line number in `src`. `[[id]]` without an alias shows the title of `titles[id]`, or the id when
 * absent. When `titles` is given, an id missing from it is not a page in the vault and its mark
 * stays as written; without `titles` (a remark), every mark becomes a link. With `latexText`, the
 * text outside code and formulas renders LaTeX text commands as `PaperText` does, and a single `~`
 * is a no-break space rather than strikethrough.
 */
export function Markdown({ src, onOpen, onAnchor, titles, latexText = false }: {
  src: string
  onOpen?: (id: string) => void
  onAnchor?: (page: number) => void
  titles?: Record<string, WikiRef>
  latexText?: boolean
}) {
  const parts = useMemo(() => components(onOpen, onAnchor, titles), [onOpen, onAnchor, titles])
  return (
    <ReactMarkdown
      remarkPlugins={latexText
        ? [[remarkGfm, { singleTilde: false }], remarkMath, remarkHeadingIds, remarkPaperText, remarkAnchorSeparators]
        : [remarkGfm, remarkMath, remarkHeadingIds, remarkAnchorSeparators]}
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
 * false it renders `text` as Markdown, or `empty` alone, outside the container, when the string is
 * empty; with it true it is a contentEditable holding the source, focused on entry, where Esc calls
 * `onCancel` and ⌘Enter on macOS, Ctrl+Enter elsewhere, calls `onSave`, unless an input method is composing.
 * The caller places EditActions and reads `box`'s `innerText` on save; `onType` receives that text
 * as it is typed. While editing, the box keeps the source it opened with, as a changed `text` would
 * move the caret. With `live`, the source is
 * edited in a MarkdownEditor inside the container instead, under the same keys, which renders every
 * block the cursor is not on as the rendered result does; the caller saves the source it last
 * received through `live.onChange`. `className` is appended to the container.
 */
export function MarkdownBox({ text, editing, box, onCancel, onSave, onOpen, onAnchor, titles, empty, className, live, onType }: {
  text: string
  editing: boolean
  box: RefObject<HTMLDivElement | null>
  onCancel: () => void
  /** Called on ⌘Enter on macOS, Ctrl+Enter elsewhere, while editing. */
  onSave: () => void
  onOpen?: (id: string) => void
  onAnchor?: (page: number) => void
  titles?: Record<string, WikiRef>
  empty: ReactNode
  className?: string
  live?: { onChange: (text: string) => void }
  onType?: (text: string) => void
}) {
  const source = useRef(text)
  if (!editing) source.current = text
  useEffect(() => { if (editing && live === undefined) box.current?.focus() }, [editing, box, live])
  const classes = `md${editing ? ' src' : ''}${className === undefined ? '' : ` ${className}`}`
  const keys = (e: ReactKeyboardEvent) => {
    if (commitsMultiline(appMenu.platform(), e.nativeEvent)) {
      e.preventDefault()
      onSave()
      return
    }
    if (e.key !== 'Escape') return
    e.stopPropagation()
    if (!composing(e.nativeEvent)) onCancel()
  }
  // Under exactOptionalPropertyTypes an absent onOpen cannot be passed as undefined; it must be left out.
  const links = {
    ...(onOpen === undefined ? {} : { onOpen }), ...(onAnchor === undefined ? {} : { onAnchor }),
    ...(titles === undefined ? {} : { titles }),
  }
  if (editing && live !== undefined) {
    return (
      <div className={classes} ref={box} onKeyDown={keys}>
        <MarkdownEditor text={text} onChange={live.onChange} preview={(source) => <Markdown src={source} {...links} />} />
      </div>
    )
  }
  return editing
    ? (
      <div
        className={classes} contentEditable suppressContentEditableWarning ref={box} onKeyDown={keys}
        onInput={(e) => onType?.(e.currentTarget.innerText)}
      >{source.current}</div>
    )
    : text === ''
      ? empty
      : <div className={classes}><Markdown src={text} {...links} /></div>
}
