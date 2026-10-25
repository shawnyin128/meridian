import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLOUR_TOKENS, COMPONENTS, componentPatterns, METRICS, patternName, PATTERNS, probeEntries, SHADOW_TOKENS, UNMEASURED } from './patterns.mjs'

const RENDERER = resolve(import.meta.dirname, '../../apps/desktop/src/renderer')

/** The pattern names the v0.0.20.0 inventory (components/inventory/partA–D.json) records. */
const INVENTORY_PATTERNS = [
  'ActionButton', 'AddAction', 'Breadcrumb', 'BusyLabel', 'Button', 'Caption', 'Card', 'CardStack',
  'Checklist (outside vocabulary) on Card', 'Chip', 'ChipList', 'Composer (outside vocabulary)', 'ConfirmDialog', 'ContextMenu',
  'CountBadge', 'DateChip', 'Dialog', 'DiffLines', 'DraftForm', 'DraftRow', 'DragHandle', 'DropOverlay', 'EmptyState',
  'EntityLink', 'EntityLink (outside vocabulary)', 'FadeText', 'FieldLabel (outside vocabulary)', 'FilterMenu', 'Fold',
  'GraphCanvas', 'GraphNode', 'Grip', 'Grip (outside vocabulary)', 'GroupHeading', 'HighlightMark', 'IconButton',
  'InlineError', 'InlineField', 'ItemMeta', 'ItemTitle', 'List', 'LoadingPlaceholder', 'Markdown', 'Menu',
  'Message (outside vocabulary)', 'MessageColumn (outside vocabulary)', 'NavList', 'Notice', 'OverflowMenu', 'PageBody',
  'PageError', 'PageFooter', 'PageHeader', 'PageToolbar', 'Pager', 'PanelHead', 'PdfPage', 'Picker', 'Popover',
  'ProgressFill', 'PropertyGrid', 'Rating', 'ReadDots', 'ReadState', 'ResizeGrip', 'Row', 'RowActions', 'RunningIndicator',
  'SearchField', 'SectionHeading', 'SegmentedControl', 'SelectedState', 'ShowMore', 'SidePanel', 'SortMenu', 'SplitPage',
  'StatTile', 'StatusDot', 'Swatches', 'Switch', 'TabGroup', 'Table', 'Tag', 'TextArea', 'TextField', 'TimelineBar',
  'TimelineMarker', 'TimelineScale', 'TitleBar', 'Tooltip', 'TrailingMeta', 'ZoomControl',
]

/** Every renderer source file's text, joined. */
function rendererSource() {
  return readdirSync(RENDERER, { recursive: true })
    .filter((file) => /\.(tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => readFileSync(join(RENDERER, file), 'utf8')).join('\n')
}

describe('the selector map', () => {
  it('measures every pattern the inventory records or says why it does not', () => {
    const uncovered = INVENTORY_PATTERNS.map(patternName).filter((name) => PATTERNS[name] === undefined && UNMEASURED[name] === undefined)
    expect(uncovered).toEqual([])
  })

  it('measures each pattern by a metric class with the inventory brief keys', () => {
    expect(METRICS.item).toEqual(['height', 'padding', 'inset', 'reach', 'gap', 'titleFont', 'metaFont', 'trailingEnd'])
    expect(METRICS.heading).toEqual(['font', 'color', 'above', 'below', 'count'])
    const unknown = Object.entries(PATTERNS).filter(([, pattern]) => METRICS[pattern.metrics] === undefined).map(([name]) => name)
    expect(unknown).toEqual([])
  })

  it('tags every entry with its pattern and a shared component or hand-built file', () => {
    const entries = probeEntries()
    expect(new Set(entries.map((item) => item.id)).size).toBe(entries.length)
    const untagged = entries.filter((item) => !/^(shared:[A-Z]\w+|hand:(shell|routes|components)\/[\w/.-]+\.(tsx|css))$/.test(item.impl))
    expect(untagged.map((item) => item.id)).toEqual([])
    expect(entries.find((item) => item.selector === '.structured-row')).toMatchObject({ pattern: 'Row', metrics: 'item', impl: 'shared:StructuredRow' })
    expect(entries.find((item) => item.selector === '.research-object-card')).toMatchObject({ pattern: 'Card', metrics: 'item' })
  })

  it('names only classes the renderer declares, so a renamed class fails here first', () => {
    const source = rendererSource()
    const named = probeEntries().flatMap((item) => [item.selector, item.not ?? '', ...Object.values(item.parts ?? {})])
      .flatMap((selector) => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]))
    // A modifier such as `section-heading--page` is written as `section-heading--${variant}`.
    const declared = (name) => new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(source)
      || (name.includes('--') && source.includes(`${name.split('--')[0]}--\${`))
    const missing = [...new Set(named)].filter((name) => !declared(name))
    expect(missing).toEqual([])
  })

  it('names colours only by tokens that tokens.css declares', () => {
    const tokens = readFileSync(join(RENDERER, 'shell', 'tokens.css'), 'utf8')
    expect([...COLOUR_TOKENS, ...SHADOW_TOKENS].filter((name) => !tokens.includes(`--${name}:`))).toEqual([])
  })

  it('makes a contact sheet only of measured patterns', () => {
    expect(Object.values(COMPONENTS).flat().filter((name) => PATTERNS[name] === undefined)).toEqual([])
    expect(componentPatterns('Row/Item')).toEqual(['Row'])
    expect(componentPatterns('Tag')).toEqual(['Tag'])
    expect(() => componentPatterns('Carousel')).toThrow('Unknown component Carousel')
  })

  it('reads the inventory names that carry an outside-vocabulary note', () => {
    expect(patternName('Message (outside vocabulary)')).toBe('Message')
    expect(patternName('Checklist (outside vocabulary) on Card')).toBe('Checklist')
    expect(patternName('Grip')).toBe('ResizeGrip')
  })
})
