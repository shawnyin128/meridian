import { createHash } from 'node:crypto'
import type { ChatDesignPreview, ExperimentDesign, ResearchIdea } from '../../shared/contract.js'
import { attachmentSizeText } from '../../shared/attachment-size.js'
import { DESIGN_FILE_TEXT, type DesignFileLanguage } from '../../shared/design-file.js'
import { CallError } from '../call-error.js'
import type { VaultStore } from '../vault.js'

type Outcome = ExperimentDesign['decisions'][number]['outcome']

/** The Lab node state each decision outcome sets, as the Lab skill's decision table maps them. */
export const OUTCOME_STATE: Record<Outcome, 'repairable' | 'supported' | 'dead' | 'unresolved'> = {
  invalid: 'repairable', alternative: 'repairable', expand: 'supported', 'below-gate': 'supported', kill: 'dead', inconclusive: 'unresolved',
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

/**
 * The design's own sections in Markdown, from the explanations to the evidence ledger, in
 * `language`, as a chat's history and its idea file hold them. Node states stay the Lab's own words.
 */
export function designSections(design: ExperimentDesign, language: DesignFileLanguage): string {
  const t = DESIGN_FILE_TEXT[language]
  const chosen = chosenPrediction(design)
  const unknown = (value: string | null) => value ?? t.unknown
  return [
    `## ${t.sections.explanations}`, '',
    `- M1: ${line(design.explanations.m1)}`,
    `- M2: ${line(design.explanations.m2)}`,
    `- M0: ${line(design.explanations.m0)}`, '',
    `## ${t.sections.predictions}`, '',
    table([t.columns.regime, 'M1', 'M2', 'M0', t.columns.metric, t.columns.chosen], design.predictions.map((prediction) => [
      prediction.regime, unknown(prediction.m1), unknown(prediction.m2), unknown(prediction.m0), prediction.metric,
      prediction.chosen ? t.chosen : '',
    ])), '',
    `## ${t.sections.experiment}`, '',
    `- ${t.experiment.substrate}: ${t.substrate[design.experiment.substrate]}`,
    `- ${t.experiment.intervention}: ${line(chosen.regime)}`,
    `- ${t.experiment.metric}: ${line(chosen.metric)}`,
    `- ${t.experiment.keeps}: ${line(design.experiment.keeps)}`,
    `- ${t.experiment.untested}: ${line(design.experiment.untested)}`, '',
    `## ${t.sections.decisions}`, '',
    table([t.columns.pattern, t.columns.interpretation, t.columns.next, t.columns.state], design.decisions.map((decision) => [
      decision.pattern, decision.interpretation, decision.next, OUTCOME_STATE[decision.outcome],
    ])), '',
    `## ${t.sections.ledger}`, '',
    table([t.columns.statement, t.columns.status, t.columns.anchor], design.ledger.map((entry) => [
      entry.statement, t.ledgerStatus[entry.status], anchorText(entry.anchor),
    ])),
  ].join('\n')
}

/** The one `record_history` line, in `language`, that declares the design's decision table on `date`. */
export function decisionHistoryLine(design: ExperimentDesign, date: string, language: DesignFileLanguage): string {
  const rows = design.decisions.map((decision) => `${line(decision.pattern)} → ${OUTCOME_STATE[decision.outcome]}`)
  return DESIGN_FILE_TEXT[language].history(date, rows)
}

type Placement = ChatDesignPreview['idea']['project']
type Under = ChatDesignPreview['nodes']['hypothesis']['under']

/**
 * The whole design as its idea's file, in `language`: a frontmatter a coding agent's Lab skill reads
 * (the design's type and claim status, the hypothesis node's title and its parent project and node,
 * absent for a root, the experiment node's title and its history line, each value a JSON string),
 * then the claim, every section, and the two Lab nodes said in words.
 */
export function designMarkdown(
  design: ExperimentDesign, project: Placement, under: Under, history: string, language: DesignFileLanguage,
): string {
  const t = DESIGN_FILE_TEXT[language]
  const regime = chosenPrediction(design).regime
  const parent = project === null ? t.root : under === null ? t.projectRoot(line(project.name)) : t.under(line(project.name), line(under.label))
  return [
    '---', 'type: experiment-design', `claim_status: ${design.claim.status}`,
    `hypothesis_node: ${JSON.stringify(design.claim.text)}`,
    ...(project === null ? [] : [`parent_project: ${JSON.stringify(project.id)}`]),
    ...(under === null ? [] : [`parent_node: ${JSON.stringify(under.id)}`]),
    `experiment_node: ${JSON.stringify(regime)}`,
    `decision_table_history: ${JSON.stringify(history)}`,
    '---', '',
    `# ${line(design.claim.text)}`, '',
    designSections(design, language), '',
    `## ${t.sections.nodes}`, '',
    t.hypothesisNode(line(design.claim.text), parent),
    t.experimentNode(line(regime)),
    `   ${history}`,
    '',
    t.noAlternatives,
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
 * What saving design answer `messageId` of chat `chatId` as an idea writes, its file in `language`, with its fingerprint and
 * the idea that already holds it, if any. Throws `not-found` when the answer carries no design.
 */
export function designPreview(store: VaultStore, chatId: string, messageId: string, language: DesignFileLanguage): ChatDesignPreview {
  const design = designOf(store, chatId, messageId)
  const projectId = mentionedProject(store, chatId)
  const held = projectId === null ? null : store.heldProject(projectId)
  const graph = held === null ? null : held.workspace?.graph ?? held.graph
  const active = graph?.activeNodes?.map((id) => graph.nodes.find((node) => node.id === id)).find((node) => node !== undefined)
  const project = held === null ? null : { id: held.id, name: held.name }
  const under = active === undefined ? null : { id: active.id, label: active.label }
  const history = decisionHistoryLine(design, store.today(), language)
  const { explanations } = design
  const shown = {
    idea: { title: design.claim.text, body: `M1：${explanations.m1}\nM2：${explanations.m2}\nM0：${explanations.m0}`, project },
    file: { name: DESIGN_FILE_TEXT[language].fileName(messageId), markdown: designMarkdown(design, project, under, history, language) },
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
 * Saves design answer `messageId` of chat `chatId` as an idea from that chat, its file in `language`, titled by its claim and
 * related to the project the preview names, with the design's Markdown as its file, as one write.
 * Rejects with `refused` when `fingerprint` is not that of the preview as it stands, or an idea
 * already holds this design, and with `not-found` when the answer carries no design.
 */
export function saveDesignAsIdea(
  store: VaultStore, chatId: string, messageId: string, fingerprint: string, language: DesignFileLanguage,
): ResearchIdea {
  const preview = designPreview(store, chatId, messageId, language)
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
