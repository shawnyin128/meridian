import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const CSS_EXTENSIONS = new Set(['.css'])
const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx'])
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g
const USE = /var\(\s*(--[\w-]+)/g
const CSS_DEFINITION = /(?<![\w-])(--[\w-]+)\s*:/g
/** A style object key such as `'--rrw':` or `['--sbw']:`, or `setProperty('--scale-factor', …)`. */
const SCRIPT_DEFINITION = /(['"`])(--[\w-]+)\1\s*\]?\s*:|setProperty\(\s*(['"`])(--[\w-]+)\3/g

function lineNumber(text, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) if (text[index] === '\n') line += 1
  return line
}

/**
 * Lists every `var(--name)` whose custom property is defined nowhere.
 * @param files Map from a repo-relative path to its text. A `.css` file defines what it declares
 *   outside comments; a `.ts` or `.tsx` file defines the style keys and `setProperty` names it writes.
 * @param external Names a dependency writes at runtime, such as Radix's `--radix-*`.
 * @returns One `path:line: --name is used but never defined` line per use, in file order.
 */
export function undefinedProperties(files, external = new Set()) {
  const defined = new Set(external)
  const uses = []
  for (const [file, raw] of files) {
    const css = CSS_EXTENSIONS.has(path.extname(file))
    const text = css ? raw.replace(CSS_COMMENT, (comment) => comment.replace(/[^\n]/g, ' ')) : raw
    for (const match of text.matchAll(css ? CSS_DEFINITION : SCRIPT_DEFINITION)) {
      defined.add(css ? match[1] : match[2] ?? match[4])
    }
    for (const match of text.matchAll(USE)) uses.push({ file, text, offset: match.index, name: match[1] })
  }
  return uses
    .filter((use) => !defined.has(use.name))
    .map((use) => `${use.file}:${lineNumber(use.text, use.offset)}: ${use.name} is used but never defined`)
}

/** The `--radix-*` names the installed Radix primitives write on the elements they render. */
function radixProperties() {
  const scope = path.join(ROOT, 'node_modules', '@radix-ui')
  const names = new Set()
  for (const entry of fs.readdirSync(scope)) {
    const bundle = path.join(scope, entry, 'dist', 'index.mjs')
    if (!fs.existsSync(bundle)) continue
    for (const match of fs.readFileSync(bundle, 'utf8').matchAll(/["'](--radix-[\w-]+)["']/g)) names.add(match[1])
  }
  return names
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean)
  const files = new Map(listed
    .filter((file) => {
      const ext = path.extname(file)
      return (CSS_EXTENSIONS.has(ext) || SCRIPT_EXTENSIONS.has(ext)) && fs.existsSync(path.join(ROOT, file))
    })
    .map((file) => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]))
  const failures = undefinedProperties(files, radixProperties())
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exit(1)
  }
  console.log(`Checked ${files.size} stylesheet and script files: every var() names a defined custom property.`)
}
