import { createHash } from 'node:crypto'
import { existsSync, globSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { type HarnessCli, type HarnessCliModel, HarnessCliSchema } from '../../../shared/contract.js'
import type { CoreLogLevel } from '../../core-log.js'
import { writeJson } from '../../vault/writer.js'
import { cliEnvironment, inTemporaryFolder, runChild, stderrExcerpt } from './child.js'
import { resolveCliBinary } from './discovery.js'
import { jsonLine } from './runner.js'

/** A session id as both CLIs write one: a UUID, which nothing in a file name pattern can mistake. */
const SessionIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const UsageRecordSchema = z.looseObject({
  inputTokens: z.number(), cachedInputTokens: z.number(), outputTokens: z.number(),
})
const CliSessionRecordSchema = z.looseObject({ cli: HarnessCliSchema, id: SessionIdSchema })
/**
 * The session a chat's next turn may resume: on `cli` running `model`, absent for the CLI's own
 * default, and holding the turns `history` fingerprints. `total` is the running total of the usage
 * Codex reported for it.
 */
const ResumableRecordSchema = z.looseObject({
  cli: HarnessCliSchema,
  id: SessionIdSchema,
  model: z.string().optional(),
  history: z.string().min(1),
  total: UsageRecordSchema.optional(),
})
/** One chat's CLI sessions: every session it started, and the one its next turn may resume. */
const CliChatRecordSchema = z.looseObject({
  vault: z.string().min(1),
  chat: z.string().min(1),
  sessions: z.array(CliSessionRecordSchema),
  resumable: ResumableRecordSchema.nullable(),
})
const SessionsFileSchema = z.looseObject({ chats: z.array(z.unknown()) })
const DELETE_TIMEOUT_MS = 30_000
/** A line of a Codex session file that names the model its turn ran on. */
const TurnContextLineSchema = z.object({ type: z.literal('turn_context'), payload: z.object({ model: z.string().min(1) }) })

type CliChatRecord = z.infer<typeof CliChatRecordSchema>
export type ResumableSession = z.infer<typeof ResumableRecordSchema>

/** The name of the working folder of chat `chat` of the vault at `vault`. */
const folderName = (vault: string, chat: string) =>
  createHash('sha256').update(`${vault}\0${chat}`).digest('hex').slice(0, 32)

/**
 * The CLI sessions of the chats of the vault at `vault`, kept in `root`/sessions.json, machine-local
 * state outside the vault. Each chat's CLI runs in a folder of its own under `root`. The CLIs keep
 * their session files in their own homes, `CLAUDE_CONFIG_DIR` or ~/.claude and `CODEX_HOME` or
 * ~/.codex as `environment` sets them; Core only looks for, and deletes, a file named by a session's
 * id, and has Codex delete its own sessions with the `codex` that `binary` finds. A record that
 * cannot be read is reported to `onLog`, skipped, and written back as it was.
 */
export function openCliChatSessions(options: {
  root: string
  vault: string
  environment?: NodeJS.ProcessEnv
  home?: string
  binary?: (cli: HarnessCli) => Promise<string | null>
  onLog?: (level: CoreLogLevel, line: string) => void
}) {
  const file = join(options.root, 'sessions.json')
  const environment = options.environment ?? process.env
  const home = options.home ?? homedir()
  const claudeHome = environment['CLAUDE_CONFIG_DIR'] ?? join(home, '.claude')
  const codexHome = environment['CODEX_HOME'] ?? join(home, '.codex')

  const read = (): unknown[] => {
    if (!existsSync(file)) return []
    try {
      const parsed = SessionsFileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
      if (parsed.success) return parsed.data.chats
    } catch {
      // Reported below, like a file of another shape.
    }
    options.onLog?.('warn', `${file} cannot be read; the chats' CLI sessions start again`)
    return []
  }
  let stored = read()
  const unreadable = stored.filter((record) => !CliChatRecordSchema.safeParse(record).success).length
  if (unreadable > 0) options.onLog?.('warn', `${file}: ${unreadable} chat records cannot be read and are skipped`)

  const indexOf = (chat: string) => stored.findIndex((record) => {
    const parsed = CliChatRecordSchema.safeParse(record)
    return parsed.success && parsed.data.vault === options.vault && parsed.data.chat === chat
  })
  const recordOf = (chat: string): CliChatRecord | null => {
    const at = indexOf(chat)
    return at < 0 ? null : CliChatRecordSchema.parse(stored[at])
  }
  const save = () => {
    mkdirSync(options.root, { recursive: true })
    writeJson(file, { chats: stored }, join(options.root, '.tmp'))
  }
  const change = (chat: string, next: (record: CliChatRecord) => CliChatRecord) => {
    const at = indexOf(chat)
    const record = next(at < 0
      ? { vault: options.vault, chat, sessions: [], resumable: null }
      : CliChatRecordSchema.parse(stored[at]))
    stored = at < 0 ? [...stored, record] : stored.map((held, index) => (index === at ? record : held))
    save()
  }
  const withSession = (record: CliChatRecord, cli: HarnessCli, id: string): CliChatRecord =>
    record.sessions.some((session) => session.cli === cli && session.id === id)
      ? record
      : { ...record, sessions: [...record.sessions, { cli, id }] }
  const validId = (id: string) => {
    if (SessionIdSchema.safeParse(id).success) return true
    options.onLog?.('warn', `a CLI session id that is not a UUID is not kept: ${JSON.stringify(id.slice(0, 80))}`)
    return false
  }
  /**
   * Deletes session `id` of `cli` and nothing else: Claude's file and folder named by the id, and the
   * project folder that leaves empty; for Codex, `codex delete`, then any session file still named by
   * the id.
   */
  const deleteSession = async (cli: HarnessCli, id: string) => {
    if (cli === 'claude') {
      const projects = join(claudeHome, 'projects')
      const found = globSync([`*/${id}.jsonl`, `*/${id}`], { cwd: projects }).map((path) => join(projects, path))
      for (const path of found) rmSync(path, { recursive: true, force: true })
      for (const folder of new Set(found.map((path) => dirname(path)))) {
        if (readdirSync(folder).length === 0) rmdirSync(folder)
      }
      return
    }
    const binary = await (options.binary ?? resolveCliBinary)('codex')
    if (binary !== null) {
      const { code, stderr } = await inTemporaryFolder((folder) => runChild(binary, ['delete', '--force', id], {
        cwd: folder, env: cliEnvironment(environment, binary), timeoutMs: DELETE_TIMEOUT_MS,
      }))
      if (code !== 0) options.onLog?.('error', `codex delete ${id} exited with ${String(code)}: ${stderrExcerpt(stderr)}`)
    }
    const sessions = join(codexHome, 'sessions')
    for (const path of globSync(`**/*${id}*.jsonl`, { cwd: sessions })) rmSync(join(sessions, path), { force: true })
  }
  /** Whether `cli` still keeps a file of session `id`, as it does until the session expires. */
  const sessionKept = (cli: HarnessCli, id: string) => (cli === 'claude'
    ? globSync(`*/${id}.jsonl`, { cwd: join(claudeHome, 'projects') })
    : globSync(`**/*${id}*.jsonl`, { cwd: join(codexHome, 'sessions') })).length > 0

  return {
    /** The folder chat `chat`'s CLI runs in, made when it is missing. */
    folder(chat: string): string {
      const folder = join(options.root, folderName(options.vault, chat))
      mkdirSync(folder, { recursive: true })
      return folder
    },
    /**
     * The session chat `chat`'s next turn resumes on `model`, when the chat's turns so far fingerprint
     * to `history`; otherwise null, the reason going to `onLog`: no session kept, one on another CLI
     * or model, one that holds other turns, or one whose file the CLI no longer has.
     */
    resumable(chat: string, model: HarnessCliModel, history: string): ResumableSession | null {
      const kept = recordOf(chat)?.resumable ?? null
      const reason = kept === null ? 'no session to resume'
        : kept.cli !== model.cli || kept.model !== model.model ? 'the model changed'
          : kept.history !== history ? 'the chat changed'
            : !sessionKept(kept.cli, kept.id) ? 'the session is gone'
              : null
      if (reason === null) return kept
      options.onLog?.('info', `chat ${chat}: a new ${model.cli} session, ${reason}`)
      return null
    },
    /**
     * Records that chat `chat` runs a turn on `cli`, in session `id` when its id is already known. No
     * session of the chat is resumable from then on until `keep` names one.
     */
    begin(chat: string, cli: HarnessCli, id?: string) {
      change(chat, (record) => {
        const next = { ...record, resumable: null }
        return id !== undefined && validId(id) ? withSession(next, cli, id) : next
      })
    },
    /** Records that chat `chat` runs its turn in session `id` of `cli`. */
    started(chat: string, cli: HarnessCli, id: string) {
      if (validId(id)) change(chat, (record) => withSession(record, cli, id))
    },
    /** Makes `session`, which holds the turns `session.history` fingerprints, the one chat `chat`'s next turn resumes. */
    keep(chat: string, session: ResumableSession) {
      if (validId(session.id)) change(chat, (record) => ({ ...withSession(record, session.cli, session.id), resumable: session }))
    },
    /**
     * The model Codex session `id` ran its last turn on, as the session's own file records it, or null
     * when the file names none or is gone.
     */
    codexModel(id: string): string | null {
      if (!SessionIdSchema.safeParse(id).success) return null
      const sessions = join(codexHome, 'sessions')
      const file = globSync(`**/*${id}*.jsonl`, { cwd: sessions })[0]
      if (file === undefined) return null
      const turns = readFileSync(join(sessions, file), 'utf8').split('\n')
        .filter((line) => line.includes('"turn_context"'))
        .map((line) => TurnContextLineSchema.safeParse(jsonLine(line)))
      return turns.findLast((turn) => turn.success)?.data?.payload.model ?? null
    },
    /**
     * Deletes the CLI sessions of every chat of the vault that `kept` does not name, then the chat's
     * folder and its record. A chat whose sessions cannot all be deleted keeps its record for the
     * next time; why goes to `onLog`.
     */
    async prune(kept: ReadonlySet<string>): Promise<void> {
      const gone = stored.flatMap((record) => {
        const parsed = CliChatRecordSchema.safeParse(record)
        return parsed.success && parsed.data.vault === options.vault && !kept.has(parsed.data.chat) ? [parsed.data] : []
      })
      for (const record of gone) {
        try {
          for (const session of record.sessions) await deleteSession(session.cli, session.id)
          rmSync(join(options.root, folderName(options.vault, record.chat)), { recursive: true, force: true })
        } catch (cause) {
          options.onLog?.('error', `chat ${record.chat}: its CLI sessions could not be deleted: ${cause instanceof Error ? cause.message : String(cause)}`)
          continue
        }
        const at = indexOf(record.chat)
        stored = stored.filter((_, index) => index !== at)
        save()
        options.onLog?.('info', `chat ${record.chat}: deleted its ${record.sessions.length} CLI sessions`)
      }
    },
  }
}

export type CliChatSessions = ReturnType<typeof openCliChatSessions>
