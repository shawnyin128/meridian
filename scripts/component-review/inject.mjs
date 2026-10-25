// Fault injection for the review's navigation map. The preload talks to Core through a
// MessagePort in Electron's isolated world; patching that port's postMessage there, over the
// DevTools protocol, makes chosen Core calls fail, wait, or answer changed or in Core's place,
// without changing the App.

/** Installs the rules once per page; `clear` drops them and sends every held call on. */
const PATCH = `(() => {
  if (globalThis.__review) return 'kept'
  const rules = globalThis.__review = { fail: {}, answer: {}, hold: {}, transform: {}, held: [], pending: new Map() }
  const post = MessagePort.prototype.postMessage
  MessagePort.prototype.postMessage = function (message, ...rest) {
    if (!this.__reviewWrapped) {
      this.__reviewWrapped = true
      const deliver = this.onmessage
      this.onmessage = (event) => {
        const sent = rules.pending.get(event.data?.id)
        rules.pending.delete(event.data?.id)
        const change = sent && rules.transform[sent.method]
        if (change && event.data.ok) deliver.call(this, { data: { ...event.data, data: change(event.data.data, sent.params) } })
        else deliver.call(this, event)
      }
    }
    if (message && typeof message === 'object' && typeof message.method === 'string') {
      const reason = rules.fail[message.method]
      if (reason) {
        setTimeout(() => this.onmessage({ data: { id: message.id, ok: false, error: { reason } } }), 0)
        return
      }
      if (message.method in rules.answer) {
        setTimeout(() => this.onmessage({ data: { id: message.id, ok: true, data: rules.answer[message.method] } }), 0)
        return
      }
      rules.pending.set(message.id, message)
      if (rules.hold[message.method]) {
        rules.held.push([this, message, rest])
        return
      }
    }
    return post.call(this, message, ...rest)
  }
  rules.clear = () => {
    rules.fail = {}
    rules.answer = {}
    rules.hold = {}
    rules.transform = {}
    for (const [port, message, rest] of rules.held.splice(0)) post.call(port, message, ...rest)
  }
  return 'patched'
})()`

/**
 * Patches the preload's port of `win` and returns the rules: `fail(method, reason)` makes the call
 * reject with that reason, `answer(method, source)` answers it with the value written in `source`
 * without reaching Core, `hold(method)` keeps it unanswered, `transform(method, source)` passes
 * Core's answer through the function written in `source`, and `clear()` ends them all and sends the
 * held calls on. Throws when the page has no Electron isolated world.
 */
export async function injector(win) {
  const cdp = await win.context().newCDPSession(win)
  const contexts = []
  cdp.on('Runtime.executionContextCreated', ({ context }) => contexts.push(context))
  await cdp.send('Runtime.enable')
  // Playwright adds a utility world of its own; the preload runs in Electron's.
  let isolated
  for (let tries = 0; tries < 20 && !isolated; tries += 1) {
    isolated = contexts.find((context) => context.name === 'Electron Isolated Context')
    if (!isolated) await new Promise((done) => setTimeout(done, 100))
  }
  if (!isolated) throw new Error(`No isolated world among ${contexts.map((context) => context.name).join(', ')}`)
  const run = async (expression) => {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, contextId: isolated.id, returnByValue: true })
    if (exceptionDetails) throw new Error(`${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`)
    return result.value
  }
  await run(PATCH)
  const set = (kind, method, value) => run(`globalThis.__review.${kind}[${JSON.stringify(method)}] = ${value}`)
  return {
    fail: (method, reason) => set('fail', method, JSON.stringify(reason)),
    answer: (method, source) => set('answer', method, `(${source})`),
    hold: (method) => set('hold', method, 'true'),
    transform: (method, source) => set('transform', method, `(${source})`),
    clear: () => run('globalThis.__review.clear()'),
  }
}
