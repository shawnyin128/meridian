import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HarnessCli } from '../../../shared/contract.js'
import { type ChildOutcome, cliEnvironment, CliRunError, inTemporaryFolder, runChild } from './child.js'

/** Codex features that give the model a tool or load outside code; every run turns them all off. */
export const CODEX_DISABLED_FEATURES = [
  'shell_tool', 'unified_exec', 'apps', 'plugins', 'multi_agent', 'image_generation',
  'browser_use_external', 'view_image', 'hooks', 'tool_suggest', 'skill_search', 'goals',
  'sleep_tool', 'remote_plugin', 'skill_mcp_dependency_install', 'code_mode_host',
] as const

/** Keys whose value maps names to schemas, so a key named `default` inside is a name to keep. */
const NAMED_SCHEMA_KEYS = new Set(['properties', '$defs', 'definitions', 'patternProperties'])

const MAX_CLI_ERROR_DETAIL = 300

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
 * installed, fails, runs past the call's timeout, or the call's signal aborts.
 */
export type CliRunner = (call: CliCall) => Promise<CliResult>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

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

function claudeArgs(call: CliCall, schema: unknown): string[] {
  return [
    '-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema),
    '--tools', '', '--strict-mcp-config', '--setting-sources', 'project',
    '--no-session-persistence', '--system-prompt', call.system,
    ...(call.model === undefined ? [] : [`--model=${call.model}`]),
  ]
}

function codexArgs(call: CliCall, files: { schema: string; output: string; work: string }): string[] {
  return [
    'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--ignore-user-config', '--ignore-rules', '--json', '--color', 'never',
    '--output-schema', files.schema, '-o', files.output, '-C', files.work,
    ...CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    ...(call.model === undefined ? [] : [`--model=${call.model}`]),
    '-',
  ]
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
    if (outcome.code !== 0) throw new CliRunError('failed', `claude 运行失败（退出码 ${String(outcome.code)}）`)
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
    throw new CliRunError('failed', detail === '' ? 'claude 运行失败' : `claude 运行失败：${detail}`)
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
    const detail = detailOf(isRecord(failure?.['error']) ? failure['error']['message'] : failure?.['message'])
    throw new CliRunError('failed', detail === ''
      ? `codex 运行失败（退出码 ${String(outcome.code)}）`
      : `codex 运行失败：${detail}`)
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
 * The runner that starts the CLI `binary` resolves, in `environment` without its API-key
 * variables, inside an empty folder of a fresh temporary folder that it removes afterwards.
 */
export function createCliRunner(deps: {
  binary: (cli: HarnessCli) => Promise<string | null>
  environment?: NodeJS.ProcessEnv
}): CliRunner {
  const environment = deps.environment ?? process.env
  return async (call) => {
    const binary = await deps.binary(call.cli)
    if (binary === null) throw new CliRunError('unavailable', `没有找到 ${call.cli} 命令`)
    return inTemporaryFolder(async (root) => {
      const work = join(root, 'work')
      mkdirSync(work)
      const schema = strictSchema(call.schema)
      const files = { schema: join(root, 'schema.json'), output: join(root, 'output.json'), work }
      if (call.cli === 'codex') writeFileSync(files.schema, JSON.stringify(schema))
      const started = Date.now()
      const outcome = await runChild(binary, call.cli === 'claude' ? claudeArgs(call, schema) : codexArgs(call, files), {
        cwd: work,
        env: cliEnvironment(environment, binary),
        input: call.cli === 'claude' ? call.prompt : `${call.system}\n\n${call.prompt}`,
        timeoutMs: call.timeoutMs,
        signal: call.signal,
      })
      const durationMs = Date.now() - started
      const result = call.cli === 'claude' ? claudeResult(outcome) : codexResult(outcome, files.output)
      return { ...result, durationMs }
    })
  }
}
