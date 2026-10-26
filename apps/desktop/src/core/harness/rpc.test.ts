import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { HARNESS_CAPABILITIES, HARNESS_PROTOCOL_VERSION } from './protocol.js'
import { createHarnessRpc, HarnessRpcError, type HarnessChild } from './rpc.js'

class FakeHarness extends EventEmitter implements HarnessChild {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly kill = vi.fn(() => true)

  send(message: object) {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }
}

function nextFrame(stream: PassThrough): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    stream.once('data', (chunk: Buffer) => resolve(JSON.parse(chunk.toString('utf8').trim())))
  })
}

function ready(
  child: FakeHarness,
  protocol = HARNESS_PROTOCOL_VERSION,
  capabilities: readonly string[] = HARNESS_CAPABILITIES,
) {
  child.send({
    type: 'event', id: 0, event: 'ready',
    data: { protocol, capabilities: [...capabilities] },
  })
}

describe('Harness RPC', () => {
  it('waits for a matching ready event before sending a request', async () => {
    const child = new FakeHarness()
    const rpc = createHarnessRpc({ launch: () => child })
    const result = rpc.request<{ ok: boolean }>('system.ping', {})
    expect(child.stdin.readableLength).toBe(0)

    ready(child)
    const request = await nextFrame(child.stdin)
    expect(request).toMatchObject({ type: 'request', id: 1, method: 'system.ping' })
    child.send({ type: 'response', id: 1, ok: true, result: { ok: true } })

    await expect(result).resolves.toEqual({ ok: true })
    rpc.close()
  })

  it('rejects a protocol mismatch before sending billable work', async () => {
    const child = new FakeHarness()
    const rpc = createHarnessRpc({ launch: () => child })
    const result = rpc.request('paper-wiki.run', {})
    ready(child, 'meridian.harness.v2')

    await expect(result).rejects.toMatchObject({ kind: 'bad_request', step: 'start' })
    expect(child.kill).toHaveBeenCalledOnce()
    expect(child.stdin.readableLength).toBe(0)
  })

  it('rejects a missing workflow capability before sending billable work', async () => {
    const child = new FakeHarness()
    const rpc = createHarnessRpc({ launch: () => child, requiredCapabilities: ['chat'] })
    const result = rpc.request('chat.answer', {})
    ready(child, HARNESS_PROTOCOL_VERSION, ['paper-wiki'])

    await expect(result).rejects.toMatchObject({
      kind: 'bad_request',
      message: 'Harness is missing required capabilities: chat',
      step: 'start',
    })
    expect(child.kill).toHaveBeenCalledOnce()
    expect(child.stdin.readableLength).toBe(0)
  })

  it('names a Harness that exits before it is ready a start failure, and one that exits in a request a request failure', async () => {
    const early = new FakeHarness()
    const before = createHarnessRpc({ launch: () => early }).request('chat.answer', {})
    early.emit('exit', 1, null)
    await expect(before).rejects.toMatchObject({ kind: 'harness_gone', step: 'start' })

    const late = new FakeHarness()
    const after = createHarnessRpc({ launch: () => late }).request('chat.answer', {})
    ready(late)
    await nextFrame(late.stdin)
    late.emit('exit', 1, null)
    await expect(after).rejects.toMatchObject({ kind: 'harness_gone', step: 'request' })
  })

  it('logs a callback it refuses and the text of a callback that failed, which Harness never gets', async () => {
    const child = new FakeHarness()
    const onLog = vi.fn()
    const rpc = createHarnessRpc({
      launch: () => child, onLog, callbacks: { 'papers.get': () => { throw new Error('no paper p9') } },
    })
    void rpc.request('paper-wiki.run', {}).catch(() => {})
    ready(child)
    await nextFrame(child.stdin)
    child.send({ type: 'callback', id: 1, callbackId: 'a', method: 'wiki.write', params: {} })
    await nextFrame(child.stdin)
    child.send({ type: 'callback', id: 1, callbackId: 'b', method: 'papers.get', params: {} })
    expect(await nextFrame(child.stdin)).toMatchObject({ error: { kind: 'internal', message: 'Core read callback failed' } })
    expect(onLog.mock.calls).toEqual([['refused Harness callback wiki.write'], ['Harness callback papers.get failed: no paper p9']])
    rpc.close()
  })

  it('allows only registered read callbacks and returns their result to Harness', async () => {
    const child = new FakeHarness()
    const paper = vi.fn(() => ({ id: 'p1', title: 'Paper' }))
    const rpc = createHarnessRpc({ launch: () => child, callbacks: { 'papers.get': paper } })
    const result = rpc.request('paper-wiki.run', { paperId: 'p1' })
    ready(child)
    await nextFrame(child.stdin)

    child.send({
      type: 'callback', id: 1, callbackId: 'callback-1',
      method: 'papers.get', params: { id: 'p1' },
    })
    const callbackResult = await nextFrame(child.stdin)
    expect(callbackResult).toMatchObject({
      type: 'response', id: 1, callbackId: 'callback-1', ok: true,
      result: { id: 'p1', title: 'Paper' },
    })
    expect(paper).toHaveBeenCalledWith({ id: 'p1' }, 1)

    child.send({ type: 'response', id: 1, ok: true, result: { proposal: 'draft' } })
    await expect(result).resolves.toEqual({ proposal: 'draft' })
    rpc.close()
  })

  it('sends cancellation and releases the caller without waiting for the provider', async () => {
    const child = new FakeHarness()
    const rpc = createHarnessRpc({ launch: () => child })
    const controller = new AbortController()
    const result = rpc.request('paper-wiki.run', {}, { signal: controller.signal })
    ready(child)
    await nextFrame(child.stdin)
    controller.abort()
    expect(await nextFrame(child.stdin)).toMatchObject({ type: 'cancel', id: 1 })
    await expect(result).rejects.toMatchObject({ kind: 'cancelled' })
    child.send({ type: 'response', id: 1, ok: true, result: { ignored: true } })
    rpc.close()
  })

  it('rejects a late callback after cancellation without reading Core', async () => {
    const child = new FakeHarness()
    const paper = vi.fn(() => ({ id: 'p1' }))
    const rpc = createHarnessRpc({ launch: () => child, callbacks: { 'papers.get': paper } })
    const controller = new AbortController()
    const result = rpc.request('paper-wiki.run', {}, { signal: controller.signal })
    ready(child)
    await nextFrame(child.stdin)
    controller.abort()
    await nextFrame(child.stdin)
    await expect(result).rejects.toMatchObject({ kind: 'cancelled' })

    child.send({
      type: 'callback', id: 1, callbackId: 'late', method: 'papers.get', params: { id: 'p1' },
    })
    expect(await nextFrame(child.stdin)).toMatchObject({
      type: 'error', id: 1, callbackId: 'late', ok: false,
      error: { kind: 'cancelled' },
    })
    expect(paper).not.toHaveBeenCalled()
    rpc.close()
  })

  it('settles a request when its process channel closes before the request write', async () => {
    const child = new FakeHarness()
    const rpc = createHarnessRpc({ launch: () => child })
    const result = rpc.request('paper-wiki.run', {})
    ready(child)
    child.stdin.destroy()

    await expect(result).rejects.toMatchObject({ kind: 'harness_gone' })
    rpc.close()
  })

  it('rejects in-flight work when the process exits and never retries it', async () => {
    const child = new FakeHarness()
    const launch = vi.fn(() => child)
    const rpc = createHarnessRpc({ launch })
    const result = rpc.request('paper-wiki.run', {})
    ready(child)
    await nextFrame(child.stdin)
    child.emit('exit', 1, null)

    await expect(result).rejects.toSatisfy((cause: unknown) => (
      cause instanceof HarnessRpcError && cause.kind === 'harness_gone'
    ))
    expect(launch).toHaveBeenCalledOnce()
  })

  it('preserves bounded stderr diagnostics when Harness exits before readiness', async () => {
    const child = new FakeHarness()
    const rpc = createHarnessRpc({ launch: () => child })
    const result = rpc.request('model.check', {})
    child.stderr.write(
      "Traceback: ModuleNotFoundError: No module named 'meridian_harness'\n",
    )
    child.emit('exit', 1, null)

    await expect(result).rejects.toMatchObject({
      kind: 'harness_gone',
      message: 'Harness process exited with code 1',
      detail: "Traceback: ModuleNotFoundError: No module named 'meridian_harness'",
    })
  })

  it('starts a fresh process for the next explicit request after a crash', async () => {
    const first = new FakeHarness()
    const second = new FakeHarness()
    const launch = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const rpc = createHarnessRpc({ launch })

    const failed = rpc.request('paper-wiki.run', { attempt: 1 })
    ready(first)
    await nextFrame(first.stdin)
    first.emit('exit', 1, null)
    await expect(failed).rejects.toMatchObject({ kind: 'harness_gone' })

    const recovered = rpc.request<{ ok: boolean }>('paper-wiki.run', { attempt: 2 })
    ready(second)
    const request = await nextFrame(second.stdin)
    expect(request).toMatchObject({
      type: 'request', id: 2, method: 'paper-wiki.run', params: { attempt: 2 },
    })
    second.send({ type: 'response', id: 2, ok: true, result: { ok: true } })

    await expect(recovered).resolves.toEqual({ ok: true })
    expect(launch).toHaveBeenCalledTimes(2)
    rpc.close()
  })

  it('never writes a retired process callback result into its replacement', async () => {
    const first = new FakeHarness()
    const second = new FakeHarness()
    let resolveCallback!: (value: { id: string }) => void
    const paper = vi.fn(() => new Promise<{ id: string }>((resolve) => { resolveCallback = resolve }))
    const launch = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    const rpc = createHarnessRpc({ launch, callbacks: { 'papers.get': paper } })

    const failed = rpc.request('paper-wiki.run', { attempt: 1 })
    ready(first)
    await nextFrame(first.stdin)
    first.send({
      type: 'callback', id: 1, callbackId: 'callback-1',
      method: 'papers.get', params: { id: 'p1' },
    })
    await vi.waitFor(() => expect(paper).toHaveBeenCalledOnce())
    first.emit('exit', 1, null)
    await expect(failed).rejects.toMatchObject({ kind: 'harness_gone' })

    const recovered = rpc.request<{ ok: boolean }>('paper-wiki.run', { attempt: 2 })
    ready(second)
    await nextFrame(second.stdin)
    resolveCallback({ id: 'p1' })
    await Promise.resolve()
    await Promise.resolve()
    expect(second.stdin.readableLength).toBe(0)
    second.send({ type: 'response', id: 2, ok: true, result: { ok: true } })

    await expect(recovered).resolves.toEqual({ ok: true })
    rpc.close()
  })

  it('answers a request\'s own callbacks only while that request runs', async () => {
    const child = new FakeHarness()
    const invoke = vi.fn(() => ({ output: { title: 'Draft' } }))
    const rpc = createHarnessRpc({ launch: () => child })
    const first = rpc.request('paper-wiki.run', {}, { callbacks: { 'model.invoke': invoke } })
    ready(child)
    await nextFrame(child.stdin)
    const second = rpc.request('paper-wiki.run', {})
    await nextFrame(child.stdin)

    child.send({ type: 'callback', id: 2, callbackId: 'other', method: 'model.invoke', params: {} })
    expect(await nextFrame(child.stdin)).toMatchObject({
      type: 'error', id: 2, callbackId: 'other', error: { kind: 'bad_request' },
    })
    child.send({ type: 'callback', id: 1, callbackId: 'own', method: 'model.invoke', params: { prompt: 'p' } })
    expect(await nextFrame(child.stdin)).toMatchObject({
      type: 'response', id: 1, callbackId: 'own', result: { output: { title: 'Draft' } },
    })
    expect(invoke).toHaveBeenCalledOnce()

    child.send({ type: 'response', id: 1, ok: true, result: {} })
    child.send({ type: 'response', id: 2, ok: true, result: {} })
    await Promise.all([first, second])
    rpc.close()
  })

  it('passes a callback\'s classified failure to Harness and keeps any other error\'s text in Core', async () => {
    const child = new FakeHarness()
    const rpc = createHarnessRpc({
      launch: () => child,
      callbacks: { 'papers.get': () => { throw new Error('/Users/someone/library/papers is unreadable') } },
    })
    const result = rpc.request('paper-wiki.run', {}, {
      callbacks: {
        'model.invoke': () => { throw new HarnessRpcError({ kind: 'model_error', message: 'claude 运行超时，已停止' }) },
      },
    })
    ready(child)
    await nextFrame(child.stdin)

    child.send({ type: 'callback', id: 1, callbackId: 'model', method: 'model.invoke', params: {} })
    expect(await nextFrame(child.stdin)).toMatchObject({
      type: 'error', callbackId: 'model', error: { kind: 'model_error', message: 'claude 运行超时，已停止' },
    })
    child.send({ type: 'callback', id: 1, callbackId: 'read', method: 'papers.get', params: {} })
    expect(await nextFrame(child.stdin)).toMatchObject({
      type: 'error', callbackId: 'read', error: { kind: 'internal', message: 'Core read callback failed' },
    })

    child.send({ type: 'response', id: 1, ok: true, result: {} })
    await result
    rpc.close()
  })

  it('lets a request take its own timeout in place of the client\'s', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeHarness()
      const rpc = createHarnessRpc({ launch: () => child, requestTimeoutMs: 1_000 })
      const result = rpc.request('paper-wiki.run', {}, { timeoutMs: 5_000 })
      ready(child)
      await vi.advanceTimersByTimeAsync(4_000)
      child.send({ type: 'response', id: 1, ok: true, result: { ok: true } })
      await expect(result).resolves.toEqual({ ok: true })

      const late = rpc.request('paper-wiki.run', {}, { timeoutMs: 5_000 })
      const settled = expect(late).rejects.toMatchObject({ kind: 'harness_gone', message: 'Harness request timed out' })
      await vi.advanceTimersByTimeAsync(5_001)
      await settled
      rpc.close()
    } finally {
      vi.useRealTimers()
    }
  })
})
