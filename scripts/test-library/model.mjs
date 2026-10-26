/**
 * Seeds the model list through Core, one configuration per source, with no credentials: OpenAI's
 * `gpt-6.1` at the `medium` effort without a key, which cannot run; the Claude subscription on `opus`
 * at the `high` effort, the default; Codex on its own default model; and a local Ollama service on
 * `qwen3`. One chat runs on the Claude subscription's `sonnet` at the `max` effort.
 */
export async function seedModelChoice(call) {
  const openai = { kind: 'api', provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', authentication: 'api-key' }
  await call('harness.addModel', { source: openai, model: 'gpt-6.1', effort: 'medium' })
  const claude = (await call('harness.addModel', { source: { kind: 'cli', cli: 'claude' }, model: 'opus', effort: 'high' }))
    .models.find((entry) => entry.source.kind === 'cli' && entry.source.cli === 'claude')
  await call('harness.setDefaultModel', { id: claude.id })
  await call('harness.addModel', { source: { kind: 'cli', cli: 'codex' }, model: '' })
  await call('harness.addModel', {
    source: { kind: 'api', provider: 'openai-compatible', protocol: 'chat-completions', baseUrl: 'http://127.0.0.1:11434/v1', authentication: 'none' },
    model: 'qwen3',
  })
  const chat = (await call('chat.list')).find((session) => session.title === '推测解码的树宽怎么定')
  await call('chat.setModel', { id: chat.id, source: claude.id, model: 'sonnet', effort: 'max' })
}
