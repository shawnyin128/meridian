import { useEffect, useRef, useState } from 'react'
import type {
  HarnessCli, HarnessModelEntry, HarnessModelSettings, HarnessModelSourceGroup, HarnessSubscriptionStatus,
} from '../../../shared/contract.js'
import { harness } from '../../ipc.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { errorLabel, reasonLabel } from '../../lib/failure-label.js'
import { modelEntryLabel, modelSourceLabel } from '../../lib/model-source.js'
import { useMessages } from '../../messages/useMessages.js'
import { MenuItem } from '../ActionMenu.js'
import { ConfirmDialog } from '../ConfirmDialog.js'
import { EmptyState } from '../EmptyState.js'
import { DotsMenu } from '../FieldPickers.js'
import { FadeText } from '../FadeText.js'
import { Item, ItemOpen } from '../Item.js'
import { List } from '../List.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { PageError } from '../PageShell.js'
import { Tag } from '../Tag.js'
import { useArrival } from '../../hooks/useArrival.js'
import { useDrafts } from '../../hooks/useDrafts.js'
import { useTopLevel } from '../../hooks/useTopLevel.js'
import { ModelForm, type ModelDraft } from './ModelForm.js'
import { ServiceCard, ServiceError } from './ServiceCard.js'

/** The draft target of a new model's form. */
const NEW_MODEL = 'new'

/** The loads of the CLIs' states, each a section of the list that shows its own failure. */
const CLI_LOADS: readonly HarnessCli[] = ['claude', 'codex']

/** What a row shows of its CLI's state: why it could not be read, still reading, or as its status reads. */
function CliState({ status, failure }: { status: HarnessSubscriptionStatus | undefined; failure: string | null }) {
  const m = useMessages()
  const copy = m.settings.model.subscription
  return failure !== null ? <Tag state="error">{failure}</Tag>
    : status === undefined ? <LoadingPlaceholder shape="ring" holds="tag" />
      : status.state === 'missing' ? <Tag state="warning">{copy.missing}</Tag>
        : status.state === 'unsupported' ? <Tag state="warning">{copy.unsupported}</Tag>
          : <Tag state={status.signIn === 'subscription' ? 'done' : 'warning'}>{copy.signIn[status.signIn]}</Tag>
}

/**
 * The … menu of model `name`: Set as default unless it is the default, Edit, and Delete, which asks
 * first, once the menu has closed; cancelling returns focus to the menu's button.
 */
function ModelMenu({ name, isDefault, onSetDefault, onEdit, onDelete }: {
  name: string
  isDefault: boolean
  onSetDefault: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const m = useMessages()
  const copy = m.settings.model.list
  const deleting = useRef(false)
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <DotsMenu
        label={copy.manage(name)} stopRowActivation
        onCloseAutoFocus={() => {
          if (!deleting.current) return
          deleting.current = false
          setConfirming(true)
        }}
      >
        {isDefault ? null : <MenuItem onSelect={onSetDefault}>{copy.setDefault}</MenuItem>}
        <MenuItem onSelect={onEdit}>{m.common.edit}</MenuItem>
        <MenuItem className="mi danger" onSelect={() => { deleting.current = true }}>{m.common.delete}</MenuItem>
      </DotsMenu>
      <ConfirmDialog
        open={confirming} onOpenChange={setConfirming}
        title={copy.confirmDelete(name)} confirmLabel={m.common.delete} onConfirm={onDelete}
      />
    </>
  )
}

/**
 * The model settings: the form on top, which configures a source not configured yet, or, once a row
 * of the list under it is picked by a click or its … menu's Edit, saves that source anew, in its
 * place, with that row selected; then every configured source, one row each in the order sources are
 * shown, naming the source, its default model and reasoning effort, with its state and the default's
 * mark, and a … menu to make it the default, edit it or delete it; the list scrolls to the source a
 * save adds or changes and flashes it. The form keeps what is typed for a new source or a source's
 * change as a draft, the key left out. `onCopy` puts a command on the clipboard and resolves whether
 * it did. Each change of `reselected`, a count of the times its category was chosen again, puts the
 * form back on a new source and leaves the picked source's draft kept.
 */
export function ModelSettings({ onCopy, reselected }: { onCopy: (text: string) => Promise<boolean>; reselected: number }) {
  const m = useMessages()
  const [settings, setSettings] = useState<HarnessModelSettings | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // A new key for the add form each time it starts again, empty.
  const [adds, setAdds] = useState(0)
  const [statuses, setStatuses] = useState<Partial<Record<HarnessCli, HarnessSubscriptionStatus>>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  // The model a save just added or changed, which the list scrolls to and flashes.
  const [landing, setLanding] = useState<{ id: string } | null>(null)
  const { error, failure, load } = useScreenLoad(CLI_LOADS)
  useArrival(landing, settings !== null, ({ id }) => document.querySelector(`.model-list [data-model="${CSS.escape(id)}"]`))
  const drafts = useDrafts<ModelDraft>(['settings', 'model'], settings === null ? null : [NEW_MODEL, ...settings.models.map((entry) => entry.id)])

  useEffect(() => load('settings', harness.modelSettings(), setSettings), [load])
  const toNew = useTopLevel(editing !== null, () => setEditing(null))
  useEffect(toNew, [reselected, toNew])

  const clis = settings === null ? [] : settings.sources.flatMap((group) => (group.source.kind === 'cli' ? [group.source.cli] : []))
  const clisKey = clis.join(',')
  useEffect(() => {
    const drops = (clisKey === '' ? [] : clisKey.split(',') as HarnessCli[]).map((cli) => (
      load(cli, harness.subscriptionStatus(cli), (status) => setStatuses((held) => ({ ...held, [cli]: status })))
    ))
    return () => { for (const drop of drops) drop() }
  }, [clisKey, load])

  if (settings === null) {
    return error === null ? <LoadingPlaceholder shape="cards" count={1} /> : <PageError variant="section" error={error} />
  }

  const byId = new Map(settings.models.map((entry) => [entry.id, entry]))
  const edited = editing === null ? undefined : byId.get(editing)
  const target = edited?.id ?? NEW_MODEL
  const act = (change: Promise<HarnessModelSettings>) => {
    setActionError(null)
    void change.then((next) => {
      setSettings(next)
      if (editing !== null && !next.models.some((entry) => entry.id === editing)) setEditing(null)
    }, (caught: unknown) => setActionError(errorLabel(m, caught)))
  }
  const saved = (next: HarnessModelSettings) => {
    drafts.drop(target)
    const id = edited?.id ?? next.models.find((entry) => !byId.has(entry.id))?.id
    if (id !== undefined) setLanding({ id })
    setSettings(next)
    setEditing(null)
    setAdds((count) => count + 1)
  }
  const row = (group: HarnessModelSourceGroup, entry: HarnessModelEntry) => {
    const isDefault = settings.defaultModel === entry.id
    const name = modelSourceLabel(m, group)
    return (
      <Item
        composite className="model-row" data-model={entry.id} key={entry.id} selected={editing === entry.id}
        onActivate={() => setEditing(entry.id)}
        title={<ItemOpen><FadeText label={name}>{name}</FadeText></ItemOpen>}
        meta={[modelEntryLabel(m, entry), ...(entry.effort === undefined ? [] : [entry.effort])].join(' · ')}
        tags={(
          <>
            {isDefault ? <Tag>{m.settings.model.list.defaultMark}</Tag> : null}
            {entry.source.kind === 'cli'
              ? <CliState status={statuses[entry.source.cli]} failure={failure(entry.source.cli)} />
              : (
                <Tag state={entry.configured ? 'done' : 'warning'}>
                  {entry.configured ? m.settings.model.configured : m.settings.model.notConfigured}
                </Tag>
              )}
          </>
        )}
        menu={(
          <ModelMenu
            name={name} isDefault={isDefault}
            onSetDefault={() => act(harness.setDefaultModel(entry.id))}
            onEdit={() => setEditing(entry.id)}
            onDelete={() => act(harness.removeModel(entry.id))}
          />
        )}
      />
    )
  }

  return (
    <>
      <ServiceCard className="model-settings-card">
        <ModelForm
          key={edited === undefined ? `${NEW_MODEL}-${adds}` : edited.id}
          settings={settings} {...(edited === undefined ? {} : { entry: edited })}
          taken={settings.models.map((held) => held.id).filter((id) => id !== edited?.id)}
          kept={{ draft: drafts.get(target) ?? {}, onChange: (next) => drafts.set(target, next) }}
          onSaved={saved} onCopy={onCopy}
          {...(edited === undefined ? {} : {
            onCancel: () => {
              drafts.drop(edited.id)
              setEditing(null)
            },
          })}
        />
      </ServiceCard>
      {settings.models.length === 0
        ? <EmptyState variant="section" />
        : (
          <List variant="embedded" rows="fill" className="model-list">
            {settings.sources.flatMap((group) => group.entries.flatMap((id) => {
              const entry = byId.get(id)
              return entry === undefined ? [] : [row(group, entry)]
            }))}
          </List>
        )}
      {settings.error === undefined ? null : <ServiceError>{reasonLabel(m, settings.error)}</ServiceError>}
      {settings.subscription.error === undefined ? null : <ServiceError>{reasonLabel(m, settings.subscription.error)}</ServiceError>}
      {settings.modelsError === undefined ? null : <ServiceError>{reasonLabel(m, settings.modelsError)}</ServiceError>}
      {actionError === null ? null : <ServiceError>{actionError}</ServiceError>}
    </>
  )
}
