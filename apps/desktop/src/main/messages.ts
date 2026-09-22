import type { CredentialVaultCopy } from './credential-vault.js'
import type { MenuCopy } from './menu.js'

export type UiLocale = 'zh' | 'en'

export type MainCopy = {
  menu: MenuCopy
  chooseLibrary: { title: string; button: string }
  chooseWorkspace: { title: string; button: string }
  credentials: CredentialVaultCopy
  preload: { serviceUnavailable: string; connectionMissing: string; unknownError: string }
}

export const MAIN_COPY: Record<UiLocale, MainCopy> = {
  zh: {
    menu: {
      settings: '设置…', tools: '工具', help: 'Help', agentTutorial: 'Skill 与 MCP 使用教程',
    },
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
      unknownError: '出了点问题。',
    },
  },
  en: {
    menu: {
      settings: 'Settings…', tools: 'Tools', help: 'Help',
      agentTutorial: 'Using Skills and MCP…',
    },
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
      unknownError: 'Something went wrong.',
    },
  },
}

export const uiLocaleOf = (value: unknown): UiLocale =>
  typeof value === 'string' && value.toLowerCase().startsWith('zh') ? 'zh' : 'en'
