import { z } from 'zod'
import { projectAreas, sortRecordsNewestFirst } from '../../../shared/project-signals.js'
import { PAPER_PAGE } from '../../../shared/vocabulary.js'
import { callFailure } from '../../call-error.js'
import { extractPdfPages } from '../../paper-library/index.js'
import type { VaultStore } from '../../vault.js'

/** What one run may look up beside the vault's titles, Wiki pages and projects: the paper it is about, if any. */
export type VaultToolScope = { paperId?: string }

export type VaultToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: Record<string, unknown>
}

/** A tool's answer: JSON text, or a plain message when `isError`. */
export type VaultToolResult = { text: string; isError: boolean }

type Tool = { definition: VaultToolDefinition; call: (args: unknown) => Promise<VaultToolResult> }
type Pages = Array<{ number: number; text: string }>

const PASSAGE_WORDS = 120
const PASSAGE_STRIDE = 80
const PASSAGE_CHARS = 900
const PAGE_CHARS = 20_000
const BODY_CHARS = 20_000
const ITEM_CHARS = 1_000
const TITLE_HITS = 8
const PAPER_LIST_SIZE = 200
const STOPWORDS = new Set(('a an and are as at be by for from has have in is it its of on or that the this to was were '
  + 'we with which our can not but than then they their these those also into such').split(' '))
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

const PaperSearchArgs = z.object({
  query: z.string().trim().min(1).max(300).describe('Keywords to look for.'),
  k: z.number().int().min(1).max(10).optional().describe('How many passages to return, 5 when absent.'),
}).strict()
const PaperPageArgs = z.object({
  page: z.number().int().min(1).max(10_000).describe('One-based page number.'),
}).strict()
const TitleSearchArgs = z.object({
  query: z.string().trim().min(1).max(200).describe('Words the title holds, compared without case.'),
}).strict()
const WikiPageArgs = z.object({
  id: z.string().min(1).max(300).describe('A Wiki page id as title_search returns it, such as methods/rotation or papers/<id>.'),
}).strict()
const ProjectSummaryArgs = z.object({
  id: z.string().min(1).max(200).describe('A project id as title_search returns it.'),
}).strict()

const clip = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, limit - 1)}…`)
const answer = (value: unknown): VaultToolResult => ({ text: JSON.stringify(value), isError: false })
const refuse = (message: string): VaultToolResult => ({ text: message, isError: true })

const words = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+(?:\.\p{N}+)?/gu) ?? [])
  .filter((word) => !STOPWORDS.has(word) && (word.length > 1 || /\p{N}/u.test(word)))

/** A BM25 search over overlapping word windows of `pages`, each passage keeping the page it came from. */
function passageSearch(pages: Pages) {
  const passages = pages.flatMap((page) => {
    const all = page.text.split(/\s+/).filter((word) => word !== '')
    const texts: string[] = []
    for (let start = 0; start <= Math.max(all.length - PASSAGE_WORDS, 0); start += PASSAGE_STRIDE) {
      texts.push(all.slice(start, start + PASSAGE_WORDS).join(' '))
    }
    return texts.filter((text) => text !== '').map((text) => {
      const counts = new Map<string, number>()
      for (const word of words(text)) counts.set(word, (counts.get(word) ?? 0) + 1)
      return { page: page.number, text, counts, length: [...counts.values()].reduce((sum, n) => sum + n, 0) }
    })
  })
  const averageLength = passages.reduce((sum, passage) => sum + passage.length, 0) / Math.max(passages.length, 1)
  const frequency = new Map<string, number>()
  for (const passage of passages) for (const word of passage.counts.keys()) frequency.set(word, (frequency.get(word) ?? 0) + 1)
  const idf = (word: string) => {
    const n = frequency.get(word) ?? 0
    return Math.log(1 + (passages.length - n + 0.5) / (n + 0.5))
  }
  return (query: string, k: number) => {
    const terms = words(query)
    return passages.map((passage) => ({
      passage,
      score: terms.reduce((score, term) => {
        const tf = passage.counts.get(term) ?? 0
        return tf === 0 ? score : score + idf(term) * tf * 2.5 / (tf + 1.5 * (0.25 + 0.75 * passage.length / averageLength))
      }, 0),
    })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, k)
      .map(({ passage }) => ({ page: passage.page, text: clip(passage.text, PASSAGE_CHARS) }))
  }
}

/** A tool named `name` whose arguments must pass the closed schema `args` before `run` sees them. */
function tool<S extends z.ZodType>(
  name: string, title: string, description: string, args: S,
  run: (parsed: z.infer<S>) => VaultToolResult | Promise<VaultToolResult>,
): Tool {
  const inputSchema: Record<string, unknown> = z.toJSONSchema(args)
  delete inputSchema['$schema']
  return {
    definition: { name, description, inputSchema, annotations: { title, ...READ_ONLY } },
    call: async (raw) => {
      const parsed = args.safeParse(raw ?? {})
      return parsed.success ? run(parsed.data) : refuse(`Invalid arguments for ${name}: ${z.prettifyError(parsed.error)}`)
    },
  }
}

/** The search and page tools over the source text of paper `paperId`, extracted once on first use. */
function paperTools(store: VaultStore, paperId: string): Tool[] {
  let pages: Promise<Pages> | undefined
  let search: ReturnType<typeof passageSearch> | undefined
  const withPages = async (use: (read: Pages) => VaultToolResult) => {
    let read: Pages
    try {
      read = await (pages ??= Promise.resolve().then(() => extractPdfPages(store.paperSource(paperId))))
    } catch (cause) {
      if (callFailure(cause) === 'not-found') return refuse('The vault holds no source PDF for this paper.')
      throw cause
    }
    return use(read)
  }
  return [
    tool('paper_search', 'Search the paper', 'Search the full text of the paper this conversation is about. Returns the '
      + 'best matching passages with their one-based page numbers.', PaperSearchArgs,
    ({ query, k }) => withPages((read) => answer({ passages: (search ??= passageSearch(read))(query, k ?? 5) }))),
    tool('paper_page', 'Read a paper page', 'Return the extracted text of one page of the paper this conversation is '
      + 'about.', PaperPageArgs,
    ({ page }) => withPages((read) => {
      const found = read.find((item) => item.number === page)
      return found === undefined
        ? refuse(`Page ${page} does not exist; the paper has pages 1-${read.length}.`)
        : answer({ page, pages: read.length, text: clip(found.text, PAGE_CHARS) })
    })),
  ]
}

/**
 * The read-only tools the internal MCP server offers one run, answered from `store`: when `scope`
 * names a paper, a search and a page read of that paper's source text; then a title search over the
 * vault's Wiki pages, papers and projects, a Wiki page read and a project summary. Every list and
 * text in an answer is bounded. `call` returns null for a tool not offered; arguments its closed
 * schema refuses, and an id or page the vault does not hold, answer as errors; a store that fails to
 * read rejects the call.
 */
export function vaultTools(store: VaultStore, scope: VaultToolScope) {
  const allPapers = () => {
    const rows = []
    for (let page = 1; ; page += 1) {
      const listed = store.listPapers({ page, size: PAPER_LIST_SIZE })
      rows.push(...listed.rows)
      if (rows.length >= listed.total || listed.rows.length === 0) return rows
    }
  }
  const tools: Tool[] = [
    ...(scope.paperId === undefined ? [] : paperTools(store, scope.paperId)),
    tool('title_search', 'Search titles', 'Find Wiki pages, papers and projects in the vault whose title holds every '
      + 'word of the query. Returns their ids for wiki_page and project_summary.', TitleSearchArgs,
    ({ query }) => {
      const terms = query.toLowerCase().split(/\s+/)
      const holds = (title: string | undefined) => title !== undefined
        && terms.every((term) => title.toLowerCase().includes(term))
      return answer({
        wiki: store.wikiCards().filter((card) => holds(card.title)).slice(0, TITLE_HITS)
          .map((card) => ({ id: card.id, kind: card.kindLabel, title: card.title })),
        papers: allPapers().filter((paper) => holds(paper.title) || holds(paper.shortTitle)).slice(0, TITLE_HITS)
          .map((paper) => ({ id: PAPER_PAGE + paper.id, title: paper.title, ...(paper.year === undefined ? {} : { year: paper.year }) })),
        projects: store.listProjects().filter((project) => holds(project.name)).slice(0, TITLE_HITS)
          .map((project) => ({ id: project.id, name: project.name })),
      })
    }),
    tool('wiki_page', 'Read a Wiki page', 'Read one Wiki page of the vault: an aggregation page such as a topic or a '
      + 'method, or a paper\'s page (papers/<id>).', WikiPageArgs,
    ({ id }) => {
      if (id.startsWith(PAPER_PAGE)) {
        if (!store.hasPaper(id.slice(PAPER_PAGE.length))) return refuse(`The vault has no Wiki page ${id}.`)
        const page = store.wikiPaper(id)
        return answer({
          id, title: page.title, authors: page.authors.slice(0, 20), ...(page.year === undefined ? {} : { year: page.year }),
          venue: page.venue, body: clip(page.body, BODY_CHARS),
        })
      }
      if (!store.wikiCards().some((card) => card.id === id)) return refuse(`The vault has no Wiki page ${id}.`)
      const page = store.wikiAggregation(id)
      return answer({
        id, kind: page.kindLabel, title: page.title, summary: clip(page.summary, ITEM_CHARS),
        claims: page.claims.slice(0, 20).map((claim) => clip(claim.text, ITEM_CHARS)), body: clip(page.body, BODY_CHARS),
      })
    }),
    tool('project_summary', 'Read a project summary', 'Read the summary of one project in the vault: its state, focus, '
      + 'milestones, conclusions, newest research records and papers.', ProjectSummaryArgs,
    ({ id }) => {
      if (!store.hasProject(id)) return refuse(`The vault has no project ${id}.`)
      const project = store.getProject(id)
      return answer({
        id, name: project.name, status: project.status, priority: project.priority, areas: projectAreas(project),
        focus: clip(project.focus, ITEM_CHARS), ...(project.block === undefined ? {} : { block: clip(project.block, ITEM_CHARS) }),
        start: project.start, due: project.due, ...(project.lastProgress === undefined ? {} : { lastProgress: project.lastProgress }),
        milestones: project.milestones.slice(0, 20).map(({ title, date, done }) => ({ title: clip(title, ITEM_CHARS), date, done })),
        conclusions: (project.projectConclusions ?? []).slice(0, 10).map(({ text, state }) => ({ text: clip(text, ITEM_CHARS), state })),
        recentRecords: sortRecordsNewestFirst(project.events).slice(0, 5).map(({ date, text }) => ({ date, text: clip(text, ITEM_CHARS) })),
        papers: Object.entries(project.paperTitles).slice(0, 20).map(([paper, title]) => ({ id: PAPER_PAGE + paper, title })),
      })
    }),
  ]
  return {
    definitions: tools.map((item) => item.definition),
    call(name: string, args: unknown): Promise<VaultToolResult> | null {
      return tools.find((item) => item.definition.name === name)?.call(args) ?? null
    },
  }
}

export type VaultTools = ReturnType<typeof vaultTools>
