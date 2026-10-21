import { join } from 'node:path'
import { dayFrom, onDay, readJson, writeJson } from './app.mjs'

/**
 * Recommendations a watch fetch would have brought from arXiv, by stored id: the watch name they
 * came from, the paper, and what happens to them in the seed. `later` moves one to read-later on
 * that day, `dismiss` moves it to Trash.
 */
const RECOMMENDATIONS = [
  { id: 'seed-inbox-sequoia', watch: 'speculative decoding', arxiv: '2402.12374', submitted: '2024-02-19',
    title: 'Sequoia: Scalable, Robust, and Hardware-aware Speculative Decoding',
    authors: ['Zhuoming Chen', 'Avner May', 'Ruslan Svirschevski', 'Yuhsun Huang', 'Max Ryabinin', 'Zhihao Jia', 'Beidi Chen'],
    abstract: 'Sequoia builds the token tree for speculative decoding by dynamic programming and reports up to $4.04\\times$ faster decoding on an A100.' },
  { id: 'seed-inbox-specinfer', watch: 'speculative decoding', arxiv: '2305.09781', submitted: '2023-05-16', later: 0,
    title: 'SpecInfer: Accelerating Generative Large Language Model Serving with Tree-based Speculative Inference and Verification',
    authors: ['Xupeng Miao', 'Gabriele Oliaro', 'Zhihao Zhang', 'Xinhao Cheng', 'Zeyu Wang', 'Zhihao Jia'],
    abstract: 'SpecInfer organizes the predictions of small speculative models as a token tree and verifies the whole tree in one pass of the large model.' },
  { id: 'seed-inbox-hydra', watch: 'speculative decoding', arxiv: '2402.05109', submitted: '2024-02-07', later: -1,
    title: 'Hydra: Sequentially-Dependent Draft Heads for Medusa Decoding',
    authors: ['Zachary Ankner', 'Rishab Parthasarathy', 'Aniruddha Nrusimha', 'Christopher Rinard', 'Jonathan Ragan-Kelley', 'William Brandon'],
    abstract: 'Hydra heads condition each draft head on the tokens drafted before it, which raises the acceptance rate of Medusa-style decoding.' },
  { id: 'seed-inbox-selfspec', watch: 'speculative decoding', arxiv: '2309.08168', submitted: '2023-09-15', later: -5,
    title: 'Draft & Verify: Lossless Large Language Model Acceleration via Self-Speculative Decoding',
    authors: ['Jun Zhang', 'Jue Wang', 'Huan Li', 'Lidan Shou', 'Ke Chen', 'Gang Chen', 'Sharad Mehrotra'],
    abstract: 'The model drafts by skipping some of its own intermediate layers and then verifies the draft with the full model, with no extra network.' },
  { id: 'seed-inbox-lookahead', watch: 'speculative decoding', arxiv: '2402.02057', submitted: '2024-02-03', dismiss: true,
    title: 'Break the Sequential Dependency of LLM Inference Using Lookahead Decoding',
    authors: ['Yichao Fu', 'Peter Bailis', 'Ion Stoica', 'Hao Zhang'],
    abstract: 'Lookahead decoding generates and verifies n-grams in parallel through Jacobi iteration, without a draft model.' },
  { id: 'seed-inbox-fa3', watch: 'Tri Dao', arxiv: '2407.08608', submitted: '2024-07-11',
    title: 'FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision',
    authors: ['Jay Shah', 'Ganesh Bikshandi', 'Ying Zhang', 'Vijay Thakkar', 'Pradeep Ramani', 'Tri Dao'],
    abstract: 'FlashAttention-3 overlaps computation and data movement on Hopper GPUs and supports FP8, reaching up to 75\\% of the H100 peak.' },
]

/** Creates topic and author watches, one of them paused, and the feed entry of the last watch fetch. */
export async function seedWatches(seed, call) {
  await call('watch.create', { watch: { type: 'topic', name: 'speculative decoding' } })
  await call('watch.create', { watch: { type: 'author', name: 'Tri Dao' } })
  await call('watch.create', { watch: { type: 'topic', name: 'mixture of experts' } })
  const watches = await call('watch.list')
  await call('watch.setActive', { id: watches.find((watch) => watch.name === 'mixture of experts').id, active: false })
  seed.watches = Object.fromEntries(watches.map((watch) => [watch.name, watch]))
  // The App posts this summary when a watch fetch over the network brings new papers.
  await onDay(seed, -1, () => call('feed.append', { source: 'inbox', body: { kind: 'runs', runs: [
    { kind: 'text', text: '抓取：' }, { kind: 'strong', text: '6 篇新论文入队' },
    { kind: 'text', text: '（speculative decoding ×5 · Tri Dao ×1）。' },
  ] } }))
}

/**
 * Writes the recommendations in `.meridian/inbox.json` in the stored shape a watch fetch writes,
 * since only the network produces them, followed by the stored records in `extra`. Run with the App
 * closed.
 */
export function writeInbox(seed, extra = []) {
  const records = RECOMMENDATIONS.map((paper) => {
    const watch = seed.watches[paper.watch]
    const kind = watch.type === 'topic' ? '关键词' : '作者'
    return {
      id: paper.id, kind: 'watch', watch: watch.id, project: '', source: `${kind} · ${watch.name}`,
      title: paper.title, authors: paper.authors.join(', '), venue: `arXiv:${paper.arxiv}`, abstract: paper.abstract,
      rec: '', reasons: [{ kind: 'watch', label: `命中${kind}「${watch.name}」` }], downloaded: false, paper: '',
      pdf: `https://arxiv.org/pdf/${paper.arxiv}`, topic: watch.type === 'topic' ? watch.name : '', gone: false,
      arxiv: paper.arxiv, semanticId: '', meta: { authors: paper.authors, submitted: paper.submitted, journalRef: null },
    }
  })
  writeJson(join(seed.out, 'library', '.meridian', 'inbox.json'), [...records, ...extra])
}

/** Moves recommendations to read-later and to Trash through the inbox's own methods. */
export async function seedInbox(seed, call) {
  for (const paper of RECOMMENDATIONS) {
    if (paper.later !== undefined) {
      await call('inbox.readLater', { id: paper.id })
      seed.days.later.set(paper.id, paper.later)
    }
    if (paper.dismiss) await call('inbox.dismiss', { id: paper.id })
  }
}

/** Moves each read-later entry to the day it was queued. Run with the App closed. */
export function redateLater(seed) {
  const file = join(seed.out, 'library', '.meridian', 'later.json')
  writeJson(file, readJson(file).map((entry) => (seed.days.later.has(entry.id)
    ? { ...entry, added: dayFrom(seed.today, seed.days.later.get(entry.id)) } : entry)))
}
