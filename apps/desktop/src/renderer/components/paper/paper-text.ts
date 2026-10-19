import type { Parent, PhrasingContent, Root } from 'mdast'

/** The supported text commands and how each renders. */
const COMMANDS = new Map<string, 'bold' | 'italic' | 'mono'>([
  ['textbf', 'bold'], ['emph', 'italic'], ['textit', 'italic'], ['texttt', 'mono'],
])
/** Characters LaTeX writes behind a backslash; `\%` stands for `%`. */
const ESCAPED = new Set(['%', '&', '$', '#', '_', '{', '}'])
const LETTERS = /[a-zA-Z]+/y

/** The class of the `<code>` element `\texttt` renders as. */
export const MONO_CLASS = 'paper-text-mono'

/**
 * A piece of paper text: plain text, text under a supported command, or an `atom`, an input piece
 * that is not text (a formula in a title, a Markdown node in an abstract), passed through untouched.
 */
export type PaperRun<A> =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic' | 'mono'; runs: PaperRun<A>[] }
  | { kind: 'atom'; atom: A }

/** A run of a title, whose atoms are `$…$` formulas holding their TeX source. */
export type TitleRun = PaperRun<{ math: string }>

type Piece<A> = string | { atom: A }
type Token<A> =
  | { kind: 'text'; text: string }
  | { kind: 'command'; name: string }
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'atom'; atom: A }

/** Appends `text` to `out`, merged into its last run when that is text too. */
function pushText(out: ({ kind: string } | { kind: 'text'; text: string })[], text: string): void {
  const last = out[out.length - 1]
  if (last !== undefined && 'text' in last) last.text += text
  else out.push({ kind: 'text', text })
}

/** Splits `pieces` into tokens: text with escapes, `~` and dashes resolved, commands, braces and atoms. */
function lex<A>(pieces: readonly Piece<A>[]): Token<A>[] {
  const tokens: Token<A>[] = []
  for (const piece of pieces) {
    if (typeof piece !== 'string') {
      tokens.push({ kind: 'atom', atom: piece.atom })
      continue
    }
    let at = 0
    while (at < piece.length) {
      const char = piece[at]!
      if (char === '\\') {
        LETTERS.lastIndex = at + 1
        const name = LETTERS.exec(piece)?.[0]
        const next = piece[at + 1] ?? ''
        if (name !== undefined && COMMANDS.has(name)) tokens.push({ kind: 'command', name })
        else if (name !== undefined) pushText(tokens, `\\${name}`)
        else pushText(tokens, ESCAPED.has(next) ? next : char + next)
        at += 1 + (name ?? next).length
      } else if (char === '{' || char === '}') {
        tokens.push({ kind: char === '{' ? 'open' : 'close' })
        at += 1
      } else if (char === '~') {
        pushText(tokens, '\u00a0')
        at += 1
      } else if (piece.startsWith('---', at)) {
        pushText(tokens, '—')
        at += 3
      } else if (piece.startsWith('--', at)) {
        pushText(tokens, '–')
        at += 2
      } else {
        pushText(tokens, char)
        at += 1
      }
    }
  }
  return tokens
}

/** Turns `tokens[from, to)` into runs; `match` maps each matched `{` to its `}`. */
function build<A>(tokens: Token<A>[], match: Map<number, number>, from: number, to: number): PaperRun<A>[] {
  const runs: PaperRun<A>[] = []
  for (let at = from; at < to; at += 1) {
    const token = tokens[at]!
    const end = token.kind === 'command' ? match.get(at + 1) : undefined
    if (token.kind === 'command' && end !== undefined) {
      runs.push({ kind: COMMANDS.get(token.name)!, runs: build(tokens, match, at + 2, end) })
      at = end
    } else if (token.kind === 'command') pushText(runs, `\\${token.name}`)
    else if (token.kind === 'open' || token.kind === 'close') pushText(runs, token.kind === 'open' ? '{' : '}')
    else if (token.kind === 'text') pushText(runs, token.text)
    else runs.push(token)
  }
  return runs
}

/**
 * Parses LaTeX text commands in `pieces`: `\textbf`, `\emph`, `\textit` and `\texttt` with a braced
 * argument that may span atoms and nest, the escapes `\% \& \$ \# \_ \{ \}`, `~` as a no-break space,
 * and `--` / `---` as en and em dashes. Unbalanced braces, commands without an argument and
 * unknown commands stay as written; bare braces are kept as text.
 */
export function parsePaperText<A>(pieces: readonly Piece<A>[]): PaperRun<A>[] {
  const tokens = lex(pieces)
  const match = new Map<number, number>()
  const open: number[] = []
  tokens.forEach((token, at) => {
    if (token.kind === 'open') open.push(at)
    else if (token.kind === 'close' && open.length > 0) match.set(open.pop()!, at)
  })
  return build(tokens, match, 0, tokens.length)
}

/** Index of the next `delimiter` in `text` at or after `from` that no backslash escapes, or -1. */
function closing(text: string, delimiter: string, from: number): number {
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === '\\') at += 1
    else if (text.startsWith(delimiter, at)) return at
  }
  return -1
}

/**
 * Parses inline paper text such as a title: `$…$` and `$$…$$` are formulas, an unclosed or empty one
 * stays as written, and the rest is parsed as in `parsePaperText`.
 */
export function paperRuns(title: string): TitleRun[] {
  const pieces: Piece<{ math: string }>[] = []
  let start = 0
  for (let at = 0; at < title.length; at += 1) {
    if (title[at] === '\\') {
      at += 1
      continue
    }
    if (title[at] !== '$') continue
    const delimiter = title.startsWith('$$', at) ? '$$' : '$'
    const end = closing(title, delimiter, at + delimiter.length)
    if (end > at + delimiter.length) {
      pieces.push(title.slice(start, at), { atom: { math: title.slice(at + delimiter.length, end) } })
      start = end + delimiter.length
      at = start - 1
    } else at += delimiter.length - 1
  }
  pieces.push(title.slice(start))
  return parsePaperText(pieces)
}

const plain = (runs: TitleRun[]): string => runs.map((run) => (
  run.kind === 'text' ? run.text : run.kind === 'atom' ? run.atom.math : plain(run.runs)
)).join('')

/** `title` as plain text for tooltips, aria labels, breadcrumbs and notices: commands resolved, formulas as TeX. */
export function plainTitle(title: string): string {
  return plain(paperRuns(title))
}

const toMdast = (runs: PaperRun<PhrasingContent>[]): PhrasingContent[] => runs.map((run): PhrasingContent => {
  switch (run.kind) {
    case 'text': return { type: 'text', value: run.text }
    case 'atom': return run.atom
    case 'bold': return { type: 'strong', children: toMdast(run.runs) }
    case 'italic': return { type: 'emphasis', children: toMdast(run.runs) }
    case 'mono': return {
      type: 'emphasis', data: { hName: 'code', hProperties: { className: [MONO_CLASS] } }, children: toMdast(run.runs),
    }
  }
})

/**
 * remark plugin: parses the children of every node as `parsePaperText` does, so a command's argument
 * may enclose sibling nodes such as a formula. Code and formulas are not text and stay untouched.
 */
export function remarkPaperText() {
  const visit = (node: Parent): void => {
    node.children.forEach((child) => { if ('children' in child) visit(child) })
    if (!node.children.some((child) => child.type === 'text')) return
    // Text only occurs in phrasing content, so every sibling of a text node is phrasing content too.
    node.children = toMdast(parsePaperText((node.children as PhrasingContent[]).map((child) => (
      child.type === 'text' ? child.value : { atom: child }))))
  }
  return (tree: Root) => visit(tree)
}
