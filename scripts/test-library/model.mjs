/**
 * Seeds the model list through Core, with no credentials: an OpenAI API model at the `medium` effort
 * without a key, the default, so the library keeps its no-model state until a model is chosen in
 * Settings; Claude's `opus` at the `high` effort and `sonnet`; Codex's own default model; and a
 * local OpenAI-compatible service. One chat runs on Claude's `sonnet` at the `max` effort.
 */
export async function seedModelChoice(call) {
  const openai = { kind: 'api', provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', authentication: 'api-key' }
  await call('harness.addModel', { source: openai, model: 'gpt-6.1', effort: 'medium' })
  await call('harness.addModel', { source: { kind: 'cli', cli: 'claude' }, model: 'opus', effort: 'high' })
  await call('harness.addModel', { source: { kind: 'cli', cli: 'claude' }, model: 'sonnet' })
  await call('harness.addModel', { source: { kind: 'cli', cli: 'codex' }, model: '' })
  const settings = await call('harness.addModel', {
    source: { kind: 'api', provider: 'openai-compatible', protocol: 'chat-completions', baseUrl: 'http://127.0.0.1:11434/v1', authentication: 'none' },
    model: 'qwen3',
  })
  const chat = (await call('chat.list')).find((session) => session.title === '推测解码的树宽怎么定')
  const sonnet = settings.models.find((entry) => entry.model === 'sonnet')
  await call('chat.setModel', { id: chat.id, model: sonnet.id, effort: 'max' })
}
