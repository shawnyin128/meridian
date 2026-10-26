import type { HarnessCli, HarnessModelEfforts, HarnessSubscriptionStatus } from '../../shared/contract.js'
import { HarnessEffortSchema, HarnessSubscriptionModelSchema } from '../../shared/contract.js'
import type { CoreLogLevel } from '../core-log.js'
import { cliEnvironment, inTemporaryFolder, runChild } from './cli/child.js'
import type { CliDiscovery } from './cli/discovery.js'

/** The aliases `claude --help` names for its --model option (Claude Code 2.1.280), which lists no models itself. */
const CLAUDE_MODELS = ['fable', 'opus', 'sonnet'] as const
/**
 * The levels `claude --help` names for its --effort option (Claude Code 2.1.280), for every model:
 * Claude Code lowers a level a model does not take to one it does, and names no default.
 */
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
/** Codex levels no run can use: `ultra` delegates to sub-agents, and every run turns multi_agent off. */
export const CODEX_UNUSABLE_EFFORTS: ReadonlySet<string> = new Set(['ultra'])
const LIST_TIMEOUT_MS = 10_000
const MAX_MODELS = 50

/**
 * The models a subscription CLI accepts besides its own default, and the reasoning efforts each takes
 * by model, `''` standing for its own default model and any model it does not list.
 */
export type CliModels = { models: string[]; efforts: Record<string, HarnessModelEfforts> }

/**
 * What Settings shows of subscription CLI `cli`, as `discover` finds it: missing; unsupported, with
 * its version, when its help lacks a flag the runner passes, which flags going only to `onLog`; or
 * installed with its version, how it is signed in, and the models and efforts `listModels` finds it
 * accepts. The binary's path stays in Core.
 */
export async function subscriptionStatus(cli: HarnessCli, { discover, listModels, onLog }: {
  discover: (cli: HarnessCli) => Promise<CliDiscovery>
  listModels: (cli: HarnessCli, binary: string) => Promise<CliModels>
  onLog: (level: CoreLogLevel, line: string) => void
}): Promise<HarnessSubscriptionStatus> {
  const found = await discover(cli)
  if (!found.installed) return { state: 'missing' }
  if (found.missingFlags.length > 0) {
    onLog('warn', `${cli} ${found.version ?? '(no version)'}: its help lists no ${found.missingFlags.join(', ')}`)
    return { state: 'unsupported', version: found.version }
  }
  return { state: 'found', version: found.version, signIn: found.signIn, ...await listModels(cli, found.binary) }
}

/** What `status` says of its CLI: missing, unsupported, or found and signed in one way. */
const stateOf = (status: HarnessSubscriptionStatus) => (status.state === 'found' ? `found:${status.signIn}` : status.state)
/** What discovery `found` says of its CLI, in the terms of `stateOf`. */
const discoveredState = (found: CliDiscovery) => (!found.installed ? 'missing'
  : found.missingFlags.length > 0 ? 'unsupported' : `found:${found.signIn}`)

/**
 * `discover`, which also has `refresh` read a CLI's kept status again whenever what it finds differs
 * from that status, as `kept` gives it, in whether the CLI is installed, supported and how it is
 * signed in, or when that status could not be read; `kept` gives null for a CLI whose status is not
 * kept. A run's own check then corrects what Settings and the pickers show of a sign-in that changed
 * outside the App.
 */
export function followCliState(
  discover: (cli: HarnessCli) => Promise<CliDiscovery>,
  kept: (cli: HarnessCli) => Promise<HarnessSubscriptionStatus> | null,
  refresh: (cli: HarnessCli) => void,
): (cli: HarnessCli) => Promise<CliDiscovery> {
  return async (cli) => {
    const found = await discover(cli)
    void kept(cli)?.then((status) => { if (stateOf(status) !== discoveredState(found)) refresh(cli) }, () => refresh(cli))
    return found
  }
}

/**
 * The reasoning levels a Codex catalog entry `held` names that a run can use, in its order, with its
 * default when that is one of them, or null when it names none.
 */
function codexEfforts(held: Record<string, unknown>): HarnessModelEfforts | null {
  const listed = Array.isArray(held['supported_reasoning_levels']) ? held['supported_reasoning_levels'] : []
  const levels = listed.flatMap((level: unknown) => {
    const effort = typeof level === 'object' && level !== null ? (level as Record<string, unknown>)['effort'] : undefined
    return HarnessEffortSchema.safeParse(effort).success && !CODEX_UNUSABLE_EFFORTS.has(effort as string) ? [effort as string] : []
  }).slice(0, 20)
  if (levels.length === 0) return null
  const fallback = held['default_reasoning_level']
  return { levels, ...(typeof fallback === 'string' && levels.includes(fallback) ? { default: fallback } : {}) }
}

/**
 * The models subscription CLI `cli` at `binary` accepts and their reasoning efforts: Claude Code's
 * aliases, each taking every level of its --effort option; or the models the catalog bundled with
 * Codex shows, in its order, each with the levels and default the catalog gives it, and for Codex's
 * own default model the levels every shown model takes; no model gets a level no run can use.
 * Codex's catalog is read offline with `codex debug models --bundled` in an empty folder with the
 * API-key variables of `environment` removed. Names the model rule refuses are left out. A Codex
 * catalog that cannot be read lists no models and no efforts, and the reason is logged.
 */
export async function listCliModels(
  cli: HarnessCli,
  binary: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<CliModels> {
  if (cli === 'claude') return { models: [...CLAUDE_MODELS], efforts: { '': { levels: [...CLAUDE_EFFORTS] } } }
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
      return [{ slug, priority: typeof held['priority'] === 'number' ? held['priority'] : Infinity, efforts: codexEfforts(held) }]
    }).sort((a, b) => a.priority - b.priority).slice(0, MAX_MODELS)
    const leveled = shown.map((model) => model.efforts?.levels ?? [])
    const common = leveled[0]?.filter((level) => leveled.every((levels) => levels.includes(level))) ?? []
    return {
      models: shown.map((model) => model.slug),
      efforts: Object.fromEntries([
        ...shown.flatMap((model) => (model.efforts === null ? [] : [[model.slug, model.efforts]])),
        ...(common.length === 0 ? [] : [['', { levels: common }]]),
      ]),
    }
  } catch (cause) {
    console.error(`[harness] codex's model catalog cannot be read: ${cause instanceof Error ? cause.message : String(cause)}`)
    return { models: [], efforts: {} }
  }
}
