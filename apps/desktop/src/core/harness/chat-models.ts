import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { ChatModelChoice, HarnessSourceModels } from '../../shared/contract.js'
import { HarnessEffortSchema, HarnessSubscriptionModelSchema } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { CoreLogLevel } from '../core-log.js'
import { writeJson } from '../vault/writer.js'
import type { HarnessModelConfig, ModelChoice } from './model-config.js'

/** The source one chat of a vault chose, and its own model of it and reasoning effort. */
const ChoiceRecordSchema = z.looseObject({
  vault: z.string().min(1),
  chat: z.string().min(1),
  source: z.string().min(1).max(320),
  model: HarnessSubscriptionModelSchema.optional(),
  effort: HarnessEffortSchema.optional(),
})
const ChoicesFileSchema = z.looseObject({ chats: z.array(z.unknown()) })

/**
 * The sources the chats of the vault at `vault` chose, kept in `file`, machine-local state outside
 * the vault, and read against the model list `models` holds and the models each source offers, as
 * `offers` gives them. A record that cannot be read is reported to `onLog`, skipped, and written
 * back as it was.
 */
export function openChatModels(options: {
  file: string
  vault: string
  models: Pick<HarnessModelConfig, 'accepts' | 'modelOf'>
  offers: (source: string) => Promise<HarnessSourceModels>
  onLog?: (level: CoreLogLevel, line: string) => void
}) {
  const read = (): unknown[] => {
    if (!existsSync(options.file)) return []
    try {
      const parsed = ChoicesFileSchema.safeParse(JSON.parse(readFileSync(options.file, 'utf8')))
      if (parsed.success) return parsed.data.chats
    } catch {
      // Reported below, like a file of another shape.
    }
    options.onLog?.('warn', `${options.file} cannot be read; every chat runs the default model again`)
    return []
  }
  let stored = read()
  const unreadable = stored.filter((record) => !ChoiceRecordSchema.safeParse(record).success).length
  if (unreadable > 0) options.onLog?.('warn', `${options.file}: ${unreadable} chat records cannot be read and are skipped`)

  const indexOf = (chat: string) => stored.findIndex((record) => {
    const parsed = ChoiceRecordSchema.safeParse(record)
    return parsed.success && parsed.data.vault === options.vault && parsed.data.chat === chat
  })
  const save = () => {
    mkdirSync(dirname(options.file), { recursive: true })
    writeJson(options.file, { chats: stored }, join(dirname(options.file), '.tmp'))
  }

  /** The source chat `chat` chose, with its own model and effort, or null when it chose none. */
  const choiceOf = (chat: string): ModelChoice | null => {
    const at = indexOf(chat)
    if (at < 0) return null
    const { source, model, effort } = ChoiceRecordSchema.parse(stored[at])
    return { source, ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }) }
  }

  /** What chat `chat` runs on: its chosen source while that is configured, else the default, with the chat's own model and effort of it. */
  const shown = (chat: string): ChatModelChoice => {
    const choice = choiceOf(chat)
    const source = options.models.modelOf(choice)
    const own = choice !== null && source === choice.source
    const effort = own && choice.effort !== undefined && options.models.accepts(choice.source, choice.effort) ? choice.effort : undefined
    return {
      source,
      ...(own && choice.model !== undefined ? { model: choice.model } : {}),
      ...(effort === undefined ? {} : { effort }),
    }
  }

  return {
    choiceOf,
    shown,
    /**
     * Makes chat `chat` run on configured source `source`, on its model `model` and at reasoning
     * effort `effort`, each else the source's own, and returns what it runs on. Throws `not-found`
     * for a source the list does not hold, and `invalid` for a model the source's list, once read,
     * does not offer and for an effort the model, or else the source, does not take.
     */
    async set(chat: string, source: string, model?: string, effort?: string): Promise<ChatModelChoice> {
      if (!options.models.accepts(source)) throw new CallError('not-found', '这个模型不在列表里')
      const offered = await options.offers(source)
      const listed = offered.error === undefined ? offered.models : null
      if (model !== undefined && listed !== null && !listed.some((held) => held.id === model)) {
        throw new CallError('invalid', `这个来源没有模型 ${model}`)
      }
      const levels = model === undefined ? offered.models[0]?.efforts.levels : listed?.find((held) => held.id === model)?.efforts.levels
      if (effort !== undefined && (levels === undefined || levels.length === 0
        ? !options.models.accepts(source, effort) : !levels.includes(effort))) {
        throw new CallError('invalid', `这个模型不接受推理强度 ${effort}`)
      }
      const record = {
        vault: options.vault, chat, source, ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }),
      }
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
