import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dayFrom, onDay } from './app.mjs'

/**
 * Creates project `name` on day `days` the way the project list does, with the feed entry it
 * posts, records its id in `seed.projects[key]`, and returns the id.
 */
async function createProject(seed, call, key, name, days) {
  return onDay(seed, days, async () => {
    const id = await call('project.create', { name })
    await call('feed.append', { source: 'me', body: { kind: 'runs', runs: [
      { kind: 'text', text: '新项目《' }, { kind: 'text', text: name, target: { kind: 'project', id } }, { kind: 'text', text: '》已创建' },
    ] } })
    seed.projects[key] = { id, days }
    return id
  })
}

/**
 * Sets project `id`'s areas to `areas`. An App that takes no `topics`, 0.0.16.1 and older, rejects
 * that key as invalid and gets the first area as `topic` instead; `seed.areas` records which one the
 * App takes once the first call has asked it. Returns the areas the App stored.
 */
export async function setAreas(seed, call, id, areas) {
  if (seed.areas !== false) {
    try {
      await call('project.update', { id, patch: { topics: areas } })
      seed.areas = true
      return areas
    } catch (error) {
      if (seed.areas === true || !String(error).includes('project.update: {"reason":"invalid"}')) throw error
      seed.areas = false
    }
  }
  await call('project.update', { id, patch: { topic: areas[0] } })
  return areas.slice(0, 1)
}

/** Adds tasks `[title, start, end, state, priority, extra]`, dated in days from the seed's today, and returns their ids by title. */
async function addTasks(seed, call, projectId, tasks) {
  const ids = {}
  for (const [title, start, end, state, priority, extra = {}] of tasks) {
    const project = await call('project.createTask', { projectId, task: {
      title, start: dayFrom(seed.today, start), end: dayFrom(seed.today, end), state, priority, ...extra,
    } })
    ids[title] = project.tasks.find((task) => task.title === title).id
  }
  return ids
}

/** Writes `name` under `<out>/files` and attaches it to project `projectId`; returns the attachment id. */
async function attach(seed, call, projectId, name, text) {
  mkdirSync(join(seed.out, 'files'), { recursive: true })
  const path = join(seed.out, 'files', name)
  writeFileSync(path, text, 'utf8')
  const size = `${Math.max(1, Math.round(statSync(path).size / 1024))} KB`
  const project = await call('project.createAttachment', { projectId, attachment: { name, size, path } })
  return project.attachments.find((attachment) => attachment.name === name).id
}

/**
 * Seeds the projects: speculative decoding, bound to `<out>/workspaces/spec-decoding`, with tasks in
 * every state and priority, milestones, every relation group, attachments and conclusions; KV cache
 * quantization, whose last research record is 30 days old but whose plan changed today; MoE routing,
 * untouched for 30 days and in two areas, one of them speculative decoding's, or only its first on an
 * App that takes one; a finished project; and one deleted into Trash. Returns the speculative
 * decoding project's task ids by title.
 */
export async function seedProjects(seed, call) {
  const spec = await createProject(seed, call, 'spec', '推测解码加速', -20)
  const workspace = join(seed.out, 'workspaces', 'spec-decoding')
  const tasks = await onDay(seed, -20, async () => {
    await call('project.update', { id: spec, patch: {
      priority: 'p0', focus: '动态树宽度原型', start: dayFrom(seed.today, -20), due: dayFrom(seed.today, 25),
    } })
    await setAreas(seed, call, spec, ['推理加速'])
    await call('project.bindWorkspace', { id: spec, binding: { kind: 'local', root: workspace } })
    await call('project.createMilestone', { projectId: spec, milestone: { date: dayFrom(seed.today, -10), title: '基线复现完成', done: true } })
    await call('project.createMilestone', { projectId: spec, milestone: { date: dayFrom(seed.today, 14), title: '动态树原型', done: false } })
    return addTasks(seed, call, spec, [
      ['复现独立草稿模型基线', -20, -16, 'done', 'p1', { note: '用 68M 草稿模型，记下 γ=4 时的接受率。' }],
      ['复现 EAGLE 草稿头', -14, -9, 'done', 'p0'],
      ['对比 Medusa 多头', 5, 12, 'plan', 'p1'],
      ['准备组会汇报', 18, 20, 'plan', 'p1'],
    ])
  })
  await onDay(seed, -14, async () => {
    for (const key of ['eagle', 'medusa', 'trees']) await call('project.addPaper', { projectId: spec, paperId: seed.papers[key] })
  })
  await onDay(seed, -12, async () => {
    await call('project.createRelation', { projectId: spec, relation: { group: 'Wiki', text: '推测解码', page: 'topics/speculative-decoding' } })
    await call('project.createRelation', { projectId: spec, relation: { group: 'Wiki', text: '接受率与草稿长度的权衡' } })
    await call('project.createRelation', { projectId: spec, relation: { group: 'links', text: 'EAGLE 代码仓库', url: 'https://github.com/SafeAILab/EAGLE' } })
  })
  await onDay(seed, -9, async () => {
    for (const [text, state] of [['草稿头比独立草稿模型的接受率高一截。', 'verified'], ['树宽超过 8 之后验证开销抵消收益。', 'conflicting'], ['温度 1.0 下动态树宽的收益会消失。', 'pending']]) {
      const project = await call('project.createConclusion', { projectId: spec, text, ...(state === 'verified' ? { paper: seed.papers.eagle } : {}) })
      const id = project.conclusionList.find((conclusion) => conclusion.text === text).id
      if (state !== 'pending') await call('project.setConclusionState', { projectId: spec, conclusionId: id, state })
    }
  })
  Object.assign(tasks, await onDay(seed, -6, () => addTasks(seed, call, spec, [
    ['实现动态树宽度', -6, 2, 'act', 'p0', { note: '树宽随最近 64 步的接受率在 2 到 8 之间调整。' }],
    ['整理周报', -2, -2, 'done', 'p2'],
  ])))
  const notes = await onDay(seed, -2, async () => {
    await attach(seed, call, spec, '宽度扫描结果.csv', 'width,acceptance,speedup\n2,0.71,1.8\n4,0.66,2.4\n8,0.58,2.6\n')
    return attach(seed, call, spec, 'draft--tree-width-notes.md', '# 树宽笔记\n\n宽度 8 之后收益变平。\n')
  })
  await onDay(seed, -1, () => call('project.update', { id: spec, patch: {
    memo: '### 本周\n\n- 动态树宽度在长回答上更稳。\n- 下一步把 B=16 的扫描跑完，再决定上限。\n',
  } }))
  Object.assign(tasks, await addTasks(seed, call, spec, [
    ['跑 B=16 宽度扫描', 0, 0, 'act', 'p1', { window: { start: '14:00', end: '18:00' } }],
    ['写接受率分析脚本', 3, 3, 'plan', 'p2'],
  ]))
  await call('project.deleteAttachment', { projectId: spec, attachmentId: notes })

  const kv = await createProject(seed, call, 'kv', 'KV cache 量化', -30)
  await onDay(seed, -30, async () => {
    await call('project.update', { id: kv, patch: {
      focus: 'K 按通道的 2bit 量化', start: dayFrom(seed.today, -30), due: dayFrom(seed.today, 30),
    } })
    await setAreas(seed, call, kv, ['KV cache'])
    for (const key of ['kivi', 'h2o', 'vllm']) await call('project.addPaper', { projectId: kv, paperId: seed.papers[key] })
    await call('project.createConclusion', { projectId: kv, text: '2bit 下 K 必须按通道分组。', paper: seed.papers.kivi })
  })
  const kvTasks = await addTasks(seed, call, kv, [
    ['跑 Llama-2-7B 的 2bit KV 基线', 1, 3, 'plan', 'p1'],
    ['整理 KIVI 复现记录', 0, 0, 'act', 'p2'],
  ])
  await call('project.updateTask', { projectId: kv, taskId: kvTasks['整理 KIVI 复现记录'], patch: { state: 'done' } })
  await call('project.update', { id: kv, patch: { memo: '### 今天\n\n- K 按通道量化在长上下文下误差更小。\n' } })

  const moe = await createProject(seed, call, 'moe', 'MoE 路由分析', -30)
  await onDay(seed, -30, async () => {
    await call('project.update', { id: moe, patch: {
      priority: 'p2', focus: '统计各层路由的负载分布', block: '等 8 卡机器排期',
      start: dayFrom(seed.today, -30), due: dayFrom(seed.today, 10),
    } })
    await setAreas(seed, call, moe, ['混合专家', '推理加速'])
    await call('project.addPaper', { projectId: moe, paperId: seed.papers.switch })
    await addTasks(seed, call, moe, [['统计各层专家负载', -29, -25, 'done', 'p2'], ['画路由热力图', -24, -20, 'plan', 'p2']])
    await call('project.createMilestone', { projectId: moe, milestone: { date: dayFrom(seed.today, -5), title: '负载分析初稿', done: false } })
  })

  const done = await createProject(seed, call, 'done', 'FlashAttention 复现', -40)
  await onDay(seed, -40, () => call('project.update', { id: done, patch: {
    status: '已完成', focus: '复现完成：A100 上前向快 2.1×', start: dayFrom(seed.today, -60), due: dayFrom(seed.today, -35),
  } }))
  const gone = await createProject(seed, call, 'gone', '长上下文评测', -3)
  await onDay(seed, -1, () => call('project.delete', { id: gone }))
  return tasks
}

/** Recommendations project discovery would have brought for the KV cache project, in the stored shape it writes. */
export function discoveryRecords(seed) {
  const authors = ['Coleman Hooper', 'Sehoon Kim', 'Hiva Mohammadzadeh', 'Michael W. Mahoney', 'Yakun Sophia Shao', 'Kurt Keutzer', 'Amir Gholami']
  return [{
    id: 'seed-discovery-kvquant', kind: 'discovery', watch: '', project: seed.projects.kv.id, source: '项目 · KV cache 量化',
    title: 'KVQuant: Towards 10 Million Context Length LLM Inference with KV Cache Quantization',
    authors: authors.join(', '), venue: 'arXiv:2401.18079',
    abstract: 'KVQuant quantizes keys per channel before the rotary embedding and keeps outliers per vector, reaching 3-bit KV caches with under $0.1$ perplexity loss.',
    rec: '', reasons: [
      { kind: 'project', label: '来自项目「KV cache 量化」' }, { kind: 'source', label: '由相似论文召回' },
      { kind: 'wiki', label: '匹配 Wiki 主题/方法「KV cache 压缩」' },
    ],
    downloaded: false, paper: '', pdf: 'https://arxiv.org/pdf/2401.18079', topic: '', gone: false,
    arxiv: '2401.18079', semanticId: '', meta: { authors, submitted: '2024-01-31', journalRef: null },
  }]
}

/**
 * Moves each project's creation, and every research record Core stamped on the project page on day
 * `stamped`, to the day the project was created. Run with the App closed.
 */
export function redateProjects(seed, stamped) {
  const dir = join(seed.out, 'library', 'wiki', 'projects')
  for (const { id, days } of Object.values(seed.projects)) {
    const file = join(dir, `${id}.md`)
    if (!readdirSync(dir).includes(`${id}.md`)) continue
    const date = dayFrom(seed.today, days)
    writeFileSync(file, readFileSync(file, 'utf8')
      .replace(/^(created: "?)\d{4}-\d{2}-\d{2}/m, `$1${date}`)
      .replaceAll(new RegExp(`^- ${stamped} `, 'gm'), `- ${date} `), 'utf8')
  }
}
