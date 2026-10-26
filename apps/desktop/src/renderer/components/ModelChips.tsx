import { useEffect, useState } from 'react'
import { HARNESS_API_EFFORTS } from '../../shared/contract.js'
import type {
  ChatModelChoice, HarnessCli, HarnessModelEfforts, HarnessModelEntry, HarnessModelSettings, HarnessModelSourceGroup,
  HarnessSubscriptionStatus,
} from '../../shared/contract.js'
import { useModelStatus } from '../hooks/useModelStatus.js'
import { chat as chatApi, harness } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import { modelEntryLabel, modelSourceLabel } from '../lib/model-source.js'
import { useMessages } from '../messages/useMessages.js'
import { useNotice, useSettingsOpen } from '../shell/AppShell.js'
import { MenuItem } from './ActionMenu.js'
import { ChoicePicker } from './FieldPickers.js'
import { RunningRing } from './icons.js'
import { ModelStatusTag } from './ModelStatusTag.js'

/** The effort option that keeps no effort of the chat's own, so the model's own applies. */
const OWN_EFFORT = ''

/** The key a source group goes by in its picker. */
const groupKey = ({ source }: HarnessModelSourceGroup) => (source.kind === 'api' ? `api:${source.profile}` : `cli:${source.cli}`)

/** The status of subscription CLI `cli`, read while `cli` is set and again when it changes; null until read. */
function useCliStatus(cli: HarnessCli | null): HarnessSubscriptionStatus | null {
  const [status, setStatus] = useState<{ cli: HarnessCli; status: HarnessSubscriptionStatus } | null>(null)
  useEffect(() => {
    if (cli === null) return
    let live = true
    void harness.subscriptionStatus(cli).then((next) => { if (live) setStatus({ cli, status: next }) })
    return () => { live = false }
  }, [cli])
  return status !== null && status.cli === cli ? status.status : null
}

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
 * The composer's three pickers for chat `chat`: the source, the model of that source and the
 * reasoning effort the chat runs at, each text with a caret. They offer only the models that can run
 * as set up, and the sources that hold one, besides the model the chat runs on now. A pick changes
 * only this chat, the way Core saves a chat's own choice: a new source runs its default entry, a new
 * model drops the chat's own effort, and an effort is the chat's own unless it is the one the model
 * runs at anyway. A refused change shows as a refusal notice. While no model is set up it is the shared "AI not
 * connected" tag; nothing can be picked while there is no chat.
 */
export function ModelChips({ chat }: { chat: string | null }) {
  const m = useMessages()
  const notice = useNotice()
  const { connected, settings } = useModelStatus()
  const { openCategory } = useSettingsOpen()
  const { choice, adopt } = useChatChoice(chat, settings)
  const shown = choice?.model ?? settings?.defaultModel ?? null
  const entry = settings?.models.find((model) => model.id === shown) ?? null
  const status = useCliStatus(entry?.source.kind === 'cli' ? entry.source.cli : null)
  if (connected !== true || settings === null || entry === null) return <ModelStatusTag />

  const group = settings.sources.find((held) => held.entries.includes(entry.id))!
  const save = (model: string, effort?: string) => {
    if (chat === null) return
    chatApi.setModel(chat, model, effort).then(adopt).catch((cause: unknown) => notice.refusal(errorLabel(m, cause)))
  }
  const entryOf = (id: string) => settings.models.find((model) => model.id === id)!
  const offered = (id: string) => id === entry.id || entryOf(id).configured
  const sources = settings.sources.filter((held) => held.entries.some(offered))
  return (
    <>
      <ChoicePicker
        appearance="text" disabled={chat === null} aria-label={m.chat.sourcePicker(modelSourceLabel(m, group))}
        value={groupKey(group)} options={sources.map(groupKey)}
        label={(key) => modelSourceLabel(m, sources.find((held) => groupKey(held) === key)!)}
        onPick={(key) => {
          const next = sources.find((held) => groupKey(held) === key)!
          if (next !== group) save(next.defaultEntry)
        }}
      />
      <ChoicePicker
        appearance="text" disabled={chat === null} aria-label={m.chat.modelPicker(modelEntryLabel(m, entry))}
        value={entry.id} options={group.entries.filter(offered)} label={(id) => modelEntryLabel(m, entryOf(id))}
        note={(id) => (id === settings.defaultModel ? m.chat.defaultMark : undefined)}
        onPick={(id) => { if (id !== entry.id) save(id) }}
        after={<MenuItem inset onSelect={() => openCategory('model')}>{m.chat.modelSettings}</MenuItem>}
      />
      <EffortPicker
        entry={entry} chosen={choice?.effort} disabled={chat === null}
        efforts={group.source.kind === 'api'
          ? { levels: [...HARNESS_API_EFFORTS[group.provider ?? 'openai-compatible']] }
          : status === null ? null
            : status.state === 'found' ? status.efforts[entry.model.trim()] ?? status.efforts[''] ?? { levels: [] } : { levels: [] }}
        onPick={(effort) => save(entry.id, effort)}
      />
    </>
  )
}

/**
 * The reasoning effort picker of model `entry`, showing the effort the chat runs at: `chosen`, the
 * chat's own, else the entry's, else the level `efforts` names as the default. Its menu lists the
 * levels `efforts` holds, the one the model runs at without a choice of the chat's own marked as the
 * default, or, when no such level is known, a first default option. Picking that one calls `onPick`
 * without an effort. While `efforts` is not known yet (null) it is busy, showing the effort it knows,
 * or the running ring, and cannot open; a model that takes no effort shows nothing.
 */
function EffortPicker({ entry, chosen, efforts, disabled, onPick }: {
  entry: HarnessModelEntry
  chosen: string | undefined
  efforts: HarnessModelEfforts | null
  disabled: boolean
  onPick: (effort?: string) => void
}) {
  const m = useMessages()
  if (efforts !== null && efforts.levels.length === 0) return null
  const own = entry.effort ?? efforts?.default
  const value = chosen ?? own ?? OWN_EFFORT
  const label = (option: string) => (option === OWN_EFFORT ? m.chat.effortDefault : option)
  const options = efforts === null ? [value] : own === undefined ? [OWN_EFFORT, ...efforts.levels] : efforts.levels
  const known = chosen ?? entry.effort
  return (
    <ChoicePicker
      appearance="text" disabled={disabled} busy={efforts === null} aria-label={m.chat.effortPicker(label(value))}
      value={value} options={options} label={label}
      note={(option) => (own !== undefined && option === own ? m.chat.defaultMark : undefined)}
      onPick={(option) => {
        if (option !== value) onPick(option === OWN_EFFORT || option === own ? undefined : option)
      }}
    >{efforts === null && known === undefined ? <RunningRing /> : label(value)}</ChoicePicker>
  )
}
