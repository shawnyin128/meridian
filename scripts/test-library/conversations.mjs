import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { onDay } from './app.mjs'

const text = (value) => ({ kind: 'text', text: value })
const say = (role, ...runs) => ({ role, runs: runs.map((run) => (typeof run === 'string' ? text(run) : run)), actions: [] })

/**
 * Seeds the chats and ideas. Replies are written with `chat.append`, since only a model produces
 * them: two paper chats, ordinary chats, one archived, one mentioning a Wiki page with `@` in its
 * text as 0.0.18.0 sent mentions and a project as a mention run naming it as later Apps send them, and
 * a reply whose action records a research record for the KV cache project. The tree-width chat's
 * replies name the model that wrote them, as 0.0.21.0 keeps them: Claude on the subscription, Codex
 * on its own default, and an API model; every other reply names none, as older Apps kept them. Ideas are saved from those
 * chats in every state: placed on the research graph, linked only, archived, promoted to a project,
 * unlinked, and deleted into Trash; one idea the user wrote down without a chat is linked to a project.
 * One chat an idea was saved from is then deleted into Trash, so that idea, carried out in the
 * speculative decoding project on a node of its graph, has a deleted chat as its source.
 * Two ideas relate to projects and a Wiki page other than where they came from, and one is written
 * down on the KV cache project's page. The idea promoted to a project holds two files, written under
 * `<out>/files`, which its project lists too, and a third that went to Trash.
 */
export async function seedConversations(seed, call) {
  const append = (id, messages) => call('chat.append', { id, messages })
  const eagle = await onDay(seed, -5, async () => {
    const chat = await call('chat.forPaper', { paperId: seed.papers.eagle })
    await append(chat.id, [
      say('you', '草稿头为什么只用一层 decoder 就够了？'),
      say('ai', '因为草稿头预测的是倒数第二层的特征，而不是 token。特征序列比 token 序列平滑得多，一层 decoder 就能外推得很准；', '真正决定加速比的是接受率，而不是草稿头的容量。论文在 13B 上用的命令行是 ',
        { kind: 'text', text: 'python -m eagle.evaluation.gen_ea_answer_vicuna --ea-model-path yuhuili/EAGLE-Vicuna-13B-v1.3 --base-model-path lmsys/vicuna-13b-v1.3' },
        '，可以直接对照。'),
      say('you', '那树形草稿的宽度怎么定？'),
      say('ai', '论文用的是固定的树结构。按接受率动态调整宽度是一个值得试的方向。'),
    ])
    return chat
  })
  const h2o = await onDay(seed, -4, async () => {
    const chat = await call('chat.forPaper', { paperId: seed.papers.h2o })
    await append(chat.id, [say('you', '重击者 token 能和 KV 量化叠加吗？'), say('ai', '可以：先淘汰非重击者，再把留下的 KV 量化到低位宽。')])
    return chat
  })
  const width = await onDay(seed, -3, async () => {
    const chat = await call('chat.create', { title: '推测解码的树宽怎么定', named: true })
    await append(chat.id, [
      say('you', '固定树宽为什么在长回答上变差？'),
      {
        ...say('ai', '长回答后半段的接受率下降，宽树里大部分分支都会被拒绝，验证开销白白浪费。'),
        model: { route: 'subscription', cli: 'claude', id: 'claude-opus-5-5[1m]' },
      },
      say('you', '@推测解码 里说加速比取决于接受率，长回答也是这样吗？'),
      { ...say('ai', '是的：长回答后半段的接受率更低，加速比也跟着下降。'), model: { route: 'subscription', cli: 'codex' } },
      say('you', '那 ', { kind: 'mention', text: '@推测解码加速', target: { kind: 'project', id: seed.projects.spec.id } }, ' 先从哪组实验开始？'),
      { ...say('ai', '先跑动态树宽的原型：它直接回答长回答上接受率下降的问题。'), model: { route: 'api', id: 'gpt-5.5' } },
    ])
    return chat
  })
  await onDay(seed, -30, async () => {
    const chat = await call('chat.create', { title: 'KV cache 量化方案讨论', named: true })
    await append(chat.id, [say('you', 'K 和 V 应该用同一种量化粒度吗？'), {
      ...say('ai', '不应该：K 的离群值集中在少数通道，按通道量化；V 没有这种结构，按 token 量化。'),
      actions: [{ kind: 'writeBack', label: '记入科研记录', project: seed.projects.kv.id, text: 'K 按通道、V 按 token 量化的方案定下来了' }],
    }])
    const [, reply] = await call('chat.messages', { id: chat.id })
    const project = await call('chat.recordAction', { id: chat.id, messageId: reply.id })
    await call('feed.append', { source: 'me', body: { kind: 'runs', runs: [
      text('已记入《'), { ...text(project.name), target: { kind: 'project', id: project.id } }, text('》的科研记录'),
    ] } })
  })
  const old = await call('chat.create', { title: '旧的 MoE 讨论', named: true })
  await append(old.id, [say('you', 'Switch 的容量因子取多少合适？'), say('ai', '论文里 1.0 到 1.25 都试过，训练时 1.25 更稳。')])
  await call('chat.setArchived', { id: old.id, archived: true })

  const spec = seed.projects.spec.id
  const idea = async (chat, title, body, patch) => {
    const made = await call('idea.create', { chatId: chat.id, title, body })
    if (patch !== undefined) await call('idea.update', { id: made.id, patch })
    return made.id
  }
  const placed = await idea(eagle, '按接受率动态调整草稿树宽度', '用最近一段的接受率决定下一步树宽：接受率高就加宽，低就收窄，让验证开销跟着收益走。', { project: spec })
  await call('idea.placeOnGraph', { id: placed, placement: { kind: 'link', nodeId: 'spec-decoding.B' } })
  await idea(width, '草稿头和目标模型共享浅层 KV', '草稿头直接读目标模型浅层的 KV，省掉草稿自己的 KV cache。', { project: spec })
  await idea(width, '按 token 难度跳过验证', '对置信度很高的 token 直接接受，不进验证。', { project: spec, archived: true })
  const promoted = await idea(h2o, '推测解码和 KV 量化联合优化', '草稿阶段用低位宽 KV，验证阶段用全精度 KV，两边的显存和速度一起算。')
  const ideaFile = async (name, text) => {
    mkdirSync(join(seed.out, 'files'), { recursive: true })
    const path = join(seed.out, 'files', name)
    writeFileSync(path, text, 'utf8')
    const size = `${Math.max(1, Math.round(statSync(path).size / 1024))} KB`
    return (await call('idea.addFile', { id: promoted, attachment: { name, size, path } })).attachment.id
  }
  await ideaFile('联合优化-proposal.md', '# 推测解码和 KV 量化联合优化\n\n草稿阶段用低位宽 KV，验证阶段用全精度 KV。\n')
  await ideaFile('显存与速度估算.csv', 'bits,draft_mem_gb,verify_mem_gb,tokens_per_s\n4,3.1,12.4,41\n8,5.8,12.4,37\n')
  await call('idea.deleteFile', { id: promoted, fileId: await ideaFile('旧草稿.md', '# 旧草稿\n') })
  await onDay(seed, -5, async () => {
    const { project } = await call('idea.promote', { id: promoted })
    seed.projects.promoted = { id: project.id, days: -5 }
    await call('project.update', { id: project.id, patch: { status: '搁置', focus: '等 KV cache 量化的结论出来再继续' } })
  })
  const moeIdea = await idea(old, 'MoE 路由用熵正则代替负载均衡 loss', '负载均衡 loss 会压低路由的确定性，换成对路由分布的熵正则可能更好。')
  await call('idea.delete', { id: await idea(width, '用 n-gram 草稿处理代码补全', '代码里重复片段多，n-gram 草稿也许有用。') })
  const own = await call('idea.create', { title: '按 batch 大小校准接受率阈值', body: '同一个阈值在 B=1 和 B=16 下效果差很多，先按 batch 分档校准。' })
  await call('idea.update', { id: own.id, patch: { project: spec } })
  const related = await call('idea.create', { title: '用草稿置信度选择 KV 量化位宽', body: '草稿头置信度高的位置用低位宽 KV，低的位置用高位宽，把显存省在不容易出错的地方。' })
  await call('idea.update', { id: related.id, patch: { relations: { projects: [seed.projects.kv.id], pages: ['methods/kv-quantization'] } } })
  await call('idea.update', { id: moeIdea, patch: { relations: { projects: [seed.projects.moe.id], pages: [] } } })
  await call('idea.create', {
    title: '按层分配 KV 位宽预算', body: '浅层对量化误差更敏感，给定总位宽时按层分配，而不是每层一样。', sourceProject: seed.projects.kv.id,
  })

  const temperature = await call('chat.create', { title: '草稿采样的温度要不要调', named: true })
  await append(temperature.id, [
    say('you', '草稿模型的采样温度和目标模型一样设吗？'), say('ai', '不必：草稿温度低一点接受率更高，但分布偏得太远会被拒绝得更多。'),
  ])
  const tuned = await idea(temperature, '按接受率自动调草稿温度', '接受率掉下来时把草稿温度往目标模型的温度拉，接受率高时再放低。', { project: spec })
  await call('idea.placeOnGraph', { id: tuned, placement: { kind: 'link', nodeId: 'spec-decoding.B' } })
  await call('chat.delete', { id: temperature.id })
}
