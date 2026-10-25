import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { rendererFiles } from './check-screen-css.mjs'

const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser')

/**
 * The raw `<button>` elements screens may render because they are not text buttons, by screen source
 * and key (see `rawButtons`), with the reason each is no Button.
 */
export const RAW_BUTTONS = [
  { reason: 'the open part of a chip whose remove sits beside it',
    keys: ['components/ideas/IdeaRelations.tsx tagchip-open', 'components/project/ProjectSections.tsx tagchip-open'] },
  { reason: 'a link of the page contents that scrolls to its heading', keys: ['routes/Wiki.tsx wktoc > button'] },
  { reason: 'a property value that opens its editor', keys: ['routes/ProjectDetail.tsx workspace-root', 'routes/ProjectDetail.tsx pv'] },
  { reason: 'a draft row\'s field that cycles its value, drawn as the row\'s other field pills',
    keys: ['components/project/ProjectPlan.tsx din'] },
  { reason: 'an option of a radio group: a column type icon or an appearance card',
    keys: ['components/paper-table/ColumnAdd.tsx ctbtn', 'components/settings/AppearanceSettings.tsx appearance-choice'] },
  { reason: 'a menu row that turns a column on or off', keys: ['components/paper-table/ColumnMenu.tsx mi'] },
  { reason: 'a table header that sorts by its column', keys: ['components/paper-table/PaperTable.tsx thsort'] },
]

/**
 * Whether a `.tsx` source relative to the renderer is a screen: `routes/*`, the feature folders
 * `components/<feature>/*` and `shell/*`. Tests are not sources.
 */
export const isScreenSource = (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx')
  && (/^(routes|shell)\//.test(file) || /^components\/[^/]+\//.test(file))

/** The first class word of a JSX element's `className` written as a string literal, or null. */
function literalClass(element) {
  const attribute = element.openingElement.attributes
    .find((held) => held.type === 'JSXAttribute' && held.name.name === 'className')
  const value = attribute?.value
  const text = value?.type === 'StringLiteral' ? value.value
    : value?.type === 'JSXExpressionContainer' && value.expression.type === 'StringLiteral' ? value.expression.value
      : value?.type === 'JSXExpressionContainer' && value.expression.type === 'ConditionalExpression'
        && value.expression.alternate.type === 'StringLiteral' ? value.expression.alternate.value : null
  return text?.trim().split(/\s+/)[0] || null
}

/** Calls `visit` on every JSX element under `node` with the JSX elements around it, innermost last. */
function walk(node, visit, around = []) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, around)
    return
  }
  const inside = node.type === 'JSXElement' ? [...around, node] : around
  if (node.type === 'JSXElement') visit(node, around)
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') walk(value, visit, inside)
  }
}

/**
 * Every raw `<button>` element a screen source renders.
 * @param files Map from a path relative to the renderer, with `/` separators, to its text; sources
 *   that are not screens are skipped.
 * @returns One `{ file, line, key }` per element, in file order. `key` is `<file> <class>`, the
 *   element's first literal class, or `<file> <class> > button`, the first literal class of the
 *   nearest element around it, for a button that has none.
 */
export function rawButtons(files) {
  const found = []
  for (const [file, text] of files) {
    if (!isScreenSource(file)) continue
    const ast = parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
    walk(ast.program, (element, around) => {
      const { name } = element.openingElement
      if (name.type !== 'JSXIdentifier' || name.name !== 'button') return
      const own = literalClass(element)
      const outer = own === null ? around.map(literalClass).findLast((held) => held !== null) : null
      const key = own !== null ? `${file} ${own}` : `${file} ${outer ?? '(no class)'} > button`
      found.push({ file, line: element.loc.start.line, key })
    })
  }
  return found
}

/**
 * Compares the raw buttons with RAW_BUTTONS.
 * @returns `unlisted`, every raw button whose key no entry lists, as `file:line key`, and `unused`,
 *   every listed key no raw button has.
 */
export function rawButtonDiff(found, listed = RAW_BUTTONS) {
  const keys = new Set(listed.flatMap((entry) => entry.keys))
  return {
    unlisted: found.filter((button) => !keys.has(button.key)).map((button) => `${button.file}:${button.line} ${button.key}`),
    unused: [...keys].filter((key) => !found.some((button) => button.key === key)),
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const found = rawButtons(rendererFiles())
  const { unlisted, unused } = rawButtonDiff(found)
  console.log(`${found.length} raw <button> elements in screens, under ${new Set(found.map((button) => button.key)).size} listed keys.`)
  if (unlisted.length > 0) console.error(`Not in RAW_BUTTONS of ${path.basename(import.meta.filename)}; use Button or IconButton:\n${unlisted.join('\n')}`)
  if (unused.length > 0) console.error(`Listed in RAW_BUTTONS but gone:\n${unused.join('\n')}`)
  if (unlisted.length > 0 || unused.length > 0) process.exitCode = 1
}
