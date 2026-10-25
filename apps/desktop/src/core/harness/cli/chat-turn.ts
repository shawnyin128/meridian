import { writeFileSync } from 'node:fs'
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
  /** The history and the new message, or, in a resumed session, the new message alone. */
  prompt: string
  /** The session the turn resumes, or else starts; Claude starts it with the id `start` names. */
  session: { resume: string } | { start?: string }
  /** The folder the CLI runs in, which the CLI files its sessions under. */
  folder: string
  /** Called with the id of the session the turn runs in, as soon as the CLI names it. */
  onSession?: (id: string) => void
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

/** Claude reads the system prompt from `systemFile`, so a long chat context never meets a command-line limit. */
function claudeArgs(call: CliChatCall, systemFile: string, mcp: InternalMcp | null): string[] {
  const session = 'resume' in call.session ? ['--resume', call.session.resume]
    : call.session.start === undefined ? [] : ['--session-id', call.session.start]
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--tools', '', '--strict-mcp-config', '--setting-sources', 'project',
    ...session, '--system-prompt-file', systemFile,
    ...modelFlag(call), ...(mcp?.claudeArgs ?? []),
  ]
}

/** `codex exec resume` takes no --sandbox, --color or -C; its sandbox is set through -c. */
function codexArgs(call: CliChatCall, mcp: InternalMcp | null): string[] {
  const common = [
    '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--json', '-c', 'web_search="disabled"',
    ...CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    ...modelFlag(call), ...(mcp?.codexArgs ?? []),
  ]
  return 'resume' in call.session
    ? ['exec', 'resume', ...common, '-c', 'sandbox_mode="read-only"', call.session.resume, '-']
    : ['exec', ...common, '--sandbox', 'read-only', '--color', 'never', '-C', call.folder, '-']
}

/**
 * Every flag a chat turn that starts or resumes a session, and looks up the vault, passes to `cli`,
 * the way `claude --help` and `codex exec --help` list them, with Codex's `resume` command.
 */
export function chatTurnFlags(cli: HarnessCli): string[] {
  const turn = (session: CliChatCall['session']): CliChatCall => ({
    cli, model: 'model', system: 'system', prompt: 'prompt', session, folder: 'folder', timeoutMs: 0,
    signal: new AbortController().signal,
  })
  const lookup: InternalMcp = {
    ...internalMcpArgs({ configFile: 'config', server: { command: 'server', args: [] }, env: {}, tools: ['tool'] }),
    env: {},
    close: async () => {},
  }
  const args = [turn({ start: 'id' }), turn({ resume: 'id' })]
    .flatMap((call) => (cli === 'claude' ? claudeArgs(call, 'system', lookup) : codexArgs(call, lookup)))
  const flags = args.filter((arg) => arg.startsWith('-') && arg !== '-').map((arg) => arg.split('=')[0]!)
  return [...new Set([...flags, ...(cli === 'codex' ? ['resume'] : [])])]
}

/**
 * Reads the events a turn prints, one JSON object per line, as they arrive: tells `onSession` the
 * session's id once the CLI names it, tells `onText` the answer as far as it is written, and keeps
 * every event for the end of the turn.
 */
function eventReader(cli: HarnessCli, onSession: (id: string) => void, onText: (text: string) => void) {
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
    const session = cli === 'claude'
      ? (event['type'] === 'system' && event['subtype'] === 'init' ? event['session_id'] : undefined)
      : (event['type'] === 'thread.started' ? event['thread_id'] : undefined)
    if (typeof session === 'string') onSession(session)
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
 * call makes, in `environment` without its API-key variables, inside the turn's folder. Claude reads
 * the system prompt from a file in a fresh temporary folder and the prompt on stdin; Codex reads both
 * on stdin when it starts a session, and only the prompt when it resumes one, whose first message
 * already holds the system prompt. A turn with a `lookup` scope also gets the internal MCP server
 * `internalMcp` opens in that temporary folder, closed once the CLI has exited; the folder is removed
 * then.
 */
export function createCliChatRunner(deps: CliRunnerDeps): CliChatRunner {
  const environment = deps.environment ?? process.env
  const check = cliCheck(deps)
  return async (call) => {
    const binary = await check.binary(call.cli)
    if (call.lookup !== undefined && deps.internalMcp === undefined) {
      throw new Error('This runner has no internal MCP server for a turn that looks up the vault')
    }
    // The internal MCP server's socket goes in a short temporary path, not the chat's folder.
    return inTemporaryFolder(async (root) => {
      const systemFile = join(root, 'system-prompt.txt')
      if (call.cli === 'claude') writeFileSync(systemFile, call.system, { mode: 0o600 })
      const mcp = call.lookup === undefined ? null : await deps.internalMcp!({ ...call.lookup, folder: root })
      const reader = eventReader(call.cli, call.onSession ?? (() => {}), call.onText ?? (() => {}))
      const started = Date.now()
      let outcome: ChildOutcome
      try {
        outcome = await runChild(binary, call.cli === 'claude' ? claudeArgs(call, systemFile, mcp) : codexArgs(call, mcp), {
          cwd: call.folder,
          env: { ...cliEnvironment(environment, binary), ...mcp?.env },
          input: call.cli === 'claude' || 'resume' in call.session ? call.prompt : `${call.system}\n\n${call.prompt}`,
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
