import { describe, expect, it } from 'vitest'
import { undefinedProperties } from './check-css-vars.mjs'

const files = (entries) => new Map(Object.entries(entries))

describe('未定义的 CSS 自定义属性检查', () => {
  it('报告样式表用到却没有任何地方定义的变量，带文件和行号', () => {
    const found = undefinedProperties(files({
      'shell/tokens.css': ':root{--good:#1f9d4d;--tint-good:rgba(48,209,88,.14)}',
      'settings/ServiceCard.css': '.pill{\n  color:var(--good);\n  background:var(--tint-ok);color:var(--ok)}',
    }))
    expect(found).toEqual([
      'settings/ServiceCard.css:3: --tint-ok is used but never defined',
      'settings/ServiceCard.css:3: --ok is used but never defined',
    ])
  })

  it('TSX 里交给 style 的 var() 同样要有定义', () => {
    const found = undefinedProperties(files({
      'shell/tokens.css': ':root{--sec:#536175}',
      'routes/Feed.tsx': "const TONE = {\n  read: { color: 'var(--sec)' },\n  saved: { color: 'var(--ok)' },\n}",
    }))
    expect(found).toEqual(['routes/Feed.tsx:3: --ok is used but never defined'])
  })

  it('TSX 的 style 键和 setProperty 写入的变量算作定义', () => {
    const found = undefinedProperties(files({
      'shell/AppShell.tsx': "<main style={{ ['--sbw']: `${width}px`, '--rrw': `${chat}px` }} />",
      'routes/Reader.tsx': "box.style.setProperty('--scale-factor', String(scale))",
      'shell/AppShell.css': '.sidebar{flex:0 0 var(--sbw,232px)}\n.paper-chat{flex:0 0 var(--rrw,300px)}',
      'routes/Reader.css': '.pdfpagebox{--total-scale-factor:calc(var(--scale-factor) * 1)}',
    }))
    expect(found).toEqual([])
  })

  it('依赖在运行时写入的变量算作定义，带回退值的 var() 不因回退值而免检', () => {
    const css = '.pickhits{width:var(--radix-popover-trigger-width)}\n.grid{gap:var(--gap,8px)}'
    expect(undefinedProperties(files({ 'PickRow.css': css }), new Set(['--radix-popover-trigger-width'])))
      .toEqual(['PickRow.css:2: --gap is used but never defined'])
  })

  it('注释里的声明不算定义，注释里提到的 var() 也不算用到', () => {
    const found = undefinedProperties(files({
      'shell/tokens.css': '/* --ok:#1f9d4d was renamed */\n:root{--good:#1f9d4d}',
      'AboutDialog.css': '/* once var(--tint) */\n.about-status svg{color:var(--ok)}',
    }))
    expect(found).toEqual(['AboutDialog.css:2: --ok is used but never defined'])
  })
})
