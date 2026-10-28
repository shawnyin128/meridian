import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dayFrom, meridian, onDay, python, readJson, writeJson } from './app.mjs'
import { quoteOf } from './papers.mjs'

const THREAD = 'spec-decoding'
const node = (id) => `${THREAD}.${id}`
const workspaceOf = (seed) => join(seed.out, 'workspaces', 'spec-decoding')

/**
 * Calls `fn` of the Lab's Python API, which the MCP tools wrap, with JSON `args`, and returns its
 * result. It works in `args.root` when given, else in the speculative-decoding repository.
 */
function lab(seed, module, fn, args) {
  const code = `import json, sys
from pathlib import Path
from ${module} import ${fn}
args = json.load(sys.stdin)
result = ${fn}(Path(args.pop('root')), **args)
print(json.dumps(result))
sys.exit(0 if result.get('status') in ('applied', 'unchanged', 'created') else 1)`
  return JSON.parse(python(seed.out, ['-c', code], JSON.stringify({ root: workspaceOf(seed), ...args })))
}

/** Applies a `meridian.lab.update.v1` packet on the thread, with the confirmations it needs accepted. */
const update = (seed, changes, confirmed = []) => lab(seed, 'meridian.lab.graph', 'apply_lab_update', { packet: {
  schema: 'meridian.lab.update.v1', intent: 'seed', target_thread: THREAD, changes,
  user_confirmation: { required_for: confirmed, status: confirmed.length === 0 ? 'not_required' : 'accepted' },
} })

/**
 * Creates the git-initialised research repository the speculative-decoding project binds to, with
 * the Lab space `meridian setup init-lab` makes and the thread seed an agent writes for a new idea.
 */
export function prepareWorkspace(seed) {
  const root = workspaceOf(seed)
  mkdirSync(root, { recursive: true })
  const git = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' })
  if (git.status !== 0) throw new Error(`git init failed: ${git.stderr}`)
  writeFileSync(join(root, 'README.md'), '# spec-decoding\n\nExperiments on speculative decoding for 13B models.\n', 'utf8')
  meridian(seed.out, ['setup', 'init-lab', '--lab-root', root, '--config-home', join(seed.out, 'config')])
  const created = dayFrom(seed.today, -20)
  writeFileSync(join(root, '.meridian', 'threads', `${THREAD}.md`), [
    '---', 'type: research-thread', 'title: 推测解码加速', 'status: open', `created: ${created}`, `updated: ${created}`,
    'related_threads: []', '---', '', '# Research Thread: 推测解码加速', '', '## Root Problem', '',
    '在 13B 模型上把解码延迟降到一半以内，同时不改变输出分布。', '', '## Approach Tree', '',
    '### Node A: 基线：独立草稿模型的投机解码', '', '- mode: `unresolved`', '', '#### Next Action', '',
    '复现 γ=4 时的接受率和加速比。', '', '## Graph Relations', '',
  ].join('\n'), 'utf8')
}

/**
 * Seeds the agent side of the speculative-decoding project through the Lab and workspace API: graph
 * nodes in every state, two of them closed with experiments and conclusions, plan tasks linked to
 * nodes, research records, agent tasks dated 12 and 7 days ago and today, each taken into the plan
 * on its day, and agent ideas: two attached to a node, one of them left as a candidate and one
 * confirmed, and one carried out in the finished project. The candidate holds a proposal the agent
 * wrote in the workspace and attached with `idea-file-add`.
 */
export async function seedLab(seed, call, tasks) {
  update(seed, [
    { op: 'set_active_thread', thread_id: THREAD },
    { op: 'create_node', node_id: node('B'), title: '树形草稿 + 动态宽度', parent: 'A', why: '固定宽度在长回答上接受率下降。',
      next_action: '实现按接受率调整的树宽，再跑 B=16 扫描。' },
    { op: 'create_node', node_id: node('C'), title: '草稿头共享浅层 KV', parent: 'A', state: 'repairable',
      why: '共享层之后位置编码错位，接受率掉到 0.3。', next_action: '修正共享层的位置编码偏移后重跑。' },
    { op: 'create_node', node_id: node('D'), title: 'n-gram 检索草稿', parent: 'A' },
    { op: 'create_node', node_id: node('E'), title: '按 token 难度自适应草稿长度', parent: 'B' },
  ], ['create_node', 'set_active_thread', 'state:repairable'])
  // A node activated in the packet that creates it is named by its id in the record the activation writes.
  update(seed, [
    { op: 'activate_node', node_id: node('B') },
    { op: 'link_task', node_id: node('A'), task_id: tasks['复现独立草稿模型基线'] },
    { op: 'link_task', node_id: node('B'), task_id: tasks['实现动态树宽度'] },
    { op: 'link_task', node_id: node('B'), task_id: tasks['跑 B=16 宽度扫描'] },
    { op: 'record_history', node_id: node('B'), message: '决定先做动态宽度，共享 KV 往后放。' },
  ])
  const result = (id, experiment, days, state, conclusion, confirmed) => {
    lab(seed, 'meridian.lab.result', 'record_lab_result', {
      node_id: node(id), event_id: `${experiment.id}-result`, summary: experiment.summary,
      source: `.meridian/experiments/${experiment.id}.md`, impact: state === 'supported' ? 'supports' : 'refutes',
      event_date: dayFrom(seed.today, days), state, next_action: experiment.next,
      user_confirmation: confirmed ? { required_for: [`state:${state}`], status: 'accepted' } : null,
      experiment: { title: experiment.title, validity: 'valid', question: experiment.question, command: experiment.command,
        result: experiment.result, interpretation: experiment.interpretation },
    })
    update(seed, [{ op: 'record_conclusion', node_id: node(id), text: conclusion, evidence: [experiment.id], date: dayFrom(seed.today, days) }])
  }
  result('A', {
    id: 'exp-baseline-13b', title: '13B 独立草稿模型基线', summary: '68M 草稿模型在 γ=4 时加速 1.9×',
    question: '独立草稿模型在 13B 上能加速多少？', command: 'python bench.py --draft 68m --gamma 4 --model 13b',
    result: '接受率 0.62，加速 1.9×。', interpretation: '草稿太弱，接受率是瓶颈。', next: '把这组数作为后续节点的对照。',
  }, -10, 'supported', '独立草稿模型在 13B 上只有 1.9×，瓶颈是接受率。', false)
  result('D', {
    id: 'exp-ngram-draft', title: 'n-gram 检索草稿的命中率', summary: '对话任务里 n-gram 草稿命中率只有 4%',
    question: '从上下文检索 n-gram 当草稿，在对话任务里能命中多少？', command: 'python bench.py --draft ngram --task mt-bench',
    result: '命中率 4%，没有加速。', interpretation: '对话里重复片段太少，这条路走不通。', next: '不再推进。',
  }, -8, 'dead', '对话任务里 n-gram 草稿几乎命中不了，放弃。', true)
  const thread = `.meridian/threads/${THREAD}.md`
  for (const [id, days, kind, text, detail] of [
    ['width-start', -6, 'start', '树形草稿 + 动态宽度', undefined],
    ['width-cap', -4, 'decision', '树宽上限定为 8', '超过 8 之后验证开销抵消收益'],
    ['sweep-turn', -1, 'note', '转向 B=16 扫描：先确认宽度收益的拐点', undefined],
    // Long enough to be cut off on the project page at 1440 by 900, so the record opens in place on hover.
    ['width-sweep', 0, 'result', '宽度扫描：B=16 时动态树宽比固定宽度 4 快 2.6×，长回答上的接受率也更稳',
      'γ=4，温度 0；宽度 2、4、8 的接受率 0.71、0.66、0.58，加速 1.8×、2.4×、2.6×；宽度超过 8 之后验证开销抵消收益'],
  ]) {
    meridian(seed.out, ['workspace', 'event-add', '--root', workspaceOf(seed), '--id', id, '--text', text, '--kind', kind,
      '--source', thread, '--date', dayFrom(seed.today, days), '--node', node('B'), ...(detail === undefined ? [] : ['--detail', detail])])
  }
  for (const [id, days, title, note] of [
    ['rerun-gamma4', -12, '补跑 γ=4 基线', '换一个随机种子再跑一遍，确认 1.9×。'],
    ['check-kv-memory', -7, '检查草稿头共享 KV 的显存占用', '对比共享前后的峰值显存。'],
    ['summarize-sweep', 0, '汇总今天的宽度扫描结果', '把每个宽度的接受率和加速比整理成表。'],
  ]) {
    await onDay(seed, days, async () => {
      meridian(seed.out, ['workspace', 'task-add', '--root', workspaceOf(seed), '--id', id, '--title', title,
        '--note', note, '--date', dayFrom(seed.today, days)])
      await call('project.get', { id: seed.projects.spec.id })
    })
  }
  meridian(seed.out, ['workspace', 'idea-add', '--root', workspaceOf(seed), '--id', 'acceptance-histogram',
    '--title', '按接受率直方图决定草稿长度', '--body', '统计最近一段的接受长度分布，取分位数作为下一步的草稿长度，而不是固定 γ。',
    '--context', '动态树宽度的实现讨论', '--node', node('B'), '--date', dayFrom(seed.today, -3)])
  mkdirSync(join(workspaceOf(seed), 'docs'), { recursive: true })
  writeFileSync(join(workspaceOf(seed), 'docs', 'acceptance-histogram.md'), '# 按接受率直方图决定草稿长度\n\n取最近 256 步接受长度的 0.6 分位数作为 γ。\n', 'utf8')
  meridian(seed.out, ['workspace', 'idea-file-add', '--root', workspaceOf(seed), '--id', 'acceptance-histogram-proposal',
    '--idea', 'acceptance-histogram', '--path', 'docs/acceptance-histogram.md', '--date', dayFrom(seed.today, -3)])
  for (const [id, title, body, attached] of [
    ['tree-attention', '草稿树验证复用分块注意力', '树形草稿的验证写成一个带掩码的分块注意力，省掉逐分支的 kernel 启动。', node('B')],
    ['block-size', '分块大小随序列长度自动选择', '短序列用小块、长序列用大块，按 SRAM 大小和序列长度查表选块。', undefined],
  ]) {
    meridian(seed.out, ['workspace', 'idea-add', '--root', workspaceOf(seed), '--id', id, '--title', title, '--body', body,
      '--context', '验证开销的实现讨论', '--date', dayFrom(seed.today, -2), ...(attached === undefined ? [] : ['--node', attached])])
  }
  const arrived = await call('idea.list')
  const ideaOf = (title) => arrived.find((idea) => idea.title === title).id
  await call('idea.placeOnGraph', { id: ideaOf('草稿树验证复用分块注意力'), placement: { kind: 'confirm' } })
  await call('idea.update', { id: ideaOf('分块大小随序列长度自动选择'), patch: { project: seed.projects.done.id } })
}

/**
 * Seeds the Wiki review queue: an agent proposal submitted through `meridian wiki propose` and left
 * pending, one left pending because the node conclusion it cites is not verified, one applied after the
 * user verified the node conclusion it cites, one declined, and one Core rejects because its quote is
 * not in the paper; then one that revises a claim and marks a conflict on it, one that retracts a
 * claim, one left pending after the page it rests on changed, and one membership Core rejects because
 * an agent may only change claims.
 */
export async function seedProposals(seed, call, files) {
  const project = seed.projects.spec.id
  const experiment = { kind: 'experiment', project, node: node('A') }
  const dir = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
  try {
    writeJson(join(dir, 'ops.json'), [{ op: 'addClaim', page: 'topics/speculative-decoding', claim: {
      id: 'adaptive-width', text: '按接受率自适应树宽，比固定宽度 4 的加速比高约 15%。', evidence: [
        experiment, { kind: 'source', paper: `papers/${seed.papers.trees}`, page: 1, quote: await quoteOf(files, 'trees') },
      ] } }])
    meridian(seed.out, ['wiki', 'propose', join(dir, 'ops.json'), '--library-root', join(seed.out, 'library'),
      '--title', '把 Dynamic Draft Trees 的 \\emph{自适应}树宽写进推测解码', '--project', project, '--node', node('A')])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const propose = async (key, page, claim, quote, cited = experiment) => {
    const { version } = await call('wiki.aggregation', { id: page })
    return call('wiki.propose', { proposal: {
      protocol: 1, key, producer: { kind: 'ai', id: 'skill.meridian' }, trigger: { kind: 'experiment', project, node: cited.node },
      title: claim.title, base: { [page]: version }, ops: [{ op: 'addClaim', page, claim: { id: claim.id, text: claim.text, evidence: [
        cited, { kind: 'source', paper: `papers/${seed.papers[quote.paper]}`, page: 1, quote: quote.text },
      ] } }],
    } })
  }
  const eagle = { paper: 'eagle', text: await quoteOf(files, 'eagle', /latency speedup ratio/) }
  const applied = await propose('seed-draft-heads', 'methods/draft-heads',
    { id: 'heads-acceptance', title: '草稿头比独立草稿模型更容易提高接受率', text: '在 13B 上，草稿头的接受率明显高于 68M 的独立草稿模型。' }, eagle)
  const declined = await propose('seed-baseline-kv', 'topics/kv-cache-compression',
    { id: 'baseline-kv', title: '把基线实验的结论写进 KV cache 压缩', text: '独立草稿模型的 KV cache 占用可以忽略。' }, eagle)
  await propose('seed-bad-quote', 'topics/speculative-decoding',
    { id: 'bad-quote', title: '引句对不上原文的提案', text: '这条提案的引句不在原文里。' }, { paper: 'eagle', text: '这句话不在 EAGLE 的第一页上。' })
  await propose('seed-ngram-dead-end', 'topics/speculative-decoding',
    { id: 'ngram-dead-end', title: '把 n-gram 草稿走不通写进推测解码', text: '在对话任务里，从上下文检索的 n-gram 草稿几乎命中不了。' },
    eagle, { kind: 'experiment', project, node: node('D') })
  // The App takes agent proposals from its inbox every few seconds.
  for (let waited = 0; (await call('wiki.proposals', { status: 'queued' })).length < 4; waited += 1) {
    if (waited > 40) throw new Error('The App did not take the agent proposal from its inbox')
    await new Promise((done) => setTimeout(done, 500))
  }
  const submit = async (key, title, cited, pages, ops) => call('wiki.propose', { proposal: {
    protocol: 1, key, producer: { kind: 'ai', id: 'skill.meridian' }, trigger: { kind: 'experiment', project, node: cited },
    title, base: Object.fromEntries(await Promise.all(pages.map(async (id) => [id, (await call('wiki.aggregation', { id })).version]))), ops,
  } })
  const spec = 'topics/speculative-decoding'
  const heads = 'methods/draft-heads'
  await submit('seed-revise-acceptance', '按基线实验修订接受率的结论', node('A'), [spec], [
    { op: 'reviseClaim', page: spec, claim: 'acceptance-rate', text: '加速比主要取决于草稿的接受率：13B 上 68M 草稿模型的接受率只有 0.62，加速 1.9×。', evidence: [experiment] },
    { op: 'markConflict', page: spec, claim: 'acceptance-rate', conflict: {
      id: 'ngram-chat', against: { kind: 'experiment', project, node: node('D') }, note: '对话任务里命中率才是瓶颈，接受率解释不了 n-gram 草稿的结果。',
    } },
  ])
  // Applying the proposal below changes the page this one rests on, which leaves it pending as stale.
  await submit('seed-stale-heads', '把草稿头的层数写进草稿头', node('A'), [heads], [{ op: 'addClaim', page: heads, claim: {
    id: 'heads-depth', text: '草稿头只用一层 decoder 就够，再加层接受率不再上升。', evidence: [experiment, { kind: 'source', paper: `papers/${seed.papers.eagle}`, page: 1, quote: eagle.text }],
  } }])
  await submit('seed-membership-trees', '把 Dynamic Draft Trees 收进推测解码', node('B'), [], [{
    op: 'setMembership', paper: `papers/${seed.papers.trees}`, in: spec,
    cells: { draft: { value: '目标模型自身的树形草稿', page: 1, quote: await quoteOf(files, 'trees') } },
  }])
  const held = (await call('project.get', { id: project })).projectConclusions.find((item) => item.node === node('A'))
  await onDay(seed, -1, async () => {
    await call('project.verifyConclusion', { projectId: project, node: node('A'), fingerprint: held.fingerprint })
    await call('wiki.decide', { id: applied.id, decision: 'apply' })
    await call('wiki.decide', { id: declined.id, decision: 'decline', reason: '基线实验不涉及 KV cache，证据对不上。' })
  })
  await submit('seed-retract-heads', '撤回草稿头接受率的结论', node('B'), [heads], [
    { op: 'retractClaim', page: heads, claim: 'heads-acceptance', reason: '换成同一组 γ 重跑之后，两者的接受率只差 0.03。' },
  ])
}

/**
 * Seeds the agent side of the draft-distillation project `id`, the second project of the
 * speculative-decoding repository, bound to the space `folder`, through the CLI with `--project`:
 * its own Lab, a thread whose nodes are a supported baseline, a dead branch and the active one, and
 * research records of its own.
 */
export function seedSharedLab(seed, { id: project, folder }) {
  const root = workspaceOf(seed)
  meridian(seed.out, ['setup', 'init-lab', '--lab-root', root, '--project', project, '--config-home', join(seed.out, 'config')])
  const space = join(root, folder)
  const thread = `${folder}/threads/distill.md`
  const created = dayFrom(seed.today, -8)
  writeFileSync(join(root, thread), [
    '---', 'type: research-thread', 'title: 草稿模型蒸馏', 'status: open', `created: ${created}`, `updated: ${created}`,
    'related_threads: []', '---', '', '# Research Thread: 草稿模型蒸馏', '', '## Root Problem', '',
    '让 68M 草稿模型的分布贴近 13B 目标模型，把接受率从 0.52 提到 0.65。', '', '## Approach Tree', '',
    '### Node A: 基线：68M 草稿模型直接上', '', '- mode: `supported`', '', '#### Next Action', '', '作为蒸馏的对照。', '',
    '## Graph Relations', '',
  ].join('\n'), 'utf8')
  const packet = (changes, confirmed) => lab(seed, 'meridian.lab.graph', 'apply_lab_update', { root: space, packet: {
    schema: 'meridian.lab.update.v1', intent: 'seed', target_thread: 'distill', changes,
    user_confirmation: { required_for: confirmed, status: 'accepted' },
  } })
  packet([
    { op: 'set_active_thread', thread_id: 'distill' },
    { op: 'create_node', node_id: 'distill.B', title: '按目标模型 logits 蒸馏草稿', parent: 'A', why: '接受率是瓶颈，蒸馏能对齐分布。',
      next_action: '用 KL 损失蒸馏 2 个 epoch，测接受率。' },
    { op: 'create_node', node_id: 'distill.C', title: '只蒸馏前 4 层', parent: 'A', state: 'dead', why: '层数太少，接受率反而下降。' },
    { op: 'create_node', node_id: 'distill.D', title: '在线蒸馏：用验证结果回灌', parent: 'B' },
  ], ['create_node', 'set_active_thread', 'state:dead'])
  packet([{ op: 'activate_node', node_id: 'distill.B' }], [])
  for (const [id, days, kind, text, node] of [
    ['distill-baseline', -6, 'result', '68M 草稿模型基线：接受率 0.52', 'distill.A'],
    ['distill-four-layers', -4, 'decision', '只蒸馏前 4 层，接受率降到 0.47，放弃', 'distill.C'],
    ['distill-logits-start', -1, 'start', '开始按 logits 蒸馏，KL 损失，2 个 epoch', 'distill.B'],
  ]) {
    meridian(seed.out, ['workspace', 'event-add', '--root', root, '--project', project, '--id', id, '--text', text,
      '--kind', kind, '--source', thread, '--date', dayFrom(seed.today, days), '--node', node])
  }
}

/**
 * Gives every research record the agent dated in the past a timestamp on its own day, and returns
 * the day of each feed entry the App copied from a record, by entry id. Run with the App closed.
 */
export function redateEvents(seed) {
  const nested = join(workspaceOf(seed), '.meridian', 'projects')
  const files = [
    join(workspaceOf(seed), '.meridian', 'events', 'events.json'),
    ...(existsSync(nested) ? readdirSync(nested).map((space) => join(nested, space, 'events', 'events.json')) : []),
  ].filter((file) => existsSync(file))
  const events = files.flatMap((file) => {
    const held = readJson(file)
    held.events = held.events.map((event) => (event.at === undefined ? event : { ...event, at: `${event.date}${event.at.slice(10)}` }))
    writeJson(file, held)
    return held.events
  })
  const feed = readJson(join(seed.out, 'library', '.meridian', 'feed.json'))
  for (const entry of feed.filter((item) => item.source === 'lab')) {
    const event = events.find((item) => JSON.stringify(entry.body).includes(item.text))
    if (event !== undefined) seed.days.feed.set(entry.id, Math.round((Date.parse(event.date) - Date.parse(seed.today)) / 86_400_000))
  }
}
