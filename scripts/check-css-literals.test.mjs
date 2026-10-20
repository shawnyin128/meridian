import { describe, expect, it } from 'vitest'
import { literalValues } from './check-css-literals.mjs'

const files = (entries) => new Map(Object.entries(entries))

describe('样式表里写死的尺寸检查', () => {
  it('报告写死的圆角、字号、字重、时长和间距，带文件和行号', () => {
    const found = literalValues(files({
      'routes/Feed.css': '.fitem{\n  border-radius:10px;font-size:12px;\n  font-weight:600;padding:12px var(--sp-16)}',
      'components/CardTray.css': '.tray{transition:opacity .2s var(--e-out);transition-delay:70ms}\n.row{gap:7px;margin:-4px 0}',
    }))
    expect(found).toEqual([
      'routes/Feed.css:2: border-radius:10px writes the literal 10px',
      'routes/Feed.css:2: font-size:12px writes the literal 12px',
      'routes/Feed.css:3: font-weight:600 writes the literal 600',
      'routes/Feed.css:3: padding:12px var(--sp-16) writes the literal 12px',
      'components/CardTray.css:1: transition:opacity .2s var(--e-out) writes the literal .2s',
      'components/CardTray.css:1: transition-delay:70ms writes the literal 70ms',
      'components/CardTray.css:2: gap:7px writes the literal 7px',
      'components/CardTray.css:2: margin:-4px 0 writes the literal -4px',
    ])
  })

  it('0、auto、百分比、1px 细线和只由变量与无单位数组成的 calc() 都不算写死', () => {
    const found = literalValues(files({
      'components/StructuredList.css': [
        '.list{border-radius:calc(var(--r-card) - 1px);padding:0;margin:0 auto;gap:var(--sp-4) var(--sp-8)}',
        '.dot{border-radius:50%;margin-inline:calc(-1 * var(--ring-room));padding:calc(var(--sp-2) - 1px)}',
        '.tray{transition:opacity var(--t) var(--e-out);transition-delay:0ms;font-size:inherit;font-weight:inherit}',
        '.flash{animation:flash var(--t-flash) var(--e-inout) 2}',
      ].join('\n'),
    }))
    expect(found).toEqual([])
  })

  it('calc() 里带单位的数、var() 的回退值和字号关键字都算写死', () => {
    const found = literalValues(files({
      'components/ClearableInput.css': [
        '.field{padding-left:calc(var(--sp-10) + 13px)}',
        '.grid{gap:var(--gap,8px)}',
        '.note{font-size:smaller;font-weight:bold}',
      ].join('\n'),
    }))
    expect(found).toEqual([
      'components/ClearableInput.css:1: padding-left:calc(var(--sp-10) + 13px) writes the literal 13px',
      'components/ClearableInput.css:2: gap:var(--gap,8px) writes the literal 8px',
      'components/ClearableInput.css:3: font-size:smaller writes the literal smaller',
      'components/ClearableInput.css:3: font-weight:bold writes the literal bold',
    ])
  })

  it('font 简写里的字号和字重要来自变量，斜杠后的行高不查', () => {
    const found = literalValues(files({
      'components/Tag.css': '.key{font:var(--fs-cap)/1 var(--mono)}\n.code{font:600 12px/1.4 var(--mono)}\n.x{font:inherit}',
    }))
    expect(found).toEqual(['components/Tag.css:2: font:600 12px/1.4 var(--mono) writes the literal 600, 12px'])
  })

  it('只查圆角、字号、字重、时长和间距：宽高、定位、边框和描边这些几何值不查', () => {
    const found = literalValues(files({
      'shell/AppShell.css': '.titlebar{height:50px;width:260px;top:12px;border:1px solid var(--sep);outline-offset:-1px;box-shadow:0 1px 2px #000}',
    }))
    expect(found).toEqual([])
  })

  it('注释里的值和 @keyframes 外壳不算，@keyframes 和 @media 里的声明照查', () => {
    const found = literalValues(files({
      'components/FormControls.css': [
        '/* .old{padding:7px 8px} */.c{color:red;/* margin:9px */gap:var(--sp-4)}',
        '@media (max-width:900px){.a{padding:var(--sp-8)}.b{margin-top:14px}}',
        '@keyframes shake{20%{transform:translateX(-3px)}to{padding-left:3px}}',
      ].join('\n'),
    }))
    expect(found).toEqual([
      'components/FormControls.css:2: margin-top:14px writes the literal 14px',
      'components/FormControls.css:3: padding-left:3px writes the literal 3px',
    ])
  })
})
