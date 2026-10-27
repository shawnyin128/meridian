import { describe, expect, it, vi } from 'vitest'
import type { HarnessCli, HarnessModelEntry, HarnessSubscriptionStatus } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { createSourceModels } from './source-models.js'

/** Claude's opus at high, an OpenAI model with a key, a local service and an OpenAI model without a key. */
const SOURCES: HarnessModelEntry[] = [
  { id: 'cli:claude', source: { kind: 'cli', cli: 'claude' }, model: 'opus', effort: 'high', configured: true },
  { id: 'api:openai', source: { kind: 'api', profile: 'openai' }, model: 'gpt-6.1', configured: true },
  { id: 'api:openai-compatible:http://127.0.0.1:11434/v1', source: { kind: 'api', profile: 'openai-compatible:http://127.0.0.1:11434/v1' }, model: 'qwen3', configured: true },
  { id: 'api:anthropic', source: { kind: 'api', profile: 'anthropic' }, model: 'claude-opus-5-5', configured: false },
]
const CLAUDE: HarnessSubscriptionStatus = {
  state: 'found', version: '2.1.280', signIn: 'subscription', models: ['fable', 'opus', 'sonnet'],
  efforts: { '': { levels: ['low', 'medium', 'high', 'xhigh', 'max'] } },
}

/** The session lists over `sources`, with CLI and API reads that answer as given and count themselves. */
function session(sources = SOURCES, api: (id: string) => Promise<string[]> = async (id) => (id === 'api:openai' ? ['gpt-6.1', 'gpt-5.5'] : ['qwen3', 'llama4'])) {
  const readCli = vi.fn<(cli: HarnessCli) => Promise<HarnessSubscriptionStatus>>(async () => CLAUDE)
  const readApi = vi.fn(api)
  const onLog = vi.fn()
  return { lists: createSourceModels({ sources: () => sources, readCli, readApi, onLog }), readCli, readApi, onLog }
}

describe('the models each configured source offers', () => {
  it('reads every configured CLI once at start, in the background, and an API source, whose key that opens, only once it is first asked for', async () => {
    const { lists, readCli, readApi } = session()
    lists.start()
    expect([readCli.mock.calls, readApi.mock.calls]).toEqual([[['claude']], []])

    for (let ask = 0; ask < 3; ask += 1) {
      await lists.models('cli:claude')
      await lists.models('api:openai')
      await lists.status('claude')
    }
    expect([readCli.mock.calls.length, readApi.mock.calls.map(([id]) => id)]).toEqual([1, ['api:openai']])
  })

  it('lists the source\'s default model first, then the others the CLI names, each with its efforts; the CLI\'s own default only when it is the source\'s default', async () => {
    const { lists } = session()
    lists.start()

    const efforts = { levels: ['low', 'medium', 'high', 'xhigh', 'max'] }
    expect(await lists.models('cli:claude')).toEqual({
      source: 'cli:claude', models: ['opus', 'fable', 'sonnet'].map((id) => ({ id, efforts })),
    })
    const own = session([{ ...SOURCES[0]!, model: '' }]).lists
    expect((await own.models('cli:claude')).models).toEqual(['', 'fable', 'opus', 'sonnet'].map((id) => ({ id, efforts })))
    expect((await lists.models('api:openai')).models).toEqual([
      { id: 'gpt-6.1', efforts: { levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] } },
      { id: 'gpt-5.5', efforts: { levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] } },
    ])
    expect((await lists.models('api:openai-compatible:http://127.0.0.1:11434/v1')).models.map(({ id }) => id)).toEqual(['qwen3', 'llama4'])
  })

  it('reads no list for an API source that cannot run yet, offering its default model', async () => {
    const { lists, readApi } = session()
    expect(await lists.models('api:anthropic')).toEqual({
      source: 'api:anthropic', models: [{ id: 'claude-opus-5-5', efforts: { levels: ['low', 'medium', 'high', 'xhigh', 'max'] } }],
    })
    expect(readApi).not.toHaveBeenCalled()
  })

  it('keeps a failed read for the session, its source offering its default model and the failure on its own, without reading again', async () => {
    const { lists, readApi, onLog } = session(SOURCES, async () => { throw new CallError('rate-limit', 'slow down') })
    lists.start()

    for (let ask = 0; ask < 2; ask += 1) {
      expect(await lists.models('api:openai')).toEqual({
        source: 'api:openai', models: [{ id: 'gpt-6.1', efforts: { levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] } }],
        error: 'rate-limit',
      })
    }
    expect((await lists.models('cli:claude')).error).toBeUndefined()
    expect(readApi).toHaveBeenCalledTimes(1)
    expect(onLog).toHaveBeenCalledWith('warn', expect.stringContaining('api:openai'))
  })

  it('reads a CLI\'s status and models again at once when its configuration changes; an API source\'s list is dropped and read again only when next asked for', async () => {
    const { lists, readCli, readApi } = session()
    lists.start()
    await lists.models('api:openai')

    lists.refresh('cli:claude')
    lists.refresh('api:openai')
    await lists.models('cli:claude')
    expect([readCli.mock.calls, readApi.mock.calls.map(([id]) => id)]).toEqual([[['claude'], ['claude']], ['api:openai']])
    await lists.models('api:openai')
    expect(readApi.mock.calls.map(([id]) => id)).toEqual(['api:openai', 'api:openai'])
  })

  it('names a CLI that is missing or unsupported as why its list cannot be read, offering its default model', async () => {
    const { lists, readCli } = session()
    readCli.mockResolvedValueOnce({ state: 'missing' })
    lists.start()

    expect(await lists.models('cli:claude')).toEqual({ source: 'cli:claude', models: [{ id: 'opus', efforts: { levels: [] } }], error: 'cli-missing' })
    await expect(lists.models('cli:codex')).rejects.toMatchObject({ reason: 'not-found' })
  })
})
