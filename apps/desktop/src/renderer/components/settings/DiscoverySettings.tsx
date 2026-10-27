import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  DiscoveryCandidate, DiscoveryDirectionParams, DiscoveryIntent, DiscoveryIntentAction, DiscoveryProfile,
} from '../../../shared/contract.js'
import { discovery } from '../../ipc.js'
import { useArrival } from '../../hooks/useArrival.js'
import { useDrafts } from '../../hooks/useDrafts.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { useMessages } from '../../messages/useMessages.js'
import { useNotice, useSettingsOpen, useVaultRevision } from '../../shell/AppShell.js'
import { AddAction } from '../AddAction.js'
import { DotsMenu } from '../FieldPickers.js'
import { InlineField } from '../InlineField.js'
import { EmptyState } from '../EmptyState.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { PageError, SectionHeading } from '../PageShell.js'
import { PaperText } from '../paper/PaperText.js'
import { Switch } from '../Switch.js'
import { Tag } from '../Tag.js'
import { Group, GroupedList } from '../GroupedList.js'
import { FadeText } from '../FadeText.js'
import { plainTitle } from '../paper/paper-text.js'
import { Button } from '../Button.js'
import { Item } from '../Item.js'
import { List } from '../List.js'

/** The draft a direction's rename is kept under, with its project and direction. */
const RENAME = 'rename'

/** A direction's seed papers on one fading line. */
function DirectionSeeds({ seeds }: { seeds: DiscoveryCandidate['seeds'] }) {
  return (
    <FadeText className="direction-seeds" label={seeds.map((seed) => plainTitle(seed.title)).join(' · ')}>
      {seeds.map((seed, at) => (
        <Fragment key={seed.id}>{at === 0 ? null : ' · '}<PaperText text={seed.title} /></Fragment>
      ))}
    </FadeText>
  )
}

/**
 * A confirmed direction of project `projectId`: its name, which its … menu's Rename opens in place and
 * `onRename` saves, its seeds, and `trailing`, its controls.
 */
function ConfirmedRow({ projectId, intent, trailing, onRename }: {
  projectId: string
  intent: DiscoveryIntent
  trailing: ReactNode
  onRename: (label: string) => Promise<boolean>
}) {
  const m = useMessages()
  const names = useDrafts<string>(['direction', projectId, intent.id])
  return (
    <Item
      className="direction-row" lines={2} muted={!intent.enabled} data-project={projectId} data-direction={intent.id}
      title={(
        <>
          {intent.core ? <Tag>{m.settings.discovery.core}</Tag> : null}
          <InlineField
            label={m.settings.discovery.nameLabel} value={intent.label}
            keep={{ scope: ['direction', projectId, intent.id], target: RENAME }}
            normalize={(next) => next.trim()} validate={(next) => next !== ''} onSave={onRename}
            rest={<span>{intent.label}</span>} selectAll
          />
        </>
      )}
      meta={<DirectionSeeds seeds={intent.seeds} />}
      trailing={trailing}
      menu={<DotsMenu onRename={() => names.set(RENAME, intent.label)}>{null}</DotsMenu>}
    />
  )
}

/** The only editor of research directions; the gear on the Discovery page just opens these settings. */
export function DiscoverySettings() {
  const m = useMessages()
  const [profiles, setProfiles] = useState<DiscoveryProfile[] | null>(null)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const { error, load, report } = useScreenLoad()
  const notice = useNotice()
  const { revision, bump } = useVaultRevision()
  const write = useVaultWrite()
  const { requestedTarget } = useSettingsOpen()
  const section = useRef<HTMLElement>(null)

  useEffect(() => load('profiles', discovery.profiles(), setProfiles), [load, revision])
  useArrival(requestedTarget, profiles !== null, (target) => (
    [...section.current?.querySelectorAll<HTMLElement>('[data-direction]') ?? []].find((row) => (
      row.dataset['direction'] === target.id && (target.within === undefined || row.dataset['project'] === target.within)
    ))
  ))

  /** Writes `params`, offering, when `note` is given, the Undo that reopens the direction as a candidate. */
  const decide = (params: DiscoveryDirectionParams, note?: string) => write(discovery.direction(params), note === undefined ? {} : {
    note,
    action: () => ({
      label: m.common.undo,
      undoes: true,
      onAction: () => { void write(discovery.direction({ projectId: params.projectId, directionId: params.directionId, action: 'reopen' })) },
    }),
  })

  const update = (projectId: string, intentId: string, action: DiscoveryIntentAction) => {
    setBusy((held) => new Set([...held, intentId]))
    void discovery.setIntent(projectId, intentId, action).then(() => {
      load('profiles', discovery.profiles(), setProfiles)
    }).catch(report).finally(() => {
      setBusy((held) => {
        const next = new Set(held)
        next.delete(intentId)
        return next
      })
    })
  }

  const refresh = (projectId: string) => {
    setRefreshing(projectId)
    void discovery.fetch(projectId, true).then((result) => {
      if (result.failedIntents > 0) notice.refusal(m.settings.discovery.failed(result.failedIntents))
      bump()
    }).catch(report).finally(() => setRefreshing(null))
  }

  const enabled = (profiles ?? []).reduce((total, profile) => total + profile.intentCount, 0)
  return (
    <section className="delivery-directions" ref={section}>
      <SectionHeading count={enabled}>{m.settings.discovery.directionsHeading}</SectionHeading>
      <PageError error={error} variant="section" />
      {profiles === null && error === null ? <LoadingPlaceholder shape="rows" count={2} /> : null}
      {profiles?.length === 0 ? <EmptyState variant="section" /> : null}
      <GroupedList>
        {(profiles ?? []).map((profile) => (
          <Group
            key={profile.id} title={profile.name} meta={m.settings.discovery.seeds(profile.seedCount + profile.positiveCount)}
            actions={(
              <Button
                size="compact" variant="ghost" disabled={refreshing !== null || profile.intentCount === 0}
                busy={refreshing === profile.id} busyLabel={m.settings.discovery.refreshing}
                onClick={() => refresh(profile.id)}
              >{m.settings.discovery.refreshProject}</Button>
            )}
          >
            {profile.intents.length + profile.candidates.length === 0 ? (
              <EmptyState variant="section" />
            ) : (
              <List rows="all">
                {profile.candidates.map((candidate) => (
                  <Item
                    className="direction-row" key={candidate.id} lines={2} data-project={profile.id} data-direction={candidate.id}
                    title={<><Tag>{m.settings.discovery.candidate}</Tag><span>{candidate.label}</span></>}
                    meta={<DirectionSeeds seeds={candidate.seeds} />}
                    actions={(
                      <>
                        <AddAction
                          size="compact"
                          onClick={() => { void decide({ projectId: profile.id, directionId: candidate.id, action: 'add' }, m.settings.discovery.added) }}
                        >{m.settings.discovery.add}</AddAction>
                        <Button
                          size="compact" variant="ghost"
                          onClick={() => { void decide({ projectId: profile.id, directionId: candidate.id, action: 'decline' }, m.settings.discovery.declined) }}
                        >{m.settings.discovery.decline}</Button>
                      </>
                    )}
                  />
                ))}
                {profile.intents.map((intent) => (
                  <ConfirmedRow
                    key={intent.id} projectId={profile.id} intent={intent}
                    onRename={(label) => decide({ projectId: profile.id, directionId: intent.id, action: 'rename', label })}
                    trailing={(
                      <>
                        {!intent.core && intent.enabled ? (
                          <Button
                            size="compact" variant="ghost" disabled={busy.has(intent.id)}
                            onClick={() => update(profile.id, intent.id, 'set-core')}
                          >{m.settings.discovery.setCoreAction}</Button>
                        ) : null}
                        <Switch
                          label={intent.label} checked={intent.enabled} disabled={busy.has(intent.id)}
                          onChange={(on) => update(profile.id, intent.id, on ? 'enable' : 'disable')}
                        />
                      </>
                    )}
                  />
                ))}
              </List>
            )}
          </Group>
        ))}
      </GroupedList>
    </section>
  )
}
