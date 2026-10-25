import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CliDiscovery } from './cli/discovery.js'
import { listCliModels, subscriptionStatus } from './subscription.js'

/** A stand-in for CLI discovery that answers `found` and records which CLI it was asked for. */
const discovery = (found: CliDiscovery) => vi.fn(async () => found)
const noModels = vi.fn(async () => [])

/**
 * A stand-in `codex` that records its arguments, working folder and environment in `<folder>/seen`
 * and answers with `stdout` and exit code `code`.
 */
function standInCodex(stdout: string, code = 0) {
  const folder = mkdtempSync(join(tmpdir(), 'meridian-stand-in-codex-'))
  const binary = join(folder, 'codex')
  writeFileSync(join(folder, 'stdout'), stdout)
  writeFileSync(binary, `#!/bin/sh\n{ echo "$@"; pwd; env; } > "${join(folder, 'seen')}"\ncat "${join(folder, 'stdout')}"\nexit ${code}\n`)
  chmodSync(binary, 0o755)
  return { binary, seen: () => readFileSync(join(folder, 'seen'), 'utf8').split('\n') }
}

const catalog = (models: object[]) => JSON.stringify({ models })

describe('subscription status', () => {
  it('reports a CLI discovery does not find as missing, listing no models', async () => {
    const discover = discovery({ cli: 'codex', installed: false })

    await expect(subscriptionStatus('codex', discover, noModels)).resolves.toEqual({ state: 'missing' })
    expect(discover).toHaveBeenCalledWith('codex')
    expect(noModels).not.toHaveBeenCalled()
  })

  it.each(['subscription', 'other', 'signed-out', 'unknown'] as const)(
    'reports an installed CLI signed in as %s with its version and models and never its path',
    async (signIn) => {
      const listModels = vi.fn(async () => ['opus'])
      const status = await subscriptionStatus('claude', discovery({
        cli: 'claude', installed: true, binary: '/Users/someone/.local/bin/claude', version: '2.1.280', signIn,
      }), listModels)

      expect(status).toEqual({ state: 'found', version: '2.1.280', signIn, models: ['opus'] })
      expect(listModels).toHaveBeenCalledWith('claude', '/Users/someone/.local/bin/claude')
    },
  )

  it('reports an installed CLI whose version could not be read with no version', async () => {
    await expect(subscriptionStatus('claude', discovery({
      cli: 'claude', installed: true, binary: '/opt/homebrew/bin/claude', version: null, signIn: 'subscription',
    }), noModels)).resolves.toEqual({ state: 'found', version: null, signIn: 'subscription', models: [] })
  })
})

describe('the models a subscription CLI accepts', () => {
  it('lists the aliases Claude Code names for its model option without starting it', async () => {
    await expect(listCliModels('claude', '/nonexistent/claude')).resolves.toEqual(['fable', 'opus', 'sonnet'])
  })

  it('lists the models Codex\'s bundled catalog shows, in its order, read offline in an empty folder without API keys', async () => {
    const codex = standInCodex(catalog([
      { slug: 'gpt-6-astra', visibility: 'list', priority: 2 },
      { slug: 'gpt-6.1-sol', visibility: 'list', priority: 1 },
      { slug: 'codex-auto-review', visibility: 'hide', priority: 3 },
      { slug: '--yolo', visibility: 'list', priority: 4 },
      { slug: 'gpt-5.5', visibility: 'list' },
    ]))

    const models = await listCliModels('codex', codex.binary, { PATH: '/usr/bin:/bin', OPENAI_API_KEY: 'sk-test', HOME: '/tmp' })

    expect(models).toEqual(['gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.5'])
    const [args, cwd, ...env] = codex.seen()
    expect(args).toBe('debug models --bundled')
    expect(cwd).toMatch(/meridian-cli-/)
    expect(env.some((line) => line.startsWith('OPENAI_API_KEY='))).toBe(false)
  })

  it.each([
    ['exits with an error', standInCodex('error: unrecognized subcommand', 2)],
    ['prints no catalog', standInCodex('not json')],
    ['lists no models', standInCodex(JSON.stringify({ catalog: [] }))],
  ])('lists no Codex models when Codex %s, and logs why', async (_, codex) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(listCliModels('codex', codex.binary, { PATH: '/usr/bin:/bin' })).resolves.toEqual([])
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })
})
