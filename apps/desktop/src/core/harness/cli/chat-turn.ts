import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { HarnessCli } from '../../../shared/contract.js'
import { type ChildOutcome, cliEnvironment, inTemporaryFolder, runChild } from './child.js'
import { type InternalMcp, internalMcpArgs } from './internal-mcp.js'
import {
  claudeExitFailure, claudeFailure, claudeUsage, cliCheck, CODEX_DISABLED_FEATURES, codexFailure, codexUsage,
  type CliRunnerDeps, type CliUsage, isRecord, jsonLine,
} from './runner.js'
import type { VaultToolScope } from './vault-tools.js'

export type CliChatCall = {
  cli: HarnessCli
  /** The CLI's model for this turn; without it the CLI uses its own default. */
  model?: string
  /** The instructions and the chat's context. */
  system: string
  /** The history and the new message. */
  prompt: string
  /** What the turn may look up in the vault through the internal MCP server; without it the CLI has no tools. */
  lookup?: VaultToolScope
  timeoutMs: number
  signal: AbortSignal
  /** Called with the answer as far as the CLI has written it, each time that grows. */
  onText?: (text: string) => void
}

export type CliChatResult = {
  /** The answer, or null when the CLI wrote none. */
  answer: string | null
  usage?: CliUsage
  durationMs: number
}

/**
 * One chat turn on the user's signed-in CLI. Rejects with a CliRunError when the CLI is not
 * installed, lacks a flag the turn passes, is not signed in with the user's subscription, reports
 * the plan's usage limit reached or fails otherwise, runs past the turn's timeout, or the turn's
 * signal aborts.
 */
export type CliChatRunner = (call: CliChatCall) => Promise<CliChatResult>

const modelFlag = (call: CliChatCall) => (call.model === undefined ? [] : [`--model=${call.model}`])

function claudeArgs(call: CliChatCall, mcp: InternalMcp | null): string[] {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--tools', '', '--strict-mcp-config', '--setting-sources', 'project',
    '--no-session-persistence', '--system-prompt', call.system,
    ...modelFlag(call), ...(mcp?.claudeArgs ?? []),
  ]
}

function codexArgs(call: CliChatCall, work: string, mcp: InternalMcp | null): string[] {
  return [
    'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--ignore-user-config', '--ignore-rules', '--json', '--color', 'never', '-c', 'web_search="disabled"', '-C', work,
    ...CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    ...modelFlag(call), ...(mcp?.codexArgs ?? []),
    '-',
  ]
}

/**
 * Every flag a chat turn passes to `cli`, a turn that looks up the vault included, the way
 * `claude --help` and `codex exec --help` list them.
 */
export function chatTurnFlags(cli: HarnessCli): string[] {
  const call: CliChatCall = {
    cli, model: 'model', system: 'system', prompt: 'prompt', timeoutMs: 0, signal: new AbortController().signal,
  }
  const lookup: InternalMcp = {
    ...internalMcpArgs({ configFile: 'config', server: { command: 'server', args: [] }, env: {}, tools: ['tool'] }),
    env: {},
    close: async () => {},
  }
  const args = cli === 'claude' ? claudeArgs(call, lookup) : codexArgs(call, 'work', lookup)
  return [...new Set(args.filter((arg) => arg.startsWith('-') && arg !== '-').map((arg) => arg.split('=')[0]!))]
}

/**
 * Reads the events a turn prints, one JSON object per line, as they arrive: tells `onText` the answer
 * as far as it is written and keeps every event for the end of the turn.
 */
function eventReader(cli: HarnessCli, onText: (text: string) => void) {
  const events: Array<Record<string, unknown>> = []
  let rest = ''
  let writing = ''
  let shown = ''
  const show = (text: string) => {
    if (text === '' || text === shown) return
    shown = text
    onText(text)
  }
  const read = (event: Record<string, unknown>) => {
    events.push(event)
    if (cli === 'codex') {
      const item = event['item']
      if (isRecord(item) && item['type'] === 'agent_message' && typeof item['text'] === 'string') show(item['text'])
      return
    }
    const stream = event['event']
    if (event['type'] !== 'stream_event' || !isRecord(stream)) return
    if (stream['type'] === 'message_start') writing = ''
    const delta = stream['delta']
    if (stream['type'] === 'content_block_delta' && isRecord(delta) && delta['type'] === 'text_delta'
      && typeof delta['text'] === 'string') {
      writing += delta['text']
      show(writing)
    }
  }
  const take = (line: string) => {
    const event = jsonLine(line)
    if (event !== null) read(event)
  }
  return {
    events,
    push(chunk: string) {
      const lines = `${rest}${chunk}`.split('\n')
      rest = lines.pop()!
      lines.forEach(take)
    },
    end() {
      take(rest)
      rest = ''
    },
  }
}

/** The answer of a Claude turn: its `result` event's text. */
function claudeAnswer(events: ReadonlyArray<Record<string, unknown>>, outcome: ChildOutcome) {
  const result = events.findLast((event) => event['type'] === 'result')
  if (result === undefined) {
    if (outcome.code !== 0) throw claudeExitFailure(outcome)
    return { answer: null }
  }
  if (result['is_error'] === true) throw claudeFailure(result, outcome)
  return { answer: typeof result['result'] === 'string' ? result['result'] : null, usage: claudeUsage(result) }
}

/** The answer of a Codex turn: its last completed agent message. */
function codexAnswer(events: ReadonlyArray<Record<string, unknown>>, outcome: ChildOutcome) {
  if (outcome.code !== 0) throw codexFailure(events, outcome)
  const message = events.findLast((event) => event['type'] === 'item.completed' && isRecord(event['item'])
    && event['item']['type'] === 'agent_message' && typeof event['item']['text'] === 'string')
  return { answer: message === undefined ? null : (message['item'] as { text: string }).text, usage: codexUsage(events) }
}

/**
 * The chat turn runner that starts the CLI as `discover` finds it, after the same check a runner's
 * call makes, in `environment` without its API-key variables, inside an empty folder of a fresh
 * temporary folder that it removes afterwards. A turn with a `lookup` scope also gets the internal
 * MCP server `internalMcp` opens in that folder, closed once the CLI has exited. The turn keeps no
 * session: the CLI reads the system prompt and the prompt whole.
 */
export function createCliChatRunner(deps: CliRunnerDeps): CliChatRunner {
  const environment = deps.environment ?? process.env
  const check = cliCheck(deps)
  return async (call) => {
    const binary = await check.binary(call.cli)
    if (call.lookup !== undefined && deps.internalMcp === undefined) {
      throw new Error('This runner has no internal MCP server for a turn that looks up the vault')
    }
    return inTemporaryFolder(async (root) => {
      const work = join(root, 'work')
      mkdirSync(work)
      const mcp = call.lookup === undefined ? null : await deps.internalMcp!({ ...call.lookup, folder: root })
      const reader = eventReader(call.cli, call.onText ?? (() => {}))
      const started = Date.now()
      let outcome: ChildOutcome
      try {
        outcome = await runChild(binary, call.cli === 'claude' ? claudeArgs(call, mcp) : codexArgs(call, work, mcp), {
          cwd: work,
          env: { ...cliEnvironment(environment, binary), ...mcp?.env },
          input: call.cli === 'claude' ? call.prompt : `${call.system}\n\n${call.prompt}`,
          timeoutMs: call.timeoutMs,
          signal: call.signal,
          onOutput: reader.push,
        })
      } finally {
        await mcp?.close()
      }
      const durationMs = Date.now() - started
      reader.end()
      const result = call.cli === 'claude' ? claudeAnswer(reader.events, outcome) : codexAnswer(reader.events, outcome)
      return { ...result, durationMs }
    }).catch((cause: unknown) => {
      check.failed(call.cli, cause)
      throw cause
    })
  }
}
