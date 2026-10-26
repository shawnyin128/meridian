import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { statusLine } from '../renderer/components/chat/status-lines.js'
import { catalogFor } from '../renderer/messages/catalog.js'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const source = (path: string) => readFileSync(join(REPO, path), 'utf8')
const all = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]!)

describe('聊天的状态行', () => {
  it('App 现在写进状态行的每一种原因，英文界面里都是英文', () => {
    const credentials = source('apps/desktop/src/main/messages.ts').match(/credentials: \{([^}]*)\}/)![1]!
    const reasons = [
      ...all(source('apps/desktop/src/core/harness/chat.ts'), /new ChatFailure\('([^']+)'(?:, \{ cause \})?\)/g),
      ...all(source('apps/desktop/src/core/harness/chat-service.ts'), /const plain = .* : '([^']+)'/g),
      // The Harness's own words for a model's failure; a status code stands in for {status}.
      ...all(source('apps/harness/src/meridian_harness/models.py'), /cls\(\s*f?"([^"]+)"/g).map((text) => text.replace('{status}', '401')),
      ...all(source('apps/desktop/src/core/harness/credential-vault.ts'), /(?:fail\(|\?\? )'([^']+)'/g),
      ...all(credentials, /: '([^']+)'/g),
    ]
    expect(reasons.length).toBeGreaterThan(14)
    const en = catalogFor('en')
    expect(reasons.map((reason) => statusLine(`生成失败：${reason}`, en)).filter((line) => /[㐀-鿿]/.test(line))).toEqual([])
  })
})
