import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HarnessCli } from '../../../shared/contract.js'
import { type ChildOutcome, cliEnvironment, CliRunError, inTemporaryFolder, runChild, stderrExcerpt } from './child.js'
import type { CliDiscovery } from './discovery.js'
import { reachedUsageLimit, readiness } from './failure.js'
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
 * the plan's usage limit reached or fails otherwise, runs past the call's timeout, or the call's
 * signal aborts.
 */
export type CliRunner = (call: CliCall) => Promise<CliResult>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** What a failed call reports beside its message: the CLI's exit code and the redacted end of its stderr. */
const failureDetails = (outcome: ChildOutcome) => ({ exitCode: outcome.code, stderr: stderrExcerpt(outcome.stderr) })

/** How a call `cli` failed with `reported`, its own error text if any: at the plan's usage limit, or otherwise. */
const failedKind = (cli: HarnessCli, outcome: ChildOutcome, reported: unknown = '') =>
  reachedUsageLimit(cli, `${typeof reported === 'string' ? reported : ''}\n${outcome.stderr}`) ? 'usage-limit' : 'failed'

const detailOf = (value: unknown) => typeof value === 'string'
  ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_CLI_ERROR_DETAIL)
  : ''

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
    '--output-schema', files.schema, '-o', files.output, '-C', files.work,
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
    if (outcome.code !== 0) {
      throw new CliRunError(failedKind('claude', outcome), `claude 运行失败（退出码 ${String(outcome.code)}）`, failureDetails(outcome))
    }
    return { output: null }
  }
  const usage = isRecord(result['usage']) ? result['usage'] : {}
  const cachedInputTokens = count(usage['cache_read_input_tokens'])
  const reported = {
    usage: {
      inputTokens: count(usage['input_tokens']) + count(usage['cache_creation_input_tokens']) + cachedInputTokens,
      cachedInputTokens,
      outputTokens: count(usage['output_tokens']),
    },
    ...(typeof result['num_turns'] === 'number' ? { turns: result['num_turns'] } : {}),
  }
  // An output that kept failing the schema is a malformed output, not a failed call.
  if (result['is_error'] === true && result['subtype'] !== 'error_max_structured_output_retries') {
    const detail = detailOf(result['result'])
    throw new CliRunError(failedKind('claude', outcome, result['result']),
      detail === '' ? 'claude 运行失败' : `claude 运行失败：${detail}`, failureDetails(outcome))
  }
  return { output: result['structured_output'] ?? null, ...reported }
}

/** Codex prints JSON Lines events and writes its last message, the output, to the `-o` file. */
function codexResult(outcome: ChildOutcome, outputFile: string): Omit<CliResult, 'durationMs'> {
  const events = outcome.stdout.split('\n').flatMap((line) => {
    try {
      const event: unknown = JSON.parse(line)
      return isRecord(event) ? [event] : []
    } catch {
      return []
    }
  })
  if (outcome.code !== 0) {
    const failure = events.findLast((event) => event['type'] === 'turn.failed' || event['type'] === 'error')
    const reported = isRecord(failure?.['error']) ? failure['error']['message'] : failure?.['message']
    const detail = detailOf(reported)
    throw new CliRunError(failedKind('codex', outcome, reported), detail === ''
      ? `codex 运行失败（退出码 ${String(outcome.code)}）`
      : `codex 运行失败：${detail}`, failureDetails(outcome))
  }
  const turns = events.filter((event) => event['type'] === 'turn.completed')
  const usages = turns.map((event) => (isRecord(event['usage']) ? event['usage'] : {}))
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
    usage: {
      inputTokens: usages.reduce((sum, usage) => sum + count(usage['input_tokens']), 0),
      cachedInputTokens: usages.reduce((sum, usage) => sum + count(usage['cached_input_tokens']), 0),
      outputTokens: usages.reduce((sum, usage) => sum + count(usage['output_tokens']), 0),
    },
    turns: turns.length,
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
export function createCliRunner(deps: {
  discover: (cli: HarnessCli) => Promise<CliDiscovery>
  /** A number that changes whenever the subscription settings change. */
  settingsRevision?: () => number
  environment?: NodeJS.ProcessEnv
  internalMcp?: InternalMcpOpener
  now?: () => number
}): CliRunner {
  const environment = deps.environment ?? process.env
  const now = deps.now ?? Date.now
  const revision = deps.settingsRevision ?? (() => 0)
  /** Each CLI's binary from its last passed check, with when it passed and under which settings revision. */
  const passed = new Map<HarnessCli, { binary: string; at: number; revision: number }>()
  const checkedBinary = async (cli: HarnessCli) => {
    const kept = passed.get(cli)
    if (kept !== undefined && now() - kept.at < CHECK_TTL_MS && kept.revision === revision()) return kept.binary
    passed.delete(cli)
    const check = { at: now(), revision: revision() }
    const ready = readiness(await deps.discover(cli))
    if (!('binary' in ready)) throw new CliRunError(ready.kind, ready.message)
    passed.set(cli, { binary: ready.binary, ...check })
    return ready.binary
  }
  return async (call) => {
    const binary = await checkedBinary(call.cli)
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
      if (!(cause instanceof CliRunError && cause.kind === 'cancelled')) passed.delete(call.cli)
      throw cause
    })
  }
}
