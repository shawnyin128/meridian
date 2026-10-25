// The navigation map of the component review: the screens and states the inventory walked, each
// reached from any screen by Playwright input alone, so a run never depends on the state before it.

/** Prefix for a selector inside the visible screen. */
const V = '.screenslot:not([hidden]) '

/** Closes open menus, dialogs and drafts, and leaves the reader, which hides the sidebar. */
const reset = [['press', 'Escape'], ['press', 'Escape'], ['clickIf', '.main.reading .paper-chat .desk-head .back']]
/** Goes to the sidebar row `desk` from any screen. */
const desk = (name) => [...reset, ['click', `[data-desk="${name}"]`], ['wait', 700]]
const openSettings = [...reset, ['click', '.appbtn'], ['click', '[data-appmenu] .mi'], ['wait', '.set-side']]
const settingsPane = (name) => [['click', `.set-side [data-setcat="${name}"]`], ['wait', 600]]
const openReader = [
  ...desk('papers'), ['click', `${V}tbody tr`], ['wait', `${V}.paper-detail-slot .panel-head`], ['click', `${V}.paper-detail-slot .panel-head .icbtn`], ['wait', `${V}.reader-rail`], ['wait', 900],
]
const readerTab = (label) => [['click', `${V}.reader-rail [aria-label="${label}"]`], ['wait', 700]]
/** The seeded project with every section filled: plan, timeline, records, graph and linked ideas. */
const openProject = [...desk('resproj'), ['click', `${V}[data-proj="project-59"]`], ['wait', `${V}.project-detail-page`], ['wait', 600]]
const openWiki = [...desk('wiki'), ['wait', `${V}.wkgrid`]]

/**
 * Every state: `screen` names the screen in reports, `batch` the App run it belongs to, `scope`
 * where its elements are measured (`screen`, `shell`, `overlay` or a selector, see probe.mjs), and `steps` how
 * to reach it. A state with `continues` starts where the state before it in the same batch ended
 * instead of from scratch; `keepPointer` leaves the pointer where the steps put it, and `after`
 * undoes what the steps changed that outlives the state, such as a stored view choice.
 */
export const STATES = [
  { screen: 'Shell', state: 'sidebar', batch: 'feeds', scope: 'shell', steps: desk('feed') },
  { screen: 'Shell', state: 'app-menu', batch: 'feeds', scope: 'overlay', steps: [...desk('feed'), ['click', '.appbtn'], ['wait', '[data-appmenu]']] },
  { screen: 'Shell', state: 'search', batch: 'feeds', scope: 'overlay', steps: [...desk('feed'), ['fill', '#sSearch', 'KV'], ['wait', '.pickhits'], ['wait', 600]] },
  { screen: 'Shell', state: 'search-empty', batch: 'feeds', scope: 'overlay', steps: [...desk('feed'), ['fill', '#sSearch', 'zzzqqq'], ['wait', '.sres .empty-state--option']] },
  { screen: 'Shell', state: 'command-palette', batch: 'feeds', scope: 'overlay', steps: [...desk('feed'), ['click', '.appbtn'], ['click', '[data-appmenu] .mi', 1], ['wait', '.cmdk-list']] },
  { screen: 'Shell', state: 'tooltip', batch: 'feeds', scope: 'overlay', keepPointer: true, steps: [...desk('feed'), ['hover', '#sbBtn'], ['wait', '.tooltip']] },
  { screen: 'Shell', state: 'about', batch: 'feeds', scope: 'overlay', steps: [...desk('feed'), ['click', '.appbtn'], ['click', '[data-appmenu] .mi', 3], ['wait', '.about-pop']] },
  { screen: '动态', state: 'default', batch: 'feeds', steps: [...desk('feed'), ['wait', `${V}.fitem`]] },
  { screen: '论文推送', state: 'watch', batch: 'feeds', steps: [...reset, ['click', '#rowInboxAll .nav-row-label'], ['wait', `${V}.paper-card`]] },
  { screen: '论文推送', state: 'sort-menu', batch: 'feeds', scope: 'overlay', steps: [...reset, ['click', '#rowInboxAll .nav-row-label'], ['click', `${V}.sort-menu`], ['wait', '.ctxmenu']] },
  { screen: '论文推送', state: 'card-hover', batch: 'feeds', keepPointer: true, steps: [...reset, ['click', '#rowInboxAll .nav-row-label'], ['hover', `${V}.paper-card`], ['wait', 400]] },
  { screen: '发现', state: 'default', batch: 'feeds', steps: [...reset, ['click', '[data-inbox="discovery"]'], ['wait', `${V}.paper-card`]] },
  { screen: '稍后阅读', state: 'default', batch: 'feeds', steps: [...desk('later'), ['wait', `${V}.paper-card`]] },
  { screen: '对话', state: 'thread', batch: 'feeds', steps: [...reset, ['click', '#chatList .chat-row'], ['wait', `${V}.stream`], ['wait', 800]] },
  { screen: '对话', state: 'row-hover', batch: 'feeds', scope: 'shell', keepPointer: true, steps: [['hover', '#chatList .chat-row'], ['wait', 300]] },
  { screen: '论文推送', state: 'download-error', batch: 'feeds', steps: [
    ['answer', 'inbox.download', "{ kind: 'failed', reason: 'not-pdf' }"], ...reset, ['click', '#rowInboxAll .nav-row-label'], ['hover', `${V}.paper-card`],
    ['click', `${V}.paper-card [aria-label="下载并入库"]`], ['wait', `${V}.paper-card [role="alert"], ${V}.paper-card .pfail`],
  ] },
  // The held download is sent on afterwards and fails under the canned network, writing nothing.
  { screen: '论文推送', state: 'downloading', batch: 'feeds', keepPointer: true, steps: [
    ['hold', 'inbox.download'], ...reset, ['click', '#rowInboxAll .nav-row-label'], ['hover', `${V}.paper-card`, 1],
    ['click', `${V}.paper-card [aria-label="下载并入库"]`, 1], ['wait', `${V}.paper-card .icbtn.busy`],
  ] },

  { screen: '论文', state: 'table', batch: 'library', steps: [...desk('papers'), ['wait', `${V}tbody tr`]] },
  { screen: '论文', state: 'row-hover', batch: 'library', keepPointer: true, steps: [...desk('papers'), ['hover', `${V}tbody tr`], ['wait', 300]] },
  { screen: '论文', state: 'detail', batch: 'library', steps: [...desk('papers'), ['click', `${V}tbody tr`], ['wait', `${V}.paper-detail-slot .panel-head`], ['wait', 500]] },
  { screen: '论文', state: 'grouped', batch: 'library', steps: [...desk('papers'), ['radio', '主题'], ['wait', `${V}.gxrow`]], after: [['radio', '无']] },
  { screen: '论文', state: 'drop', batch: 'library', steps: [...desk('papers'), ['drag', `${V}.paper-library`, 'dragenter'], ['wait', `${V}.paper-drop`]], after: [['drag', `${V}.paper-library`, 'dragleave']] },
  { screen: '论文', state: 'research-map', batch: 'library', steps: [...desk('papers'), ['radio', '研究地图'], ['wait', `${V}.research-map .split-page`], ['wait', 600]], after: [['radio', '列表']] },
  // A larger total than the library holds puts the pager under the table; typing a query reloads the list.
  { screen: '论文', state: 'pager', batch: 'library', steps: [
    ['transform', 'papers.list', '(list) => ({ ...list, total: Math.max(list.total, 45) })'], ...desk('papers'),
    ['fill', `${V}.paper-search input`, 'e'], ['wait', `${V}.pgbtn`],
  ], after: [['fill', `${V}.paper-search input`, '']] },
  { screen: '论文', state: 'loading', batch: 'library', steps: [
    ['hold', 'papers.reading'], ...desk('papers'), ['click', `${V}tbody tr`, 1], ['wait', `${V}.loading-placeholder`], ['wait', 400],
  ] },
  // The seeded EAGLE paper has more reading notes than the detail's excerpt shows.
  { screen: '论文', state: 'show-more', batch: 'library', steps: [...desk('papers'), ['clickText', `${V}tbody tr`, 'EAGLE'], ['wait', `${V}.reading-summary-all`]] },
  { screen: '论文', state: 'context-menu', batch: 'library', scope: 'overlay', steps: [...desk('papers'), ['rightclick', `${V}tbody tr`], ['wait', '.ctxmenu']] },
  { screen: '阅读器', state: 'default', batch: 'library', steps: openReader },
  { screen: '阅读器', state: 'metadata', batch: 'library', continues: true, steps: readerTab('元数据') },
  { screen: '阅读器', state: 'highlights', batch: 'library', continues: true, steps: readerTab('高亮与批注') },
  { screen: '阅读器', state: 'notes', batch: 'library', continues: true, steps: readerTab('阅读笔记') },
  { screen: '阅读器', state: 'remark', batch: 'library', continues: true, steps: readerTab('随笔') },
  { screen: '阅读器', state: 'wiki', batch: 'library', continues: true, steps: readerTab('内化到 Wiki') },
  // The reader keeps a paper it opened, so this state opens one no earlier state opened.
  { screen: '阅读器', state: 'page-error', batch: 'library', steps: [
    ...desk('papers'), ['click', `${V}tbody tr`, 2], ['wait', `${V}.paper-detail-slot .panel-head`], ['fail', 'papers.get', 'not-found'], ['fail', 'papers.source', 'not-found'],
    ['click', `${V}.paper-detail-slot .panel-head .icbtn`], ['wait', `${V}[role="alert"], ${V}.pdfload`],
  ] },
  { screen: 'Wiki', state: 'home', batch: 'library', steps: openWiki },
  { screen: 'Wiki', state: 'paper', batch: 'library', steps: [...openWiki, ['click', `${V}.wkcard--paper .item-open`], ['wait', `${V}.split-rail`], ['wait', 500]] },
  { screen: 'Wiki', state: 'aggregation', batch: 'library', steps: [...openWiki, ['click', `${V}.wkcard:not(.wkcard--paper) .item-open`], ['wait', `${V}.split-rail`], ['wait', 500]] },
  { screen: 'Wiki', state: 'review', batch: 'library', steps: [...openWiki, ['click', `${V}.desk-head .page-actions .btn`], ['wait', 900]] },
  { screen: 'Wiki', state: 'tidy', batch: 'library', steps: [...openWiki, ['click', `${V}.desk-head .page-actions .btn`, -1], ['wait', 900]] },
  { screen: '论文', state: 'notice-refusal', batch: 'library', scope: '.notice-host', steps: [
    ['fail', 'papers.update', 'write'], ...desk('papers'), ['radio', '1 星'], ['wait', '.notice.show'],
  ] },
  // A move to the trash notices with its Undo. It is answered in Core's place, so nothing is written to the library copy.
  { screen: '论文', state: 'notice-success', batch: 'library', scope: '.notice-host', steps: [
    ['answer', 'papers.delete', "{ change: 'review-change' }"], ...desk('papers'), ['rightclick', `${V}tbody tr`], ['wait', '.ctxmenu'],
    ['clickText', '.ctxmenu [role="menuitem"]', '移到垃圾桶'], ['wait', '.notice.show'],
  ] },

  { screen: '总览', state: 'default', batch: 'research', steps: [...desk('restl'), ['wait', `${V}.ovcols`]] },
  { screen: '总览', state: 'filter-menu', batch: 'research', scope: 'overlay', steps: [...desk('restl'), ['click', `${V}.filter-menu`], ['wait', '.ctxmenu']] },
  { screen: '项目', state: 'list', batch: 'research', steps: [...desk('resproj'), ['wait', `${V}.item--card`]] },
  { screen: '项目', state: 'card-menu', batch: 'research', scope: 'overlay', steps: [...desk('resproj'), ['hover', `${V}.item--card`], ['click', `${V}.item--card .dots`], ['wait', '.ctxmenu']] },
  { screen: '项目', state: 'draft', batch: 'research', steps: [...desk('resproj'), ['click', `${V}.page-actions .add-action`], ['wait', `${V}.item--card .form-control`]] },
  { screen: '项目详情', state: 'default', batch: 'research', steps: openProject },
  { screen: '项目详情', state: 'task-panel', batch: 'research', steps: [...openProject, ['click', `${V}.plan-open`], ['wait', `${V}.project-detail-panel .panel-head`], ['wait', 500]] },
  { screen: '项目详情', state: 'records-graph', batch: 'research', steps: [...openProject, ['radio', '科研图'], ['wait', `${V}.rgraph-viewport`], ['wait', 600]] },
  { screen: '项目详情', state: 'records-conclusions', batch: 'research', steps: [...openProject, ['radio', '实验结论'], ['wait', 700]] },
  { screen: '想法', state: 'default', batch: 'research', steps: [...desk('ideas'), ['wait', `${V}.idea-card`]] },
  { screen: '想法', state: 'panel', batch: 'research', steps: [...desk('ideas'), ['click', `${V}.idea-card .item-open`], ['wait', `${V}.idea-detail-panel .panel-head`], ['wait', 500]] },
  { screen: '想法', state: 'card-menu', batch: 'research', scope: 'overlay', steps: [...desk('ideas'), ['hover', `${V}.idea-card`], ['click', `${V}.idea-card .dots`], ['wait', '.ctxmenu']] },
  { screen: '最近变动', state: 'default', batch: 'research', steps: [...desk('changelog'), ['wait', `${V}.crow`]] },
  { screen: '最近变动', state: 'expanded', batch: 'research', steps: [...desk('changelog'), ['click', `${V}.card-tray-toggle`], ['wait', `${V}.diff`]] },
  { screen: '垃圾桶', state: 'default', batch: 'research', steps: [...desk('trash'), ['wait', `${V}.trow`]] },
  { screen: '论文', state: 'page-error', batch: 'research', steps: [['fail', 'papers.get', 'not-found'], ...desk('papers'), ['click', `${V}tbody tr`], ['wait', `${V}[role="alert"]`]] },
  { screen: '垃圾桶', state: 'confirm-purge', batch: 'research', scope: 'overlay', steps: [...desk('trash'), ['click', `${V}.desk-head .page-actions .btn`], ['wait', '.modal.confirm']] },

  { screen: '设置', state: 'appearance', batch: 'settings', scope: 'overlay', steps: [...openSettings, ...settingsPane('appearance')] },
  { screen: '设置', state: 'storage', batch: 'settings', scope: 'overlay', continues: true, steps: settingsPane('storage') },
  { screen: '设置', state: 'api', batch: 'settings', scope: 'overlay', continues: true, steps: settingsPane('api') },
  { screen: '设置', state: 'model', batch: 'settings', scope: 'overlay', continues: true, steps: settingsPane('model') },
  { screen: '设置', state: 'research', batch: 'settings', scope: 'overlay', continues: true, steps: settingsPane('research') },
  { screen: '设置', state: 'extensions', batch: 'settings', scope: 'overlay', continues: true, steps: settingsPane('extensions') },
  { screen: '设置', state: 'delivery', batch: 'settings', scope: 'overlay', continues: true, steps: settingsPane('delivery') },
  { screen: '设置', state: 'watches', batch: 'settings', scope: 'overlay', continues: true, steps: settingsPane('delivery-watch') },
  { screen: '设置', state: 'discovery', batch: 'settings', scope: 'overlay', continues: true, steps: settingsPane('delivery-discovery') },
  { screen: '设置', state: 'archived', batch: 'settings', scope: 'overlay', continues: true, steps: settingsPane('archived') },
  { screen: '设置', state: 'delivery-error', batch: 'settings', scope: 'overlay', steps: [
    ...openSettings, ...settingsPane('delivery'), ['fill', '.setdlg [aria-label="显示上限"]', '0'], ['wait', 400],
  ] },
  { screen: '设置', state: 'watch-errors', batch: 'settings', scope: 'overlay', steps: [
    ['fail', 'watch.suggest', 'rate-limit'], ['fail', 'author.search', 'rate-limit'], ...openSettings, ...settingsPane('delivery-watch'),
    ['fill', '.setdlg .watch-suggestions input', '我想关注批量推理中的动态验证与草稿树'], ['clickText', '.setdlg .watch-suggestions .btn', '查找建议'],
    ['click', '.setdlg .section-heading:has-text("作者") button'], ['fill', '.setdlg .wrow.newrow input', 'Ada Lovelace'], ['wait', 1500],
  ] },
  { screen: '设置', state: 'author-searching', batch: 'settings', scope: 'overlay', steps: [
    ['hold', 'author.search'], ...openSettings, ...settingsPane('delivery-watch'),
    ['click', '.setdlg .section-heading:has-text("作者") button'], ['fill', '.setdlg .wrow.newrow input', 'Ada Lovelace'], ['wait', '.setdlg .author-search-note'],
  ] },
  { screen: '设置', state: 'theme-problem', batch: 'settings', scope: 'overlay', steps: [
    ['transform', 'themes.list', "(files) => [...files, { state: 'unreadable', file: 'broken.json', reason: 'syntax' }]"],
    ...openSettings, ...settingsPane('appearance'), ['wait', '.setdlg .appearance-problem'],
  ] },
  { screen: '设置', state: 'confirm-reset', batch: 'settings', scope: 'overlay', steps: [...openSettings, ...settingsPane('storage'), ['click', '.storage-reset .btn'], ['wait', '.modal.confirm']] },
  // The trash loads once per App run, so its failure comes in a batch that has not shown the trash.
  { screen: '垃圾桶', state: 'page-error', batch: 'settings', steps: [['fail', 'trash.list', 'newer-version'], ...desk('trash'), ['wait', `${V}[role="alert"]`]] },
  // Leaving the theme editor asks to discard the draft, so it is the batch's last state.
  { screen: '设置', state: 'theme-editor', batch: 'settings', scope: 'overlay', steps: [...openSettings, ...settingsPane('appearance'), ['click', '.set-body .section-heading .add-action'], ['wait', '.theme-editor-title']] },
]

/** The screens in the order the map first visits them. */
export const SCREEN_ORDER = [...new Set(STATES.map((state) => state.screen))]
