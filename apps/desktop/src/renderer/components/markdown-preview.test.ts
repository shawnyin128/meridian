import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { markdownBlocks, renderedBlocks } from './markdown-preview.js'

/**
 * The line numbers that render in `marked`, written as `n` or `n-m`: `‸` marks the cursor, and two
 * `‸` mark the ends of a selection. The marks are not part of the source.
 */
function renderedLines(marked: string): string[] {
  const ends = [...marked.matchAll(/‸/g)].map((match, at) => match.index - at)
  const state = EditorState.create({
    doc: marked.replaceAll('‸', ''),
    selection: EditorSelection.single(ends[0]!, ends.at(-1)!),
  })
  return renderedBlocks(markdownBlocks(state.doc), state.selection).map(({ from, to }) => {
    const [first, last] = [state.doc.lineAt(from).number, state.doc.lineAt(to).number]
    return first === last ? `${first}` : `${first}-${last}`
  })
}

describe('live preview', () => {
  it('写完「# 标题」按回车,光标到了下一行,标题那行就渲染出来;光标回到标题行,它又是原文', () => {
    expect(renderedLines('# 实时标题\n‸')).toEqual(['1'])
    expect(renderedLines('# 实时‸标题\n\n正文')).toEqual(['3'])
    expect(renderedLines('‸# 实时标题')).toEqual([])
  })

  it('列表一项一项渲染:光标所在的那一项是原文,嵌套在一项里的子列表跟着那一项', () => {
    expect(renderedLines('- 甲\n- 乙‸\n- 丙')).toEqual(['1', '3'])
    expect(renderedLines('1. 一\n2. 二\n‸')).toEqual(['1', '2'])
    expect(renderedLines('- 甲\n  - 甲一\n  - 甲二\n- 乙‸')).toEqual(['1-3'])
  })

  it('一段话的几行是同一块:光标在其中一行时整段是原文,空行上谁也不占', () => {
    expect(renderedLines('第一行\n第二行‸\n\n下一段')).toEqual(['4'])
    expect(renderedLines('第一行\n第二行\n‸\n下一段')).toEqual(['1-2', '4'])
    expect(renderedLines('\n‸\n')).toEqual([])
  })

  it('代码块和公式块中间有空行也是一整块;没收口的代码块一直到末尾', () => {
    expect(renderedLines('```\na\n\nb\n```\n‸')).toEqual(['1-5'])
    expect(renderedLines('```\na\n‸\nb\n```')).toEqual([])
    expect(renderedLines('正文\n\n```\na‸\n\nb')).toEqual(['1'])
    expect(renderedLines('$$\na\n\nb\n$$\n\n正文‸')).toEqual(['1-5'])
    expect(renderedLines('正文\n$$\nx\n$$\n‸')).toEqual(['1', '2-4'])
    expect(renderedLines('行内 $$x$$ 公式\n‸')).toEqual(['1'])
  })

  it('表格和引用各是一整块', () => {
    expect(renderedLines('| a | b |\n|---|---|\n| 1 | 2 |\n‸')).toEqual(['1-3'])
    expect(renderedLines('> 引\n> 文\n‸')).toEqual(['1-2'])
  })

  it('选中一段跨过的每一块都是原文,其余照常渲染', () => {
    expect(renderedLines('# 甲\n\n‸乙\n\n丙‸\n\n丁')).toEqual(['1', '7'])
  })
})
