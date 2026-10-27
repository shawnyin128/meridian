import { useEffect, useId, useState } from 'react'
import type { ChatDesignPreview, ExperimentDesign, WikiAggregationCard } from '../../../shared/contract.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { chat as chatApi, wiki } from '../../ipc.js'
import { useLocale, useMessages } from '../../messages/useMessages.js'
import { useJump, useVaultRevision } from '../../shell/AppShell.js'
import { Card } from '../Card.js'
import { CommitActions } from '../CommitActions.js'
import { EntityLink, NODE_MODE_LOOK } from '../EntityLink.js'
import { Markdown } from '../Markdown.js'
import { SectionHeading } from '../PageShell.js'
import { Property, PropertyList } from '../PropertyList.js'
import { SourceAnchor } from '../SourceAnchor.js'
import { StatusDot } from '../StatusDot.js'
import { Table, TableCell, TableRow } from '../Table.js'
import { Tag } from '../Tag.js'
import './DesignCard.css'

type Outcome = ExperimentDesign['decisions'][number]['outcome']
type Anchor = ExperimentDesign['ledger'][number]['anchor']

/** The Lab node state each decision outcome sets, as Core writes it into the idea's file. */
const OUTCOME_MODE: Record<Outcome, keyof typeof NODE_MODE_LOOK> = {
  invalid: 'repairable', alternative: 'repairable', expand: 'supported', 'below-gate': 'supported', kill: 'dead', inconclusive: 'unresolved',
}
/** The body of the file `markdown`, without the frontmatter its Lab skill reads. */
const fileBody = (markdown: string) => markdown.replace(/^---\n[\s\S]*?\n---\n/, '')

/** The most rows a design's tables show before they scroll. */
const DESIGN_ROWS = 8

/** A prediction, or the unknown tag for one no explanation can say. */
function Prediction({ value }: { value: string | null }) {
  const m = useMessages()
  return value === null ? <Tag>{m.chat.design.unknown}</Tag> : <>{value}</>
}

/** The anchor of a ledger statement: its Wiki page or claim, by the page's title, or the page of the chat's paper. */
function LedgerAnchor({ anchor, titles }: { anchor: Anchor; titles: ReadonlyMap<string, string> }) {
  const m = useMessages()
  const { open } = useJump()
  if (anchor === null) return null
  if (anchor.kind === 'source') return <SourceAnchor page={anchor.page} onOpen={() => open('reader', anchor.paper, { page: anchor.page })} />
  const [page, claim] = anchor.ref.split('#') as [string, string | undefined]
  const title = titles.get(page) ?? page
  return (
    <EntityLink
      kind="page" label={claim === undefined ? title : m.chat.design.claimAnchor(title)}
      href={`#wiki:${page}`} onOpen={() => open('wiki', page)}
    />
  )
}

/**
 * The experiment design answer `messageId` of chat `chat` carries, under the answer's text: the
 * claim, the explanations, the predictions, the smallest experiment, the decision table and the
 * evidence ledger, then the section of what saving the design as an idea writes, folded until
 * opened, which shows all of it and confirms it with the fingerprint of what it shows.
 */
export function DesignCard({ chat, messageId, design }: { chat: string; messageId: string; design: ExperimentDesign }) {
  const m = useMessages()
  const locale = useLocale()
  const d = m.chat.design
  const { open } = useJump()
  const { revision } = useVaultRevision()
  const write = useVaultWrite()
  const writesId = useId()
  const [unfolded, setUnfolded] = useState(false)
  const [preview, setPreview] = useState<ChatDesignPreview | null>(null)
  const [saving, setSaving] = useState(false)
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map())
  const chosen = design.predictions.find((prediction) => prediction.chosen)!
  const anchorsWiki = design.ledger.some((entry) => entry.anchor?.kind === 'wiki')

  useEffect(() => {
    let live = true
    void chatApi.designPreview(chat, messageId, locale).then((next) => { if (live) setPreview(next) })
    return () => { live = false }
  }, [chat, messageId, locale, revision])
  useEffect(() => {
    if (!anchorsWiki) return undefined
    let live = true
    void wiki.cards().then((cards: WikiAggregationCard[]) => {
      if (live) setTitles(new Map(cards.map((card) => [card.id, card.title])))
    })
    return () => { live = false }
  }, [anchorsWiki, revision])

  const confirm = () => {
    if (preview === null) return
    setSaving(true)
    void write(chatApi.saveDesign(chat, messageId, preview.fingerprint, locale), {
      note: m.chat.ideaSavedNote,
      action: (idea) => ({ label: m.common.open, onAction: () => open('ideas', idea.id) }),
    }).finally(() => setSaving(false))
  }
  const placement = (shown: ChatDesignPreview) => {
    const { project } = shown.idea
    const { under } = shown.nodes.hypothesis
    if (project === null) return d.rootAlone
    return under === null ? d.root(project.name) : d.under(project.name, under.label)
  }

  return (
    <div className="design-card">
      <SectionHeading level="group">{d.claim}</SectionHeading>
      <div className="design-claim">
        <Tag>{d.claimStatus[design.claim.status]}</Tag>
        <span>{design.claim.text}</span>
      </div>

      <SectionHeading level="group">{d.explanations}</SectionHeading>
      <PropertyList>
        <Property label="M1">{design.explanations.m1}</Property>
        <Property label="M2">{design.explanations.m2}</Property>
        <Property label="M0">{design.explanations.m0}</Property>
      </PropertyList>

      <SectionHeading level="group">{d.predictions}</SectionHeading>
      <Table
        wrap rows="capped" limit={DESIGN_ROWS}
        columns={[
          { key: 'regime', label: d.columns.regime, width: 220 },
          { key: 'm1', label: 'M1', width: 120 },
          { key: 'm2', label: 'M2', width: 120 },
          { key: 'm0', label: 'M0', width: 120 },
          { key: 'metric', label: d.columns.metric, width: 100 },
        ]}
      >
        {design.predictions.map((prediction) => (
          <TableRow key={prediction.regime}>
            <TableCell kind="title">{prediction.regime}</TableCell>
            <TableCell><Prediction value={prediction.m1} /></TableCell>
            <TableCell><Prediction value={prediction.m2} /></TableCell>
            <TableCell><Prediction value={prediction.m0} /></TableCell>
            <TableCell kind="meta">{prediction.metric}</TableCell>
          </TableRow>
        ))}
      </Table>

      <SectionHeading level="group">{d.experiment}</SectionHeading>
      <PropertyList>
        <Property label={d.substrateLabel}><Tag>{d.substrate[design.experiment.substrate]}</Tag></Property>
        <Property label={d.intervention}>{chosen.regime}</Property>
        <Property label={d.keeps}>{design.experiment.keeps}</Property>
        <Property label={d.untested}>{design.experiment.untested}</Property>
      </PropertyList>

      <SectionHeading level="group">{d.decisions}</SectionHeading>
      <Table
        wrap rows="capped" limit={DESIGN_ROWS}
        columns={[
          { key: 'pattern', label: d.columns.pattern, width: 260 },
          { key: 'interpretation', label: d.columns.interpretation, width: 150 },
          { key: 'next', label: d.columns.next, width: 150 },
          { key: 'state', label: d.columns.state, width: 100 },
        ]}
      >
        {design.decisions.map((decision) => {
          const look = NODE_MODE_LOOK[OUTCOME_MODE[decision.outcome]]
          return (
            <TableRow key={decision.outcome}>
              <TableCell kind="title">{decision.pattern}</TableCell>
              <TableCell>{decision.interpretation}</TableCell>
              <TableCell>{decision.next}</TableCell>
              <TableCell content="controls">
                <StatusDot tone={look.tone} fill={look.fill} label={m.project.graph.legend[look.legend]} />
              </TableCell>
            </TableRow>
          )
        })}
      </Table>

      <SectionHeading level="group">{d.ledger}</SectionHeading>
      <Table
        wrap rows="capped" limit={DESIGN_ROWS}
        columns={[
          { key: 'statement', label: d.columns.statement, width: 360 },
          { key: 'status', label: d.columns.status, width: 100 },
          { key: 'anchor', label: d.columns.anchor, width: 200 },
        ]}
      >
        {design.ledger.map((entry) => (
          <TableRow key={entry.statement}>
            <TableCell kind="title">{entry.statement}</TableCell>
            <TableCell content="chips"><Tag>{d.ledgerStatus[entry.status]}</Tag></TableCell>
            <TableCell content="controls"><LedgerAnchor anchor={entry.anchor} titles={titles} /></TableCell>
          </TableRow>
        ))}
      </Table>

      <SectionHeading
        level="group" meta={preview?.saved == null ? undefined : d.savedAs}
        fold={{ open: unfolded, onToggle: () => setUnfolded((held) => !held), controls: writesId }}
      >{d.writes}</SectionHeading>
      {!unfolded || preview === null ? null : (
        <Card id={writesId}>
          <div className="design-writes">
            <PropertyList>
              <Property label={d.idea}>
                <span className="design-claim">
                  <Tag>{d.claimStatus[design.claim.status]}</Tag>
                  {preview.saved === null ? preview.idea.title : (
                    <EntityLink kind="idea" label={preview.idea.title} href={`#ideas:${preview.saved}`} onOpen={() => open('ideas', preview.saved!)} />
                  )}
                </span>
              </Property>
              <Property label={d.body}>{preview.idea.body.split('\n').map((line) => <div key={line}>{line}</div>)}</Property>
              {preview.idea.project === null ? null : <Property label={d.project}>{preview.idea.project.name}</Property>}
              <Property label={d.file}>{preview.file.name}</Property>
            </PropertyList>
            <div className="md"><Markdown src={fileBody(preview.file.markdown)} /></div>
            <PropertyList>
              <Property label={d.hypothesisNode}>
                <EntityLink kind="node" mode="unresolved" fill label={preview.nodes.hypothesis.title} />
                <div>{placement(preview)}</div>
              </Property>
              <Property label={d.experimentNode}>
                <EntityLink kind="node" mode="unresolved" fill label={preview.nodes.experiment.title} />
              </Property>
              <Property label={d.history}>{preview.nodes.experiment.history}</Property>
            </PropertyList>
            {preview.saved !== null ? null : (
              <div className="design-commit">
                <CommitActions place="item" onCancel={() => setUnfolded(false)} onSave={confirm} saving={saving} saveLabel={d.confirm} />
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
