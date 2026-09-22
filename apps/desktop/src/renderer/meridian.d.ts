import type { ContractMethod } from '../shared/contract.js'
import type { AppUpdateStatus } from '../shared/app-update.js'

declare global {
  interface Window {
    meridian: {
      call(method: ContractMethod, params: unknown): Promise<unknown>
      onOpenSettings(handler: () => void): () => void
      onOpenAgentTutorial(handler: () => void): () => void
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
      toggleMaximize(): void
      readonly platform: string
      setTitleBarTheme(symbolColor: string): void
      setLocale(locale: 'zh' | 'en'): void
    }
  }
}
