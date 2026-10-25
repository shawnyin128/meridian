// The selector map of the component review: every pattern of the v0.0.20.0 inventory, the metrics
// its class is measured by, and the stable selectors that find its instances in the running App.

/**
 * The metric keys of each pattern class, as the inventory brief lists them, plus classes for the
 * patterns the brief leaves out (heads, page columns, overlays and text).
 */
export const METRICS = {
  heading: ['font', 'color', 'above', 'below', 'count'],
  list: ['border', 'radius', 'background', 'divider', 'dividerInset', 'rowCap', 'scroll', 'padding'],
  item: ['height', 'padding', 'inset', 'reach', 'gap', 'titleFont', 'metaFont', 'trailingEnd'],
  button: ['height', 'padding', 'font', 'radius', 'variant', 'glyph'],
  tag: ['height', 'padding', 'font', 'radius', 'tone'],
  field: ['height', 'padding', 'border', 'radius', 'focus'],
  state: ['height', 'text', 'style'],
  panel: ['width', 'surface', 'head', 'scroll'],
  head: ['height', 'padding', 'titleFont', 'border', 'background'],
  page: ['x', 'width', 'padding', 'gap'],
  overlay: ['width', 'surface', 'padding', 'radius', 'item'],
  text: ['font', 'color', 'lineHeight'],
}

/** Classes that name a button's variant; the measured `variant` lists those present. */
export const VARIANT_CLASSES = ['pri', 'ghost', 'danger', 'quiet', 'sm', 'xs', 'compact', 'round', 'on', 'inline', 'nested']

/** The colour tokens of `shell/tokens.css` a measured colour is named by, in the order names are listed. */
export const COLOUR_TOKENS = [
  'desktop', 'window', 'content', 'sidebar', 'ink', 'sec', 'ter', 'sep', 'sep2', 'sep-strong', 'accent', 'accent-soft',
  'on-accent', 'accent-solid', 'accent-text', 'card', 'raised', 'field', 'hover', 'chip', 'track', 'good', 'warn', 'bad',
  'hl', 'good-text', 'warn-text', 'bad-text', 'bad-solid', 'star', 'mslane', 'press', 'press-solid', 'hover-solid', 'ring',
  'sel', 'selected', 'on-selected', 'selected-strong', 'tint-good', 'tint-warn', 'tint-bad', 'tint-mut', 'paper', 'scrim',
  'diff-add', 'diff-del', 'q-bg', 'hl-yellow', 'hl-sel',
]

/** The elevation tokens of `shell/tokens.css` a measured box shadow is named by. */
export const SHADOW_TOKENS = ['sh-1', 'sh-2', 'sh-3', 'sh-paper']

/**
 * Section headings that head a group of items rather than a section: the status groups of the
 * project list and of Ideas, and the kind groups of the trash.
 */
const GROUPED_SECTIONS = '.desk-body:has(.projpanel) > .section-heading, .desk-body:has(> .tgroup) > .section-heading, '
  + '.ideas-list > .section-heading:not(:has(+ .idea-stats-head)), .idea-row-groups > .section-heading'

/** One selector entry: `impl` is `shared:<Component>` or `hand:<file>`, `selector` finds its elements. */
const entry = (impl, selector, options = {}) => ({ id: `${impl} ${selector}`, impl, selector, ...options })

/**
 * Every pattern: its metric class and its entries, the shared component's classes first, then the
 * hand-built classes the inventory lists. An element that matches `not` is left out; `parts` names
 * the descendants a metric reads (title, meta, trailing, count, head, item). Within a pattern an
 * element counts once, for the first entry that matches it.
 */
export const PATTERNS = {
  TitleBar: { metrics: 'head', entries: [entry('hand:shell/AppShell.tsx', '.titlebar', { parts: { title: '#crumb' } })] },
  Breadcrumb: { metrics: 'text', entries: [entry('hand:shell/AppShell.tsx', '#crumb')] },
  NavList: { metrics: 'list', entries: [entry('hand:shell/Sidebar.tsx', '#sidebar .sb-top')] },
  PageHeader: {
    metrics: 'head',
    entries: [
      entry('shared:PageHeader', '.desk-head', { parts: { title: '.t' } }),
      entry('hand:components/AboutDialog.tsx', '.about-head'),
    ],
  },
  PageToolbar: { metrics: 'head', entries: [entry('shared:PageToolbar', '.page-toolbar')] },
  PageBody: {
    metrics: 'page',
    entries: [
      entry('shared:PageBody', '.desk-body'),
      entry('hand:routes/Settings.tsx', '.set-main'),
      entry('hand:routes/Reader.tsx', '.pdfwrap'),
    ],
  },
  PageFooter: { metrics: 'page', entries: [entry('shared:PageFooter', '.desk-foot')] },
  SplitPage: {
    metrics: 'page',
    entries: [
      entry('hand:components/paper-table/ResearchMap.tsx', '.research-map-layout'),
      entry('hand:routes/Wiki.tsx', '.wkpage'),
      entry('hand:routes/ResearchOverview.tsx', '.ovcols'),
      entry('hand:routes/Ideas.tsx', '.ideas-workspace'),
    ],
  },
  SidePanel: {
    metrics: 'panel',
    entries: [
      entry('shared:DetailPanel', '.detail-panel.is-open, .detail-panel--inline, .detail-panel--resize'),
      entry('shared:PaperChat', '.paper-chat'),
      entry('hand:components/reader/ReaderSidePanel.tsx', '.reader-side:not(.collapsed)'),
      entry('hand:routes/Settings.tsx', '.set-side'),
      entry('hand:routes/Wiki.tsx', '.wkside'),
    ],
  },
  PanelHead: {
    metrics: 'head',
    entries: [
      entry('shared:ReaderPanelHeader', '.reader-panel-head'),
      entry('shared:SectionHeading', '.node-document-head'),
      entry('shared:ModalDialog', '.modal-title'),
      entry('hand:components/chat/PaperChat.tsx', '.paper-chat-head', { parts: { title: '.paper-chat-title' } }),
      entry('hand:components/paper-table/PaperTable.tsx', '.pd-h', { parts: { title: '.pd-t' } }),
      entry('hand:components/paper-table/ResearchMap.tsx', '.research-map-detail-head'),
      entry('hand:components/timeline/TimelineBoard.tsx', '.ghead'),
      entry('hand:components/settings/ThemeEditor.tsx', '.theme-editor-title'),
    ],
  },
  SectionHeading: {
    metrics: 'heading',
    entries: [
      entry('shared:SectionHeading', '.section-heading', { not: `.section-heading--group, .node-document-head, .section-heading:has(+ .tabbed-section-panel), ${GROUPED_SECTIONS}` }),
      entry('hand:routes/Wiki.tsx', '.coledit .ch'),
    ],
  },
  GroupHeading: {
    metrics: 'heading',
    entries: [
      entry('shared:SectionHeading', '.section-heading--group', { not: '.node-document-head' }),
      entry('shared:SectionHeading', GROUPED_SECTIONS),
      entry('hand:shell/SearchBox.tsx', '.pickhits .rh'),
      entry('hand:components/chat/ChatComposer.tsx', '.pickhits .rg'),
      entry('hand:routes/Watches.tsx', '.watch-suggestion-group-heading'),
      entry('hand:components/settings/DiscoverySettings.tsx', '.direction-project > header'),
    ],
  },
  TabGroup: {
    metrics: 'heading',
    entries: [
      entry('shared:TabbedSection', '.section-heading:has(+ .tabbed-section-panel)'),
      entry('shared:ToggleGroup', '.reader-rail'),
    ],
  },
  Fold: {
    metrics: 'heading',
    entries: [
      entry('shared:Group', '.collapsible-group-head', { parts: { count: '.count-badge' } }),
      entry('shared:CardTray', '.card-tray--tray > .card-tray-head'),
      entry('shared:NavRow', '#sidebar .srow.disc'),
      entry('hand:shell/Sidebar.tsx', '#sidebar .sb-h'),
      entry('shared:FoldToggle', '.fold-toggle--composite', { not: '.card-tray--row .fold-toggle--composite' }),
      entry('hand:components/timeline/TimelineBoard.tsx', '.glrow:has(.fold-toggle)'),
    ],
  },
  List: {
    metrics: 'list',
    entries: [
      entry('shared:StructuredList', '.structured-list'),
      entry('shared:PaperMetadata', '.paper-meta-list'),
      entry('shared:ProposalRows', '.proposal-rows'),
      entry('hand:shell/CommandPalette.tsx', '.cmdk-list'),
      entry('hand:components/settings/ExtensionSettings.tsx', '.extension-prompt-list'),
      entry('hand:components/settings/DiscoverySettings.tsx', '.direction-project'),
      entry('hand:routes/Feed.tsx', '.brief'),
      entry('hand:routes/Watches.tsx', '.author-matches'),
      entry('hand:components/reader/PaperWikiIngest.tsx', '.wiki-ingest-scope'),
      entry('hand:routes/Wiki.tsx', '.wktoc'),
      entry('hand:components/timeline/TimelineBoard.tsx', '.glabels'),
    ],
  },
  CardStack: {
    metrics: 'list',
    entries: [
      entry('shared:ListColumn', '.list-column'),
      entry('hand:routes/Wiki.tsx', '.wkgrid'),
      entry('hand:components/reader/ReadingNotes.tsx', '.reading-list'),
    ],
  },
  Table: {
    metrics: 'list',
    entries: [
      entry('hand:components/paper-table/PaperTable.tsx', '.ptable'),
      entry('hand:routes/Wiki.tsx', '.cmp'),
      entry('hand:routes/Ideas.tsx', '.idea-stats'),
      entry('shared:Markdown', '.md table'),
    ],
  },
  PropertyGrid: {
    metrics: 'list',
    entries: [
      entry('hand:routes/Wiki.tsx', '.wkprops'),
      entry('hand:routes/Projects.tsx', '.project-card-decisions'),
    ],
  },
  Row: {
    metrics: 'item',
    entries: [
      entry('shared:StructuredRow', '.structured-row', { not: '.structured-row:has(> .form-control)' }),
      entry('shared:NavRow', '.nav-row', { not: '.srow.disc, .sb-h' }),
      entry('shared:PickOption', '.mi.rrow', { parts: { title: '.rt', meta: '.rm' } }),
      entry('hand:components/paper-table/PaperTable.tsx', '.ptable tbody tr', { parts: { title: '.pt-title' } }),
      entry('hand:routes/Wiki.tsx', '.cmp tbody tr:not(.newrow)'),
      entry('hand:routes/Wiki.tsx', '.wktoc li'),
      entry('hand:components/wiki/WikiClaims.tsx', '.wkclaim-lines li'),
      entry('hand:components/reader/PaperWikiIngest.tsx', '.wiki-ingest-scope > div'),
      entry('hand:components/timeline/TimelineBoard.tsx', '.glrow'),
      entry('hand:components/settings/DiscoverySettings.tsx', '.direction-row'),
      entry('hand:components/settings/ExtensionSettings.tsx', '.extension-prompt'),
    ],
  },
  Card: {
    metrics: 'item',
    entries: [
      entry('shared:ResearchObjectCard', '.research-object-card', { not: '.newcard, .research-object-card:has(.form-control)' }),
      entry('shared:Card', '.card-surface'),
      entry('shared:PaperCard', '.paper-card', { parts: { title: 'h3', meta: '.paper-card-metadata' } }),
      entry('shared:ProposalCard', '.proposal-card'),
      entry('shared:PaperUnderstanding', '.paper-understanding'),
      entry('hand:routes/Feed.tsx', '.fitem', { parts: { title: '.fbody', meta: '.fsrc', trailing: '.ftime' } }),
      entry('hand:components/reader/ReadingNotes.tsx', '.reading-card'),
      entry('hand:components/paper-table/ResearchMap.tsx', '.research-map-detail'),
      entry('hand:components/timeline/TimelineBoard.tsx', '.gantt'),
    ],
  },
  DraftRow: {
    metrics: 'item',
    entries: [
      entry('shared:InlineDraftInput', '.structured-row:has(> .form-control)'),
      entry('hand:routes/Projects.tsx', '.research-object-card:has(.form-control)'),
      entry('hand:routes/Wiki.tsx', '.wkcard.newcard'),
      entry('hand:routes/Wiki.tsx', '.cmp .newrow'),
      entry('hand:components/project/ProjectSections.tsx', '.reladd'),
    ],
  },
  DraftForm: {
    metrics: 'item',
    entries: [
      entry('shared:DraftForm', '.draft-form'),
      entry('shared:IdeaDraft', '.idea-draft', { not: '.draft-form' }),
      entry('hand:components/reader/ReadingNotes.tsx', '.note-compose'),
      entry('hand:components/reader/ReadingRemark.tsx', '.remark-compose'),
      entry('hand:components/wiki/WikiClaims.tsx', '.wkclaim-draft'),
      entry('hand:routes/ProjectDetail.tsx', '.workspace-form'),
      entry('hand:routes/Ideas.tsx', '.idea-detail-editor'),
    ],
  },
  Message: {
    metrics: 'item',
    entries: [
      entry('shared:ChatMessageView', '.mwrap .msg', { not: '.msg:has(> .fitem)' }),
      entry('hand:components/chat/ChatMessage.tsx', '.mwrap .event'),
    ],
  },
  MessageColumn: {
    metrics: 'page',
    entries: [
      entry('hand:routes/Feed.tsx', '.feedcol .msgs'),
      entry('hand:routes/Chat.tsx', '.stream:not(.paper-chat .stream)'),
      entry('hand:components/chat/PaperChat.tsx', '.paper-chat .msgs'),
    ],
  },
  StatTile: { metrics: 'item', entries: [entry('hand:routes/ResearchOverview.tsx', '.ovstat')] },
  TimelineBar: { metrics: 'item', entries: [entry('hand:components/timeline/TimelineBoard.tsx', '.gbar')] },
  GraphNode: { metrics: 'item', entries: [entry('hand:components/project/ResearchGraph.tsx', '.rgn-box')] },
  ItemTitle: {
    metrics: 'text',
    entries: [
      entry('shared:PaperCard', '.paper-card h3'),
      entry('shared:PickOption', '.mi.rrow .rt'),
      entry('hand:components/project/ProjectIdentity.tsx', '.project-identity-name'),
      entry('hand:routes/Ideas.tsx', '.idea-card-title, .idea-row-title'),
      entry('hand:components/paper-table/PaperTable.tsx', '.pt-title'),
      entry('hand:routes/Changelog.tsx', '.crow .ct'),
      entry('hand:routes/Trash.tsx', '.tt2'),
      entry('hand:routes/Feed.tsx', '.fbody'),
      entry('hand:routes/Wiki.tsx', '.wkcard .wt'),
      entry('hand:routes/ResearchOverview.tsx', '.ovpulse-title'),
      entry('hand:components/timeline/TimelineBoard.tsx', '.timeline-item-label'),
      entry('hand:routes/ProjectDetail.tsx', '.project-idea-title'),
      entry('hand:routes/Watches.tsx', '.wrow .nm'),
    ],
  },
  ItemMeta: {
    metrics: 'text',
    entries: [
      entry('shared:PaperCard', '.paper-card-metadata'),
      entry('shared:PickOption', '.mi.rrow .rm'),
      entry('hand:components/project/ProjectIdentity.tsx', '.project-identity-topic'),
      entry('hand:components/project/ProjectControl.tsx', '.project-control-text, .project-control-meta'),
      entry('hand:routes/Ideas.tsx', '.idea-card-meta, .idea-card-source, .idea-row-meta'),
      entry('hand:routes/Projects.tsx', '.prow .m'),
      entry('hand:routes/Changelog.tsx', '.crow .cm'),
      entry('hand:components/paper-table/PaperTable.tsx', '.pt-dim'),
      entry('hand:routes/Wiki.tsx', '.wkcard .wm'),
      entry('hand:routes/ResearchOverview.tsx', '.ovpulse-sub'),
    ],
  },
  TrailingMeta: {
    metrics: 'text',
    entries: [
      entry('shared:TrailingDate', '.trailing-date'),
      entry('shared:PaperCardCitations', '.paper-card-citations'),
      entry('shared:SourceAnchor', '.source-anchor'),
      entry('hand:routes/Feed.tsx', '.ftime'),
      entry('hand:routes/Trash.tsx', '.tm2'),
      entry('hand:routes/ResearchOverview.tsx', '.ovlist-meta'),
      entry('hand:routes/Projects.tsx', '.pp-h > .dd'),
      entry('hand:routes/ProjectDetail.tsx', '.project-idea-source'),
    ],
  },
  RowActions: {
    metrics: 'button',
    entries: [
      entry('shared:RowActions', '.row-actions'),
      entry('hand:components/paper-table/PaperTable.tsx', '.row-actions-cell'),
    ],
  },
  OverflowMenu: { metrics: 'button', entries: [entry('shared:DotsMenu', '.dots')] },
  DragHandle: {
    metrics: 'button',
    entries: [
      entry('shared:DragHandle', '.drag-handle'),
      entry('hand:components/paper-table/PaperTable.tsx', '.thmove'),
    ],
  },
  ResizeGrip: { metrics: 'button', entries: [entry('shared:Grip', '.grip, .grip-edge')] },
  SelectedState: {
    metrics: 'state',
    entries: [
      entry('shared:StructuredRow', '.structured-row--selected'),
      entry('shared:NavRow', '.srow.on'),
      entry('shared:IconButton', '.icbtn[aria-pressed="true"]'),
      entry('hand:components/paper-table/PaperTable.tsx', '.ptable tbody tr.selected'),
      entry('hand:components/reader/ReadingNotes.tsx', '.reading-card.selected'),
    ],
  },
  Tag: {
    metrics: 'tag',
    entries: [entry('shared:Tag', '.tag', { not: '.tagchip, .date-chip, .chip-toggle, .add-action, .count-badge' })],
  },
  Chip: {
    metrics: 'tag',
    entries: [
      entry('shared:TagChips', '.tagchip', { not: '.tagadd' }),
      entry('shared:ChipToggles', '.chip-toggle'),
    ],
  },
  ChipList: {
    metrics: 'list',
    entries: [
      entry('shared:RailLinks', '.rail-links'),
      entry('hand:components/project/ProjectSections.tsx', '.wkrel', { not: '.rail-links' }),
      entry('hand:routes/Wiki.tsx', '.memb'),
      entry('hand:components/project/ResearchGraph.tsx', '.node-branch-groups'),
    ],
  },
  CountBadge: {
    metrics: 'tag',
    entries: [
      entry('shared:CountBadge', '.count-badge'),
      entry('hand:components/timeline/TimelineBoard.tsx', '.timeline-folded-count'),
    ],
  },
  DateChip: { metrics: 'tag', entries: [entry('shared:DateChip', '.date-chip')] },
  StatusDot: { metrics: 'tag', entries: [entry('shared:StatusDot', '.status-dot')] },
  ReadDots: { metrics: 'tag', entries: [entry('shared:ReadDots', '.read-dots')] },
  Rating: { metrics: 'tag', entries: [entry('shared:RatingStars', '.rating-stars')] },
  ReadState: { metrics: 'tag', entries: [entry('shared:ReadStatePicker', '.stchip')] },
  ProgressFill: {
    metrics: 'tag',
    entries: [
      entry('shared:ProgressFill', '.progress-fill'),
      entry('hand:routes/Projects.tsx', '.msbar'),
    ],
  },
  TimelineMarker: { metrics: 'tag', entries: [entry('hand:components/timeline/TimelineBoard.tsx', '.gddl')] },
  RunningIndicator: {
    metrics: 'button',
    entries: [
      entry('shared:IconButton', '.icbtn.busy'),
      entry('shared:Button', '.btn:has(.ring)'),
    ],
  },
  DropOverlay: { metrics: 'state', entries: [entry('hand:components/paper-table/PaperTable.tsx', '.paper-drop')] },
  Button: {
    metrics: 'button',
    entries: [
      entry('shared:Button', '.btn', {
        not: '.filter-menu, .sort-menu, .add-action, .choice-picker, .harness-trigger, .paper-abstract-toggle, .reading-summary-all, .zoom-reset, .graph-zoom-reset',
      }),
      entry('hand:components/project/ProjectPlan.tsx', '.din'),
    ],
  },
  ActionButton: {
    metrics: 'button',
    entries: [
      entry('shared:GenerationControl', '.generation-control'),
      entry('shared:HarnessAction', '.harness-trigger'),
    ],
  },
  IconButton: {
    metrics: 'button',
    entries: [entry('shared:IconButton', '.icbtn', { not: '.drag-handle, .dots' })],
  },
  AddAction: {
    metrics: 'button',
    entries: [
      entry('shared:AddAction', '.add-action'),
    ],
  },
  ShowMore: {
    metrics: 'button',
    entries: [
      entry('hand:components/paper/PaperAbstract.tsx', '.paper-abstract-toggle'),
      entry('hand:components/paper-table/PaperReadingSummary.tsx', '.reading-summary-all'),
    ],
  },
  Pager: { metrics: 'button', entries: [entry('shared:Pager', '.pgbtn')] },
  SegmentedControl: {
    metrics: 'button',
    entries: [
      entry('shared:SegmentedControl', '.segmented-control'),
      entry('hand:components/paper-table/ColumnAdd.tsx', '.mi-in.ctrow'),
    ],
  },
  Switch: { metrics: 'button', entries: [entry('shared:Switch', '.switch')] },
  FilterMenu: { metrics: 'button', entries: [entry('shared:FilterMenu', '.filter-menu')] },
  SortMenu: {
    metrics: 'button',
    entries: [
      entry('shared:SortMenu', '.sort-menu'),
      entry('hand:components/paper-table/PaperTable.tsx', '.thsort'),
    ],
  },
  Picker: {
    metrics: 'button',
    entries: [
      entry('shared:ChoicePicker', '.choice-picker'),
      entry('shared:TaskScheduleField', '.schedule-trigger'),
      entry('hand:components/settings/AppearanceSettings.tsx', '.appearance-choice'),
    ],
  },
  Swatches: { metrics: 'button', entries: [entry('shared:Swatches', '.swatch')] },
  ZoomControl: {
    metrics: 'button',
    entries: [
      entry('hand:routes/Reader.tsx', '.zoomctl'),
      entry('hand:components/project/ResearchGraph.tsx', '.graph-view-controls'),
    ],
  },
  SearchField: { metrics: 'field', entries: [entry('shared:ClearableInput', '.clearable-input')] },
  TextField: {
    metrics: 'field',
    entries: [entry('shared:FormInput', '.form-input', { not: '.clearable-input .form-input' })],
  },
  TextArea: { metrics: 'field', entries: [entry('shared:FormTextarea', '.form-textarea')] },
  InlineField: {
    metrics: 'field',
    entries: [
      entry('shared:InlineMetadataField', '.metadata-editable'),
      entry('hand:components/paper-table/PaperTable.tsx', '.celledit'),
    ],
  },
  Composer: { metrics: 'field', entries: [entry('shared:ChatComposer', '.cbox')] },
  Dialog: { metrics: 'overlay', entries: [entry('shared:ModalDialog', '.modal:not(.confirm)')] },
  ConfirmDialog: { metrics: 'overlay', entries: [entry('shared:ConfirmDialog', '.modal.confirm')] },
  Menu: { metrics: 'overlay', entries: [entry('shared:ActionMenu', '.ctxmenu[role="menu"][aria-labelledby]')] },
  ContextMenu: { metrics: 'overlay', entries: [entry('shared:ContextMenu', '.ctxmenu[role="menu"]:not([aria-labelledby])')] },
  Popover: {
    metrics: 'overlay',
    entries: [
      entry('shared:ActionPopover', '.ctxmenu[role="dialog"]'),
      entry('shared:PickerPopover', '.pickhits'),
    ],
  },
  Tooltip: { metrics: 'overlay', entries: [entry('shared:Tooltip', '.tooltip')] },
  Notice: { metrics: 'overlay', entries: [entry('shared:Notice', '.notice')] },
  EmptyState: {
    metrics: 'state',
    entries: [
      entry('shared:EmptyState', '.empty-state'),
      entry('hand:components/project/ProjectControl.tsx', '.project-control-value.empty'),
    ],
  },
  LoadingPlaceholder: { metrics: 'state', entries: [entry('shared:LoadingPlaceholder', '.loading-placeholder')] },
  InlineError: {
    metrics: 'state',
    entries: [
      entry('shared:InlineMessage', '.inline-message--error, .inline-message--warning', { not: '.page-error' }),
      entry('hand:components/settings/AppearanceSettings.tsx', '.appearance-problem'),
      entry('hand:components/settings/DeliverySettings.tsx', '.delivery-setting-error'),
      entry('hand:routes/Watches.tsx', '.watch-suggestion-error'),
    ],
  },
  PageError: {
    metrics: 'state',
    entries: [
      entry('shared:PageError', '.page-error'),
    ],
  },
  BusyLabel: { metrics: 'state', entries: [entry('hand:routes/Watches.tsx', '.author-search-note:not(:has(.inline-message))')] },
  Markdown: { metrics: 'text', entries: [entry('shared:Markdown', '.md')] },
  FadeText: { metrics: 'text', entries: [entry('shared:PaperAbstract', '.paper-abstract')] },
  EntityLink: { metrics: 'text', entries: [entry('shared:EntityLink', '.entity-link')] },
  DiffLines: { metrics: 'text', entries: [entry('shared:DiffLines', '.diff')] },
  FieldLabel: { metrics: 'text', entries: [entry('shared:PaperCard', '.paper-card-label')] },
  Caption: {
    metrics: 'text',
    entries: [
      entry('hand:routes/Inbox.tsx', '.fetchnote, .discovery-note'),
      entry('hand:routes/Settings.tsx', '.storage-state'),
      entry('hand:routes/Projects.tsx', '.project-card-label'),
      entry('hand:components/project/ResearchGraph.tsx', '.glegend'),
      entry('hand:components/FirstRunChecklist.tsx', '.firstrun-heading'),
      entry('hand:components/reader/PaperWikiIngest.tsx', '.wiki-ingest-status'),
      entry('hand:components/wiki/ReviewQueue.tsx', '.proposal-context'),
    ],
  },
}

/** Inventory patterns that are not measured, with the reason. */
export const UNMEASURED = {
  TimelineScale: 'domain-view drawing; catalog section 4 lets domain views keep their own canvas',
  GraphCanvas: 'domain-view drawing; catalog section 4 lets domain views keep their own canvas',
  PdfPage: 'domain-view drawing; catalog section 4 lets domain views keep their own canvas',
  HighlightMark: 'domain-view drawing; catalog section 4 lets domain views keep their own canvas',
  Checklist: 'the first-run checklist is measured as a Card (.card-surface)',
}

/** Inventory names that are spelled differently from the pattern they record. */
const ALIASES = { Grip: 'ResizeGrip' }

/** The pattern name an inventory record uses, without its "(outside vocabulary)" note. */
export function patternName(name) {
  const bare = name.replace(/\s*\(outside vocabulary\).*$/, '').trim()
  return ALIASES[bare] ?? bare
}

/** The components `sheets` knows, with the patterns each one's contact sheet shows. */
export const COMPONENTS = {
  'Row/Item': ['Row'],
  Card: ['Card'],
  SectionHeading: ['SectionHeading'],
  Button: ['Button'],
  EmptyState: ['EmptyState'],
}

/** The patterns the contact sheet of `name` shows: a COMPONENTS entry, else the pattern itself. Throws for an unknown name. */
export function componentPatterns(name) {
  const patterns = COMPONENTS[name] ?? (PATTERNS[name] === undefined ? undefined : [name])
  if (patterns === undefined) throw new Error(`Unknown component ${name}: use one of ${Object.keys(COMPONENTS).join(', ')} or a pattern name`)
  return patterns
}

/**
 * The measuring spec of `patterns` (default: all) for the in-page probe: one item per entry, with
 * its pattern, metric class and keys.
 */
export function probeEntries(patterns = Object.keys(PATTERNS)) {
  return patterns.flatMap((pattern) => PATTERNS[pattern].entries.map((item) => ({
    ...item, pattern, metrics: PATTERNS[pattern].metrics, keys: METRICS[PATTERNS[pattern].metrics],
  })))
}
