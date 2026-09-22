import { useEffect, useMemo } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { Parent, Root } from 'mdast'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import { useMessages } from '../messages/useMessages.js'

/** There are two types of tags in the text: `[[id|Text]]` / `[[id]]` are in-page links, and `(p.N)` is the original anchor point. */
const WIKI_LINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g
const CITE_MARK = /\(p\.(\d+)\)/g

/** The rewritten links are distinguished by prefixes; `#` starts with allowing react-markdown URL filtering to pass. */
const WIKI = '#wiki:'
const CITE = '#cite:'

/**
 * The two tags are rewritten into standard markdown links: `[[id|text]]` → `[text](<#wiki:id>)`, the text of `[[id]]` is
 * `titles[id]`, if not, it is id;`(p.N)` → `[p.N](<#cite:N>)`. When `titles` is given, the id that is not in it is not
 * For pages in the library, the tags are kept according to the original text; if no `titles` (essay) is given, they will be used as links.
 * Rewriting is done on the entire original text before parsing, so the tags in code blocks, inline codes, and formulas will also be rewritten; tags do not cross lines, rewriting does not add, delete, or break new lines, and the line numbers remain unchanged.
 */
const desugar = (src: string, titles: Record<string, string> | undefined): string => src
  .replace(WIKI_LINK, (m: string, id: string, label?: string) =>
    (titles !== undefined && titles[id] === undefined ? m : `[${label ?? titles?.[id] ?? id}](<${WIKI}${id}>)`))
  .replace(CITE_MARK, (_m: string, n: string) => `[p.${n}](<${CITE}${n}>)`)

/** remark plug-in: Each heading has an id `h-<line number>`, which matches the id given to the directory by headingsOf. */
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
 * There are three ways to draw links: the in-page link is clickable `.wl` and shows the page's full title from
 * `titles` on hover, the original text anchor is `.cite`, and the rest are opened on the new window target.
 */
function components(
  onOpen: ((id: string) => void) | undefined,
  citePage: (page: string) => string,
  titles: Record<string, string> | undefined,
): Components {
  return {
    a: ({ href, children }) => {
      // urlTransform clears javascript: this type of protocol into an empty string: the cleared link should not be drawn as a link
      if (!href) return <>{children}</>
      if (href.startsWith(WIKI)) {
        const id = href.slice(WIKI.length)
        return <span className="wl" data-wk={id} title={titles?.[id]} onClick={() => onOpen?.(id)}>{children}</span>
      }
      if (href.startsWith(CITE)) {
        return <span className="cite" title={citePage(href.slice(CITE.length))}>{children}</span>
      }
      return <a href={href} target="_blank" rel="noreferrer">{children}</a>
    },
  }
}

/**
 * A piece of markdown is rendered: GFM (tables, etc.) are rendered as GFM, and the original HTML is escaped as text. `[[id|text]]` and
 * `[[id]]` and `(p.N)` can be identified anywhere in the text (including those in the code). The former is an in-page link. Click to call it.
 * `onOpen(id)`, the latter is the original anchor point; ordinary links are opened on the new window target. `$…$` is an inline formula, `$$` occupies one line
 * The last block is the interline formula, both of which use KaTeX; the `$$...$$` within a single line is calculated according to the syntax rules of remark-math.
 * Not counting between lines. The id of each header is `h-` followed by its line number in `src`. `[[id]]` When no alias is written, the text is `titles[id]`,
 * If not, it’s id. When `titles` is given, the id that is not in it is not a page in the library, and the mark remains as the original text; `titles` is not given
 * (Essay) will always be used as a link.
 */
export function Markdown({ src, onOpen, titles }: {
  src: string
  onOpen?: (id: string) => void
  titles?: Record<string, string>
}) {
  const m = useMessages()
  const parts = useMemo(() => components(onOpen, m.common.markdown.citePage, titles), [onOpen, m, titles])
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkHeadingIds]} rehypePlugins={[rehypeKatex]} components={parts}>
      {desugar(src, titles)}
    </ReactMarkdown>
  )
}

/** An entry in the directory: title level, original text, and the id of the rendered title element. */
export type Heading = { depth: number; text: string; id: string }

/**
 * The ATX headers of levels one to three in `src` are in the order of appearance; lines in fenced code blocks are not counted; the trailing `#` sequence is removed.
 * `id` is the `h-` line number, which is the same as the title element rendered by Markdown.
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
 * The same container switches between the rendering result and the original Markdown text: when `editing` is false, press Markdown to draw `text`
 * (When the string is empty, draw `empty`), when it is true, it is a piece of original text of contentEditable, focus when entering, and Esc calls `onCancel`.
 * The "Edit"/"Save" button is placed by the caller, and the `innerText` of the `box` is read when saving. `className` is appended to the container.
 */
export function MarkdownBox({ text, editing, box, onCancel, onOpen, titles, empty, className }: {
  text: string
  editing: boolean
  box: RefObject<HTMLDivElement | null>
  onCancel: () => void
  onOpen?: (id: string) => void
  titles?: Record<string, string>
  empty: ReactNode
  className?: string
}) {
  useEffect(() => { if (editing) box.current?.focus() }, [editing, box])
  const classes = `md${editing ? ' src' : ''}${className === undefined ? '' : ` ${className}`}`
  return editing
    ? (
      <div
        className={classes} contentEditable suppressContentEditableWarning ref={box}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}
      >{text}</div>
    )
    // Under exactOptionalPropertyTypes, when onOpen is not passed, it cannot be explicitly assigned to undefined, and it can only be not passed at all.
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
