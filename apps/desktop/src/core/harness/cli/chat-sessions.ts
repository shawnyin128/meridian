import { createHash } from 'node:crypto'
import { existsSync, globSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { type HarnessCli, type HarnessCliModel, HarnessCliSchema } from '../../../shared/contract.js'
import { writeJson } from '../../vault/writer.js'

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

type CliChatRecord = z.infer<typeof CliChatRecordSchema>
export type ResumableSession = z.infer<typeof ResumableRecordSchema>

/** The name of the working folder of chat `chat` of the vault at `vault`. */
const folderName = (vault: string, chat: string) =>
  createHash('sha256').update(`${vault}\0${chat}`).digest('hex').slice(0, 32)

/**
 * The CLI sessions of the chats of the vault at `vault`, kept in `root`/sessions.json, machine-local
 * state outside the vault. Each chat's CLI runs in a folder of its own under `root`. The CLIs keep
 * their session files in their own homes, `CLAUDE_CONFIG_DIR` or ~/.claude and `CODEX_HOME` or
 * ~/.codex as `environment` sets them; Core only looks for a file named by a session's id. A record
 * that cannot be read is reported to `onLog`, skipped, and written back as it was.
 */
export function openCliChatSessions(options: {
  root: string
  vault: string
  environment?: NodeJS.ProcessEnv
  home?: string
  onLog?: (line: string) => void
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
    options.onLog?.(`${file} cannot be read; the chats' CLI sessions start again`)
    return []
  }
  let stored = read()
  const unreadable = stored.filter((record) => !CliChatRecordSchema.safeParse(record).success).length
  if (unreadable > 0) options.onLog?.(`${file}: ${unreadable} chat records cannot be read and are skipped`)

  const indexOf = (chat: string) => stored.findIndex((record) => {
    const parsed = CliChatRecordSchema.safeParse(record)
    return parsed.success && parsed.data.vault === options.vault && parsed.data.chat === chat
  })
  const recordOf = (chat: string): CliChatRecord | null => {
    const at = indexOf(chat)
    return at < 0 ? null : CliChatRecordSchema.parse(stored[at])
  }
  const change = (chat: string, next: (record: CliChatRecord) => CliChatRecord) => {
    const at = indexOf(chat)
    const record = next(at < 0
      ? { vault: options.vault, chat, sessions: [], resumable: null }
      : CliChatRecordSchema.parse(stored[at]))
    stored = at < 0 ? [...stored, record] : stored.map((held, index) => (index === at ? record : held))
    mkdirSync(options.root, { recursive: true })
    writeJson(file, { chats: stored }, join(options.root, '.tmp'))
  }
  const withSession = (record: CliChatRecord, cli: HarnessCli, id: string): CliChatRecord =>
    record.sessions.some((session) => session.cli === cli && session.id === id)
      ? record
      : { ...record, sessions: [...record.sessions, { cli, id }] }
  const validId = (id: string) => {
    if (SessionIdSchema.safeParse(id).success) return true
    options.onLog?.(`a CLI session id that is not a UUID is not kept: ${JSON.stringify(id.slice(0, 80))}`)
    return false
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
      options.onLog?.(`chat ${chat}: a new ${model.cli} session, ${reason}`)
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
  }
}

export type CliChatSessions = ReturnType<typeof openCliChatSessions>
