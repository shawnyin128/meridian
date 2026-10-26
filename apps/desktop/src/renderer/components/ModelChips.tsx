import { useEffect, useState } from 'react'
import type {
  ChatModelChoice, HarnessModelEfforts, HarnessModelEntry, HarnessModelSettings, HarnessModelSourceGroup, HarnessSourceModels,
} from '../../shared/contract.js'
import { useModelStatus } from '../hooks/useModelStatus.js'
import { chat as chatApi, harness } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import { modelEntryLabel, modelSourceLabel } from '../lib/model-source.js'
import { useMessages } from '../messages/useMessages.js'
import { useNotice, useSettingsOpen } from '../shell/AppShell.js'
import { MenuItem } from './ActionMenu.js'
import { ChoicePicker } from './FieldPickers.js'
import { ModelStatusTag } from './ModelStatusTag.js'

/** The effort option that keeps no effort of the chat's own, so the model's own applies. */
const OWN_EFFORT = ''

/** The key a source group goes by in its picker. */
const groupKey = ({ source }: HarnessModelSourceGroup) => (source.kind === 'api' ? `api:${source.profile}` : `cli:${source.cli}`)

/**
 * The model chat `chat` runs on, as Core reports it, read when the chat or `settings` change and
 * set to what Core answers a change with; null until read and while there is no chat.
 */
function useChatChoice(chat: string | null, settings: HarnessModelSettings | null) {
  const [choice, setChoice] = useState<{ chat: string; choice: ChatModelChoice } | null>(null)
  useEffect(() => {
    if (chat === null || settings === null) return
    let live = true
    void chatApi.model(chat).then((next) => { if (live) setChoice({ chat, choice: next }) })
    return () => { live = false }
  }, [chat, settings])
  return {
    choice: choice !== null && choice.chat === chat ? choice.choice : null,
    adopt: (next: ChatModelChoice) => { if (chat !== null) setChoice({ chat, choice: next }) },
  }
}

/**
 * The models configured source `source` offers, as Core keeps them from its read at App start, asked
 * again when `settings` change; null while Core has not answered for this source yet.
 */
function useSourceModels(source: string | null, settings: HarnessModelSettings | null): HarnessSourceModels | null {
  const [models, setModels] = useState<HarnessSourceModels | null>(null)
  useEffect(() => {
    if (source === null) return
    let live = true
    void harness.sourceModels(source).then((next) => { if (live) setModels(next) })
    return () => { live = false }
  }, [source, settings])
  return models !== null && models.source === source ? models : null
}

/**
 * The composer's three pickers for chat `chat`: the source, the model of that source and the
 * reasoning effort of that model, each text with a caret. The source picker offers the configured
 * sources that can run, besides the chat's own; the model picker every model that source offers, as
 * Core keeps them for the session, its default model marked, then the model settings command; the
 * effort picker the levels of the chosen model. A pick changes only this chat, the way Core saves a
 * chat's own choice: a new source runs at its defaults, a new model drops the chat's own effort, and
 * picking the source's default model or the effort a run takes anyway keeps none of the chat's own. While a source's
 * models are not known yet the model and effort pickers are busy. A refused change shows as a
 * refusal notice. They show while some configured source can run, the chat's own or the default
 * included when it cannot; while none can, or the chat has no source to run, it is the shared "AI
 * not connected" tag. Nothing shows before the chat's choice is read; without a chat they show the
 * default source and nothing can be picked.
 */
export function ModelChips({ chat }: { chat: string | null }) {
  const m = useMessages()
  const notice = useNotice()
  const { anyRuns, settings } = useModelStatus()
  const { openCategory } = useSettingsOpen()
  const { choice, adopt } = useChatChoice(chat, settings)
  const shown = chat === null ? settings?.defaultModel ?? null : choice?.source ?? null
  const entry = settings?.models.find((model) => model.id === shown) ?? null
  const offers = useSourceModels(entry?.id ?? null, settings)
  if (settings === null || (chat !== null && choice === null)) return null
  if (anyRuns !== true || entry === null) return <ModelStatusTag connected={false} />

  const group = settings.sources.find((held) => held.entries.includes(entry.id))!
  const sources = settings.sources.filter((held) => held === group || held.entries.some((id) => (
    settings.models.find((model) => model.id === id)?.configured === true
  )))
  const model = choice?.model ?? entry.model
  const models = offers === null ? [model] : offers.models.some((held) => held.id === model)
    ? offers.models.map((held) => held.id) : [...offers.models.map((held) => held.id), model]
  const save = (next: { source: string; model?: string; effort?: string }) => {
    if (chat === null) return
    chatApi.setModel(chat, next.source, next.model, next.effort)
      .then(adopt).catch((cause: unknown) => notice.refusal(errorLabel(m, cause)))
  }
  return (
    <>
      <ChoicePicker
        appearance="text" disabled={chat === null} aria-label={m.chat.sourcePicker(modelSourceLabel(m, group))}
        value={groupKey(group)} options={sources.map(groupKey)}
        label={(key) => modelSourceLabel(m, sources.find((held) => groupKey(held) === key)!)}
        onPick={(key) => {
          const next = sources.find((held) => groupKey(held) === key)!
          if (next !== group) save({ source: next.defaultEntry })
        }}
      />
      <ChoicePicker
        appearance="text" disabled={chat === null} busy={offers === null}
        aria-label={m.chat.modelPicker(modelEntryLabel(m, { model }))}
        value={model} options={models} label={(id) => modelEntryLabel(m, { model: id })}
        note={(id) => (id === entry.model ? m.chat.defaultMark : undefined)}
        onPick={(id) => {
          if (id !== model) save({ source: entry.id, ...(id === entry.model ? {} : { model: id }) })
        }}
        after={<MenuItem inset onSelect={() => openCategory('model')}>{m.chat.modelSettings}</MenuItem>}
      />
      <EffortPicker
        entry={entry} model={model} chosen={choice?.effort} disabled={chat === null}
        efforts={offers === null ? null : offers.models.find((held) => held.id === model)?.efforts ?? { levels: [] }}
        onPick={(effort) => save({ source: entry.id, ...(choice?.model === undefined ? {} : { model: choice.model }), ...(effort === undefined ? {} : { effort }) })}
      />
    </>
  )
}

/**
 * The reasoning effort picker of `model`, a model of configured source `entry`, showing the effort
 * the chat runs at: `chosen`, the chat's own, else the one a run of `model` takes without it, the
 * source's own effort for its own model, else the level `efforts` names as the model's default. Its
 * menu lists the levels `efforts` holds, that run-without-a-choice effort marked as the default, or,
 * when there is none, a first default option. Picking it calls `onPick` without an effort. While
 * `efforts` is not known yet (null) it is busy, showing the effort it knows, and cannot open; a
 * model that takes no effort shows nothing.
 */
function EffortPicker({ entry, model, chosen, efforts, disabled, onPick }: {
  entry: HarnessModelEntry
  model: string
  chosen: string | undefined
  efforts: HarnessModelEfforts | null
  disabled: boolean
  onPick: (effort?: string) => void
}) {
  const m = useMessages()
  if (efforts !== null && efforts.levels.length === 0) return null
  const own = (model === entry.model ? entry.effort : undefined) ?? efforts?.default
  const value = chosen ?? own ?? OWN_EFFORT
  const label = (option: string) => (option === OWN_EFFORT ? m.chat.effortDefault : option)
  const options = efforts === null ? [value] : own === undefined ? [OWN_EFFORT, ...efforts.levels] : efforts.levels
  return (
    <ChoicePicker
      appearance="text" disabled={disabled} busy={efforts === null} aria-label={m.chat.effortPicker(label(value))}
      value={value} options={options} label={label}
      note={(option) => (own !== undefined && option === own ? m.chat.defaultMark : undefined)}
      onPick={(option) => {
        if (option !== value) onPick(option === OWN_EFFORT || option === own ? undefined : option)
      }}
    >{efforts === null && chosen === undefined && own === undefined ? '' : label(value)}</ChoicePicker>
  )
}
