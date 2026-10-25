import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { HarnessCli } from '../../../shared/contract.js'
import { type ChildOutcome, cliEnvironment, CliRunError, inTemporaryFolder, runChild } from './child.js'
import {
  claudeFailure, claudeUsage, CODEX_DISABLED_FEATURES, codexFailure, codexUsage, type CliUsage, failureDetails,
  isRecord, jsonLine,
} from './runner.js'

export type CliChatCall = {
  cli: HarnessCli
  /** The CLI's model for this turn; without it the CLI uses its own default. */
  model?: string
  /** The instructions and the chat's context. */
  system: string
  /** The history and the new message. */
  prompt: string
  /** The flags that give the CLI the run's MCP servers. */
  mcpFlags: readonly string[]
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
 * installed, fails, runs past the turn's timeout, or the turn's signal aborts.
 */
export type CliChatRunner = (call: CliChatCall) => Promise<CliChatResult>

const modelFlag = (call: CliChatCall) => (call.model === undefined ? [] : [`--model=${call.model}`])

function claudeArgs(call: CliChatCall): string[] {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--tools', '', '--strict-mcp-config', '--setting-sources', 'project',
    '--no-session-persistence', '--system-prompt', call.system,
    ...modelFlag(call), ...call.mcpFlags,
  ]
}

function codexArgs(call: CliChatCall, work: string): string[] {
  return [
    'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--ignore-user-config', '--ignore-rules', '--json', '--color', 'never', '-c', 'web_search="disabled"', '-C', work,
    ...CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    ...modelFlag(call), ...call.mcpFlags,
    '-',
  ]
}

/** Every flag a chat turn passes to `cli`, the way `claude --help` and `codex exec --help` list them. */
export function chatTurnFlags(cli: HarnessCli): string[] {
  const call: CliChatCall = {
    cli, model: 'model', system: 'system', prompt: 'prompt', mcpFlags: [], timeoutMs: 0,
    signal: new AbortController().signal,
  }
  const args = cli === 'claude' ? claudeArgs(call) : codexArgs(call, 'work')
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
    if (outcome.code !== 0) {
      throw new CliRunError('failed', `claude 运行失败（退出码 ${String(outcome.code)}）`, failureDetails(outcome))
    }
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
 * The chat turn runner that starts the CLI `binary` resolves, in `environment` without its API-key
 * variables, inside an empty folder of a fresh temporary folder that it removes afterwards. The turn
 * keeps no session: the CLI reads the system prompt and the prompt whole.
 */
export function createCliChatRunner(deps: {
  binary: (cli: HarnessCli) => Promise<string | null>
  environment?: NodeJS.ProcessEnv
}): CliChatRunner {
  const environment = deps.environment ?? process.env
  return async (call) => {
    const binary = await deps.binary(call.cli)
    if (binary === null) throw new CliRunError('unavailable', `没有找到 ${call.cli} 命令`)
    return inTemporaryFolder(async (root) => {
      const work = join(root, 'work')
      mkdirSync(work)
      const reader = eventReader(call.cli, call.onText ?? (() => {}))
      const started = Date.now()
      const outcome = await runChild(binary, call.cli === 'claude' ? claudeArgs(call) : codexArgs(call, work), {
        cwd: work,
        env: cliEnvironment(environment, binary),
        input: call.cli === 'claude' ? call.prompt : `${call.system}\n\n${call.prompt}`,
        timeoutMs: call.timeoutMs,
        signal: call.signal,
        onOutput: reader.push,
      })
      const durationMs = Date.now() - started
      reader.end()
      const result = call.cli === 'claude' ? claudeAnswer(reader.events, outcome) : codexAnswer(reader.events, outcome)
      return { ...result, durationMs }
    })
  }
}
