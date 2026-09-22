import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { SemanticKeyStatus } from '../../shared/contract.js'

/** The OS-backed encryption the store needs; Core's composition root passes the Harness credential vault. */
export type SecretSealer = {
  seal(secret: string): Promise<string>
  open(ciphertext: string): Promise<{ secret: string; replacement?: string }>
}

const StoredSchema = z.object({ ciphertext: z.string().min(1), lastFour: z.string() }).strict()

export type SemanticKeyStore = {
  /** Whether a key is saved, and its last four characters. */
  status(): SemanticKeyStatus
  /** The decrypted key for requests, or undefined when none is saved. */
  current(): string | undefined
  /** Saves `apiKey` encrypted, or removes the saved key when it is null or blank. */
  set(apiKey: string | null): Promise<void>
}

const lastFourOf = (secret: string) => Array.from(secret).slice(-4).join('')

/**
 * The user's optional Semantic Scholar API key, kept in `file` encrypted by the OS-backed `vault`
 * and decrypted once while opening. A key the vault re-encrypts on open is written back.
 */
export async function openSemanticKeyStore({ file, vault }: {
  file: string
  vault: SecretSealer
}): Promise<SemanticKeyStore> {
  let stored = existsSync(file) ? StoredSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) : null
  let key: string | undefined
  const write = (value: z.infer<typeof StoredSchema>) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }
  if (stored !== null) {
    const opened = await vault.open(stored.ciphertext)
    key = opened.secret
    if (opened.replacement !== undefined) {
      stored = { ...stored, ciphertext: opened.replacement }
      write(stored)
    }
  }
  return {
    status: () => (stored === null ? { configured: false } : { configured: true, lastFour: stored.lastFour }),
    current: () => key,
    async set(apiKey) {
      const trimmed = apiKey?.trim() ?? ''
      if (trimmed === '') {
        rmSync(file, { force: true })
        stored = null
        key = undefined
        return
      }
      stored = { ciphertext: await vault.seal(trimmed), lastFour: lastFourOf(trimmed) }
      write(stored)
      key = trimmed
    },
  }
}
