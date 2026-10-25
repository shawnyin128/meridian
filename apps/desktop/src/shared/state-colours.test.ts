import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { zh } from '../renderer/messages/zh/index.js'
import { projectDecisionItems, projectPulseSignal, type ProjectSignalSource } from './project-signals.js'
import { ACTIVE_PROJECT } from './vocabulary.js'

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
  it('时间线的今天、此刻线和 P0 任务条,日历的今天,停滞提示都不用红色', () => {
    const marks = [
      ['components/timeline/TimelineBoard.css', '.gday.today span'],
      ['components/timeline/TimelineBoard.css', '.gtoday'],
      ['components/timeline/TimelineBoard.css', '.gnow'],
      ['components/timeline/TimelineBoard.css', '.gnow::after'],
      ['components/timeline/TimelineBoard.css', '.gbar.priority-p0'],
      ['components/FieldPickers.css', '.cd.today'],
      ['components/Tag.css', '.tag--warn'],
    ] as const
    expect(marks.map(([path, selector]) => [selector, tokens(bodyOf(path, selector)).filter((t) => RED.test(t))]))
      .toEqual(marks.map(([, selector]) => [selector, []]))
  })

  it('逾期的任务条和里程碑仍是红色', () => {
    for (const selector of ['.gbar.overdue', '.gddl.overdue']) {
      expect(tokens(bodyOf('components/timeline/TimelineBoard.css', selector)), selector).toContain('--bad')
    }
  })

  it('时间线上今天的日期是当前项的选中样子,今天的竖线和此刻线是强调色', () => {
    expect(tokens(bodyOf('components/timeline/TimelineBoard.css', '.gday.today span'))).toEqual(['--selected', '--on-selected'])
    for (const selector of ['.gtoday', '.gnow', '.gnow::after']) {
      expect(tokens(bodyOf('components/timeline/TimelineBoard.css', selector)), selector).toEqual(['--accent'])
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

describe('停滞的色调', () => {
  it('推进停滞在需要注意和项目推进里与项目卡上一样,是共用 Tag 的警示色', () => {
    const stalled: ProjectSignalSource = { status: ACTIVE_PROJECT, conclusions: { conflicting: 0 }, milestones: [], lastProgress: '2026-10-01' }
    expect(projectDecisionItems(stalled, '2026-10-23', zh.project.signals).map(({ id, tone }) => [id, tone]))
      .toEqual([['stale', 'warn']])
    expect(projectPulseSignal(stalled, '2026-10-23', zh.project.signals).tone).toBe('warn')
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

describe('错误', () => {
  it('错误只用共享的错误框:组件不写没有样式的 err 类,样式表也不为它留规则', () => {
    const offenders = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
      .filter((path) => /\.(css|tsx)$/.test(path) && !/\.test\./.test(path))
      .filter((path) => {
        const text = readFileSync(join(RENDERER, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
        return path.endsWith('.css') ? /\.err(?![\w-])/.test(text) : /className="(?:[^"]*\s)?err(?:\s[^"]*)?"/.test(text)
      })
    expect(offenders).toEqual([])
  })
})

describe('状态色', () => {
  /** The stylesheets that own a state colour, each with what it marks there. */
  const OWNERS: Record<string, string> = {
    'components/InlineMessage.css': 'errors, warnings and notes shown in place, as a line or on their tint',
    'components/Notice.css': "a notice's success or refusal icon",
    'components/IconButton.css': 'a danger icon action under the pointer',
    'components/Button.css': "a danger button's soft fill",
    'components/ActionMenu.css': 'a danger menu item',
    'components/FirstRunChecklist.css': "a finished first-run step's check",
  }

  /**
   * The state colours outside an owner that another open issue moves, as `<path>  <selector>  <property>`,
   * each with that issue. The list only shrinks.
   */
  const PENDING: Record<string, string> = {
    'components/paper-table/PaperTable.css  .ptable th.column-moving  background': '#567, the drag feedback of a column',
    'components/project/ProjectPlan.css  50%  background': '#578, the landing flash of a plan row',
    'shell/tokens.css  .ddlrow.flash  background': '#578, the landing flash of a plan row',
    'routes/ResearchOverview.css  .ovstat.bad b  color': 'the Overview stat tiles, which the catalog has no row for',
  }

  /** Every declaration that writes text in --bad, --warn or --good, or lays a --tint-* fill, as `<path>  <selector>  <property>`. */
  const stateColours = () => STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors, body }) => body.split(';')
    .map((declaration) => /^\s*(color|background(?:-color|-image)?)\s*:(.*)$/s.exec(declaration))
    .filter((match) => match !== null && (match[1] === 'color'
      ? /var\(--(?:bad|warn|good)\s*[,)]/.test(match[2]!)
      : /var\(--tint-[\w-]+/.test(match[2]!)))
    .flatMap((match) => selectors.map((selector) => `${path}  ${selector}  ${match![1]}`))))

  it('错误、警告和完成的颜色只在它们的共享组件里:别的样式表不把字写成 --bad、--warn、--good,也不铺 --tint-* 的底', () => {
    expect(stateColours().filter((found) => !(found.split('  ')[0]! in OWNERS) && !(found in PENDING))).toEqual([])
  })

  it('留给别的议题的状态色都还在:挪走的从清单里删掉', () => {
    const found = new Set(stateColours())
    expect(Object.keys(PENDING).filter((entry) => !found.has(entry))).toEqual([])
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

describe('实心强调色', () => {
  it('样式表只给主按钮和输入框的发送铺实心强调色,开关和步骤序号都不用', () => {
    const filled = STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors, body }) => (
      /(?:^|;)\s*background(?:-color)?:var\(--accent-solid\)/.test(body) ? selectors : []
    )))
    expect(filled.sort()).toEqual(['.btn.pri', '.send'])
  })
})

describe('计数', () => {
  it('计数只有一种样子:样式表里没有计数徽标的变体', () => {
    const variants = STYLESHEETS.flatMap((path) => rules(path).flatMap(({ selectors }) => selectors
      .filter((s) => /\.count-badge-[\w-]/.test(s)).map((s) => `${path}  ${s}`)))
    expect(variants).toEqual([])
  })
})

describe('强调色', () => {
  /**
   * The only rules that may read an accent token, by what the accent marks there: what to act on (the
   * primary and the send), what is selected (the current sidebar row, the picked segment, a checked
   * menu item, an on chip toggle, a list's selected row or card and the selected highlight card),
   * what is on or running (an on switch, the running ring, a progress fill) and today on the
   * timeline. The focus ring reads --ring.
   */
  const ACCENT = [
    'components/ActionMenu.css  .mi .ck', 'components/Button.css  .btn.pri',
    'components/ChipToggles.css  .chip-toggle[data-state="on"]', 'components/NavRow.css  .nav-row.on', 'components/ProgressFill.css  .progress-fill>span',
    'components/ResearchObjectCard.css  .research-object-card.selected', 'components/SegmentedControl.css  .segmented-control>button[data-state="on"]',
    'components/StructuredList.css  .structured-row--selected', 'components/Switch.css  .switch[data-state="checked"]',
    'components/chat/Chat.css  .send', 'components/icons.css  .ring',
    'components/paper-table/PaperTable.css  .ptable tbody tr.selected', 'components/paper-table/PaperTable.css  .ptable tbody tr.selected .pt-title',
    'components/timeline/TimelineBoard.css  .gnow', 'components/timeline/TimelineBoard.css  .gnow::after',
    'components/timeline/TimelineBoard.css  .gtoday', 'routes/Reader.css  .reading-card.selected',
  ]

  it('强调色只标选中的和正在执行的:主操作、侧栏的当前行、选中的分段、勾上的菜单项、开着的标签开关、列表里选中的行和卡片、选中的高亮卡片、开着的开关、运行中的圈、进度和时间线的今天;链接、标签、计数和别的规则都不读', () => {
    const readers = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
      .filter((path) => /\.(css|tsx?)$/.test(path) && !/\.test\.tsx?$/.test(path))
      .flatMap((path) => (path.endsWith('.css')
        ? rules(path).filter(({ selectors, body }) => /var\(--accent[\w-]*\)/.test(body) && !selectors.some((s) => /^(?::root|\[data-theme="dark"\])$/.test(s)))
          .flatMap(({ selectors }) => selectors.map((s) => `${path}  ${s}`))
        : /var\(--accent[\w-]*\)/.test(readFileSync(join(RENDERER, path), 'utf8')) ? [`${path}  (script)`] : []))
    expect(readers.sort()).toEqual(ACCENT)
    expect(readFileSync(join(RENDERER, 'shell/tokens.css'), 'utf8')).toMatch(/--ring:var\(--accent\);/)
  })

  it('选中的东西用强调色:列表里选中的行和卡片、选中的高亮卡片和开着的标签开关都是侧栏当前行的浅强调底配强调色的字,选中的分段字用强调色,勾和运行中的圈用强调色的记号色', () => {
    const current = tokens(bodyOf('components/NavRow.css', '.nav-row.on'))
    expect(current).toEqual(['--accent-soft', '--accent-text'])
    for (const [path, selector] of [
      ['components/StructuredList.css', '.structured-row--selected'], ['components/ResearchObjectCard.css', '.research-object-card.selected'],
      ['routes/Reader.css', '.reading-card.selected'], ['components/ChipToggles.css', '.chip-toggle[data-state="on"]'],
    ] as const) expect(tokens(bodyOf(path, selector)), selector).toEqual(current)
    expect(tokens(bodyOf('components/paper-table/PaperTable.css', '.ptable tbody tr.selected'))).toEqual(['--accent-soft'])
    expect(tokens(bodyOf('components/paper-table/PaperTable.css', '.ptable tbody tr.selected .pt-title'))).toEqual(['--accent-text'])
    expect(tokens(bodyOf('components/SegmentedControl.css', '.segmented-control>button[data-state="on"]'))).toEqual(['--accent-text'])
    for (const [path, selector] of [['components/ActionMenu.css', '.mi .ck'], ['components/icons.css', '.ring']] as const) {
      expect(tokens(bodyOf(path, selector)), selector).toEqual(['--accent-mark'])
    }
  })

  it('链接、侧栏的图标、关注行的未读点和研究地图的阅读点都是中性的', () => {
    expect(bodyOf('components/EntityLink.css', '.entity-link')).toMatch(/(?:^|;)color:inherit(?:;|$)/)
    expect(tokens(bodyOf('components/EntityLink.css', '.entity-link:hover'))).toEqual(['--ink'])
    expect(tokens(bodyOf('components/NavRow.css', '.nav-row-icon'))).toEqual(['--sec'])
    expect(readFileSync(join(RENDERER, 'shell/Sidebar.tsx'), 'utf8')).toMatch(/<StatusDot tone="neutral" fill=\{fresh \? 'full' : 'ring'\} \/>/)
    expect(readFileSync(join(RENDERER, 'components/ReadDots.tsx'), 'utf8')).toMatch(/<StatusDot key=\{index\} tone="neutral"/)
    expect(tokens(bodyOf('components/StatusDot.css', '.status-dot--neutral'))).toEqual(['--ter'])
  })
})

describe('阅读器里的高亮', () => {
  it('四种高亮色都取自 token', () => {
    const colours = ['yellow', 'green', 'blue', 'pink']
    expect(colours.map((name) => [bodyOf('routes/Reader.css', `.${name}`).split(':')[0], tokens(bodyOf('routes/Reader.css', `.${name}`))]))
      .toEqual(colours.map((name) => ['--mark', [`--hl-${name}`]]))
  })

  it('有批注的高亮保留自己的底色,批注另用一条中性的底线标出;单击选中的高亮的轮廓也只用这种中性色', () => {
    const fills = rules('routes/Reader.css').filter(({ selectors }) => selectors.some((s) => s.startsWith('.paper-highlight')))
    expect(fills.filter(({ body }) => /fill:none/.test(body)).map(({ selectors }) => selectors.join(',')).sort())
      .toEqual(['.paper-highlight .paper-highlight-note', '.paper-highlight-outline path'])
    expect(tokens(bodyOf('routes/Reader.css', '.paper-highlight .paper-highlight-note'))).toEqual(['--hl-note'])
    expect(tokens(bodyOf('routes/Reader.css', '.paper-highlight-outline path'))).toEqual(['--hl-note'])
  })
})
