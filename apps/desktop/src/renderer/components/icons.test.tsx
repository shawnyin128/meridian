// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  Icon,
  IconCheck,
  IconChevron,
  IconCross,
  IconDots,
  IconDownload,
  IconFolder,
  IconGear,
  IconLater,
  IconMulti,
  IconPencil,
  IconPlus,
  IconRead,
  IconSelect,
  IconText,
  PLUS_PATH,
} from './icons.js'

/**
 * Pin the rendering tags of each exported icon in card-icons.tsx and compare the source code byte by byte as it is written today.
 * IconPlus / IconCross / IconDots are handwritten bare <svg>, deliberately not containing the Icon of this file
 * Shell: Icon fixed complement strokeLinecap and strokeLinejoin double round, while IconPlus,
 * IconCross only needs strokeLinecap; IconDots uses fill to draw three solid points and no stroke at all.
 * Inserting Icon will reverse fill/stroke. PLUS_PATH is exported separately. This test uses the naked icon.
 * All the tags packaged with the universal Icon shell are pinned and asserted to be unequal to prevent someone from accidentally using IconPlus
 * "Simplified" into another plus sign.
 */

describe('card-icons', () => {
  it('IconCheck 的标记原样钉住,双 round 都在', () => {
    expect(renderToStaticMarkup(<IconCheck />)).toBe(
      '<svg class="cki" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>',
    )
  })

  it('IconRead 只描边不连角,没有 stroke-linejoin', () => {
    const markup = renderToStaticMarkup(<IconRead />)
    expect(markup).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h9l5 5v13H6z"></path><path d="M14 3v6h6"></path><path d="M9 13h7M9 17h5"></path></svg>',
    )
    expect(markup).not.toContain('stroke-linejoin')
  })

  it('IconDownload 的标记原样钉住,双 round 都在', () => {
    expect(renderToStaticMarkup(<IconDownload />)).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"></path><path d="M7 11l5 5 5-5"></path><path d="M4 20h16"></path></svg>',
    )
  })

  it('IconFolder 使用统一的目录选择轮廓', () => {
    expect(renderToStaticMarkup(<IconFolder />)).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h6l2 2h10v10H3z"></path></svg>',
    )
  })

  it('IconLater 的标记原样钉住,双 round 都在', () => {
    expect(renderToStaticMarkup(<IconLater />)).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18v11H3z"></path><path d="M3 9l2-5h14l2 5"></path><path d="M12 12v5M9.5 14.5L12 17l2.5-2.5"></path></svg>',
    )
  })

  it('IconText 只描边不连角,没有 stroke-linejoin', () => {
    const markup = renderToStaticMarkup(<IconText />)
    expect(markup).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 6h14M12 6v13"></path></svg>',
    )
    expect(markup).not.toContain('stroke-linejoin')
  })

  it('IconSelect 的标记原样钉住,双 round 都在', () => {
    expect(renderToStaticMarkup(<IconSelect />)).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 11l3 3 5-5"></path></svg>',
    )
  })

  it('IconMulti 的标记原样钉住,双 round 都在', () => {
    expect(renderToStaticMarkup(<IconMulti />)).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l2 2 3-3M3 16l2 2 3-3M12 8h9M12 17h9"></path></svg>',
    )
  })

  it('IconGear 用 16 格视口,标记原样钉住', () => {
    expect(renderToStaticMarkup(<IconGear />)).toBe(
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.52 6.97L14.52 9.03L12.35 9.16L11.9 10.25L13.34 11.88L11.88 13.34L10.25 11.9L9.16 12.35L9.03 14.52L6.97 14.52L6.84 12.35L5.75 11.9L4.12 13.34L2.66 11.88L4.1 10.25L3.65 9.16L1.48 9.03L1.48 6.97L3.65 6.84L4.1 5.75L2.66 4.12L4.12 2.66L5.75 4.1L6.84 3.65L6.97 1.48L9.03 1.48L9.16 3.65L10.25 4.1L11.88 2.66L13.34 4.12L11.9 5.75L12.35 6.84Z"></path><circle cx="8" cy="8" r="1.9"></circle></svg>',
    )
  })

  it('IconChevron 的标记原样钉住,双 round 都在', () => {
    expect(renderToStaticMarkup(<IconChevron />)).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>',
    )
  })

  it('IconPencil 的标记原样钉住,双 round 都在', () => {
    expect(renderToStaticMarkup(<IconPencil />)).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"></path></svg>',
    )
  })

  it('IconPlus 不套 Icon:没有 stroke-linejoin', () => {
    const markup = renderToStaticMarkup(<IconPlus />)
    expect(markup).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>',
    )
    expect(markup).not.toContain('stroke-linejoin')
  })

  it('IconCross 不传 sw 时按 2 描边,不套 Icon 没有 stroke-linejoin', () => {
    const markup = renderToStaticMarkup(<IconCross />)
    expect(markup).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>',
    )
    expect(markup).not.toContain('stroke-linejoin')
  })

  it('IconCross sw=2.2(列菜单的叉)按 2.2 描边,不套 Icon 没有 stroke-linejoin', () => {
    const markup = renderToStaticMarkup(<IconCross sw={2.2} />)
    expect(markup).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>',
    )
    expect(markup).not.toContain('stroke-linejoin')
  })

  it('IconCross sw=2.5(chip 角标的叉)按 2.5 描边,不套 Icon 没有 stroke-linejoin', () => {
    const markup = renderToStaticMarkup(<IconCross sw={2.5} />)
    expect(markup).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>',
    )
    expect(markup).not.toContain('stroke-linejoin')
  })

  it('IconDots 用 fill 画点、完全不描边,fill/stroke 和 Icon 正相反', () => {
    const markup = renderToStaticMarkup(<IconDots />)
    expect(markup).toBe(
      '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="19" cy="12" r="1.7"></circle></svg>',
    )
    expect(markup).not.toContain('stroke-width')
    expect(markup).not.toContain('stroke-linecap')
    expect(markup).not.toContain('stroke-linejoin')
  })

  it('Icon 外壳固定双 round 且 fill=none/stroke=currentColor,套上 PLUS_PATH 后和裸的 IconPlus 标记不同', () => {
    const wrapped = renderToStaticMarkup(
      <Icon sw={2}>
        <path d={PLUS_PATH} />
      </Icon>,
    )
    expect(wrapped).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>',
    )
    expect(wrapped).not.toBe(renderToStaticMarkup(<IconPlus />))
  })
})
