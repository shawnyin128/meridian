import { describe, expect, it } from 'vitest'
import { rendererFiles } from './check-screen-css.mjs'
import { RAW_BUTTONS, isScreenSource, rawButtonDiff, rawButtons } from './check-screen-elements.mjs'

const files = (entries) => new Map(Object.entries(entries))

describe('屏幕不画原生按钮', () => {
  it('routes/、components/<功能>/ 和 shell/ 里的原生 button 都报出来，带文件、行号和键；共享组件和测试里的不算', () => {
    const source = 'export const X = () => (\n  <div>\n    <button className="btn sm">保存</button>\n  </div>\n)\n'
    expect(rawButtons(files({
      'routes/Feed.tsx': source,
      'components/project/ProjectPlan.tsx': source,
      'shell/Sidebar.tsx': source,
      'components/Notice.tsx': source,
      'routes/Feed.test.tsx': source,
    }))).toEqual([
      { file: 'routes/Feed.tsx', line: 3, key: 'routes/Feed.tsx btn' },
      { file: 'components/project/ProjectPlan.tsx', line: 3, key: 'components/project/ProjectPlan.tsx btn' },
      { file: 'shell/Sidebar.tsx', line: 3, key: 'shell/Sidebar.tsx btn' },
    ])
  })

  it('Button、IconButton 和 ToolbarButton 不算原生按钮', () => {
    expect(rawButtons(files({
      'routes/Feed.tsx': 'export const X = () => <><Button size="regular">保存</Button><IconButton label="删除" /><ToolbarButton>打开</ToolbarButton></>',
    }))).toEqual([])
  })

  it('键是按钮自己的第一个字面类名，条件类名取它的另一支；没有类名时取外面最近一个有类名的元素', () => {
    const keys = rawButtons(files({
      'routes/Wiki.tsx': [
        'export const X = ({ on }) => (',
        '  <ul className="wktoc">',
        '    <li className={`l${on}`}><button type="button">标题</button></li>',
        '    <button className={on ? \'ctbtn on\' : \'ctbtn\'} />',
        '    <button className="  prow-open  x" />',
        '  </ul>',
        ')',
      ].join('\n'),
    })).map((button) => button.key)
    expect(keys).toEqual(['routes/Wiki.tsx wktoc > button', 'routes/Wiki.tsx ctbtn', 'routes/Wiki.tsx prow-open'])
  })

  it('清单之外的原生按钮和清单里已经不在的键都报出来', () => {
    const found = [{ file: 'routes/Feed.tsx', line: 3, key: 'routes/Feed.tsx btn' }, { file: 'routes/Ideas.tsx', line: 9, key: 'routes/Ideas.tsx idea-row-open' }]
    expect(rawButtonDiff(found, [{ reason: 'rows', keys: ['routes/Ideas.tsx idea-row-open', 'routes/Projects.tsx prow-open'] }])).toEqual({
      unlisted: ['routes/Feed.tsx:3 routes/Feed.tsx btn'], unused: ['routes/Projects.tsx prow-open'],
    })
  })

  it('清单里每一组都写明理由，每个键都落在一个屏幕源文件上', () => {
    const sources = [...rendererFiles().keys()]
    expect(RAW_BUTTONS.filter((entry) => entry.reason.trim() === '' || entry.keys.length === 0)).toEqual([])
    expect(RAW_BUTTONS.flatMap((entry) => entry.keys).filter((key) => {
      const file = key.split(' ')[0]
      return !isScreenSource(file) || !sources.includes(file)
    })).toEqual([])
  })

  it('应用里屏幕上的原生按钮都在清单里，清单里的每个键都还在用', () => {
    expect(rawButtonDiff(rawButtons(rendererFiles()))).toEqual({ unlisted: [], unused: [] })
  })
})
