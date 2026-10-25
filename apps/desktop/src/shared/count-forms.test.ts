import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const DESKTOP = join(import.meta.dirname, '..', '..')
const RENDERER = join(DESKTOP, 'src', 'renderer')

/** The compiler options and root files of `tsconfig.renderer.json`. */
function rendererConfig(): ts.ParsedCommandLine {
  const config = ts.getParsedCommandLineOfConfigFile(join(DESKTOP, 'tsconfig.renderer.json'), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    },
  })
  if (config === undefined) throw new Error('tsconfig.renderer.json could not be read')
  return config
}

/** Whether the type of `node` is a number or a union that holds one. */
function isNumber(checker: ts.TypeChecker, node: ts.Node): boolean {
  const type = checker.getTypeAtLocation(node)
  return (type.isUnion() ? type.types : [type]).some((part) => (part.flags & ts.TypeFlags.NumberLike) !== 0)
}

/** Whether the text `node` evaluates to carries a number: as itself, a template part, a `+` operand or a branch. */
function carriesNumber(checker: ts.TypeChecker, node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node)) return carriesNumber(checker, node.expression)
  if (ts.isTemplateExpression(node)) return node.templateSpans.some((span) => carriesNumber(checker, span.expression))
  if (ts.isConditionalExpression(node)) return carriesNumber(checker, node.whenTrue) || carriesNumber(checker, node.whenFalse)
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return carriesNumber(checker, node.left) || carriesNumber(checker, node.right)
  }
  return isNumber(checker, node)
}

const DOM_TEXT_PROPERTIES = new Set(['textContent', 'innerText', 'innerHTML', 'outerHTML', 'nodeValue'])
const DOM_TEXT_CALLS = new Set(['createTextNode', 'append', 'prepend', 'insertAdjacentText', 'insertAdjacentHTML', 'replaceChildren'])

/**
 * Every place in `files` that writes text carrying a number straight into the DOM: an assignment to
 * `textContent`, `innerText`, `innerHTML`, `outerHTML` or `nodeValue`, or a call that inserts text.
 * @returns One `path:line` per write, the path relative to `base`.
 */
function domCounts(program: ts.Program, files: readonly string[], base: string): string[] {
  const checker = program.getTypeChecker()
  return files.flatMap((file) => {
    const source = program.getSourceFile(file)!
    const found: string[] = []
    const at = (node: ts.Node) => `${relative(base, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
    const visit = (node: ts.Node) => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.left) && DOM_TEXT_PROPERTIES.has(node.left.name.text)
        && carriesNumber(checker, node.right)) found.push(at(node))
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && DOM_TEXT_CALLS.has(node.expression.name.text)
        && node.arguments.some((argument) => carriesNumber(checker, argument))) found.push(at(node))
      ts.forEachChild(node, visit)
    }
    visit(source)
    return found
  })
}

/** The one place that writes a heading's count after its text. */
const HEADING_COUNT = join(RENDERER, 'components', 'HeadingCount.tsx')

/** A text part that ends in the count separator. */
const ENDS_IN_DOT = /·\s*$/u
/** Text after a number that starts with a word, as a unit does (`3 papers`). */
const UNIT_AFTER = /^\s*[\p{L}%]/u

/**
 * Every `·` followed by a bare number in `files`: a template literal part, a JSX text or a string
 * joined with `+` that ends in `·`, followed by a number no unit word follows. That is a count written
 * after a label by hand.
 * @returns One `path:line` per count, the path relative to `base`.
 */
function handBuiltCounts(program: ts.Program, files: readonly string[], base: string): string[] {
  const checker = program.getTypeChecker()
  return files.flatMap((file) => {
    const source = program.getSourceFile(file)!
    const found: string[] = []
    const at = (node: ts.Node) => `${relative(base, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
    const visit = (node: ts.Node) => {
      if (ts.isTemplateExpression(node)) {
        const before = [node.head, ...node.templateSpans.map((span) => span.literal)]
        node.templateSpans.forEach((span, index) => {
          // A space and then another part, as `${n} ${plural}`, puts a unit after the number too.
          const unit = UNIT_AFTER.test(span.literal.text)
            || (index < node.templateSpans.length - 1 && /^\s+$/u.test(span.literal.text))
          if (ENDS_IN_DOT.test(before[index]!.text) && isNumber(checker, span.expression) && !unit) found.push(at(span.expression))
        })
      }
      if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
        const children = [...node.children]
        children.forEach((child, index) => {
          const next = children[index + 1]
          const after = children[index + 2]
          if (ts.isJsxText(child) && ENDS_IN_DOT.test(child.text) && next !== undefined && ts.isJsxExpression(next)
            && next.expression !== undefined && isNumber(checker, next.expression)
            && !(after !== undefined && ts.isJsxText(after) && UNIT_AFTER.test(after.text))) found.push(at(next))
        })
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken
        && ts.isStringLiteralLike(node.left) && ENDS_IN_DOT.test(node.left.text) && isNumber(checker, node.right)) {
        found.push(at(node.right))
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    return found
  })
}

/** A program over in-memory renderer sources at `/fixture/<name>`, type-checked with the renderer's options. */
function fixtureProgram(sources: Record<string, string>): { program: ts.Program; files: string[] } {
  const options = { ...rendererConfig().options, types: [] }
  const host = ts.createCompilerHost(options)
  const files = Object.keys(sources).map((name) => `/fixture/${name}`)
  const read = (file: string) => sources[file.replace(/^\/fixture\//, '')]
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (file, language) => {
    const text = read(file)
    return text === undefined ? getSourceFile(file, language) : ts.createSourceFile(file, text, language, true)
  }
  const fileExists = host.fileExists.bind(host)
  host.fileExists = (file) => read(file) !== undefined || fileExists(file)
  const readFile = host.readFile.bind(host)
  host.readFile = (file) => read(file) ?? readFile(file)
  return { program: ts.createProgram(files, options, host), files }
}

/** The renderer's own sources, tests excluded, in one program. */
function rendererProgram(): { program: ts.Program; files: string[] } {
  const config = rendererConfig()
  const files = config.fileNames.filter((file) => !/\.test\.tsx?$/.test(file))
  return { program: ts.createProgram(config.fileNames, config.options), files }
}

const renderer = rendererProgram()

describe('计数只有两种画法', () => {
  it('写进 DOM 的文字带数字就算手搭的计数，不带数字的文字不算', () => {
    const { program, files } = fixtureProgram({
      'more.ts': [
        'export function fold(cell: HTMLElement, hidden: number, open: boolean, name: string) {',
        '  const badge = document.createElement("button")',
        '  badge.textContent = open ? "−" : `+${hidden}`',
        '  cell.append(badge, String(name), hidden)',
        '  cell.title = `${hidden}`',
        '  badge.innerText = name',
        '}',
      ].join('\n'),
    })
    expect(domCounts(program, files, '/fixture')).toEqual(['more.ts:3', 'more.ts:4'])
  })

  it('没有哪个计数是用 document.createElement 搭出来再把数字写进 DOM 的，计数由 CountBadge 画', () => {
    expect(domCounts(renderer.program, renderer.files, RENDERER)).toEqual([])
  })

  it('· 后面跟着一个不带单位的数就是手写的计数；带单位的数和 · 后的文字都不算', () => {
    const { program, files } = fixtureProgram({
      'copy.ts': [
        'export const copy = {',
        '  title: (n: number) => `垃圾桶 · ${n}`,',
        '  group: (status: string, n: number) => `${status} · ${n}`,',
        '  middle: (n: number, at: string) => `已处理 · ${n} · ${at}`,',
        '  summary: (projects: number, intents: number) => `${projects} 个项目 · ${intents} 个启用方向`,',
        '  plural: (label: string, n: number, unit: string) => `${label} · ${n} ${unit}`,',
        '  source: (name: string) => `项目 · ${name}`,',
        '  joined: (n: number) => "笔记 · " + n,',
        '}',
      ].join('\n'),
      'heading.tsx': [
        'export const Heading = ({ kind, n, unit }: { kind: string; n: number; unit: string }) => (',
        '  <div><h2>{kind} · {n}</h2><p>{kind} · {unit}</p><p>{kind} · {n} 篇</p><p>{`${kind} · ${n}`}</p></div>',
        ')',
      ].join('\n'),
    })
    expect(handBuiltCounts(program, files, '/fixture'))
      .toEqual(['copy.ts:2', 'copy.ts:3', 'copy.ts:4', 'copy.ts:8', 'heading.tsx:2', 'heading.tsx:2'])
  })

  it('标题后的计数只由标题组件的 count 画成 · N，文案和界面代码都不手写', () => {
    const files = renderer.files.filter((file) => file !== HEADING_COUNT)
    expect(handBuiltCounts(renderer.program, files, RENDERER)).toEqual([])
  })
})
