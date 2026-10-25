import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { declarations, lineNumber, numbers } from './check-css-literals.mjs'

const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser')

const RENDERER = path.join(import.meta.dirname, '..', 'apps/desktop/src/renderer')
export const RATCHET = path.join(import.meta.dirname, 'screen-css-ratchet.txt')

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g
const CLASS = /\.(-?[_a-zA-Z][\w-]*)/g
const CLASS_WORD = /^-?[_a-zA-Z][\w-]*$/
/** The properties that place an element: display, grid and flex placement, alignment, gaps, sizes, position, containers. */
const PLACEMENT = new RegExp('^(display|grid(-template(-(columns|rows|areas))?|-auto-(flow|columns|rows)|-area|-(column|row)(-(start|end))?)?'
  + '|order|(align|justify|place)-(items|content|self)|flex(-(grow|shrink|basis|direction|wrap|flow))?|(row-|column-)?gap'
  + '|(min-|max-)?(width|height|inline-size|block-size)|position|top|right|bottom|left|inset(-(inline|block)(-(start|end))?)?'
  + '|z-index|container(-(type|name))?)$')
/** The placement properties that place an element in its parent without laying out its own content. */
const ITEM_PLACEMENT = new RegExp('^(grid-area|grid-(column|row)(-(start|end))?|order|(align|justify|place)-self|flex(-(grow|shrink|basis))?'
  + '|(min-|max-)?(width|height|inline-size|block-size)|position|top|right|bottom|left|inset(-(inline|block)(-(start|end))?)?'
  + '|z-index|container(-(type|name))?)$')
/** The placement properties whose lengths come from tokens. */
const LENGTHS = new RegExp('^(grid(-template(-(columns|rows))?|-auto-(columns|rows))?|flex(-basis)?|(row-|column-)?gap'
  + '|(min-|max-)?(width|height|inline-size|block-size)|top|right|bottom|left|inset(-(inline|block)(-(start|end))?)?)$')
/** Units that scale with a container or the viewport instead of fixing a length. */
const RELATIVE_UNITS = new Set(['', '%', 'fr', 'vw', 'vh', 'vmin', 'vmax', 'dvw', 'dvh', 'svw', 'svh', 'lvw', 'lvh',
  'cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax'])
const PSEUDO_ELEMENT = /::|:(before|after|first-line|first-letter)(?![\w-])/
/** A pseudo-class or attribute that holds an element's interactive state. */
const STATE = new RegExp(':(hover|focus|focus-visible|focus-within|active|checked|disabled|enabled|visited|target|placeholder-shown'
  + '|invalid|valid|indeterminate|open|popover-open|read-only|read-write|required|optional|user-invalid|user-valid|autofill'
  + '|in-range|out-of-range)(?![\\w-])'
  + '|\\[\\s*(aria-[\\w-]+|data-(state|highlighted|disabled|selected|active|checked|pressed|open|dragging|current)|hidden|open'
  + '|disabled|checked|selected)\\s*([~|^$*]?=|\\])')
const GROUPS = [
  ['custom property', /^--/],
  ['colour and background', /^(color|background(-[a-z-]+)?|fill|stroke(-[a-z-]+)?|accent-color|caret-color|-webkit-text-fill-color|-webkit-tap-highlight-color|color-scheme)$/],
  ['border, outline, radius and shadow', /^(border(-[a-z-]+)?|outline(-[a-z-]+)?|box-shadow)$/],
  ['padding and margin', /^(padding|margin|scroll-padding|scroll-margin)(-[a-z-]+)?$/],
  ['font and text', /^(font(-[a-z-]+)?|line-height|letter-spacing|word-spacing|text-[a-z-]+|white-space(-collapse)?|word-break|overflow-wrap|word-wrap|hyphens|vertical-align|(-webkit-)?line-clamp|-webkit-box-orient|tab-size|list-style(-[a-z-]+)?|-webkit-font-smoothing|-moz-osx-font-smoothing|direction|writing-mode)$/],
  ['opacity, motion and effects', /^(opacity|transition(-[a-z-]+)?|animation(-[a-z-]+)?|(-webkit-)?(backdrop-)?filter|mix-blend-mode|(-webkit-)?mask(-[a-z-]+)?|transform(-[a-z-]+)?|translate|rotate|scale|clip-path|will-change)$/],
  ['placement', PLACEMENT],
  ['other', /(?:)/],
]

/**
 * The domain views, which keep their own drawing: in these screen stylesheets a rule whose element is
 * one of the listed drawing classes may set visual properties. Any other rule in them (on a shared
 * component's class, a row, a heading, a button, a menu, a panel, a field or a tag) stays a violation,
 * and so does a listed class that a shared stylesheet or a shared component's source draws.
 */
export const DOMAIN_DRAWING = {
  'components/timeline/TimelineBoard.css': {
    reason: 'The timeline board lays tasks and milestones on a dated scale, which no list or table draws.',
    groups: [
      { reason: 'the canvas, its day and hour scale, and the gridlines and stripes under it',
        classes: ['gcanvas', 'gdays', 'gday', 'gtime', 'gtimecell', 'gdatecell', 'gstripe'] },
      { reason: 'the lanes that bars and milestones lie in', classes: ['grow'] },
      { reason: 'task bars, the title beside a one-day bar, and the stub of a bar outside the period',
        classes: ['gbar', 'gbar-aside', 'gstub'] },
      { reason: 'milestone diamonds', classes: ['gddl'] },
      { reason: 'the today and now lines', classes: ['gtoday', 'gnow'] },
    ],
  },
  'components/project/ResearchGraph.css': {
    reason: 'The research graph draws research nodes and the edges between them as SVG on a canvas that pans and zooms.',
    groups: [
      { reason: 'edges, those on the active path, and the flow along it', classes: ['redges', 'active', 'active-edge-flows'] },
      { reason: 'nodes: their box, hover box, label, status dot and the idea pattern',
        classes: ['rgn', 'rgn-box', 'rgn-hover', 'rgn-label', 'nd', 'idea-node-pattern-base', 'idea-node-pattern-stripe'] },
    ],
  },
  'routes/Reader.css': {
    reason: 'The reader renders PDF pages with pdf.js and draws its text layer and the reader\'s marks over them.',
    groups: [
      { reason: 'the zoomed sheet and the paper page', classes: ['pdfsheet', 'pdfpagebox'] },
      { reason: "pdf.js's text layer, copied from the pdfjs-dist viewer stylesheet",
        classes: ['textLayer', 'markedContent', 'highlight', 'endOfContent'] },
      { reason: 'the highlight and selection marks drawn over the page',
        classes: ['paper-highlights', 'paper-selection', 'paper-highlight', 'paper-selected', 'paper-highlight-outline', 'paper-highlight-note'] },
      { reason: 'the highlight colours a mark takes', classes: ['yellow', 'green', 'blue', 'pink'] },
    ],
  },
}

/**
 * Which layer a renderer stylesheet belongs to. Shared: the flat `components/*.css` and the token
 * layer `shell/tokens.css`. Screen: every other stylesheet, that is `routes/*.css`, the feature folders
 * `components/<feature>/*.css` and `shell/AppShell.css`.
 * @param file A path relative to the renderer, with `/` separators.
 * @returns `'shared'`, `'screen'`, or `null` for a file that is not a stylesheet.
 */
export function stylesheetLayer(file) {
  if (!file.endsWith('.css')) return null
  return /^components\/[^/]+\.css$/.test(file) || file === 'shell/tokens.css' ? 'shared' : 'screen'
}

/** Every block of declarations in a stylesheet whose comments are blanked, with the at-rules around it. */
function blocks(text) {
  const found = []
  const open = []
  let quote = null
  let boundary = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== null) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
    } else if (char === '"' || char === "'") quote = char
    else if (char === '{') {
      if (open.length > 0) open.at(-1).nested = true
      open.push({ prelude: squeeze(text.slice(boundary, index)), start: index + 1, nested: false })
      boundary = index + 1
    } else if (char === '}') {
      const block = open.pop()
      if (!block.nested) {
        found.push({ prelude: block.prelude, body: text.slice(block.start, index), offset: block.start, at: open.map((outer) => outer.prelude) })
      }
      boundary = index + 1
    } else if (char === ';') boundary = index + 1
  }
  return found
}

const squeeze = (text) => text.trim().replace(/\s+/g, ' ')

/** Splits `text` at the top-level occurrences of the characters `stops`, outside brackets, parentheses and quotes. */
function splitTopLevel(text, stops) {
  const parts = []
  let depth = 0
  let quote = null
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== null) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (depth === 0 && stops.includes(char)) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** Removes every `:not(…)` and `:has(…)` from a compound selector: the classes inside name other elements. */
function withoutNegationAndHas(compound) {
  let result = ''
  for (let index = 0; index < compound.length; index += 1) {
    const match = /^:(not|has)\(/.exec(compound.slice(index))
    if (match === null) {
      result += compound[index]
      continue
    }
    let depth = 0
    index += match[0].length - 1
    for (; index < compound.length; index += 1) {
      if (compound[index] === '(') depth += 1
      else if (compound[index] === ')' && --depth === 0) break
    }
  }
  return result
}

const compounds = (selector) => splitTopLevel(selector, ' >+~').filter((part) => part.trim() !== '')
const classesOf = (compound) => [...withoutNegationAndHas(compound).matchAll(CLASS)].map((match) => match[1])

/** The classes of the element a complex selector selects: those of its last compound selector. */
const subjectClasses = (selector) => classesOf(compounds(selector).at(-1) ?? '')

/** The first class of the selected element, or of its nearest ancestor with a class when it has none. */
const anchorClass = (selector) => compounds(selector).map(classesOf).findLast((classes) => classes.length > 0)?.[0]

/** Whether a module specifier imported from `file` resolves to a flat `components/<Name>` module. */
function isSharedModule(file, specifier) {
  if (!specifier.startsWith('.')) return false
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)).replace(/\.(tsx?|jsx?)$/, '')
  return /^components\/[^/]+$/.test(resolved)
}

/** The class words written as literals in a JSX attribute value; a word joined to an interpolation is left out. */
function literalClasses(node, found = []) {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) literalClasses(item, found)
    return found
  }
  if (node.type === 'StringLiteral') found.push(...node.value.split(/\s+/))
  else if (node.type === 'TemplateLiteral') {
    node.quasis.forEach((quasi, index) => {
      const words = quasi.value.cooked.split(/\s+/)
      if (index > 0 && !/^\s/.test(quasi.value.cooked)) words.shift()
      if (index < node.quasis.length - 1 && !/\s$/.test(quasi.value.cooked)) words.pop()
      found.push(...words)
    })
    literalClasses(node.expressions, found)
    return found
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') literalClasses(value, found)
  }
  return found
}

/** Every JSX opening element in `node`. */
function openingElements(node, found = []) {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) openingElements(item, found)
    return found
  }
  if (node.type === 'JSXOpeningElement') found.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') openingElements(value, found)
  }
  return found
}

const rootName = (name) => (name.type === 'JSXMemberExpression' ? rootName(name.object) : name.name)

/**
 * The classes on elements a shared component draws.
 * @returns `drawn`, every class on an element a shared stylesheet selects (not on its ancestors) and
 *   every literal class a shared component's source writes, and `passed`, every literal class a screen
 *   passes to a shared component through `className` or a `…ClassName` prop.
 */
export function sharedClasses(files) {
  const drawn = new Set()
  const passed = new Set()
  for (const [file, text] of files) {
    if (stylesheetLayer(file) === 'shared' && file.startsWith('components/')) {
      for (const block of blocks(text.replace(CSS_COMMENT, ''))) {
        for (const selector of splitTopLevel(block.prelude, ',')) for (const name of subjectClasses(selector)) drawn.add(name)
      }
    }
    if (!file.endsWith('.tsx')) continue
    const ast = parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
    const ownSource = /^components\/[^/]+\.tsx$/.test(file)
    const imported = new Set(ast.program.body
      .filter((node) => node.type === 'ImportDeclaration' && isSharedModule(file, node.source.value))
      .flatMap((node) => node.specifiers.map((specifier) => specifier.local.name)))
    for (const element of openingElements(ast.program)) {
      if (!ownSource && !imported.has(rootName(element.name))) continue
      for (const attribute of element.attributes) {
        if (attribute.type !== 'JSXAttribute' || !/^(className|[a-z][A-Za-z]*ClassName)$/.test(attribute.name.name)) continue
        for (const word of literalClasses(attribute.value)) if (CLASS_WORD.test(word)) (ownSource ? drawn : passed).add(word)
      }
    }
  }
  return { drawn, passed }
}

const writesLength = (value) => numbers(value.replace(/var\(\s*--[\w-]+/g, 'var(').replace(/(["'])[\s\S]*?\1/g, ''))
  .some((number) => !number.zero && !RELATIVE_UNITS.has(number.unit))

/** Why a declaration in a screen rule is not placement, or null when it is. */
function reasonFor(property, value, rule) {
  if (rule.keyframes) return 'keyframes'
  if (rule.pseudoElement) return 'pseudo-element'
  if (rule.state) return 'state'
  if (!PLACEMENT.test(property)) return 'not placement'
  if (property === 'display') {
    if (value === 'none' && rule.container) return null
    if (rule.shared) return 'shared component'
    return /^(inline-)?(grid|flex)$/.test(value) ? null : 'display'
  }
  if (rule.shared && !ITEM_PLACEMENT.test(property)) return 'shared component'
  return LENGTHS.test(property) && writesLength(value) ? 'literal length' : null
}

/**
 * Lists every declaration in a screen stylesheet that does more than place an element.
 *
 * A screen declaration passes only when it places: display grid or flex, grid and flex placement,
 * alignment, gaps, sizes, position and its offsets, z-index and containers, with every length from a
 * token (0, percentages, fr and viewport or container units excepted), and display:none only inside
 * `@container`. Everything else is reported: any other property (colour, background, border, outline,
 * radius, shadow, padding, margin, font and text, opacity, motion, filters, custom properties and the
 * rest), any declaration in a rule for an interactive state (`:hover`, `:focus*`, `:active`,
 * `[aria-*]`, `[data-state]` and the like), in a pseudo-element or in `@keyframes`, and, in a rule
 * whose selected element's first class is a shared component's class, any declaration that lays out
 * the element's own content (its display, gaps, alignment of its items, its grid or flex direction).
 * In a stylesheet of `DOMAIN_DRAWING`, a declaration on one of its drawing classes is reported with
 * the reason of that class's group as `domain`; every other declaration has `domain` null.
 * @param files Map from a path relative to the renderer, with `/` separators, to its text. Shared
 *   stylesheets and `.tsx` sources only tell which classes belong to shared components.
 * @returns One `{ file, line, selector, property, value, reason, group, domain }` per selector of a
 *   rule and reported declaration, in file order; `selector` is prefixed with the at-rules around it.
 */
export function screenViolations(files) {
  const { drawn, passed } = sharedClasses(files)
  const found = []
  for (const [file, raw] of files) {
    if (stylesheetLayer(file) !== 'screen') continue
    const text = raw.replace(CSS_COMMENT, (comment) => comment.replace(/[^\n]/g, ' '))
    const drawing = DOMAIN_DRAWING[file]?.groups ?? []
    for (const block of blocks(text)) {
      const at = block.at.join(' ')
      const rules = splitTopLevel(block.prelude, ',').map(squeeze).filter(Boolean).map((selector) => ({
        selector: at === '' ? selector : `${at} ${selector}`,
        keyframes: block.at.some((prelude) => /^@(-webkit-)?keyframes\b/.test(prelude)),
        container: block.at.some((prelude) => prelude.startsWith('@container')),
        pseudoElement: PSEUDO_ELEMENT.test(selector),
        state: STATE.test(selector),
        shared: drawn.has(subjectClasses(selector)[0]) || passed.has(subjectClasses(selector)[0]),
        domain: drawn.has(anchorClass(selector)) ? null
          : drawing.find((group) => group.classes.includes(anchorClass(selector)))?.reason ?? null,
      }))
      for (const declaration of declarations(block.body)) {
        const colon = declaration.text.indexOf(':')
        if (colon < 0) continue
        const name = declaration.text.slice(0, colon).trim()
        const property = name.startsWith('--') ? name : name.toLowerCase()
        const value = squeeze(declaration.text.slice(colon + 1)).replace(/\s*!important$/i, '')
        const line = lineNumber(text, block.offset + declaration.offset + declaration.text.search(/\S/))
        const group = GROUPS.find(([, pattern]) => pattern.test(property))[0]
        for (const rule of rules) {
          const reason = reasonFor(property, property.startsWith('--') ? value : value.toLowerCase(), rule)
          if (reason !== null) found.push({ file, line, selector: rule.selector, property, value, reason, group, domain: rule.domain })
        }
      }
    }
  }
  return found
}

/** One ratchet line: `file:line: selector { property }`. */
export const ratchetEntry = (violation) => `${violation.file}:${violation.line}: ${violation.selector} { ${violation.property} }`

/** A ratchet line without its line number, which stays the same when lines above it move. */
export const ratchetKey = (entry) => entry.replace(/^([^:]+):\d+:/, '$1:')

/** The entries of a ratchet file: every line but blank lines and `#` comments. */
export const parseRatchet = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'))

/**
 * Compares the current entries with the listed ones, counting repeated entries.
 * @returns `added`, current entries the list does not hold, and `fixed`, listed entries no longer current.
 */
export function ratchetDiff(found, listed) {
  const remaining = new Map()
  for (const entry of listed) remaining.set(entry, (remaining.get(entry) ?? 0) + 1)
  const added = []
  for (const entry of found) {
    const left = remaining.get(entry) ?? 0
    if (left === 0) added.push(entry)
    else remaining.set(entry, left - 1)
  }
  const fixed = listed.filter((entry) => {
    const left = remaining.get(entry) ?? 0
    if (left === 0) return false
    remaining.set(entry, left - 1)
    return true
  })
  return { added, fixed }
}

/**
 * Every stylesheet and component source under the renderer, tests excluded.
 * @returns Map from a path relative to the renderer, with `/` separators, to its text.
 */
export function rendererFiles(root = RENDERER) {
  return new Map(fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.css') || (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx'))))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort()
    .map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]))
}

function tally(violations, key) {
  const counts = new Map()
  for (const violation of violations) counts.set(violation[key], (counts.get(violation[key]) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([name, count]) => `  ${String(count).padStart(5)}  ${name}`).join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = screenViolations(rendererFiles())
  const violations = all.filter((violation) => violation.domain === null)
  const domain = all.filter((violation) => violation.domain !== null)
  const found = violations.map(ratchetEntry)
  const listed = parseRatchet(fs.readFileSync(RATCHET, 'utf8'))
  if (process.argv.includes('--update')) {
    const grown = ratchetDiff(found.map(ratchetKey), listed.map(ratchetKey)).added
    if (grown.length > 0) {
      console.error(`Not rewritten: these are not in ${path.basename(RATCHET)}, so the list would grow.\n${grown.join('\n')}`)
      process.exit(1)
    }
    const header = fs.readFileSync(RATCHET, 'utf8').split(/\r?\n/).filter((line) => line.startsWith('#'))
    fs.writeFileSync(RATCHET, `${[...header, ...found].join('\n')}\n`)
  }
  console.log(`${violations.length} declarations in screen stylesheets are not placement.`)
  console.log(`By property group:\n${tally(violations, 'group')}`)
  console.log(`By reason:\n${tally(violations, 'reason')}`)
  console.log(`By file:\n${tally(violations, 'file')}`)
  console.log(`${domain.length} more declarations are domain drawing that DOMAIN_DRAWING allows.`)
  console.log(`By domain stylesheet:\n${tally(domain, 'file')}`)
  console.log(`By drawing group:\n${tally(domain, 'domain')}`)
  const { added, fixed } = ratchetDiff(found, parseRatchet(fs.readFileSync(RATCHET, 'utf8')))
  if (added.length > 0) console.error(`Not in ${path.basename(RATCHET)}:\n${added.join('\n')}`)
  if (fixed.length > 0) console.error(`Listed in ${path.basename(RATCHET)} but gone; run with --update:\n${fixed.join('\n')}`)
  if (added.length > 0 || fixed.length > 0) process.exitCode = 1
}
