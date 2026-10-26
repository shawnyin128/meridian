import type { ContractMethod } from '../shared/contract.js'
import type { AppUpdateStatus } from '../shared/app-update.js'
import type { AppCommand, MenuState } from '../shared/app-commands.js'

declare global {
  interface Window {
    meridian: {
      call(method: ContractMethod, params: unknown): Promise<unknown>
      onOpenSettings(handler: () => void): () => void
      onOpenAgentTutorial(handler: () => void): () => void
      onOpenPalette(handler: () => void): () => void
      onAppCommand(handler: (command: AppCommand) => void): () => void
      setMenuState(state: MenuState): void
      chooseLibraryRoot(): Promise<string | null>
      chooseWorkspaceRoot(): Promise<string | null>
      pathForFile(file: File): string
      revealFile(path: string): Promise<boolean>
      updates: {
        status(): Promise<AppUpdateStatus>
        check(): Promise<AppUpdateStatus>
        install(): void
        onChange(handler: (status: AppUpdateStatus) => void): () => void
      }
      restartApp(): void
      revealLogs(): void
      toggleMaximize(): void
      onFullScreen(handler: (on: boolean) => void): () => void
      readonly platform: string
      setTitleBarTheme(symbolColor: string): void
      setLocale(locale: 'zh' | 'en'): void
    }
  }
}
