import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser')
const NON_ENGLISH_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/u
const ROOT = process.cwd()
const CODE_EXTENSIONS = new Set([
  '.bash', '.c', '.cjs', '.cpp', '.css', '.go', '.h', '.hpp', '.html', '.java', '.js',
  '.jsx', '.kt', '.less', '.mjs', '.ps1', '.py', '.rs', '.scss', '.sh', '.sql', '.svelte',
  '.swift', '.toml', '.ts', '.tsx', '.vue', '.yaml', '.yml', '.zsh',
])
const JS_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx'])
const CSS_EXTENSIONS = new Set(['.css', '.less', '.scss'])
const HASH_EXTENSIONS = new Set(['.bash', '.ps1', '.sh', '.toml', '.yaml', '.yml', '.zsh'])

function lineNumber(text, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) if (text[index] === '\n') line += 1
  return line
}

function regexComments(text, regex) {
  return [...text.matchAll(regex)].map((match) => ({ start: match.index, text: match[0] }))
}

function javascriptComments(text, filename) {
  try {
    const ast = parse(text, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      sourceFilename: filename,
      plugins: ['typescript', 'jsx', 'importAttributes'],
    })
    return (ast.comments ?? []).map((comment) => ({
      start: comment.start,
      text: text.slice(comment.start, comment.end),
    }))
  } catch (error) {
    throw new Error(`Cannot inspect comments in ${filename}: ${error.message}`)
  }
}

function hashComments(text) {
  const comments = []
  let quote = null
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\n') {
      quote = null
      escaped = false
      continue
    }
    if (escaped) {
      escaped = false
      continue
    }
    if (quote && char === '\\') {
      escaped = true
      continue
    }
    if (char === '"' || char === "'") {
      if (quote === char) quote = null
      else if (quote === null) quote = char
      continue
    }
    if (char !== '#' || quote !== null) continue
    const end = text.indexOf('\n', index)
    comments.push({ start: index, text: text.slice(index, end < 0 ? text.length : end) })
    index = end < 0 ? text.length : end
  }
  return comments
}

function htmlComments(text, filename) {
  const comments = regexComments(text, /<!--[\s\S]*?-->/g)
  for (const match of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const body = match[1]
    const bodyStart = match.index + match[0].indexOf(body)
    for (const comment of regexComments(body, /\/\*[\s\S]*?\*\//g)) {
      comments.push({ start: bodyStart + comment.start, text: comment.text })
    }
  }
  for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1]
    if (/type\s*=\s*["']application\/json["']/i.test(attributes)) continue
    const body = match[2]
    const bodyStart = match.index + match[0].indexOf(body)
    for (const comment of javascriptComments(body, filename)) {
      comments.push({ start: bodyStart + comment.start, text: comment.text })
    }
  }
  return comments
}

function commentsFor(file, text) {
  const ext = path.extname(file).toLowerCase()
  if (JS_EXTENSIONS.has(ext)) return javascriptComments(text, file)
  if (CSS_EXTENSIONS.has(ext)) return regexComments(text, /\/\*[\s\S]*?\*\//g)
  if (ext === '.html' || ext === '.vue' || ext === '.svelte') return htmlComments(text, file)
  if (HASH_EXTENSIONS.has(ext)) return hashComments(text)
  if (['.c', '.cpp', '.go', '.h', '.hpp', '.java', '.kt', '.rs', '.sql', '.swift'].includes(ext)) {
    return [
      ...regexComments(text, /\/\*[\s\S]*?\*\//g),
      ...regexComments(text, /^\s*\/\/[^\n]*/gm),
    ]
  }
  return []
}

const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: ROOT,
  encoding: 'utf8',
}).split('\0').filter(Boolean)
const files = listed.filter((file) => (
  CODE_EXTENSIONS.has(path.extname(file).toLowerCase()) && fs.existsSync(path.join(ROOT, file))
))
const failures = []

for (const file of files.filter((candidate) => path.extname(candidate).toLowerCase() !== '.py')) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
  for (const comment of commentsFor(file, text)) {
    if (NON_ENGLISH_SCRIPT.test(comment.text)) {
      failures.push(`${file}:${lineNumber(text, comment.start)}: comment must be written in English`)
    }
  }
}

const pythonFiles = files.filter((file) => path.extname(file).toLowerCase() === '.py')
if (pythonFiles.length > 0) {
  const pythonCheck = String.raw`
import ast
import io
import pathlib
import re
import sys
import tokenize

non_english_script = re.compile(
    r'[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]'
)
for name in sys.argv[1:]:
    path = pathlib.Path(name)
    source = path.read_text(encoding='utf-8')
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            if token.type == tokenize.COMMENT and non_english_script.search(token.string):
                print(f'{name}:{token.start[0]}: comment must be written in English')
        tree = ast.parse(source, filename=name)
        for node in ast.walk(tree):
            body = getattr(node, 'body', None)
            if not body or not isinstance(body[0], ast.Expr):
                continue
            value = body[0].value
            if (
                isinstance(value, ast.Constant)
                and isinstance(value.value, str)
                and non_english_script.search(value.value)
            ):
                print(f'{name}:{body[0].lineno}: docstring must be written in English')
    except (SyntaxError, tokenize.TokenError) as error:
        print(f'{name}:1: cannot inspect Python comments: {error}')
`
  const checked = spawnSync(process.env.PYTHON ?? 'python', ['-c', pythonCheck, ...pythonFiles], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (checked.error) throw checked.error
  if (checked.stdout.trim()) failures.push(...checked.stdout.trim().split('\n'))
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`Checked ${files.length} code files: all comments are English.`)
