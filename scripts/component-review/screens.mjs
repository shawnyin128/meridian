// The navigation map of the component review: the screens and states the inventory walked, each
// reached from any screen by Playwright input alone, so a run never depends on the state before it.

/** Prefix for a selector inside the visible screen. */
const V = '.screenslot:not([hidden]) '

/** Closes open menus, dialogs and drafts, and leaves the reader, which hides the sidebar. */
const reset = [['press', 'Escape'], ['press', 'Escape'], ['clickIf', '.main.reading .paper-chat-head .back']]
/** Goes to the sidebar row `desk` from any screen. */
const desk = (name) => [...reset, ['click', `[data-desk="${name}"]`], ['wait', 700]]
const openSettings = [...reset, ['click', '.appbtn'], ['click', '[data-appmenu] .mi'], ['wait', '.set-side']]
const settingsPane = (name) => [['click', `.set-side [data-setcat="${name}"]`], ['wait', 600]]
const openReader = [
  ...desk('papers'), ['click', `${V}tbody tr`], ['wait', `${V}.pd-h`], ['click', `${V}.pd-h .icbtn`], ['wait', `${V}.reader-rail`], ['wait', 900],
]
const readerTab = (label) => [['click', `${V}.reader-rail [aria-label="${label}"]`], ['wait', 700]]
/** The seeded project with every section filled: plan, timeline, records, graph and linked ideas. */
const openProject = [...desk('resproj'), ['click', `${V}[data-proj="project-59"]`], ['wait', `${V}.project-detail-page`], ['wait', 600]]
const openWiki = [...desk('wiki'), ['wait', `${V}.wkgrid`]]

/**
 * Every state: `screen` names the screen in reports, `batch` the App run it belongs to, `scope`
 * where its elements are measured (`screen`, `shell` or `overlay`, see probe.mjs), and `steps` how
 * to reach it. A state with `continues` starts where the state before it in the same batch ended
 * instead of from scratch; `keepPointer` leaves the pointer where the steps put it, and `after`
 * undoes what the steps changed that outlives the state, such as a stored view choice.
 */
export const STATES = [
  { screen: 'Shell', state: 'sidebar', batch: 'feeds', scope: 'shell', steps: desk('feed') },
  { screen: 'Shell', state: 'app-menu', batch: 'feeds', scope: 'overlay', steps: [...desk('feed'), ['click', '.appbtn'], ['wait', '[data-appmenu]']] },
  { screen: 'Shell', state: 'search', batch: 'feeds', scope: 'overlay', steps: [...desk('feed'), ['fill', '#sSearch', 'KV'], ['wait', '.pickhits'], ['wait', 600]] },
  { screen: 'Shell', state: 'search-empty', batch: 'feeds', scope: 'overlay', steps: [...desk('feed'), ['fill', '#sSearch', 'zzzqqq'], ['wait', '.sres-empty']] },
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

  { screen: '论文', state: 'table', batch: 'library', steps: [...desk('papers'), ['wait', `${V}tbody tr`]] },
  { screen: '论文', state: 'row-hover', batch: 'library', keepPointer: true, steps: [...desk('papers'), ['hover', `${V}tbody tr`], ['wait', 300]] },
  { screen: '论文', state: 'detail', batch: 'library', steps: [...desk('papers'), ['click', `${V}tbody tr`], ['wait', `${V}.pd-h`], ['wait', 500]] },
  { screen: '论文', state: 'grouped', batch: 'library', steps: [...desk('papers'), ['radio', '主题'], ['wait', `${V}.gxrow`]], after: [['radio', '无']] },
  { screen: '论文', state: 'context-menu', batch: 'library', scope: 'overlay', steps: [...desk('papers'), ['rightclick', `${V}tbody tr`], ['wait', '.ctxmenu']] },
  { screen: '阅读器', state: 'default', batch: 'library', steps: openReader },
  { screen: '阅读器', state: 'metadata', batch: 'library', continues: true, steps: readerTab('元数据') },
  { screen: '阅读器', state: 'highlights', batch: 'library', continues: true, steps: readerTab('高亮与批注') },
  { screen: '阅读器', state: 'notes', batch: 'library', continues: true, steps: readerTab('阅读笔记') },
  { screen: '阅读器', state: 'remark', batch: 'library', continues: true, steps: readerTab('随笔') },
  { screen: '阅读器', state: 'wiki', batch: 'library', continues: true, steps: readerTab('内化到 Wiki') },
  { screen: 'Wiki', state: 'home', batch: 'library', steps: openWiki },
  { screen: 'Wiki', state: 'paper', batch: 'library', steps: [...openWiki, ['click', `${V}.wkcard--paper .research-object-card-open`], ['wait', `${V}.wkside`], ['wait', 500]] },
  { screen: 'Wiki', state: 'aggregation', batch: 'library', steps: [...openWiki, ['click', `${V}.wkcard:not(.wkcard--paper) .research-object-card-open`], ['wait', `${V}.wkside`], ['wait', 500]] },
  { screen: 'Wiki', state: 'review', batch: 'library', steps: [...openWiki, ['click', `${V}.desk-head .page-actions .btn`], ['wait', 900]] },
  { screen: 'Wiki', state: 'tidy', batch: 'library', steps: [...openWiki, ['click', `${V}.desk-head .page-actions .btn`, -1], ['wait', 900]] },

  { screen: '总览', state: 'default', batch: 'research', steps: [...desk('restl'), ['wait', `${V}.ovcols`]] },
  { screen: '总览', state: 'filter-menu', batch: 'research', scope: 'overlay', steps: [...desk('restl'), ['click', `${V}.filter-menu`], ['wait', '.ctxmenu']] },
  { screen: '项目', state: 'list', batch: 'research', steps: [...desk('resproj'), ['wait', `${V}.research-object-card`]] },
  { screen: '项目', state: 'card-menu', batch: 'research', scope: 'overlay', steps: [...desk('resproj'), ['hover', `${V}.research-object-card`], ['click', `${V}.research-object-card .dots`], ['wait', '.ctxmenu']] },
  { screen: '项目', state: 'draft', batch: 'research', steps: [...desk('resproj'), ['click', `${V}.add-action-page`], ['wait', `${V}.research-object-card .form-control`]] },
  { screen: '项目详情', state: 'default', batch: 'research', steps: openProject },
  { screen: '项目详情', state: 'task-panel', batch: 'research', steps: [...openProject, ['click', `${V}.plan-open`], ['wait', `${V}.node-document-head`], ['wait', 500]] },
  { screen: '项目详情', state: 'records-graph', batch: 'research', steps: [...openProject, ['radio', '科研图'], ['wait', `${V}.rgraph-viewport`], ['wait', 600]] },
  { screen: '项目详情', state: 'records-conclusions', batch: 'research', steps: [...openProject, ['radio', '实验结论'], ['wait', 700]] },
  { screen: '想法', state: 'default', batch: 'research', steps: [...desk('ideas'), ['wait', `${V}.idea-card`]] },
  { screen: '想法', state: 'panel', batch: 'research', steps: [...desk('ideas'), ['click', `${V}.idea-card .research-object-card-open`], ['wait', `${V}.idea-panel-head`], ['wait', 500]] },
  { screen: '想法', state: 'card-menu', batch: 'research', scope: 'overlay', steps: [...desk('ideas'), ['hover', `${V}.idea-card`], ['click', `${V}.idea-card .dots`], ['wait', '.ctxmenu']] },
  { screen: '最近变动', state: 'default', batch: 'research', steps: [...desk('changelog'), ['wait', `${V}.crow`]] },
  { screen: '最近变动', state: 'expanded', batch: 'research', steps: [...desk('changelog'), ['click', `${V}.card-tray-toggle`], ['wait', `${V}.diff`]] },
  { screen: '垃圾桶', state: 'default', batch: 'research', steps: [...desk('trash'), ['wait', `${V}.trow`]] },
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
  { screen: '设置', state: 'confirm-reset', batch: 'settings', scope: 'overlay', steps: [...openSettings, ...settingsPane('storage'), ['click', '.storage-reset .btn'], ['wait', '.modal.confirm']] },
  // Leaving the theme editor asks to discard the draft, so it is the batch's last state.
  { screen: '设置', state: 'theme-editor', batch: 'settings', scope: 'overlay', steps: [...openSettings, ...settingsPane('appearance'), ['click', '.appearance-add'], ['wait', '.theme-editor-title']] },
]

/** The screens in the order the map first visits them. */
export const SCREEN_ORDER = [...new Set(STATES.map((state) => state.screen))]
