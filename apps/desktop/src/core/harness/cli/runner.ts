import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HarnessCli } from '../../../shared/contract.js'
import { type ChildOutcome, cliEnvironment, CliRunError, inTemporaryFolder, runChild, stderrExcerpt } from './child.js'
import type { CliDiscovery } from './discovery.js'
import { reachedUsageLimit, readiness, rejectedModel } from './failure.js'
import { type InternalMcp, internalMcpArgs, type InternalMcpOpener } from './internal-mcp.js'
import type { VaultToolScope } from './vault-tools.js'

/** Codex features that give the model a tool or load outside code; every run turns them all off. */
export const CODEX_DISABLED_FEATURES = [
  'shell_tool', 'unified_exec', 'apps', 'plugins', 'multi_agent', 'image_generation',
  'browser_use_external', 'view_image', 'hooks', 'tool_suggest', 'skill_search', 'goals',
  'sleep_tool', 'remote_plugin', 'skill_mcp_dependency_install', 'code_mode_host',
] as const

/** Keys whose value maps names to schemas, so a key named `default` inside is a name to keep. */
const NAMED_SCHEMA_KEYS = new Set(['properties', '$defs', 'definitions', 'patternProperties'])

const MAX_CLI_ERROR_DETAIL = 300
/** How long a CLI's passed check holds before a call checks it again. */
const CHECK_TTL_MS = 5 * 60_000

export type CliCall = {
  cli: HarnessCli
  /** The CLI's model for this call; without it the CLI uses its own default. */
  model?: string
  system: string
  prompt: string
  /** The JSON Schema the output must follow. */
  schema: Record<string, unknown>
  timeoutMs: number
  signal: AbortSignal
  /** What the call may look up in the vault through the internal MCP server; without it the CLI has no tools. */
  lookup?: VaultToolScope
}

export type CliUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number }

export type CliResult = {
  /** The CLI's structured output, or null when it gave none that parses as JSON. */
  output: unknown
  usage?: CliUsage
  turns?: number
  durationMs: number
}

/**
 * One model call on the user's signed-in CLI. Rejects with a CliRunError when the CLI is not
 * installed, lacks a flag the call passes, is not signed in with the user's subscription, reports
 * the plan's usage limit reached or a model it will not run, or fails otherwise, runs past the call's
 * timeout, or the call's signal aborts.
 */
export type CliRunner = (call: CliCall) => Promise<CliResult>

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** What a failed call reports beside its message: the CLI's exit code and the redacted end of its stderr. */
export const failureDetails = (outcome: ChildOutcome) => ({ exitCode: outcome.code, stderr: stderrExcerpt(outcome.stderr) })

/**
 * How a call `cli` failed with `reported`, its own error text if any: at the plan's usage limit, on a
 * model the CLI will not run, or otherwise.
 */
function failedKind(cli: HarnessCli, outcome: ChildOutcome, reported: unknown = '') {
  const text = `${typeof reported === 'string' ? reported : ''}\n${outcome.stderr}`
  return reachedUsageLimit(cli, text) ? 'usage-limit' : rejectedModel(cli, text) ? 'model-unavailable' : 'failed'
}

const detailOf = (value: unknown) => typeof value === 'string'
  ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_CLI_ERROR_DETAIL)
  : ''

/** The JSON object one line of a CLI's output holds, or null when it holds none. */
export function jsonLine(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line)
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

/** The usage a Claude `result` reports, its input counting the tokens read from and written to the cache. */
export function claudeUsage(result: Record<string, unknown>): CliUsage {
  const usage = isRecord(result['usage']) ? result['usage'] : {}
  const cachedInputTokens = count(usage['cache_read_input_tokens'])
  return {
    inputTokens: count(usage['input_tokens']) + count(usage['cache_creation_input_tokens']) + cachedInputTokens,
    cachedInputTokens,
    outputTokens: count(usage['output_tokens']),
  }
}

/** The failure of a Claude call that exited with `outcome.code` and printed no result. */
export function claudeExitFailure(outcome: ChildOutcome): CliRunError {
  return new CliRunError(failedKind('claude', outcome), `claude 运行失败（退出码 ${String(outcome.code)}）`, failureDetails(outcome))
}

/** The failure of a Claude call whose `result` reports an error, in the words of that error. */
export function claudeFailure(result: Record<string, unknown>, outcome: ChildOutcome): CliRunError {
  const detail = detailOf(result['result'])
  return new CliRunError(failedKind('claude', outcome, result['result']),
    detail === '' ? 'claude 运行失败' : `claude 运行失败：${detail}`, failureDetails(outcome))
}

/** The usage the `turn.completed` events of a Codex call report, summed. */
export function codexUsage(events: ReadonlyArray<Record<string, unknown>>): CliUsage {
  const usages = events.filter((event) => event['type'] === 'turn.completed')
    .map((event) => (isRecord(event['usage']) ? event['usage'] : {}))
  return {
    inputTokens: usages.reduce((sum, usage) => sum + count(usage['input_tokens']), 0),
    cachedInputTokens: usages.reduce((sum, usage) => sum + count(usage['cached_input_tokens']), 0),
    outputTokens: usages.reduce((sum, usage) => sum + count(usage['output_tokens']), 0),
  }
}

/** The failure of a Codex call that exited with an error, in the words of its last error event. */
export function codexFailure(events: ReadonlyArray<Record<string, unknown>>, outcome: ChildOutcome): CliRunError {
  const failure = events.findLast((event) => event['type'] === 'turn.failed' || event['type'] === 'error')
  const reported = isRecord(failure?.['error']) ? failure['error']['message'] : failure?.['message']
  const detail = detailOf(reported)
  return new CliRunError(failedKind('codex', outcome, reported), detail === ''
    ? `codex 运行失败（退出码 ${String(outcome.code)}）`
    : `codex 运行失败：${detail}`, failureDetails(outcome))
}

/** `schema` in OpenAI's strict form: every object closed, every property required, no defaults. */
export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema)
  if (!isRecord(schema)) return schema
  const node: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'default') continue
    node[key] = NAMED_SCHEMA_KEYS.has(key) && isRecord(value)
      ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, strictSchema(child)]))
      : strictSchema(value)
  }
  if (node['type'] === 'object' && isRecord(node['properties'])) {
    node['additionalProperties'] = false
    node['required'] = Object.keys(node['properties'])
  }
  return node
}

function claudeArgs(call: CliCall, schema: unknown, mcp: InternalMcp | null = null): string[] {
  return [
    '-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema),
    '--tools', '', '--strict-mcp-config', '--setting-sources', 'project',
    '--no-session-persistence', '--system-prompt', call.system,
    ...(call.model === undefined ? [] : [`--model=${call.model}`]),
    ...(mcp?.claudeArgs ?? []),
  ]
}

function codexArgs(
  call: CliCall, files: { schema: string; output: string; work: string }, mcp: InternalMcp | null = null,
): string[] {
  return [
    'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--ignore-user-config', '--ignore-rules', '--json', '--color', 'never',
    '--output-schema', files.schema, '-o', files.output, '-C', files.work, '-c', 'web_search="disabled"',
    ...CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    ...(call.model === undefined ? [] : [`--model=${call.model}`]),
    ...(mcp?.codexArgs ?? []),
    '-',
  ]
}

/**
 * Every flag the runner passes to `cli`, a call that looks up the vault included, the way
 * `claude --help` and `codex exec --help` list them.
 */
export function runnerFlags(cli: HarnessCli): string[] {
  const call: CliCall = {
    cli, model: 'model', system: 'system', prompt: 'prompt', schema: {}, timeoutMs: 0, signal: new AbortController().signal,
  }
  const lookup: InternalMcp = {
    ...internalMcpArgs({ configFile: 'config', server: { command: 'server', args: [] }, env: {}, tools: ['tool'] }),
    env: {},
    close: async () => {},
  }
  const args = cli === 'claude'
    ? claudeArgs(call, {}, lookup)
    : codexArgs(call, { schema: 'schema', output: 'output', work: 'work' }, lookup)
  return [...new Set(args.filter((arg) => arg.startsWith('-') && arg !== '-').map((arg) => arg.split('=')[0]!))]
}

/** Claude prints one JSON result: the output is its `structured_output`, absent when invalid. */
function claudeResult(outcome: ChildOutcome): Omit<CliResult, 'durationMs'> {
  let result: unknown
  try {
    result = JSON.parse(outcome.stdout)
  } catch {
    result = undefined
  }
  if (!isRecord(result)) {
    if (outcome.code !== 0) throw claudeExitFailure(outcome)
    return { output: null }
  }
  const reported = {
    usage: claudeUsage(result),
    ...(typeof result['num_turns'] === 'number' ? { turns: result['num_turns'] } : {}),
  }
  // An output that kept failing the schema is a malformed output, not a failed call.
  if (result['is_error'] === true && result['subtype'] !== 'error_max_structured_output_retries') {
    throw claudeFailure(result, outcome)
  }
  return { output: result['structured_output'] ?? null, ...reported }
}

/** Codex prints JSON Lines events and writes its last message, the output, to the `-o` file. */
function codexResult(outcome: ChildOutcome, outputFile: string): Omit<CliResult, 'durationMs'> {
  const events = outcome.stdout.split('\n').map(jsonLine).filter((event) => event !== null)
  if (outcome.code !== 0) throw codexFailure(events, outcome)
  let output: unknown = null
  if (existsSync(outputFile)) {
    try {
      output = JSON.parse(readFileSync(outputFile, 'utf8'))
    } catch {
      output = null
    }
  }
  return {
    output,
    usage: codexUsage(events),
    turns: events.filter((event) => event['type'] === 'turn.completed').length,
  }
}

export type CliRunnerDeps = {
  discover: (cli: HarnessCli) => Promise<CliDiscovery>
  /** A number that changes whenever the subscription settings change. */
  settingsRevision?: () => number
  environment?: NodeJS.ProcessEnv
  internalMcp?: InternalMcpOpener
  now?: () => number
}

/**
 * The check a call makes before it starts a CLI: `binary` resolves the binary of `cli` as `discover`
 * finds it once it is installed, supported and signed in with the user's subscription, and otherwise
 * rejects with a CliRunError saying why. A passed check holds for five minutes by `now`, until
 * `settingsRevision` changes or `failed` is told of a call that did not complete; a call the user
 * cancelled keeps it.
 */
export function cliCheck(deps: Pick<CliRunnerDeps, 'discover' | 'settingsRevision' | 'now'>) {
  const now = deps.now ?? Date.now
  const revision = deps.settingsRevision ?? (() => 0)
  /** Each CLI's binary from its last passed check, with when it passed and under which settings revision. */
  const passed = new Map<HarnessCli, { binary: string; at: number; revision: number }>()
  return {
    async binary(cli: HarnessCli): Promise<string> {
      const kept = passed.get(cli)
      if (kept !== undefined && now() - kept.at < CHECK_TTL_MS && kept.revision === revision()) return kept.binary
      passed.delete(cli)
      const check = { at: now(), revision: revision() }
      const ready = readiness(await deps.discover(cli))
      if (!('binary' in ready)) throw new CliRunError(ready.kind, ready.message)
      passed.set(cli, { binary: ready.binary, ...check })
      return ready.binary
    },
    failed(cli: HarnessCli, cause: unknown) {
      if (!(cause instanceof CliRunError && cause.kind === 'cancelled')) passed.delete(cli)
    },
  }
}

/**
 * The runner that starts the CLI as `discover` finds it, once it is installed, supported and signed
 * in with the user's subscription, in `environment` without its API-key variables, inside an empty
 * folder of a fresh temporary folder that it removes afterwards. A call with a `lookup` scope also
 * gets the internal MCP server `internalMcp` opens in that folder, and only that server, which the
 * runner closes once the CLI has exited, however the call ends; a refused call opens none. A passed
 * check holds for five minutes by `now`, until `settingsRevision` changes or a call fails or times out;
 * a call the user cancels keeps it.
 */
export function createCliRunner(deps: CliRunnerDeps): CliRunner {
  const environment = deps.environment ?? process.env
  const check = cliCheck(deps)
  return async (call) => {
    const binary = await check.binary(call.cli)
    if (call.lookup !== undefined && deps.internalMcp === undefined) {
      throw new Error('This runner has no internal MCP server for a call that looks up the vault')
    }
    return inTemporaryFolder(async (root) => {
      const work = join(root, 'work')
      mkdirSync(work)
      const schema = strictSchema(call.schema)
      const files = { schema: join(root, 'schema.json'), output: join(root, 'output.json'), work }
      if (call.cli === 'codex') writeFileSync(files.schema, JSON.stringify(schema))
      const mcp = call.lookup === undefined ? null : await deps.internalMcp!({ ...call.lookup, folder: root })
      const started = Date.now()
      let outcome: ChildOutcome
      try {
        outcome = await runChild(binary, call.cli === 'claude' ? claudeArgs(call, schema, mcp) : codexArgs(call, files, mcp), {
          cwd: work,
          env: { ...cliEnvironment(environment, binary), ...mcp?.env },
          input: call.cli === 'claude' ? call.prompt : `${call.system}\n\n${call.prompt}`,
          timeoutMs: call.timeoutMs,
          signal: call.signal,
        })
      } finally {
        await mcp?.close()
      }
      const durationMs = Date.now() - started
      const result = call.cli === 'claude' ? claudeResult(outcome) : codexResult(outcome, files.output)
      return { ...result, durationMs }
    }).catch((cause: unknown) => {
      check.failed(call.cli, cause)
      throw cause
    })
  }
}
