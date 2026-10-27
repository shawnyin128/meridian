import { createHash } from 'node:crypto'
import type { ChatDesignPreview, ExperimentDesign, ResearchIdea } from '../../shared/contract.js'
import { attachmentSizeText } from '../../shared/attachment-size.js'
import { CallError } from '../call-error.js'
import type { VaultStore } from '../vault.js'

type Outcome = ExperimentDesign['decisions'][number]['outcome']

/** The Lab node state each decision outcome sets, as the Lab skill's decision table maps them. */
export const OUTCOME_STATE: Record<Outcome, 'repairable' | 'supported' | 'dead' | 'unresolved'> = {
  invalid: 'repairable', alternative: 'repairable', expand: 'supported', 'below-gate': 'supported', kill: 'dead', inconclusive: 'unresolved',
}
const LEDGER_STATUS: Record<ExperimentDesign['ledger'][number]['status'], string> = {
  source: 'Source-supported', inference: 'Inference', 'new-hypothesis': 'New hypothesis',
}

/** `text` as one Markdown table cell: a pipe or backslash cannot end the cell, and no line break survives. */
const cell = (text: string) => text.replace(/[\\|]/g, (mark) => `\\${mark}`).replace(/\s*\n\s*/g, ' ')
const row = (cells: readonly string[]) => `| ${cells.map(cell).join(' | ')} |`
const table = (head: readonly string[], rows: readonly (readonly string[])[]) =>
  [row(head), `|${head.map(() => ' --- |').join('')}`, ...rows.map(row)].join('\n')
/** `text` on one line that no Markdown reader takes for a heading or a list field. */
const line = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/^([#>-])/, '\\$1')

const anchorText = (anchor: ExperimentDesign['ledger'][number]['anchor']) =>
  anchor === null ? '' : anchor.kind === 'wiki' ? anchor.ref : `${anchor.paper} p.${anchor.page}`

/** The prediction row the experiment runs. */
export const chosenPrediction = (design: ExperimentDesign) => design.predictions.find((prediction) => prediction.chosen)!

/** The design's own sections in Markdown, from the explanations to the evidence ledger, as a chat's history and its idea file hold them. */
export function designSections(design: ExperimentDesign): string {
  const chosen = chosenPrediction(design)
  const unknown = (value: string | null) => value ?? '?'
  return [
    '## Explanations', '',
    `- M1: ${line(design.explanations.m1)}`,
    `- M2: ${line(design.explanations.m2)}`,
    `- M0: ${line(design.explanations.m0)}`, '',
    '## Predictions', '',
    table(['Intervention', 'M1', 'M2', 'M0', 'Metric', 'Chosen'], design.predictions.map((prediction) => [
      prediction.regime, unknown(prediction.m1), unknown(prediction.m2), unknown(prediction.m0), prediction.metric,
      prediction.chosen ? 'yes' : '',
    ])), '',
    '## Smallest experiment', '',
    `- substrate: ${design.experiment.substrate}`,
    `- intervention: ${line(chosen.regime)}`,
    `- metric: ${line(chosen.metric)}`,
    `- keeps: ${line(design.experiment.keeps)}`,
    `- untested: ${line(design.experiment.untested)}`, '',
    '## Decision table', '',
    table(['Result pattern', 'Interpretation', 'Next action', 'Node state'], design.decisions.map((decision) => [
      decision.pattern, decision.interpretation, decision.next, OUTCOME_STATE[decision.outcome],
    ])), '',
    '## Evidence ledger', '',
    table(['Statement', 'Status', 'Anchor'], design.ledger.map((entry) => [
      entry.statement, LEDGER_STATUS[entry.status], anchorText(entry.anchor),
    ])),
  ].join('\n')
}

/** The one `record_history` line that declares the design's decision table on `date`. */
export function decisionHistoryLine(design: ExperimentDesign, date: string): string {
  const rows = design.decisions.map((decision) => `${line(decision.pattern)} → ${OUTCOME_STATE[decision.outcome]}`)
  return `${date}: declared decision table: ${rows.join('; ')}`
}

type Placement = ChatDesignPreview['idea']['project']
type Under = ChatDesignPreview['nodes']['hypothesis']['under']

/**
 * The whole design as its idea's file: a frontmatter naming it an experiment design, the claim, every
 * section, and the two Lab nodes a coding agent builds from it when the idea is started.
 */
export function designMarkdown(design: ExperimentDesign, project: Placement, under: Under, history: string): string {
  const parent = project === null ? 'a root node'
    : under === null ? `a root node of project ${line(project.name)}` : `under node ${line(under.label)} of project ${line(project.name)}`
  return [
    '---', 'type: experiment-design', `claim_status: ${design.claim.status}`, '---', '',
    `# ${line(design.claim.text)}`, '',
    designSections(design), '',
    '## Lab nodes', '',
    `1. Hypothesis node "${line(design.claim.text)}", ${parent}.`,
    `2. Experiment node "${line(chosenPrediction(design).regime)}", a child of the hypothesis node, with this history line:`,
    `   ${history}`,
    '',
    'No node for M2 or M0. An alternative sibling node for M2 is proposed only when the alternative row of the decision table matches.',
    '',
  ].join('\n')
}

/** The file name a design answer's idea file is stored under. */
const fileName = (chatId: string, messageId: string) => `${chatId}-${messageId}.md`

/** The design answer `messageId` of chat `chatId`; throws `not-found` when it holds no design. */
function designOf(store: VaultStore, chatId: string, messageId: string): ExperimentDesign {
  const message = store.chatMessages(chatId).find((held) => held.id === messageId)
  if (message?.design === undefined) throw new CallError('not-found', `这条回答没有实验设计：${messageId}`)
  return message.design
}

/** The project chat `chatId` mentioned last that the vault still holds, or null. */
function mentionedProject(store: VaultStore, chatId: string): string | null {
  const mentions = store.chatMessages(chatId).flatMap((message) => message.runs)
    .flatMap((run) => (run.target?.kind === 'project' && store.hasProject(run.target.id) ? [run.target.id] : []))
  return mentions.at(-1) ?? null
}

/**
 * What saving design answer `messageId` of chat `chatId` as an idea writes, with its fingerprint and
 * the idea that already holds it, if any. Throws `not-found` when the answer carries no design.
 */
export function designPreview(store: VaultStore, chatId: string, messageId: string): ChatDesignPreview {
  const design = designOf(store, chatId, messageId)
  const projectId = mentionedProject(store, chatId)
  const held = projectId === null ? null : store.heldProject(projectId)
  const graph = held === null ? null : held.workspace?.graph ?? held.graph
  const active = graph?.activeNodes?.map((id) => graph.nodes.find((node) => node.id === id)).find((node) => node !== undefined)
  const project = held === null ? null : { id: held.id, name: held.name }
  const under = active === undefined ? null : { id: active.id, label: active.label }
  const history = decisionHistoryLine(design, store.today())
  const { explanations } = design
  const shown = {
    idea: { title: design.claim.text, body: `M1：${explanations.m1}\nM2：${explanations.m2}\nM0：${explanations.m0}`, project },
    file: { name: `实验设计-${messageId}.md`, markdown: designMarkdown(design, project, under, history) },
    nodes: {
      hypothesis: { title: design.claim.text, under },
      experiment: { title: chosenPrediction(design).regime, history },
    },
  }
  const path = store.designFilePath(fileName(chatId, messageId))
  return {
    ...shown,
    fingerprint: createHash('sha256').update(JSON.stringify(shown)).digest('hex').slice(0, 16),
    saved: store.listIdeaFiles().find((file) => file.attachment.path === path)?.idea ?? null,
  }
}

/**
 * Saves design answer `messageId` of chat `chatId` as an idea from that chat, titled by its claim and
 * related to the project the preview names, with the design's Markdown as its file, as one write.
 * Rejects with `refused` when `fingerprint` is not that of the preview as it stands, or an idea
 * already holds this design, and with `not-found` when the answer carries no design.
 */
export function saveDesignAsIdea(store: VaultStore, chatId: string, messageId: string, fingerprint: string): ResearchIdea {
  const preview = designPreview(store, chatId, messageId)
  if (preview.fingerprint !== fingerprint) throw new CallError('refused', '实验设计在确认之后变了，请重新查看')
  if (preview.saved !== null) throw new CallError('refused', '这份实验设计已经存为想法')
  return store.atomically(() => {
    const created = store.createIdea(chatId, preview.idea.title, preview.idea.body)
    const idea = preview.idea.project === null ? created
      : store.updateIdea(created.id, { relations: { projects: [preview.idea.project.id], pages: [] } })
    const path = store.writeDesignFile(fileName(chatId, messageId), preview.file.markdown)
    store.addIdeaFile(idea.id, {
      name: preview.file.name, size: attachmentSizeText(Buffer.byteLength(preview.file.markdown)), path,
    })
    return idea
  })
}
