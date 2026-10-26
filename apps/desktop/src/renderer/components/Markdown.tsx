import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import type { Node, Parent, Root } from 'mdast'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import type { WikiRef } from '../../shared/contract.js'
import { commitKeys } from '../lib/keyboard.js'
import { EntityLink } from './EntityLink.js'
import { MarkdownEditor, type EditorStart } from './MarkdownEditor.js'
import { CommitActions } from './CommitActions.js'
import { EmptyState } from './EmptyState.js'
import { SectionHeading } from './PageShell.js'
import type { TextEdit } from '../hooks/useDrafts.js'
import { useOnLeave } from '../hooks/useOnLeave.js'
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
 * remark plugin: gives each top-level block, and each item of a top-level list, the attribute
 * `data-line`, the line it starts on.
 */
function remarkBlockLines() {
  const mark = (node: Node) => {
    if (node.position === undefined) return
    const data = node.data as { hProperties?: Record<string, unknown> } | undefined
    Object.assign(node, { data: { ...data, hProperties: { ...data?.hProperties, 'data-line': node.position.start.line } } })
  }
  return (tree: Root) => tree.children.forEach((child) => (child.type === 'list' ? child.children.forEach(mark) : mark(child)))
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
 * is a no-break space rather than strikethrough. With `lines`, each top-level block, and each item
 * of a top-level list, carries `data-line`, the line of `src` it starts on.
 */
export function Markdown({ src, onOpen, onAnchor, titles, latexText = false, lines = false }: {
  src: string
  onOpen?: (id: string) => void
  onAnchor?: (page: number) => void
  titles?: Record<string, WikiRef>
  latexText?: boolean
  lines?: boolean
}) {
  const parts = useMemo(() => components(onOpen, onAnchor, titles), [onOpen, onAnchor, titles])
  const marks = lines ? [remarkHeadingIds, remarkBlockLines] : [remarkHeadingIds]
  return (
    <ReactMarkdown
      remarkPlugins={latexText
        ? [[remarkGfm, { singleTilde: false }], remarkMath, ...marks, remarkPaperText, remarkAnchorSeparators]
        : [remarkGfm, remarkMath, ...marks, remarkAnchorSeparators]}
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
 * A section of Markdown text edited in place: the heading `title` at `level`, then the text, which
 * renders as Markdown, or as the section's empty state when it is empty. `edit` is the text's kept
 * edit (see `editText`). A click on the text, except on a link, a control or a selection, opens the
 * edit with the cursor where the click landed, and so does Enter on the focused text. While it is
 * open the text is a MarkdownEditor in a box with the class `src`, and the heading holds Cancel and
 * Save. ⌘Enter on macOS, Ctrl+Enter elsewhere, Save, a press outside the heading and the box, and
 * focus leaving them, all save, unless the section is inside a hidden element; Esc and Cancel drop
 * the edit. Saving an unchanged edit drops it, and an edit that is `stale` or `saving` is not saved,
 * nor, with `required`, one whose text is empty: Save is then held and leaving keeps the edit open.
 * `onSave` receives the changed text trimmed, and the caller drops the edit once it is saved.
 * `className` is appended to the text's container.
 */
export function MarkdownSection({
  title, level = 'section', edit, onSave, saving = false, required = false, className, onOpen, onAnchor, titles,
}: {
  title: ReactNode
  level?: 'section' | 'group'
  edit: TextEdit
  onSave: (text: string) => void
  saving?: boolean
  required?: boolean
  className?: string
  onOpen?: (id: string) => void
  onAnchor?: (page: number) => void
  titles?: Record<string, WikiRef>
}) {
  const head = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [inside] = useState(() => [head])
  const start = useRef<EditorStart | undefined>(undefined)
  const missing = required && edit.text.trim() === ''
  const save = () => {
    if (saving || edit.stale || missing) return
    if (edit.changed) onSave(edit.text.trim())
    else edit.drop()
  }
  useOnLeave(box, () => { if (box.current?.closest('[hidden]') === null) save() }, inside)
  const open = (text: HTMLElement, at: EditorStart | undefined) => {
    // The editor's blocks are drawn only after it mounts; until then the text keeps its height, so
    // the page around it does not move.
    text.style.minHeight = `${text.offsetHeight}px`
    requestAnimationFrame(() => { text.style.minHeight = '' })
    start.current = at
    edit.start()
  }
  const click = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element
    if (target.closest('a, button') !== null || window.getSelection()?.isCollapsed === false) return
    const line = Number(target.closest('[data-line]')?.getAttribute('data-line'))
    open(event.currentTarget, line > 0 ? { line, x: event.clientX, y: event.clientY } : undefined)
  }
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && event.target === event.currentTarget) open(event.currentTarget, undefined)
  }
  const classes = `md${edit.editing ? ' src' : ''}${className === undefined ? '' : ` ${className}`}`
  // Under exactOptionalPropertyTypes an absent onOpen cannot be passed as undefined; it must be left out.
  const links = {
    ...(onOpen === undefined ? {} : { onOpen }), ...(onAnchor === undefined ? {} : { onAnchor }),
    ...(titles === undefined ? {} : { titles }),
  }
  return (
    <>
      <SectionHeading
        ref={head} level={level}
        actions={edit.editing
          ? <CommitActions place="heading" saving={saving} canSave={!edit.stale && !missing} onCancel={edit.drop} onSave={save} />
          : undefined}
      >{title}
      </SectionHeading>
      {/* One element in both states: it may hold the focus, and the focus leaving with the element would move the page. */}
      <div
        className={classes} ref={edit.editing ? box : undefined} tabIndex={edit.editing ? -1 : 0}
        onClick={edit.editing ? undefined : click}
        onKeyDown={edit.editing ? commitKeys({ multiline: true, onSave: save, onCancel: edit.drop }) : keys}
      >
        {edit.editing
          ? (
            <MarkdownEditor
              text={edit.text} onChange={edit.change} start={start.current}
              preview={(source) => <Markdown src={source} {...links} />}
            />
          )
          : edit.text === '' ? <EmptyState variant="section" /> : <Markdown src={edit.text} lines {...links} />}
      </div>
    </>
  )
}

/**
 * A long Markdown text as a boxed form field: a MarkdownEditor over `text`, not focused on mount, in
 * the field look of the shared form controls, which shows focus while the editor holds it and the
 * refused look while `invalid`. `label` names the text and `placeholder` shows while it is empty;
 * `onChange` receives the whole source after each edit. `text` is read once, on mount.
 */
export function MarkdownField({ text, onChange, label, placeholder, invalid }: {
  text: string
  onChange: (text: string) => void
  label: string
  placeholder?: string
  invalid?: true | undefined
}) {
  return (
    <div className="form-control form-control-field md form-markdown" aria-invalid={invalid}>
      <MarkdownEditor
        text={text} onChange={onChange} autoFocus={false} label={label}
        {...(placeholder === undefined ? {} : { placeholder })}
        preview={(source) => <Markdown src={source} />}
      />
    </div>
  )
}
