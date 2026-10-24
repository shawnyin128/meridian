import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import tls from 'node:tls'
import { dayFrom, onDay, readJson, writeJson } from './app.mjs'
import { stubPdf, textLines } from './pdf.mjs'

// Trust the system's certificates as the App does, so a TLS-inspecting proxy does not break the downloads.
tls.setDefaultCACertificates([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])

/**
 * The papers of the test library, by scenario key. `arxiv` papers with `download` are real
 * two-column PDFs fetched once into `<out>/cache`; the others get a one-page stand-in PDF, and the
 * arXiv id in its file name still makes the App's import look up the real metadata. `days` is the day
 * of the import relative to the seed's today; `fields` are set afterwards with `papers.update`.
 */
export const PAPERS = [
  { key: 'eagle', arxiv: '2401.15077', download: true, days: -14,
    fields: { shortTitle: 'EAGLE', readState: '在读', rating: 5, custom: { repro: '已复现，加速比 2.8×', weight: '核心', tags: ['推理加速'] } } },
  { key: 'medusa', arxiv: '2401.10774', download: true, days: -14,
    fields: { shortTitle: 'Medusa', readState: '已读', rating: 4, custom: { repro: '等 Vicuna 权重', weight: '参考', tags: ['推理加速'] } } },
  { key: 'kivi', arxiv: '2402.02750', download: true, days: -30,
    fields: { shortTitle: 'KIVI', readState: '已读', rating: 4, custom: { repro: 'K 按通道量化已跑通', weight: '核心', tags: ['量化', '长上下文'] } } },
  { key: 'vllm', arxiv: '2309.06180', download: true, days: -30,
    fields: { shortTitle: 'vLLM', readState: '稍后阅读', custom: { weight: '参考', tags: ['系统'] } } },
  { key: 'specdec', arxiv: '2211.17192', days: -3, claim: 'Speculative decoding runs the target model on several draft tokens in parallel.',
    fields: { shortTitle: 'Speculative Decoding', readState: '已读', rating: 5, custom: { tags: ['推理加速'] } } },
  { key: 'h2o', arxiv: '2306.14048', days: -30, claim: 'A small set of heavy-hitter tokens holds most of the attention score mass.',
    fields: {
      title: 'H$_2$O: Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models',
      shortTitle: 'H2O', readState: '在读', custom: { weight: '待定', tags: ['长上下文'] },
    } },
  { key: 'switch', arxiv: '2101.03961', days: -30, claim: 'Routing every token to one expert keeps the layer sparse and simple to train.',
    fields: { shortTitle: 'Switch Transformers', rating: 3 } },
  { key: 'survey', arxiv: '2312.15234', days: -1, fields: { readState: '稍后阅读' } },
  { key: 'infbench', arxiv: '2402.13718', days: -2,
    fields: { title: '$\\infty$Bench: Extending Long Context Evaluation Beyond 100K Tokens' } },
  { key: 'quip', arxiv: '2402.04396', days: 0, claim: 'Incoherence processing with a randomized Hadamard transform makes weights easier to quantize.',
    fields: { title: 'QuIP$\\#$: Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks', shortTitle: 'QuIP#' } },
  { key: 'trees', days: 0, claim: 'Choosing the draft tree width from the running acceptance rate keeps verification cheap.',
    fields: {
      title: 'Dynamic Draft Trees: \\emph{Adaptive} Width for Speculative Decoding at~95\\% Acceptance with \\textbf{2--3$\\times$} Speedup',
      shortTitle: 'Dynamic Draft Trees', authors: ['Meridian 测试库'], year: 2026, venue: '测试数据',
    } },
]

/** Custom paper-table columns, one of each type. */
const COLUMNS = [
  { key: 'repro', label: '复现备注', type: 'text', options: [] },
  { key: 'weight', label: '重要度', type: 'select', options: ['核心', '参考', '待定'] },
  { key: 'tags', label: '标签', type: 'multi', options: ['推理加速', '量化', '系统', '长上下文'] },
]

/**
 * Returns the PDF bytes of every paper by key: real ones from `<out>/cache/<arXiv id>/`, downloading
 * what the cache lacks from arxiv.org, and stand-ins written here for the rest. Throws when a
 * download fails or is not a PDF.
 */
export async function paperFiles(out) {
  const files = {}
  for (const paper of PAPERS) {
    if (!paper.download) {
      files[paper.key] = stubPdf(paper.fields.title ?? `Stand-in for arXiv ${paper.arxiv}`, [
        'Meridian test library stand-in PDF',
        'This one-page file stands in for the original paper.',
        paper.claim ?? 'It holds no text from the paper.',
      ])
      continue
    }
    const file = join(out, 'cache', paper.arxiv, `${paper.arxiv}.pdf`)
    if (!existsSync(file)) {
      const response = await fetch(`https://arxiv.org/pdf/${paper.arxiv}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (!response.ok || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new Error(`Downloading arXiv ${paper.arxiv} failed: HTTP ${response.status}`)
      }
      mkdirSync(join(out, 'cache', paper.arxiv), { recursive: true })
      writeFileSync(file, bytes)
    }
    files[paper.key] = readFileSync(file)
  }
  return files
}

const abs = (id) => `https://arxiv.org/abs/${id}`
/** The canned-response key under which every batch lookup of the App finds the Atom answer. */
const BATCH = 'https://export.arxiv.org/api/query?id_list=*'

/**
 * Returns the file `<out>/cache/arxiv.json`, which holds what arXiv answers for every arXiv paper as
 * a table of Core's canned network responses: each paper's abstract page, which the App reads to
 * look up one paper, and the API's Atom answer for all of them, which it reads for any batch of
 * them. Asks arXiv with `get` only for what the file lacks, at most once every `intervalMs`, and
 * keeps each answer as it arrives. Throws when an answer is not a 200 naming its papers.
 */
export async function arxivMetadata(out, { get = fetch, intervalMs = 3_200 } = {}) {
  const file = join(out, 'cache', 'arxiv.json')
  const table = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const ids = PAPERS.flatMap((paper) => paper.arxiv === undefined ? [] : [paper.arxiv])
  const fresh = ids.filter((id) => table[abs(id)] === undefined)
  if (fresh.length === 0 && table[BATCH] !== undefined) return file
  mkdirSync(join(out, 'cache'), { recursive: true })
  let asked = Number.NEGATIVE_INFINITY
  const answer = async (url, named) => {
    await new Promise((done) => setTimeout(done, Math.max(0, asked + intervalMs - Date.now())))
    asked = Date.now()
    const response = await get(url)
    const text = await response.text()
    const lacking = named.filter((id) => !text.includes(`arxiv.org/abs/${id}`))
    if (!response.ok || lacking.length > 0) {
      throw new Error(`Asking arXiv for ${url} failed: ${response.ok ? `no answer for ${lacking.join(', ')}` : `HTTP ${response.status}`}`)
    }
    return text
  }
  for (const id of fresh) {
    table[abs(id)] = { status: 200, text: await answer(abs(id), [id]) }
    writeJson(file, table)
  }
  const query = new URLSearchParams({ id_list: ids.join(','), max_results: String(ids.length) })
  table[BATCH] = { status: 200, atom: await answer(`https://export.arxiv.org/api/query?${query}`, ids) }
  writeJson(file, table)
  return file
}

/**
 * Imports every paper through `papers.import`, waits for the App's metadata lookup, and records each
 * paper's page id in `seed.papers`. Throws when an arXiv paper's metadata did not come from arXiv.
 */
export async function importPapers(seed, call, win, files) {
  for (const paper of PAPERS) {
    const filename = paper.arxiv === undefined ? `${paper.key}.pdf` : `${paper.arxiv}.pdf`
    const result = await win.evaluate(([name, base64]) => window.meridian.call('papers.import', {
      filename: name, bytes: Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
    }), [filename, files[paper.key].toString('base64')])
    seed.papers[paper.key] = result.paper.id
  }
  for (;;) {
    const { uploads } = await call('jobs.status')
    if (uploads.every((job) => job.step === 'done' || job.step === 'failed')) {
      for (const paper of PAPERS.filter((item) => item.arxiv !== undefined)) {
        const job = uploads.find((item) => item.paperId === seed.papers[paper.key])
        if (job?.found !== 'arxiv') throw new Error(`arXiv metadata for ${paper.arxiv} did not arrive: ${job?.error ?? job?.found}`)
      }
      return
    }
    await new Promise((done) => setTimeout(done, 500))
  }
}

/**
 * The passage of `count` text items on page 1 of `bytes` that starts at the first item matching
 * `pattern`, as its quote and its rectangles, one per line. No item in it or just before it may
 * break a word with a hyphen, since a quote must read as the page text does. Throws when none fits.
 */
async function passage(bytes, pattern, count = 1) {
  const items = await textLines(bytes, 1)
  const broken = (item) => item === undefined || item.text.trim().endsWith('-')
  const at = items.findIndex((item, index) => pattern.test(item.text) && item.text.trim().length >= 20
    && (index === 0 || !broken(items[index - 1])) && items.slice(index, index + count).every((next) => !broken(next)))
  if (at < 0) throw new Error(`No passage on page 1 matches ${pattern}`)
  const rects = []
  for (const { rect } of items.slice(at, at + count)) {
    const line = rects.find((held) => Math.abs(held.y - rect.y) < rect.height / 2)
    if (line === undefined) rects.push({ ...rect })
    else line.width = rect.x + rect.width - line.x
  }
  return { quote: items.slice(at, at + count).map((item) => item.text.trim()).join(' '), rects }
}

/** A quote from page 1 of paper `key`: its stand-in sentence, or the first downloaded line matching `pattern`. */
export async function quoteOf(files, key, pattern) {
  const paper = PAPERS.find((item) => item.key === key)
  return paper.download ? (await passage(files[key], pattern)).quote : paper.claim
}

/**
 * Seeds the paper table and the reader: one custom column of each type, every reading state, short
 * titles, LaTeX titles, ratings and cells; highlights, notes, a remark and the reading position;
 * a deleted note and highlight; a deleted column; an undone and an archived change; one paper deleted
 * into Trash.
 */
export async function seedPapers(seed, call, files) {
  const columns = await call('papers.columns')
  await call('papers.setColumns', { columns: { ...columns, custom: COLUMNS, groups: [...columns.groups, 'weight'] } })
  const seeded = await call('papers.columns')
  await call('papers.setColumns', { columns: { ...seeded, custom: [...seeded.custom, { key: 'scratch', label: '草稿列', type: 'text', options: [] }] } })
  await call('papers.setColumns', { columns: seeded })
  // Papers older than three days were edited nine days ago, past the seven days undo is kept.
  for (const paper of PAPERS) {
    await onDay(seed, paper.days >= -3 ? 0 : -9, () => call('papers.update', { id: seed.papers[paper.key], patch: paper.fields }))
  }
  const eagle = seed.papers.eagle
  const reading = (id, mutation) => call('papers.mutateReading', { id, mutation })
  const highlight = async (key, pattern, count, color) =>
    reading(seed.papers[key], { kind: 'highlight.add', page: 1, ...await passage(files[key], pattern, count), color })
  await highlight('eagle', /reconsider speculative sampling/, 2, 'yellow')
  const held = await highlight('eagle', /latency speedup ratio/, 2, 'green')
  await reading(eagle, { kind: 'highlight.update', id: held.highlights.at(-1).id, note: '这里的加速比是在 LLaMA2-Chat 70B 上测的，和我们 13B 的设置不同。' })
  for (const [page, text] of [[1, '草稿头只用一层 decoder，参数量不到目标模型的 1%。'], [3, '树形注意力掩码的实现细节在附录。'], [5, '温度升到 1.0 后加速比下降，可能和接受率有关。']]) {
    await reading(eagle, { kind: 'note.add', page, text })
  }
  await reading(eagle, { kind: 'remark.set', text: '精读中：重点看特征层自回归和树形草稿两部分。' })
  await reading(eagle, { kind: 'progress.set', page: 3 })
  const kivi = await highlight('kivi', /value cache should/, 1, 'blue')
  await reading(seed.papers.kivi, { kind: 'highlight.update', id: kivi.highlights[0].id, note: 'K 按通道、V 按 token 量化，是这篇的关键。' })
  await reading(seed.papers.kivi, { kind: 'note.add', page: 1, text: '2bit 下 Llama-2-7B 精度几乎不掉。' })
  await reading(seed.papers.h2o, { kind: 'note.add', page: 1, text: '重击者 token 留 20% 就够，和我们的 KV 预算估计一致。' })
  const dropped = await reading(seed.papers.h2o, { kind: 'note.add', page: 2, text: '这条记错了，删掉。' })
  await reading(seed.papers.h2o, { kind: 'note.delete', id: dropped.notes.at(-1).id })
  const misplaced = await highlight('kivi', /findings indicate that the key cache/, 1, 'pink')
  await reading(seed.papers.kivi, { kind: 'highlight.delete', id: misplaced.highlights.at(-1).id })

  await call('papers.update', { id: seed.papers.switch, patch: { rating: 1 } })
  await call('changelog.undo', { id: (await call('changelog.list'))[0].id })
  await call('changelog.archive', { id: (await call('changelog.list')).find((row) => row.title.includes('PagedAttention')).id })
  await call('papers.delete', { id: seed.papers.infbench })
}

/**
 * Stores on EAGLE, with the App closed, a pink highlight over the first line of its yellow one, the
 * overlap App 0.0.18.0 could write and Core now refuses. Its id comes from the vault's sequence as
 * Core draws one. The reader keeps both highlights and draws only the pink one on that line.
 */
export async function writeLegacyOverlap(seed, files) {
  const meridian = join(seed.out, 'library', '.meridian')
  const state = readJson(join(meridian, 'state.json'))
  writeJson(join(meridian, 'state.json'), { ...state, seq: state.seq + 1 })
  const readings = readJson(join(meridian, 'paper-readings.json'))
  const { quote, rects } = await passage(files.eagle, /reconsider speculative sampling/, 1)
  readings.find((reading) => reading.paperId === seed.papers.eagle).highlights.push({
    id: `highlight-${state.seq + 1}`, page: 1, quote, rects, color: 'pink', note: '', created: seed.today, updated: seed.today,
  })
  writeJson(join(meridian, 'paper-readings.json'), readings)
}

/**
 * Moves each paper's import to its day: the "uploaded" feed entry and the page's `created` and
 * `added_at` lines. Run with the App closed.
 */
export function redatePapers(seed, titles) {
  const feed = JSON.parse(readFileSync(join(seed.out, 'library', '.meridian', 'feed.json'), 'utf8'))
  for (const paper of PAPERS) {
    const date = dayFrom(seed.today, paper.days)
    for (const entry of feed.filter((item) => item.body.runs?.some((run) => run.text === `《${titles[paper.key]}》`))) {
      seed.days.feed.set(entry.id, paper.days)
    }
    const page = join(seed.out, 'library', 'wiki', 'papers', `${seed.papers[paper.key]}.md`)
    if (!existsSync(page)) continue
    writeFileSync(page, readFileSync(page, 'utf8')
      .replace(/^(created: "?)\d{4}-\d{2}-\d{2}/m, `$1${date}`)
      .replace(/^(added_at: "?)\d{4}-\d{2}-\d{2}/m, `$1${date}`), 'utf8')
  }
}
