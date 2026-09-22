import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { ExtensionStatus, FeedRun } from '../../shared/contract.js'

const NoticesSchema = z.object({
  appVersion: z.string(),
  extensions: z.array(z.string()),
}).strict()

/**
 * Tells the user, through the feed, about version changes they would otherwise not see: the app
 * having updated itself since the last run, and each plugin older than `pluginVersion`, the newest
 * plugin version known. Every
 * notice is posted once per machine; `file` remembers what was posted. The first run on a machine
 * records the app version without announcing it.
 */
export function noteVersionChanges({ file, appVersion, pluginVersion, extensions, post }: {
  file: string
  appVersion: string
  pluginVersion: string
  extensions: ExtensionStatus[]
  post: (runs: FeedRun[]) => void
}): void {
  const prior = existsSync(file) ? NoticesSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) : null
  const noticed = new Set(prior?.extensions ?? [])
  if (prior !== null && prior.appVersion !== appVersion) {
    post([
      { kind: 'text', text: 'Meridian 已更新到 ' },
      { kind: 'strong', text: appVersion },
      { kind: 'text', text: '。' },
    ])
  }
  for (const extension of extensions) {
    const key = `${extension.id}@${pluginVersion}`
    if (extension.state !== 'update-required' || extension.version === undefined || noticed.has(key)) continue
    noticed.add(key)
    post([
      { kind: 'text', text: '扩展 ' },
      { kind: 'strong', text: extension.name },
      {
        kind: 'text',
        text: ` 还是 ${extension.version}，最新是 ${pluginVersion}。到设置 · 扩展复制更新命令，更新后重启 coding agent 会话。`,
      },
    ])
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ appVersion, extensions: [...noticed] }, null, 2)}\n`, 'utf8')
}
