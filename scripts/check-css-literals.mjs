import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const RENDERER = 'apps/desktop/src/renderer/'
const TOKENS = `${RENDERER}shell/tokens.css`
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g
/** The declarations of a rule, a keyframe step or a rule nested in an at-rule: a block with no block inside it. */
const BLOCK = /\{([^{}]*)\}/g
const RADIUS = /^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/
const SPACING = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(row-|column-)?gap$/
const TIME = /^(transition|animation)(-(duration|delay))?$/
/** A number with its unit; a digit inside a name such as --sp-12 or #f7f9fd is not one. */
const NUMBER = /(?<![\w.#-])-?(?:\d+\.?\d*|\.\d+)([a-z%]*)/gi
const SIZE_KEYWORD = /\b(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)\b/g
const WEIGHT_KEYWORD = /\b(normal|bold|bolder|lighter)\b/g

function lineNumber(text, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) if (text[index] === '\n') line += 1
  return line
}

/** Splits a block's body at the semicolons that end its declarations, with each declaration's offset in the body. */
function declarations(body) {
  const found = []
  let depth = 0
  let quote = null
  let start = 0
  for (let index = 0; index <= body.length; index += 1) {
    const char = body[index]
    if (quote !== null) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if ((char === ';' && depth === 0) || index === body.length) {
      found.push({ text: body.slice(start, index), offset: start })
      start = index + 1
    }
  }
  return found
}

const numbers = (text) => [...text.matchAll(NUMBER)]
  .map(([number, unit]) => ({ text: number, unit: unit.toLowerCase(), zero: Number.parseFloat(number) === 0 }))
const words = (text, keywords) => [...text.matchAll(keywords)].map((match) => match[0])

/** The literal parts of one checked declaration's value; `kind` names which rule applies. */
function literals(kind, value) {
  const bare = value.replace(/!important$/, '').replace(/var\(\s*--[\w-]+/g, 'var(').replace(/(["'])[\s\S]*?\1/g, '')
  if (kind === 'weight') return [...numbers(bare).map((n) => n.text), ...words(bare, WEIGHT_KEYWORD)]
  if (kind === 'time') return numbers(bare).filter((n) => !n.zero && (n.unit === 's' || n.unit === 'ms')).map((n) => n.text)
  if (kind === 'font') {
    const head = bare.replace(/\/\s*\S+/, '')
    return [
      ...numbers(head).filter((n) => !n.zero && n.unit !== '%').map((n) => n.text),
      ...words(head, WEIGHT_KEYWORD), ...words(head, SIZE_KEYWORD),
    ]
  }
  const hairline = (n) => kind !== 'size' && /^-?1px$/.test(n.text)
  const lengths = numbers(bare).filter((n) => !n.zero && n.unit !== '' && n.unit !== '%' && !hairline(n))
  return [...lengths.map((n) => n.text), ...(kind === 'size' ? words(bare, SIZE_KEYWORD) : [])]
}

function kindOf(property) {
  if (RADIUS.test(property)) return 'radius'
  if (SPACING.test(property)) return 'spacing'
  if (TIME.test(property)) return 'time'
  if (property === 'font-size') return 'size'
  if (property === 'font-weight') return 'weight'
  if (property === 'font') return 'font'
  return null
}

/**
 * Lists every radius, font size, font weight, duration and spacing value that a stylesheet writes as a
 * literal instead of taking it from a token of shell/tokens.css.
 *
 * Checked: border-radius and its longhands; font-size; font-weight; the size and the weight in the font
 * shorthand; the durations and delays of transition, animation and their -duration and -delay
 * longhands; padding, margin and their longhands, gap, row-gap and column-gap.
 * Allowed in those: var() without a fallback, keywords such as auto and inherit, 0 with any unit,
 * percentages, unitless numbers (a calc() factor, an animation's iteration count, the line height
 * after the slash in font), and 1px or -1px, a hairline border's width, alone or inside calc(), in
 * every checked property but font-size. A var() fallback is checked like the rest of the value.
 * Not checked, as geometry or colour: widths and heights, insets and positions, border and outline
 * widths, line heights, shadows and transforms.
 * @param files Map from a path to a stylesheet's text.
 * @returns One `path:line: property:value writes the literal …` line per declaration, in file order.
 */
export function literalValues(files) {
  const found = []
  for (const [file, raw] of files) {
    const text = raw.replace(CSS_COMMENT, (comment) => comment.replace(/[^\n]/g, ' '))
    for (const block of text.matchAll(BLOCK)) {
      const bodyStart = block.index + 1
      for (const declaration of declarations(block[1])) {
        const colon = declaration.text.indexOf(':')
        if (colon < 0) continue
        const property = declaration.text.slice(0, colon).trim().toLowerCase()
        const kind = kindOf(property)
        if (kind === null) continue
        const value = declaration.text.slice(colon + 1).trim().replace(/\s+/g, ' ')
        const parts = literals(kind, value)
        if (parts.length === 0) continue
        const at = bodyStart + declaration.offset + declaration.text.search(/\S/)
        found.push(`${file}:${lineNumber(text, at)}: ${property}:${value} writes the literal ${parts.join(', ')}`)
      }
    }
  }
  return found
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean)
  const files = new Map(listed
    .filter((file) => file.startsWith(RENDERER) && file.endsWith('.css') && file !== TOKENS && fs.existsSync(path.join(ROOT, file)))
    .map((file) => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]))
  const failures = literalValues(files)
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  } else {
    console.log(`Checked ${files.size} stylesheets: every radius, font size, weight, duration and spacing comes from a token.`)
  }
}
