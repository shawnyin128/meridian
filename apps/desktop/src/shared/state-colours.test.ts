import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every stylesheet under the renderer, as paths relative to it. */
const STYLESHEETS = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.css'))

/** Each rule of the stylesheet `path` as its selectors and its body, comments dropped. */
const rules = (path: string) => [...readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors!.split(',').map((s) => s.trim()),
  body: body!,
}))

/** The body of the rule for `selector` in `path`. @throws When no rule names `selector`. */
const bodyOf = (path: string, selector: string): string => {
  const rule = rules(path).find(({ selectors }) => selectors.includes(selector))
  if (rule === undefined) throw new Error(`${path} 里没有 ${selector} 这条规则`)
  return rule.body
}

/** The colour tokens a rule body reads, in order: every custom property outside the size, type and motion scales. */
const tokens = (body: string): string[] => [...body.matchAll(/var\((--[\w-]+)\)/g)].map(([, name]) => name!)
  .filter((name) => !/^--(?:sp|r|fs|fw|lh|row|pad|t|e)-/.test(name))

const RED = /^--(?:bad|tint-bad|bad-solid|bad-text|diff-del)$/

describe('红色只标逾期、错误和危险', () => {
  it('时间线的今天、此刻线和 P0 任务条,日历的今天,项目卡的停滞提示都不用红色', () => {
    const marks = [
      ['components/timeline/TimelineBoard.css', '.gday.today span'],
      ['components/timeline/TimelineBoard.css', '.gtoday'],
      ['components/timeline/TimelineBoard.css', '.gnow'],
      ['components/timeline/TimelineBoard.css', '.gnow::after'],
      ['components/timeline/TimelineBoard.css', '.gbar.priority-p0'],
      ['components/FieldPickers.css', '.cd.today'],
      ['routes/Projects.css', '.project-card-alert'],
    ] as const
    expect(marks.map(([path, selector]) => [selector, tokens(bodyOf(path, selector)).filter((t) => RED.test(t))]))
      .toEqual(marks.map(([, selector]) => [selector, []]))
  })

  it('逾期的任务条和里程碑仍是红色', () => {
    for (const selector of ['.gbar.overdue', '.gddl.overdue']) {
      expect(tokens(bodyOf('components/timeline/TimelineBoard.css', selector)), selector).toContain('--bad')
    }
  })

  it('时间线上今天的日期是当前项的选中样子,今天的竖线和此刻线是墨色', () => {
    expect(tokens(bodyOf('components/timeline/TimelineBoard.css', '.gday.today span'))).toEqual(['--selected', '--on-selected'])
    for (const selector of ['.gtoday', '.gnow', '.gnow::after']) {
      expect(tokens(bodyOf('components/timeline/TimelineBoard.css', selector)), selector).toEqual(['--ink'])
    }
  })
})

describe('阻塞的色调', () => {
  it('只有 ProjectControl 给阻塞上色,在每种密度下都是同一个警示色', () => {
    const coloured = STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors, body }) => (
      /(?:^|;)color:/.test(body)
        ? selectors.filter((s) => /\.blocker\b/.test(s)).map((s) => [path, s, tokens(body)])
        : []
    )))
    expect(coloured).toEqual([
      ['components/project/ProjectControl.css', '.project-control-value.blocker .project-control-text', ['--warn-text']],
    ])
  })
})

describe('拖放落点', () => {
  it('每个拖放落点的提示都用墨色和中性的选中底画', () => {
    const drop = /(?:drag-over-(?:before|after)|drop-(?:before|after)|\.paper-drop|\.attachments\.drag)(?:::?[\w-]+)*$/
    const offenders = STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors, body }) => {
      const painted = body.split(';').filter((d) => /^\s*(?:background|border|outline|box-shadow)[\w-]*:/.test(d)).join(';')
      const colours = tokens(painted).filter((t) => !/^--(?:ink|selected|content)$/.test(t))
      return colours.length === 0 ? [] : selectors.filter((s) => drop.test(s)).map((s) => `${path}  ${s}  ${colours.join(' ')}`)
    }))
    expect(offenders).toEqual([])
  })
})

describe('结论冲突', () => {
  it('冲突的结论不画红条、红底块,也不因此缩进', () => {
    const drawn = STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors, body }) => (
      /(?:^|;)(?:box-shadow|background[\w-]*|padding[\w-]*|border[\w-]*):/.test(body)
        ? selectors.filter((s) => /\.wkclaim-?-conflict\b/.test(s)).map((s) => `${path}  ${s}`)
        : []
    )))
    expect(drawn).toEqual([])
  })
})

describe('主操作的墨色实心', () => {
  it('样式表只给主按钮和输入框的发送铺墨色实心、配画布色的字,开关和步骤序号都不用', () => {
    const filled = STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors, body }) => (
      /(?:^|;)\s*background(?:-color)?:var\(--ink\)/.test(body) && /(?:^|;)\s*color:var\(--content\)/.test(body) ? selectors : []
    )))
    expect(filled.sort()).toEqual(['.btn.pri', '.send'])
  })
})

describe('强调色', () => {
  it('强调色只留给键盘焦点环:除了 tokens.css 里的 --ring,没有样式表或组件读 --accent', () => {
    const readers = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
      .filter((path) => /\.(css|tsx?)$/.test(path) && !/\.test\.tsx?$/.test(path))
      .flatMap((path) => readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
        .filter((line) => /var\(--accent[\w-]*\)/.test(line)).map((line) => `${path}  ${line.trim()}`))
    expect(readers).toEqual(['shell/tokens.css  --ring:var(--accent); --ring-width:2px; --ring-offset:2px;'])
  })
})

describe('阅读器里的高亮', () => {
  it('四种高亮色都取自 token', () => {
    const colours = ['yellow', 'green', 'blue', 'pink']
    expect(colours.map((name) => [bodyOf('routes/Reader.css', `.${name}`).split(':')[0], tokens(bodyOf('routes/Reader.css', `.${name}`))]))
      .toEqual(colours.map((name) => ['--mark', [`--hl-${name}`]]))
  })

  it('有批注的高亮保留自己的底色,批注另用一条中性的底线标出', () => {
    const fills = rules('routes/Reader.css').filter(({ selectors }) => selectors.some((s) => s.startsWith('.paper-highlight')))
    expect(fills.filter(({ body }) => /fill:none/.test(body)).map(({ selectors }) => selectors.join(',')))
      .toEqual(['.paper-highlight .paper-highlight-note'])
    expect(tokens(bodyOf('routes/Reader.css', '.paper-highlight .paper-highlight-note'))).toEqual(['--hl-note'])
  })
})
