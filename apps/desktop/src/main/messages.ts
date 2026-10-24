import type { CredentialVaultCopy } from './credential-vault.js'
import type { EditMenuCopy, MenuCopy } from './menu.js'

export type UiLocale = 'zh' | 'en'

export type MainCopy = {
  menu: MenuCopy
  editMenu: EditMenuCopy
  chooseLibrary: { title: string; button: string }
  chooseWorkspace: { title: string; button: string }
  credentials: CredentialVaultCopy
  preload: { serviceUnavailable: string; connectionMissing: string }
}

/** The edit commands both the application menu and a text's context menu name. */
const ZH_EDIT = { cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选' }
const EN_EDIT = { cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All' }

export const MAIN_COPY: Record<UiLocale, MainCopy> = {
  zh: {
    menu: {
      settings: '设置…', palette: '命令面板…', tools: '工具', help: '帮助', agentTutorial: 'Skill 与 MCP 使用教程',
      file: '文件', edit: '编辑', view: '视图', window: '窗口', substitutions: '替换', speech: '语音',
      roles: {
        ...ZH_EDIT,
        about: '关于 Meridian', services: '服务', hide: '隐藏 Meridian', hideOthers: '隐藏其他', unhide: '全部显示',
        quit: '退出 Meridian', close: '关闭窗口',
        undo: '撤销', redo: '重做', pasteAndMatchStyle: '粘贴并匹配样式', delete: '删除',
        showSubstitutions: '显示替换', toggleSmartQuotes: '智能引号', toggleSmartDashes: '智能破折号',
        toggleTextReplacement: '文本替换', startSpeaking: '开始朗读', stopSpeaking: '停止朗读',
        reload: '重新载入', forceReload: '强制重新载入', toggleDevTools: '开发者工具',
        resetZoom: '实际大小', zoomIn: '放大', zoomOut: '缩小', togglefullscreen: '切换全屏',
        minimize: '最小化', zoom: '缩放', front: '前置全部窗口',
      },
    },
    editMenu: { ...ZH_EDIT, lookUp: (text) => `查询“${text}”` },
    chooseLibrary: { title: '选择 Meridian 论文库根目录', button: '选择' },
    chooseWorkspace: { title: '选择项目目录', button: '连接' },
    credentials: {
      unavailable: '操作系统安全凭据库不可用，API Key 未保存',
      secureBackendMissing: '未检测到安全的系统密码库，API Key 未保存',
      invalidCiphertext: '保存的 API Key 密文无效',
      operationFailed: '系统凭据库操作失败',
    },
    preload: {
      serviceUnavailable: 'Meridian 无法连接本地数据服务。',
      connectionMissing: 'Meridian 没有收到本地数据服务连接。',
    },
  },
  en: {
    menu: {
      settings: 'Settings…', palette: 'Command Palette…', tools: 'Tools', help: 'Help',
      agentTutorial: 'Using Skills and MCP…',
      file: 'File', edit: 'Edit', view: 'View', window: 'Window', substitutions: 'Substitutions', speech: 'Speech',
      roles: {
        ...EN_EDIT,
        about: 'About Meridian', services: 'Services', hide: 'Hide Meridian', hideOthers: 'Hide Others', unhide: 'Show All',
        quit: 'Quit Meridian', close: 'Close Window',
        undo: 'Undo', redo: 'Redo', pasteAndMatchStyle: 'Paste and Match Style', delete: 'Delete',
        showSubstitutions: 'Show Substitutions', toggleSmartQuotes: 'Smart Quotes', toggleSmartDashes: 'Smart Dashes',
        toggleTextReplacement: 'Text Replacement', startSpeaking: 'Start Speaking', stopSpeaking: 'Stop Speaking',
        reload: 'Reload', forceReload: 'Force Reload', toggleDevTools: 'Toggle Developer Tools',
        resetZoom: 'Actual Size', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', togglefullscreen: 'Toggle Full Screen',
        minimize: 'Minimize', zoom: 'Zoom', front: 'Bring All to Front',
      },
    },
    editMenu: { ...EN_EDIT, lookUp: (text) => `Look Up “${text}”` },
    chooseLibrary: { title: 'Choose a Meridian library folder', button: 'Choose' },
    chooseWorkspace: { title: 'Choose a project folder', button: 'Connect' },
    credentials: {
      unavailable: 'The operating system credential vault is unavailable. The API key was not saved.',
      secureBackendMissing: 'No secure system credential vault was found. The API key was not saved.',
      invalidCiphertext: 'The saved API key is invalid.',
      operationFailed: 'The system credential vault operation failed.',
    },
    preload: {
      serviceUnavailable: 'Meridian could not connect to its local data service.',
      connectionMissing: 'Meridian did not receive a connection to its local data service.',
    },
  },
}

export const uiLocaleOf = (value: unknown): UiLocale =>
  typeof value === 'string' && value.toLowerCase().startsWith('zh') ? 'zh' : 'en'
