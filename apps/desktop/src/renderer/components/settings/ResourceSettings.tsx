import { useState } from 'react'
import { editText, useDrafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { AddAction } from '../AddAction.js'
import { MenuItem } from '../ActionMenu.js'
import { Button } from '../Button.js'
import { DraftSlot, useDraftSlot } from '../DraftSlot.js'
import { DotsMenu } from '../FieldPickers.js'
import { Group, GroupedList } from '../GroupedList.js'
import { InlineDraftInput } from '../InlineDraftInput.js'
import { Item } from '../Item.js'
import { List } from '../List.js'
import { Markdown, MarkdownSection } from '../Markdown.js'
import { SectionHeading } from '../PageShell.js'
import { Tag } from '../Tag.js'
import {
  DEMO_GROUPS, DEMO_HABIT_CANDIDATES, DEMO_HABITS, DEMO_RESOURCES, type DemoGroup, type DemoResource,
} from '../resource-pool/demo-pool.js'

/**
 * Settings › Resources on the demo's stub pool: each group of resources with its members and the
 * rules only the user writes, then the usage habits record and the habits agents offered for it.
 */
export function ResourceSettings() {
  const m = useMessages()
  const [groups, setGroups] = useState<DemoGroup[]>(DEMO_GROUPS)
  const [resources, setResources] = useState<DemoResource[]>(DEMO_RESOURCES)
  const [habits, setHabits] = useState(DEMO_HABITS)
  const [candidates, setCandidates] = useState(DEMO_HABIT_CANDIDATES)
  const [drafting, setDrafting] = useState(false)
  const [name, setName] = useState('')
  const edits = useDrafts<EditDraft>(['pool'])
  const { slot, start } = useDraftSlot<HTMLDivElement>(drafting, () => setDrafting(true))
  const amount = (resource: DemoResource) => (resource.units === undefined
    ? m.pool.amount(resource.capacity, resource.kind)
    : `${resource.units[0]}–${resource.units.at(-1)!.replace(/\D+/, '')}`)
  return (
    <section className="resource-settings">
      <SectionHeading
        count={resources.length}
        actions={<AddAction size="compact" label={m.pool.addResourceLabel} onClick={start}>{m.pool.addResource}</AddAction>}
      >{m.pool.registered}
      </SectionHeading>
      <GroupedList>
        {groups.map((group) => {
          const members = resources.filter((resource) => resource.group === group.id)
          return (
            <Group
              key={group.id} title={group.name} data-pool-group={group.id}
              meta={members.length === 1 ? undefined : m.pool.members(members.length)}
              actions={(
                <DotsMenu label={group.name}>
                  <MenuItem>{m.pool.rename}</MenuItem>
                  <MenuItem className="mi danger">{m.pool.retire}</MenuItem>
                </DotsMenu>
              )}
            >
              <List rows="all" variant="embedded">
                {members.map((resource) => (
                  <Item
                    key={resource.id} data-pool-resource={resource.id}
                    title={resource.name} tags={<Tag>{m.pool.kinds[resource.kind]}</Tag>} trailing={amount(resource)}
                    menu={(
                      <DotsMenu label={resource.name}>
                        <MenuItem>{m.pool.rename}</MenuItem>
                        <MenuItem className="mi danger">{m.pool.retire}</MenuItem>
                      </DotsMenu>
                    )}
                  />
                ))}
              </List>
              <MarkdownSection
                level="group" title={m.pool.rules} edit={editText(edits, `rules:${group.id}`, group.rules)}
                onSave={(rules) => {
                  edits.drop(`rules:${group.id}`)
                  setGroups((held) => held.map((item) => (item.id === group.id ? { ...item, rules } : item)))
                }}
              />
            </Group>
          )
        })}
      </GroupedList>
      {drafting ? (
        <List rows="all">
          <DraftSlot slot={slot}>
            <InlineDraftInput
              autoFocus placeholder={m.pool.namePlaceholder} value={name} onChange={(event) => setName(event.target.value)}
              onCancel={() => { setDrafting(false); setName('') }}
              onSubmit={(next) => {
                setGroups((held) => [...held, { id: next, name: next, rules: '' }])
                setResources((held) => [...held, { id: next, group: next, name: next, kind: 'machine', capacity: 1 }])
                setDrafting(false)
                setName('')
                return true
              }}
            />
          </DraftSlot>
        </List>
      ) : null}

      <MarkdownSection
        title={m.pool.habits} edit={editText(edits, 'habits', habits)}
        onSave={(next) => { edits.drop('habits'); setHabits(next) }}
      />
      {candidates.length === 0 ? null : (
        <List rows="all">
          {candidates.map((candidate) => (
            <Item
              key={candidate.id} data-pool-candidate={candidate.id} lines={2}
              title={<><Tag>{m.pool.candidate}</Tag><span>{candidate.resource}</span></>}
              meta={`${candidate.agent} · ${candidate.project}`}
              actions={(
                <>
                  <AddAction
                    size="compact"
                    onClick={() => {
                      setHabits((held) => `${held.trimEnd()}\n\n## ${candidate.resource}\n\n${candidate.text}\n`)
                      setCandidates((held) => held.filter((item) => item.id !== candidate.id))
                    }}
                  >{m.pool.add}</AddAction>
                  <Button
                    size="compact" variant="ghost"
                    onClick={() => setCandidates((held) => held.filter((item) => item.id !== candidate.id))}
                  >{m.pool.dismiss}</Button>
                </>
              )}
            ><Markdown src={candidate.text} /></Item>
          ))}
        </List>
      )}
    </section>
  )
}
