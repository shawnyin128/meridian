import { describe, expect, it } from 'vitest'
import { paperRuns, plainTitle } from './paper-text.js'

const text = (value: string) => ({ kind: 'text', text: value })
const math = (tex: string) => ({ kind: 'atom', atom: { math: tex } })

describe('paperRuns', () => {
  it('没有 LaTeX 的标题原样保留为一段文本', () => {
    for (const title of [
      'Attention Is All You Need', 'C++ & Rust: 50% faster?', 'GPT-4 Technical Report', '多模态投机解码',
      'Learning {0,1} codes', 'Price is $5', 'a \\ b',
    ]) {
      expect(paperRuns(title)).toEqual([text(title)])
      expect(plainTitle(title)).toBe(title)
    }
  })

  it('\\textbf、\\emph、\\textit、\\texttt 变成对应的格式', () => {
    expect(paperRuns('e\\textbf{X}ecution with \\emph{a}, \\textit{b} and \\texttt{c}')).toEqual([
      text('e'), { kind: 'bold', runs: [text('X')] }, text('ecution with '),
      { kind: 'italic', runs: [text('a')] }, text(', '), { kind: 'italic', runs: [text('b')] }, text(' and '),
      { kind: 'mono', runs: [text('c')] },
    ])
  })

  it('嵌套的命令与花括号按配对找到参数的结尾', () => {
    expect(paperRuns('\\textbf{a \\emph{b {c}} d}e')).toEqual([
      { kind: 'bold', runs: [text('a '), { kind: 'italic', runs: [text('b {c}')] }, text(' d')] }, text('e'),
    ])
  })

  it('不配对的花括号、缺参数的命令、未知命令和没闭合的公式原样显示', () => {
    for (const title of ['\\textbf{abc', 'abc}', '\\textbf abc', '\\cite{x} y', '$x', '$$x$', 'a } \\emph{']) {
      expect(paperRuns(title)).toEqual([text(title)])
    }
    expect(paperRuns('\\textbf{a \\emph{b}')).toEqual([text('\\textbf{a '), { kind: 'italic', runs: [text('b')] }])
  })

  it('公式紧挨命令时各自成段，命令的参数里也能有公式，公式里的命令留给 KaTeX', () => {
    expect(paperRuns('\\textbf{F}$\\alpha$-Net')).toEqual([{ kind: 'bold', runs: [text('F')] }, math('\\alpha'), text('-Net')])
    expect(paperRuns('\\textbf{3.2$\\times$} faster')).toEqual([
      { kind: 'bold', runs: [text('3.2'), math('\\times')] }, text(' faster'),
    ])
    expect(paperRuns('$\\textbf{x}_{i}$ and $$\\frac{a}{b}$$')).toEqual([
      math('\\textbf{x}_{i}'), text(' and '), math('\\frac{a}{b}'),
    ])
  })

  it('转义字符、~ 与连字符按 LaTeX 的意思显示', () => {
    expect(paperRuns('50\\% \\& \\$5 \\#1 a\\_b \\{x\\}')).toEqual([text('50% & $5 #1 a_b {x}')])
    expect(paperRuns('Fig.~1, 2019--2020, a---b')).toEqual([text('Fig.\u00a01, 2019–2020, a—b')])
    expect(paperRuns('$a\\$b$ \\\\$c$')).toEqual([math('a\\$b'), text(' \\\\'), math('c')])
    expect(paperRuns('\\$5 or $x$')).toEqual([text('$5 or '), math('x')])
  })
})

describe('plainTitle', () => {
  it('去掉命令与公式定界符，留下文字与公式源码', () => {
    expect(plainTitle('\\textbf{F}lux: $O(n)$ for 50\\% -- \\emph{fast}')).toBe('Flux: O(n) for 50% – fast')
  })
})
