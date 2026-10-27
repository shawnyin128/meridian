import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CliDiscovery } from './cli/discovery.js'
import { followCliState, listCliModels, subscriptionStatus } from './subscription.js'

/** A stand-in for CLI discovery that answers `found` and records which CLI it was asked for. */
const discovery = (found: CliDiscovery) => vi.fn(async () => found)
const noModels = vi.fn(async () => ({ models: [], efforts: {} }))
const noLog = vi.fn()

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

    await expect(subscriptionStatus('codex', { discover, listModels: noModels, onLog: noLog })).resolves.toEqual({ state: 'missing' })
    expect(discover).toHaveBeenCalledWith('codex')
    expect(noModels).not.toHaveBeenCalled()
  })

  it.each(['subscription', 'other', 'signed-out', 'unknown'] as const)(
    'reports an installed CLI signed in as %s with its version, models and efforts and never its path',
    async (signIn) => {
      const listModels = vi.fn(async () => ({ models: ['opus'], efforts: { '': { levels: ['low', 'high'] } } }))
      const status = await subscriptionStatus('claude', {
        discover: discovery({
          cli: 'claude', installed: true, binary: '/Users/someone/.local/bin/claude', version: '2.1.280', missingFlags: [], signIn,
        }),
        listModels,
        onLog: noLog,
      })

      expect(status).toEqual({
        state: 'found', version: '2.1.280', signIn, models: ['opus'], efforts: { '': { levels: ['low', 'high'] } },
      })
      expect(listModels).toHaveBeenCalledWith('claude', '/Users/someone/.local/bin/claude')
    },
  )

  it('reports an installed CLI whose version could not be read with no version', async () => {
    await expect(subscriptionStatus('claude', {
      discover: discovery({
        cli: 'claude', installed: true, binary: '/opt/homebrew/bin/claude', version: null, missingFlags: [], signIn: 'subscription',
      }),
      listModels: noModels,
      onLog: noLog,
    })).resolves.toEqual({ state: 'found', version: null, signIn: 'subscription', models: [], efforts: {} })
  })

  it('reports a CLI whose help lacks a flag the runner passes as unsupported with its version, logging the flags it lacks', async () => {
    const onLog = vi.fn()
    const listModels = vi.fn(async () => ({ models: ['opus'], efforts: {} }))

    const status = await subscriptionStatus('claude', {
      discover: discovery({
        cli: 'claude', installed: true, binary: '/opt/homebrew/bin/claude', version: '2.0.1',
        missingFlags: ['--json-schema', '--strict-mcp-config'], signIn: 'subscription',
      }),
      listModels,
      onLog,
    })

    expect(status).toEqual({ state: 'unsupported', version: '2.0.1' })
    expect(onLog).toHaveBeenCalledWith('warn', expect.stringMatching(/claude 2\.0\.1.*--json-schema, --strict-mcp-config/))
    expect(listModels).not.toHaveBeenCalled()
  })
})

describe('the models a subscription CLI accepts', () => {
  it('lists the aliases Claude Code names for its model option, every one taking each --effort level with no default, without starting it', async () => {
    await expect(listCliModels('claude', '/nonexistent/claude')).resolves.toEqual({
      models: ['fable', 'opus', 'sonnet'],
      efforts: { '': { levels: ['low', 'medium', 'high', 'xhigh', 'max'] } },
    })
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

    expect(models.models).toEqual(['gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.5'])
    const [args, cwd, ...env] = codex.seen()
    expect(args).toBe('debug models --bundled')
    expect(cwd).toMatch(/meridian-cli-/)
    expect(env.some((line) => line.startsWith('OPENAI_API_KEY='))).toBe(false)
  })

  it('gives each model Codex\'s catalog shows the reasoning levels and default the catalog names, without ultra, and Codex\'s own default model the levels every one of them takes', async () => {
    const levels = (...efforts: string[]) => efforts.map((effort) => ({ effort, description: `${effort} reasoning` }))
    const codex = standInCodex(catalog([
      {
        slug: 'gpt-6.1-sol', visibility: 'list', priority: 1, default_reasoning_level: 'low',
        supported_reasoning_levels: levels('low', 'medium', 'high', 'xhigh', 'max', 'ultra'),
      },
      {
        slug: 'gpt-5.5', visibility: 'list', priority: 2, default_reasoning_level: 'medium',
        supported_reasoning_levels: levels('low', 'medium', 'high', 'xhigh'),
      },
      {
        slug: 'gpt-6-luna', visibility: 'list', priority: 3, default_reasoning_level: 'ultra',
        supported_reasoning_levels: [...levels('low', 'medium', 'Bad Level', 'ultra'), { description: 'no effort' }],
      },
      {
        slug: 'codex-auto-review', visibility: 'hide', priority: 4, default_reasoning_level: 'medium',
        supported_reasoning_levels: levels('medium'),
      },
    ]))

    const { efforts } = await listCliModels('codex', codex.binary, { PATH: '/usr/bin:/bin' })

    expect(efforts).toEqual({
      'gpt-6.1-sol': { levels: ['low', 'medium', 'high', 'xhigh', 'max'], default: 'low' },
      'gpt-5.5': { levels: ['low', 'medium', 'high', 'xhigh'], default: 'medium' },
      'gpt-6-luna': { levels: ['low', 'medium'] },
      '': { levels: ['low', 'medium'] },
    })
  })

  it('names no levels for Codex\'s own default model when a model it shows takes none', async () => {
    const codex = standInCodex(catalog([
      { slug: 'gpt-6.1-sol', visibility: 'list', priority: 1, supported_reasoning_levels: [{ effort: 'low' }] },
      { slug: 'gpt-4.1', visibility: 'list', priority: 2 },
    ]))

    await expect(listCliModels('codex', codex.binary, { PATH: '/usr/bin:/bin' })).resolves.toEqual({
      models: ['gpt-6.1-sol', 'gpt-4.1'], efforts: { 'gpt-6.1-sol': { levels: ['low'] } },
    })
  })

  it.each([
    ['exits with an error', standInCodex('error: unrecognized subcommand', 2)],
    ['prints no catalog', standInCodex('not json')],
    ['lists no models', standInCodex(JSON.stringify({ catalog: [] }))],
  ])('lists no Codex models when Codex %s, and logs why', async (_, codex) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(listCliModels('codex', codex.binary, { PATH: '/usr/bin:/bin' })).resolves.toEqual({ models: [], efforts: {} })
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })
})

describe('a run\'s own check of a CLI', () => {
  const signedIn: CliDiscovery = { cli: 'claude', installed: true, binary: '/bin/claude', version: '2.1.280', missingFlags: [], signIn: 'subscription' }
  const status = (signIn: 'subscription' | 'signed-out') => Promise.resolve({ state: 'found' as const, version: '2.1.280', signIn, models: ['opus'], efforts: {} })
  /** The run's discovery, made to follow the kept status `kept`, and the CLIs whose kept status it had read again. */
  const following = (found: CliDiscovery, kept: ReturnType<typeof status> | null) => {
    const refresh = vi.fn()
    return { discover: followCliState(discovery(found), () => kept, refresh), refresh }
  }

  it('has the kept status read again when the run finds the CLI signed in, signed out or gone unlike it, and answers what it found', async () => {
    const cases = [
      following(signedIn, status('signed-out')), following({ ...signedIn, signIn: 'signed-out' }, status('subscription')),
      following({ cli: 'claude', installed: false }, status('subscription')),
    ]
    for (const { discover } of cases) await discover('claude')
    await Promise.resolve()

    expect(cases.map(({ refresh }) => refresh.mock.calls)).toEqual([[['claude']], [['claude']], [['claude']]])
    expect(await following(signedIn, status('signed-out')).discover('claude')).toBe(signedIn)
  })

  it('leaves the kept status alone while the run finds the CLI as it says, or when no status is kept', async () => {
    const same = following(signedIn, status('subscription'))
    const none = following(signedIn, null)
    await same.discover('claude')
    await none.discover('claude')
    await Promise.resolve()

    expect([same.refresh.mock.calls, none.refresh.mock.calls]).toEqual([[], []])
  })
})
