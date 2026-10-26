// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatSendResult, HarnessModelEntry, HarnessModelSettings } from '../../shared/contract.js'
import type { ModelStatus } from './useModelStatus.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/**
 * Model settings as Core reads them: a DeepSeek API model, the default, which can run when
 * `configured`, and Claude's opus, which can run when `cliRuns`.
 */
const settings = (configured: boolean, cliRuns = false): HarnessModelSettings => {
  const models: HarnessModelEntry[] = [
    { id: 'deepseek', source: { kind: 'api', profile: 'openai-compatible:https://api.deepseek.com' }, model: 'deepseek-chat', configured },
    { id: 'opus', source: { kind: 'cli', cli: 'claude' }, model: 'opus', effort: 'high', configured: cliRuns },
  ]
  return {
    provider: 'openai-compatible', protocol: 'chat-completions', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat',
    authentication: 'api-key', apiKeyConfigured: configured, configured, profiles: [],
    subscription: { active: null, models: { claude: 'opus', codex: '' } },
    models, defaultModel: 'deepseek', sources: [],
  }
}

const core = vi.hoisted(() => ({
  /** The answers to the reads of the model settings, in the order they were asked. */
  reads: [] as ((settings: HarnessModelSettings) => void)[],
}))

vi.mock('../ipc.js', () => ({
  harness: {
    modelSettings: () => new Promise<HarnessModelSettings>((resolve) => { core.reads.push(resolve) }),
  },
}))

const { useCoreModelStatus } = await import('./useModelStatus.js')

describe('the App\'s model status', () => {
  let root: Root
  let status: ModelStatus
  function Shell({ settingsOpen }: { settingsOpen: boolean }) {
    status = useCoreModelStatus(settingsOpen)
    return null
  }
  const render = (settingsOpen = false) => act(() => root.render(<Shell settingsOpen={settingsOpen} />))
  const answer = (at: number, configured: boolean, cliRuns = false) => act(async () => { core.reads[at]!(settings(configured, cliRuns)) })

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    core.reads.length = 0
    root = createRoot(document.createElement('div'))
  })
  afterEach(() => { act(() => root.unmount()) })

  it('is unknown until the model settings are read, then says whether the default model can run and whether any model can', async () => {
    render()
    expect([status.connected, status.anyRuns, core.reads.length]).toEqual([null, null, 1])
    await answer(0, false)
    expect([status.connected, status.anyRuns]).toEqual([false, false])
  })

  it('is not connected while the default model cannot run, though a CLI model a chat can switch to can', async () => {
    render()
    await answer(0, false, true)
    expect([status.connected, status.anyRuns]).toEqual([false, true])
  })

  it('is connected while the default model can run, whatever the subscription choice older Apps read says', async () => {
    render()
    await act(async () => { core.reads[0]!({ ...settings(true), subscription: { active: null, models: { claude: '', codex: '' }, error: 'invalid' } }) })
    expect([status.connected, status.anyRuns]).toEqual([true, true])
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
    expect([status.connected, status.anyRuns]).toEqual([true, true])
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

  it('reads the model settings again when a model answers a chat send while none can run, and not when one a chat chose can', async () => {
    render()
    await answer(0, false, true)
    await act(async () => { await status.track(Promise.resolve({ id: 'chat-1', state: 'complete' })) })
    expect(core.reads).toHaveLength(1)
    render(true)
    render(false)
    await answer(1, false)
    const none: ChatSendResult = { id: 'chat-1', state: 'failed', reason: 'no-model' }
    await act(async () => { await status.track(Promise.resolve(none)) })
    expect(core.reads).toHaveLength(2)
    await act(async () => { await status.track(Promise.resolve({ id: 'chat-1', state: 'complete' })) })
    expect(core.reads).toHaveLength(3)
    await answer(2, true)
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
})
