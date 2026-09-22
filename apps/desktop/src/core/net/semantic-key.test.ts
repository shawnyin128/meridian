import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openSemanticKeyStore, type SecretSealer } from './semantic-key.js'

const temporary: string[] = []
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }) })

function keyFile(): string {
  const root = mkdtempSync(join(tmpdir(), 'meridian-semantic-key-'))
  temporary.push(root)
  return join(root, 'config', 'semantic-scholar.json')
}

/** Reversible stand-in for OS encryption: prefixes the secret, and can ask for a re-encryption on open. */
const sealer = (rewrap = false): SecretSealer => ({
  seal: async (secret) => `sealed:${secret}`,
  open: async (ciphertext) => ({
    secret: ciphertext.replace(/^(re)?sealed:/, ''),
    ...(rewrap && ciphertext.startsWith('sealed:') ? { replacement: `re${ciphertext}` } : {}),
  }),
})

describe('openSemanticKeyStore', () => {
  it('没存过时是未配置，也不给 key', async () => {
    const store = await openSemanticKeyStore({ file: keyFile(), vault: sealer() })
    expect(store.status()).toEqual({ configured: false })
    expect(store.current()).toBeUndefined()
  })

  it('保存后只露末四位，文件里是密文，重开后能解出原 key', async () => {
    const file = keyFile()
    const store = await openSemanticKeyStore({ file, vault: sealer() })
    await store.set('  abcd1234wxyz  ')
    expect(store.status()).toEqual({ configured: true, lastFour: 'wxyz' })
    expect(store.current()).toBe('abcd1234wxyz')
    expect(readFileSync(file, 'utf8')).not.toContain('"abcd1234wxyz"')
    const reopened = await openSemanticKeyStore({ file, vault: sealer() })
    expect(reopened.current()).toBe('abcd1234wxyz')
  })

  it('移除或存空白都会删掉已保存的 key', async () => {
    const file = keyFile()
    const store = await openSemanticKeyStore({ file, vault: sealer() })
    await store.set('abcd1234wxyz')
    await store.set('   ')
    expect(existsSync(file)).toBe(false)
    expect(store.status()).toEqual({ configured: false })
    expect(store.current()).toBeUndefined()
  })

  it('加密服务要求换密文时把新密文写回', async () => {
    const file = keyFile()
    await (await openSemanticKeyStore({ file, vault: sealer() })).set('abcd1234wxyz')
    const reopened = await openSemanticKeyStore({ file, vault: sealer(true) })
    expect(reopened.current()).toBe('abcd1234wxyz')
    expect(JSON.parse(readFileSync(file, 'utf8')).ciphertext).toBe('resealed:abcd1234wxyz')
  })
})
