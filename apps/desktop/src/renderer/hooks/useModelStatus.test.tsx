// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatSendResult, HarnessModelSettings } from '../../shared/contract.js'
import type { ModelStatus } from './useModelStatus.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Model settings as Core reads them, with a model set up when `configured`. */
const settings = (configured: boolean): HarnessModelSettings => ({
  provider: 'openai-compatible', protocol: 'chat-completions', baseUrl: 'https://api.deepseek.com', model: configured ? 'deepseek-chat' : '',
  authentication: 'api-key', apiKeyConfigured: configured, configured, profiles: [],
  subscription: { active: null, models: { claude: '', codex: '' } },
})

const core = vi.hoisted(() => ({
  /** The answers to the reads of the model settings, in the order they were asked. */
  reads: [] as ((settings: HarnessModelSettings) => void)[],
}))

vi.mock('../ipc.js', () => ({
  harness: {
    modelSettings: () => new Promise<HarnessModelSettings>((resolve) => { core.reads.push(resolve) }),
  },
}))

const { modelSourceOf, useCoreModelStatus } = await import('./useModelStatus.js')

describe('the App\'s model status', () => {
  let root: Root
  let status: ModelStatus
  function Shell({ settingsOpen }: { settingsOpen: boolean }) {
    status = useCoreModelStatus(settingsOpen)
    return null
  }
  const render = (settingsOpen = false) => act(() => root.render(<Shell settingsOpen={settingsOpen} />))
  const answer = (at: number, configured: boolean) => act(async () => { core.reads[at]!(settings(configured)) })

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    core.reads.length = 0
    root = createRoot(document.createElement('div'))
  })
  afterEach(() => { act(() => root.unmount()) })

  it('is unknown until the model settings are read, then says whether a model is set up and where it answers from', async () => {
    render()
    expect([status.connected, status.source, core.reads.length]).toEqual([null, null, 1])
    await answer(0, false)
    expect([status.connected, status.source]).toEqual([false, null])
  })

  it('reads the model settings again each time Settings closes, and only then', async () => {
    render()
    await answer(0, false)
    render(true)
    render(true)
    expect(core.reads).toHaveLength(1)
    render(false)
    expect(core.reads).toHaveLength(2)
    await answer(1, true)
    expect([status.connected, status.source]).toEqual([true, 'api'])
  })

  it('reads the model settings again when a chat send finds no model set up while one is, and passes every result through', async () => {
    render()
    await answer(0, true)
    const results: ChatSendResult[] = [{ id: 'chat-1', state: 'complete' }, { id: 'chat-1', state: 'failed', reason: 'model' }]
    for (const result of results) await act(async () => { expect(await status.track(Promise.resolve(result))).toBe(result) })
    expect(core.reads).toHaveLength(1)
    const none: ChatSendResult = { id: 'chat-1', state: 'failed', reason: 'no-model' }
    await act(async () => { expect(await status.track(Promise.resolve(none))).toBe(none) })
    expect(core.reads).toHaveLength(2)
    await answer(1, false)
    expect(status.connected).toBe(false)
  })

  it('reads the model settings again when a model answers a chat send while none is set up', async () => {
    render()
    await answer(0, false)
    const none: ChatSendResult = { id: 'chat-1', state: 'failed', reason: 'no-model' }
    await act(async () => { await status.track(Promise.resolve(none)) })
    expect(core.reads).toHaveLength(1)
    await act(async () => { await status.track(Promise.resolve({ id: 'chat-1', state: 'complete' })) })
    expect(core.reads).toHaveLength(2)
    await answer(1, true)
    expect(status.connected).toBe(true)
  })

  it('drops a read answered after a newer one began', async () => {
    render()
    render(true)
    render(false)
    await answer(1, true)
    await answer(0, false)
    expect(status.connected).toBe(true)
  })

  it('reads the source from the model settings: a set-up endpoint answers through the API, unset settings from nowhere', () => {
    expect([modelSourceOf(settings(true)), modelSourceOf(settings(false))]).toEqual(['api', null])
  })

  it('reads a chosen subscription as the source whether or not an endpoint is set up, and a choice it cannot read as none', () => {
    const chosen = (configured: boolean, error?: 'invalid') => ({
      ...settings(configured),
      subscription: { active: error === undefined ? 'codex' as const : null, models: { claude: '', codex: '' }, ...(error === undefined ? {} : { error }) },
    })
    expect([modelSourceOf(chosen(false)), modelSourceOf(chosen(true)), modelSourceOf(chosen(true, 'invalid'))])
      .toEqual(['subscription', 'subscription', null])
  })
})
