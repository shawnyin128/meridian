import type { HarnessCli, HarnessSubscriptionStatus } from '../../shared/contract.js'
import { HarnessSubscriptionModelSchema } from '../../shared/contract.js'
import { cliEnvironment, inTemporaryFolder, runChild } from './cli/child.js'
import type { CliDiscovery } from './cli/discovery.js'

/** The aliases `claude --help` names for its --model option (Claude Code 2.1.280), which lists no models itself. */
const CLAUDE_MODELS = ['fable', 'opus', 'sonnet'] as const
const LIST_TIMEOUT_MS = 10_000
const MAX_MODELS = 50

/**
 * What Settings shows of subscription CLI `cli`, as `discover` finds it: missing; unsupported, with
 * its version, when its help lacks a flag the runner passes, which flags going only to `onLog`; or
 * installed with its version, how it is signed in and the models `listModels` finds it accepts. The
 * binary's path stays in Core.
 */
export async function subscriptionStatus(cli: HarnessCli, { discover, listModels, onLog }: {
  discover: (cli: HarnessCli) => Promise<CliDiscovery>
  listModels: (cli: HarnessCli, binary: string) => Promise<string[]>
  onLog: (line: string) => void
}): Promise<HarnessSubscriptionStatus> {
  const found = await discover(cli)
  if (!found.installed) return { state: 'missing' }
  if (found.missingFlags.length > 0) {
    onLog(`${cli} ${found.version ?? '(no version)'}: its help lists no ${found.missingFlags.join(', ')}`)
    return { state: 'unsupported', version: found.version }
  }
  return { state: 'found', version: found.version, signIn: found.signIn, models: await listModels(cli, found.binary) }
}

/**
 * The models subscription CLI `cli` at `binary` accepts: Claude Code's aliases, or the models the
 * catalog bundled with Codex shows, in its order, read offline with `codex debug models --bundled`
 * in an empty folder with the API-key variables of `environment` removed. Names the model rule
 * refuses are left out. A Codex catalog that cannot be read lists none, and the reason is logged.
 */
export async function listCliModels(
  cli: HarnessCli,
  binary: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  if (cli === 'claude') return [...CLAUDE_MODELS]
  try {
    const { code, stdout } = await inTemporaryFolder((folder) => runChild(binary, ['debug', 'models', '--bundled'], {
      cwd: folder, env: cliEnvironment(environment, binary), timeoutMs: LIST_TIMEOUT_MS,
    }))
    if (code !== 0) throw new Error(`codex debug models 退出码 ${String(code)}`)
    const models = (JSON.parse(stdout) as { models?: unknown }).models
    if (!Array.isArray(models)) throw new Error('目录里没有 models')
    const shown = models.flatMap((model: unknown) => {
      const held = (typeof model === 'object' && model !== null ? model : {}) as Record<string, unknown>
      const slug = held['slug']
      const named = typeof slug === 'string' && slug !== '' && HarnessSubscriptionModelSchema.safeParse(slug).success
      if (!named || held['visibility'] !== 'list') return []
      return [{ slug, priority: typeof held['priority'] === 'number' ? held['priority'] : Infinity }]
    })
    return shown.sort((a, b) => a.priority - b.priority).map((model) => model.slug).slice(0, MAX_MODELS)
  } catch (cause) {
    console.error(`[harness] codex 的模型目录读不出来：${cause instanceof Error ? cause.message : String(cause)}`)
    return []
  }
}
