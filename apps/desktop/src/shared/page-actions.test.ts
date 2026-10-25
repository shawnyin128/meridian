import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'
import { en } from '../renderer/messages/en/index.js'
import { zh } from '../renderer/messages/zh/index.js'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every component and route source under the renderer, tests excluded, as paths relative to it. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))

type Node = { type: string; [key: string]: unknown }

const nameOf = (element: Node): string => {
  const name = (element.openingElement as Node).name as Node
  return name.type === 'JSXIdentifier' ? name.name as string : ''
}

/** Every JSX element in `node`, outermost first. */
function elements(node: unknown, found: Node[] = []): Node[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) elements(item, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXElement') found.push(held)
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') elements(value, found)
  }
  return found
}

/** The JSX elements in `node` that no other JSX element in it holds. */
function outermost(node: unknown, found: Node[] = []): Node[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) outermost(item, found)
    return found
  }
  const held = node as Node
  if (held.type === 'JSXElement') {
    found.push(held)
    return found
  }
  for (const [key, value] of Object.entries(held)) {
    if (key !== 'loc' && key !== 'start' && key !== 'end') outermost(value, found)
  }
  return found
}

/** The JSX attribute `name` of `element`, if it has one. */
const attribute = (element: Node, name: string): Node | undefined =>
  ((element.openingElement as Node).attributes as Node[])
    .find((attr) => attr.type === 'JSXAttribute' && (attr.name as Node).name === name)

/** Every string literal inside `node`: class names written as literals or picked by a ternary. */
const strings = (node: unknown): string[] => {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(strings)
  const held = node as Node
  if (held.type === 'StringLiteral') return [held.value as string]
  if (held.type === 'TemplateElement') return [(held.value as { raw: string }).raw]
  return Object.entries(held).filter(([key]) => key !== 'loc').flatMap(([, value]) => strings(value))
}

const line = (node: Node) => (node.loc as { start: { line: number } }).start.line

const headers = SOURCES.flatMap((path) => {
  const ast = parse(readFileSync(join(RENDERER, path), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  return elements(ast.program).filter((element) => nameOf(element) === 'PageHeader').map((header) => ({ path, header }))
})

describe('屏头的按钮', () => {
  it('屏头里只有返回、标题和 actions 槽:页级操作和视图切换都不直接放在标题旁边', () => {
    const offenders = headers.flatMap(({ path, header }) => outermost(header.children)
      .filter((child) => !['PageTitle', 'BackButton'].includes(nameOf(child)))
      .map((child) => `${path}:${line(child)} <${nameOf(child) || 'element'}>`))
    expect(offenders).toEqual([])
  })

  it('页级操作一种尺寸:actions 槽里没有小号按钮或小号添加', () => {
    const offenders = headers.flatMap(({ path, header }) => {
      const actions = attribute(header, 'actions')
      if (actions === undefined) return []
      return elements(actions).flatMap((element) => {
        const name = nameOf(element)
        const classes = strings(attribute(element, 'className')).flatMap((value) => value.split(/\s+/))
        const variant = strings(attribute(element, 'variant'))
        const small = classes.includes('sm') || strings(attribute(element, 'size')).some((size) => ['sm', 'nested', 'inline'].includes(size))
          || (name === 'AddAction' && !variant.includes('page'))
        return small ? [`${path}:${line(element)} <${name}>`] : []
      })
    })
    expect(offenders).toEqual([])
  })
})

/** Where an action sits on the screen; its slot says which scope the action acts on. */
type Slot = 'page header' | 'page toolbar' | 'section heading' | 'panel head' | 'group heading' | 'row actions'
  | 'chip' | 'table header' | 'timeline toolbar' | 'dialog actions' | 'card foot' | 'sidebar heading' | 'selection toolbar' | 'inline'

/** Props whose content a component renders in one slot. */
const SLOT_PROPS: Record<string, Record<string, Slot>> = {
  PageHeader: { actions: 'page header' },
  SectionHeading: { actions: 'section heading' },
  TabbedSection: { actions: 'section heading' },
  CollapsibleGroup: { actions: 'group heading' },
  IdeaPanel: { actions: 'panel head' },
  PaperCard: { actions: 'row actions' },
  IdeaCard: { menu: 'row actions' },
  IdeaRow: { menu: 'row actions' },
  ProjectPanel: { menu: 'row actions' },
  ProjectRow: { menu: 'row actions' },
  Table: { head: 'table header' },
  TimelineBoard: { headerAction: 'timeline toolbar' },
  ModalDialog: { actions: 'dialog actions' },
  SectHead: { extra: 'sidebar heading' },
}

/** Elements whose children sit in one slot: components by name, plain elements by a class. */
const SLOT_CHILDREN: Record<string, Slot> = {
  PageToolbar: 'page toolbar', RowActions: 'row actions', Tag: 'chip', tagchip: 'chip', 'pd-h': 'panel head',
  'th-add': 'table header', ServiceFoot: 'card foot', 'selection-tools-row': 'selection toolbar',
}

/** Components whose whole body is one slot wherever they are placed. */
const SLOT_BODIES: Record<string, Slot> = { TimelineControls: 'timeline toolbar' }

/** Files that define an operation's own control; their insides are not placements. */
const CONTROL_FILES = new Set(['components/SortMenu.tsx', 'components/AddAction.tsx', 'components/EditActions.tsx',
  'components/PanelClose.tsx', 'components/FieldPickers.tsx', 'components/IconButton.tsx', 'components/DraftForm.tsx'])

/**
 * Segmented controls that switch the views of a page, a section or a board, by their accessible name;
 * a section's switch is TabbedSection's, named by its `label`.
 */
const VIEW_SWITCHES = new Set(['m.papers.views.aria', 'm.papers.toolbar.groupFieldAria', 'm.later.groupBy',
  'm.feed.sourceFieldLabel', 'label', 'm.timeline.scaleGroup'])

/** The message path of a control that sorts a page's list, whichever control draws it. */
const SORT_LABEL = /^m\.[\w.]+\.sort(Label)?$/

/** Segmented controls that pick one option of a form in a dialog, a popover, Settings or a draft row. */
const OPTION_SWITCHES = new Set(['f.basisLabel', 'm.project.workspace.kindLabel', 'm.watches.sourceLabel',
  'm.research.schedule.modeLabel', 'm.project.links.groupLabel'])

/** Icon and text buttons whose operation their label names. */
const LABELLED: [RegExp, string][] = [
  [/^m\.(common\.(delete|deletePermanently|remove)|project\.attachments\.delete|project\.plan\.delete\w+For|papers\.rowActions\.delete)\b/, 'delete'],
  [/^m\.(inbox\.actions\.dismiss|later\.actions\.removeFrom|wiki\.removeFromPage|common\.removeLink|papers\.tags\.remove)\b/, 'remove'],
  [/^m\.(papers\.rowActions\.openReader|settings\.archived\.open|project\.idea\.openIdea|papers\.understanding\.goRead|wiki\.viewInPaperList)\b/, 'open'],
  [/^m\.(common\.(restore|undo)|settings\.archived\.unarchive)\b/, 'restore'],
  [/^m\.(trash\.clear|changelog\.clearArchived)\b/, 'clear'],
  [/^m\.(inbox\.dismissAll|changelog\.archiveAll)\b/, 'dismiss all'],
  // The review queue names its copy `r`, for m.wiki.queue.
  [/^(r\.decline|m\.wiki\.ingest\.discardProposal)$/, 'decline a proposal'],
  [/^r\.apply$|\bm\.wiki\.ingest\.confirm\b/, 'apply a proposal'],
  [/^m\.wiki\.(queue|tidy)\.entry$/, 'open pending work'],
]

type Look = { operation: string; size: string; variant: string; label?: string }
type Placement = Look & { slot: Slot; at: string }
type IconPlacement = { slot: Slot; size: string; at: string }
type ButtonPlacement = { slot: Slot; size: string; variant: string; at: string }
type Place = { slot: Slot; size: string; variant: string; scope?: string }

/**
 * Each operation's one place: its slot, size and variant. A further place names the scope that tells
 * it apart, which the screen shows by where the control sits.
 */
const PLACES: Record<string, Place[]> = {
  sort: [{ slot: 'page header', size: 'md', variant: 'plain' }],
  create: [{ slot: 'page header', size: 'md', variant: 'primary' }],
  add: [
    { slot: 'section heading', size: 'md', variant: 'plain' },
    { slot: 'table header', size: 'nested', variant: 'icon', scope: 'a table adds a column to itself' },
    { slot: 'inline', size: 'chip', variant: 'chip', scope: 'a field adds a value after its chips' },
  ],
  'view switch': [
    { slot: 'page toolbar', size: 'md', variant: 'plain' },
    { slot: 'section heading', size: 'sm', variant: 'plain', scope: 'a section switches its own content' },
    { slot: 'timeline toolbar', size: 'sm', variant: 'plain', scope: 'a timeline switches its own scale' },
  ],
  delete: [
    { slot: 'row actions', size: 'nested', variant: 'danger' },
    { slot: 'selection toolbar', size: 'nested', variant: 'danger', scope: "the reader's selection toolbar deletes the highlight a click selected" },
  ],
  remove: [
    { slot: 'row actions', size: 'nested', variant: 'plain' },
    { slot: 'chip', size: 'inline', variant: 'plain', scope: 'a chip takes itself out of its field' },
  ],
  open: [
    { slot: 'row actions', size: 'nested', variant: 'plain' },
    { slot: 'panel head', size: 'default', variant: 'plain', scope: 'a detail panel opens what it shows elsewhere' },
    { slot: 'page header', size: 'md', variant: 'plain', scope: 'a page leaves for the place that holds its subject' },
  ],
  restore: [{ slot: 'row actions', size: 'nested', variant: 'plain' }],
  close: [{ slot: 'panel head', size: 'default', variant: 'plain' }],
  edit: [
    { slot: 'section heading', size: 'md', variant: 'plain' },
    { slot: 'panel head', size: 'md', variant: 'plain', scope: 'a detail panel edits the idea it shows' },
  ],
  'overflow menu': [{ slot: 'row actions', size: 'nested', variant: 'plain' }],
  clear: [
    { slot: 'page header', size: 'md', variant: 'danger' },
    { slot: 'section heading', size: 'md', variant: 'danger', scope: 'a section clears its own entries' },
  ],
  'decline a proposal': [{ slot: 'inline', size: 'md', variant: 'ghost danger' }],
  'apply a proposal': [
    { slot: 'inline', size: 'md', variant: 'plain' },
    { slot: 'inline', size: 'md', variant: 'primary', scope: "the review queue's first applicable proposal, its one primary" },
  ],
  'option switch': [{ slot: 'inline', size: 'md', variant: 'plain' }],
  'open pending work': [{ slot: 'page header', size: 'md', variant: 'plain' }],
  'settings save': [{ slot: 'card foot', size: 'md', variant: 'primary' }],
  'dismiss all': [
    { slot: 'section heading', size: 'md', variant: 'plain' },
    { slot: 'group heading', size: 'md', variant: 'plain', scope: 'a group dismisses its own rows' },
  ],
}

/** The class words of an element's className, literal or picked by a ternary. */
const classesOf = (element: Node) => strings(attribute(element, 'className')).flatMap((value) => value.split(/\s+/))

/** The look of a button from its btn classes. */
const buttonLook = (classes: string[]) => ({
  size: classes.includes('sm') ? 'sm' : 'md',
  variant: ['pri', 'ghost', 'danger'].filter((word) => classes.includes(word))
    .map((word) => (word === 'pri' ? 'primary' : word)).join(' ') || 'plain',
})

/**
 * The look of a text button: a Button by its size, variant and tone, the buttons of a CommitActions or
 * an EditActions by the size and Save of their place, a raw button by its btn classes, or null for any
 * other element.
 */
function textButtonLook(element: Node) {
  const name = nameOf(element)
  if (name === 'CommitActions') {
    const place = strings(attribute(element, 'place'))[0]
    return { size: place === 'item' ? 'sm' : 'md', variant: place === 'foot' ? 'primary' : 'plain' }
  }
  if (name === 'EditActions') return { size: 'md', variant: 'plain' }
  if (name === 'Button') {
    const words = [...strings(attribute(element, 'variant')), ...strings(attribute(element, 'tone'))]
    return {
      size: strings(attribute(element, 'size')).includes('compact') ? 'sm' : 'md',
      variant: ['primary', 'ghost', 'danger'].filter((word) => words.includes(word)).join(' ') || 'plain',
    }
  }
  return (name === 'button' || name === 'ToolbarButton') && classesOf(element).includes('btn') ? buttonLook(classesOf(element)) : null
}

/** A Settings card's save, by its label. */
const SETTINGS_SAVE = /\bm\.(common|settings\.model)\.save\b/

/** The operation an element in the source file `path` performs and how it looks, or null when it is not a tracked action. */
function lookOf(element: Node, source: string, path: string): Look | null {
  const name = nameOf(element)
  const text = (node: Node | undefined) => (node === undefined ? '' : source.slice(node.start as number, node.end as number))
  const expression = (attr: Node | undefined) => ((attr?.value as Node | undefined)?.expression as Node | undefined)
  const literal = (attr: string) => strings(attribute(element, attr))[0]
  const labelled = (label: string) => LABELLED.find(([pattern]) => pattern.test(label))?.[1]
  if (name === 'SortMenu') {
    return { operation: 'sort', size: 'md', variant: 'plain', label: text(expression(attribute(element, 'label'))) }
  }
  if (name === 'AddAction') {
    const variant = literal('variant') ?? 'section'
    if (variant === 'page') return { operation: 'create', size: 'md', variant: 'primary' }
    if (variant === 'section') return { operation: 'add', size: 'md', variant: 'plain' }
    return { operation: 'add', size: variant === 'icon' ? 'nested' : variant, variant }
  }
  if (name === 'EditActions') return { operation: 'edit', size: 'md', variant: 'plain' }
  if (name === 'CommitActions' && path.startsWith('components/settings/')) {
    const place = literal('place')
    return { operation: 'settings save', size: place === 'item' ? 'sm' : 'md', variant: place === 'foot' ? 'primary' : 'plain' }
  }
  if (name === 'PanelClose') return { operation: 'close', size: 'default', variant: 'plain' }
  if (name === 'DotsMenu') return { operation: 'overflow menu', size: 'nested', variant: 'plain' }
  if (name === 'SegmentedControl') {
    const label = text(expression(attribute(element, 'label')))
    if (SORT_LABEL.test(label)) return { operation: 'sort', size: literal('size') ?? 'md', variant: 'plain', label }
    const operation = VIEW_SWITCHES.has(label) ? 'view switch' : OPTION_SWITCHES.has(label) ? 'option switch' : null
    return operation === null ? null : { operation, size: literal('size') ?? 'md', variant: 'plain' }
  }
  if (name === 'IconButton') {
    const operation = labelled(text(expression(attribute(element, 'label'))))
    return operation === undefined ? null : {
      operation, size: literal('size') ?? 'default', variant: literal('tone') === 'danger' ? 'danger' : 'plain',
    }
  }
  if (name === 'Button' || name === 'button' || name === 'ToolbarButton') {
    const children = (element.children as Node[]).filter((child) => child.type === 'JSXExpressionContainer')
      .map((child) => text(child.expression as Node))
    const operation = path.startsWith('components/settings/') && children.some((child) => SETTINGS_SAVE.test(child))
      ? 'settings save' : children.map(labelled).find(Boolean)
    const look = textButtonLook(element) ?? buttonLook([])
    return operation === undefined ? null : { operation, ...look }
  }
  return null
}

const isFunction = (node: Node | null | undefined) =>
  node != null && ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(node.type)

/**
 * Every tracked action in one source file with the slot it sits in. A function the file names and
 * places elsewhere in the file (as a JSX tag, a call or a callback) is read where it is placed.
 */
function placementsIn(path: string): { actions: Placement[]; icons: IconPlacement[]; buttons: ButtonPlacement[] } {
  const source = readFileSync(join(RENDERER, path), 'utf8')
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  const functions = new Map<string, Node[]>()
  const placed = new Set<string>()
  const scan = (node: unknown) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(scan); return }
    const held = node as Node
    if (held.type === 'FunctionDeclaration' && held.id) {
      const name = (held.id as Node).name as string
      functions.set(name, [...functions.get(name) ?? [], held])
    }
    if (held.type === 'VariableDeclarator' && (held.id as Node).type === 'Identifier' && isFunction(held.init as Node | null)) {
      const name = (held.id as Node).name as string
      functions.set(name, [...functions.get(name) ?? [], held.init as Node])
    }
    if (held.type === 'JSXOpeningElement' && (held.name as Node).type === 'JSXIdentifier') placed.add((held.name as Node).name as string)
    if (held.type === 'CallExpression') {
      for (const part of [held.callee, ...(held.arguments as Node[])] as Node[]) {
        if (part.type === 'Identifier') placed.add(part.name as string)
      }
    }
    for (const [key, value] of Object.entries(held)) if (key !== 'loc') scan(value)
  }
  scan(ast.program)
  const elsewhere = (name: string | undefined) => name !== undefined && functions.has(name) && placed.has(name)

  const found: Placement[] = []
  const icons: IconPlacement[] = []
  const buttons: ButtonPlacement[] = []
  const visit = (node: unknown, slot: Slot, inside: ReadonlySet<string>) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const item of node) visit(item, slot, inside); return }
    const held = node as Node
    if (held.type === 'FunctionDeclaration' && elsewhere(((held.id as Node | undefined)?.name) as string | undefined)) return
    if (held.type === 'VariableDeclarator' && isFunction(held.init as Node | null)
      && elsewhere((held.id as Node).name as string)) return
    const enter = (name: string, at: Slot) => {
      if (inside.has(name) || !functions.has(name)) return
      for (const fn of functions.get(name)!) visit(fn.body, SLOT_BODIES[name] ?? at, new Set([...inside, name]))
    }
    if (isFunction(held)) {
      const own = held.type === 'FunctionDeclaration' ? ((held.id as Node | undefined)?.name as string | undefined) : undefined
      visit(held.body, own === undefined ? slot : SLOT_BODIES[own] ?? slot, inside)
      return
    }
    if (held.type === 'VariableDeclarator' && isFunction(held.init as Node | null)) {
      const own = (held.id as Node).name as string
      visit((held.init as Node).body, SLOT_BODIES[own] ?? slot, inside)
      return
    }
    if (held.type === 'CallExpression') {
      for (const part of [held.callee, ...(held.arguments as Node[])] as Node[]) {
        if (part.type === 'Identifier') enter(part.name as string, slot)
      }
    }
    if (held.type === 'JSXElement') {
      const name = nameOf(held)
      const look = lookOf(held, source, path)
      if (look !== null && !CONTROL_FILES.has(path)) found.push({ ...look, slot, at: `${path}:${line(held)}` })
      if (name === 'IconButton' && !CONTROL_FILES.has(path)) {
        icons.push({ slot, size: strings(attribute(held, 'size'))[0] ?? 'default', at: `${path}:${line(held)}` })
      }
      const textLook = textButtonLook(held)
      if (textLook !== null && !CONTROL_FILES.has(path)) buttons.push({ slot, ...textLook, at: `${path}:${line(held)}` })
      const built = ((attribute(held, 'className')?.value as Node | undefined)?.expression as Node | undefined)
      const builder = built?.type === 'CallExpression' && (built.callee as Node).type === 'Identifier'
        ? functions.get((built.callee as Node).name as string) ?? [] : []
      const classes = [...classesOf(held), ...strings(builder).flatMap((value) => value.split(/\s+/))]
      for (const attr of (held.openingElement as Node).attributes as Node[]) {
        if (attr.type !== 'JSXAttribute') { visit(attr, slot, inside); continue }
        const prop = (attr.name as Node).name as string
        const own = name === 'SectionHeading' && prop === 'actions' && classes.includes('node-document-head')
          ? 'panel head' : SLOT_PROPS[name]?.[prop]
        visit(attr.value, slot === 'chip' ? slot : own ?? slot, inside)
      }
      const holds = SLOT_CHILDREN[name] ?? classes.map((word) => SLOT_CHILDREN[word]).find(Boolean)
      // A table header cell reveals its buttons through a row-actions slot; they still act on the table.
      const kept = slot === 'chip' || (slot === 'table header' && holds === 'row actions')
      visit(held.children, kept ? slot : holds ?? slot, inside)
      enter(name, slot)
      return
    }
    for (const [key, value] of Object.entries(held)) if (key !== 'loc') visit(value, slot, inside)
  }
  visit(ast.program, 'inline', new Set())
  return { actions: found, icons, buttons }
}

const READ = SOURCES.map(placementsIn)
const PLACEMENTS = READ.flatMap((file) => file.actions)

/** The one text button size of each slot: regular in heads and foots, compact inside rows and toolbars. */
const BUTTON_SIZES: Partial<Record<Slot, string>> = {
  'page header': 'md', 'section heading': 'md', 'group heading': 'md', 'panel head': 'md', 'dialog actions': 'md',
  'card foot': 'md', 'row actions': 'sm', 'timeline toolbar': 'sm', 'selection toolbar': 'sm',
}

/** The one icon button size of the slots that hold rows' and chips' own actions. */
const ICON_SIZES: Partial<Record<Slot, string>> = { 'row actions': 'nested', chip: 'inline' }

const shown = (place: Pick<Place, 'slot' | 'size' | 'variant'>) => `${place.slot} · ${place.size} · ${place.variant}`

/** The text that a message path such as `m.ideas.sort` names in `locale`. */
const textOf = (path: string, locale: 'zh' | 'en') => String(path.split('.').slice(1)
  .reduce<unknown>((held, key) => (held as Record<string, unknown>)[key], locale === 'zh' ? zh : en))

describe('一个操作一个位置', () => {
  it('每个操作只在它的位置上出现，同一种尺寸和样式；另一个位置要写明它的作用范围', () => {
    const offenders = PLACEMENTS
      .filter((placement) => !(PLACES[placement.operation] ?? []).some((place) => shown(place) === shown(placement)))
      .map((placement) => `${placement.at} ${placement.operation}: ${shown(placement)}`)
    expect([...new Set(offenders)]).toEqual([])
  })

  it('每个操作都在源码里找得到，每个写了作用范围的位置都有人用', () => {
    const unused = Object.entries(PLACES).flatMap(([operation, places]) => places
      .filter((place) => !PLACEMENTS.some((placement) => placement.operation === operation && shown(placement) === shown(place)))
      .map((place) => `${operation}: ${shown(place)}`))
    expect(unused).toEqual([])
  })

  it('决定一份提案时拒绝在前、应用在后，审阅队列和阅读器里都是这样', () => {
    const at = (placement: Placement) => Number(placement.at.split(':')[1])
    const files = [...new Set(PLACEMENTS.filter((placement) => placement.operation === 'apply a proposal')
      .map((placement) => placement.at.split(':')[0]!))]
    const order = files.map((file) => {
      const of = (operation: string) => PLACEMENTS.filter((placement) => placement.at.startsWith(`${file}:`) && placement.operation === operation)
      return [file, Math.max(...of('decline a proposal').map(at)) < Math.min(...of('apply a proposal').map(at))]
    })
    expect(order).toEqual([['components/reader/PaperWikiIngest.tsx', true], ['components/wiki/ReviewQueue.tsx', true]])
  })

  it('排序只有一个名字:项目和想法的一次排序、收件里一直生效的排序都叫排序,都是屏头的排序菜单', () => {
    const menus = PLACEMENTS.filter((placement) => placement.operation === 'sort')
    expect([...new Set(menus.map((menu) => `${textOf(menu.label!, 'zh')} / ${textOf(menu.label!, 'en')}`))]).toEqual(['排序 / Sort'])
    expect([...new Set(menus.map((menu) => menu.at.split(':')[0]))].sort()).toEqual(['routes/Ideas.tsx', 'routes/Inbox.tsx', 'routes/Projects.tsx'])
  })

  it('详情面板头部的文字按钮都是普通按钮', () => {
    const offenders = READ.flatMap((file) => file.buttons)
      .filter((button) => button.slot === 'panel head' && button.variant !== 'plain')
      .map((button) => `${button.at} ${button.size} · ${button.variant}`)
    expect([...new Set(offenders)]).toEqual([])
  })

  it('一个槽里的文字按钮一种尺寸：屏头、小标题、组标题、面板头、对话框和卡片脚上是常规尺寸，行里和工具栏里是紧凑尺寸', () => {
    const offenders = READ.flatMap((file) => file.buttons)
      .filter((button) => BUTTON_SIZES[button.slot] !== undefined && button.size !== BUTTON_SIZES[button.slot])
      .map((button) => `${button.at} ${button.slot}: ${button.size}`)
    expect([...new Set(offenders)]).toEqual([])
  })

  it('一行的图标操作一种尺寸：行里是嵌套尺寸，标签里是行内尺寸', () => {
    const offenders = READ.flatMap((file) => file.icons)
      .filter((icon) => ICON_SIZES[icon.slot] !== undefined && icon.size !== ICON_SIZES[icon.slot])
      .map((icon) => `${icon.at} ${icon.slot}: ${icon.size}`)
    expect([...new Set(offenders)]).toEqual([])
  })
})
