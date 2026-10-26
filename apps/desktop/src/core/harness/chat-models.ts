import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { ChatModelChoice } from '../../shared/contract.js'
import { HarnessEffortSchema } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { writeJson } from '../vault/writer.js'
import type { HarnessModelConfig, ModelChoice } from './model-config.js'

/** The model one chat of a vault chose, and its own reasoning effort for it. */
const ChoiceRecordSchema = z.looseObject({
  vault: z.string().min(1),
  chat: z.string().min(1),
  model: z.string().min(1).max(100),
  effort: HarnessEffortSchema.optional(),
})
const ChoicesFileSchema = z.looseObject({ chats: z.array(z.unknown()) })

/**
 * The models the chats of the vault at `vault` chose, kept in `file`, machine-local state outside
 * the vault, and read against the model list `models` holds. A record that cannot be read is reported
 * to `onLog`, skipped, and written back as it was.
 */
export function openChatModels(options: {
  file: string
  vault: string
  models: Pick<HarnessModelConfig, 'accepts' | 'modelOf'>
  onLog?: (line: string) => void
}) {
  const read = (): unknown[] => {
    if (!existsSync(options.file)) return []
    try {
      const parsed = ChoicesFileSchema.safeParse(JSON.parse(readFileSync(options.file, 'utf8')))
      if (parsed.success) return parsed.data.chats
    } catch {
      // Reported below, like a file of another shape.
    }
    options.onLog?.(`${options.file} cannot be read; every chat runs the default model again`)
    return []
  }
  let stored = read()
  const unreadable = stored.filter((record) => !ChoiceRecordSchema.safeParse(record).success).length
  if (unreadable > 0) options.onLog?.(`${options.file}: ${unreadable} chat records cannot be read and are skipped`)

  const indexOf = (chat: string) => stored.findIndex((record) => {
    const parsed = ChoiceRecordSchema.safeParse(record)
    return parsed.success && parsed.data.vault === options.vault && parsed.data.chat === chat
  })
  const save = () => {
    mkdirSync(dirname(options.file), { recursive: true })
    writeJson(options.file, { chats: stored }, join(dirname(options.file), '.tmp'))
  }

  /** The model chat `chat` chose, or null when it chose none. */
  const choiceOf = (chat: string): ModelChoice | null => {
    const at = indexOf(chat)
    if (at < 0) return null
    const { model, effort } = ChoiceRecordSchema.parse(stored[at])
    return { model, ...(effort === undefined ? {} : { effort }) }
  }

  /** What chat `chat` runs on: its chosen model while that is in the list, else the default, and its own effort for it. */
  const shown = (chat: string): ChatModelChoice => {
    const choice = choiceOf(chat)
    const model = options.models.modelOf(choice)
    const own = choice !== null && model === choice.model && choice.effort !== undefined
      && options.models.accepts(choice.model, choice.effort)
    return { model, ...(own ? { effort: choice.effort } : {}) }
  }

  return {
    choiceOf,
    shown,
    /**
     * Makes chat `chat` run on model `model`, at reasoning effort `effort` or else the model's own,
     * and returns what it runs on. Throws `not-found` for a model the list does not hold and `invalid`
     * for an effort it does not take.
     */
    set(chat: string, model: string, effort?: string): ChatModelChoice {
      if (!options.models.accepts(model)) throw new CallError('not-found', '这个模型不在列表里')
      if (!options.models.accepts(model, effort)) throw new CallError('invalid', `这个模型不接受推理强度 ${String(effort)}`)
      const record = { vault: options.vault, chat, model, ...(effort === undefined ? {} : { effort }) }
      const at = indexOf(chat)
      stored = at < 0 ? [...stored, record] : stored.map((held, index) => (index === at ? record : held))
      save()
      return shown(chat)
    },
    /** Forgets the choice of every chat of the vault that `kept` does not name. */
    prune(kept: ReadonlySet<string>) {
      const left = stored.filter((record) => {
        const parsed = ChoiceRecordSchema.safeParse(record)
        return !parsed.success || parsed.data.vault !== options.vault || kept.has(parsed.data.chat)
      })
      if (left.length === stored.length) return
      stored = left
      save()
    },
  }
}

export type ChatModels = ReturnType<typeof openChatModels>
