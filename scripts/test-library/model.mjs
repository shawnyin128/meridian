/**
 * Seeds the model choice through Core, with no credentials: a model picked for each subscription
 * CLI, Claude's `opus` at the `high` effort and Codex's own default model and effort, and then the
 * API profile, which has no key, at the `medium` effort, as the model source, so the library keeps
 * its no-model state until a subscription is chosen in Settings.
 */
export async function seedModelChoice(call) {
  await call('harness.updateSubscription', { cli: 'codex', model: '' })
  await call('harness.updateSubscription', { cli: 'claude', model: 'opus', effort: 'high' })
  await call('harness.updateModelSettings', {
    provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: '', authentication: 'api-key',
    effort: 'medium',
  })
}
