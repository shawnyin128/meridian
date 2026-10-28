/** Stub data of the #16 resource pool demo: no Core call reads or writes any of it. */

/** One registered resource: what it is, and how many units it has, by label when they are told apart. */
export type DemoResource = {
  id: string
  group: string
  name: string
  kind: 'gpu' | 'machine'
  capacity: number
  units?: string[]
}

/** A group of resources and the rules the user wrote for it; a resource on its own is a group of one. */
export type DemoGroup = {
  id: string
  name: string
  rules: string
}

/** One claim a session holds on a resource. */
export type DemoClaim = {
  id: string
  resource: string
  project: string
  /** The units held, by label, or as an amount. */
  held: string
  amount: number
  task: string
  agent: string
  device: string
  since: string
  until: string
  /** Its `until` passed with no update from its session. */
  stale?: boolean
}

/** A habit an agent offered after the user said yes in its session; the record holds it only once the user saves it. */
export type DemoHabitCandidate = {
  id: string
  resource: string
  agent: string
  project: string
  text: string
}

export const DEMO_GROUPS: DemoGroup[] = [
  {
    id: 'gpu-lab', name: 'gpu-lab',
    rules: '- `ssh gpu-lab`\n- 只用占到的卡：`CUDA_VISIBLE_DEVICES`\n- 可写：`~/scratch`、`~/checkpoints`\n- 不可碰：`~/datasets`、`/srv/shared`\n',
  },
  {
    id: 'cluster', name: 'cluster',
    rules: '- Mac：`ssh login`，再 `ssh cluster`；Windows：`ssh cluster`\n- `sbatch -p a100` 或 `-p h100`，`-A lab-gpu`，最长 48 小时\n- 可写：`/scratch/researcher`\n- 不可碰：`/home/researcher`\n',
  },
  { id: 'cpu-box', name: 'cpu-box', rules: '' },
]

export const DEMO_RESOURCES: DemoResource[] = [
  { id: 'gpu-lab', group: 'gpu-lab', name: 'gpu-lab', kind: 'gpu', capacity: 8, units: Array.from({ length: 8 }, (_, at) => `GPU ${at}`) },
  { id: 'a100', group: 'cluster', name: 'a100', kind: 'gpu', capacity: 16 },
  { id: 'h100', group: 'cluster', name: 'h100', kind: 'gpu', capacity: 8 },
  { id: 'cpu-box', group: 'cpu-box', name: 'cpu-box', kind: 'machine', capacity: 1 },
]

export const DEMO_CLAIMS: DemoClaim[] = [
  {
    id: 'c1', resource: 'gpu-lab', project: '推测解码加速', held: 'GPU 0–3', amount: 4,
    task: '跑 B=16 宽度扫描', agent: 'Claude Code', device: 'Mac', since: '2 小时前', until: '18:00',
  },
  {
    id: 'c2', resource: 'gpu-lab', project: 'KV cache 量化', held: 'GPU 4–5', amount: 2,
    task: '跑 Llama-2-7B 的 2bit KV 基线', agent: 'Codex', device: 'Windows', since: '40 分钟前', until: '22:00',
  },
  {
    id: 'c3', resource: 'a100', project: 'MoE 路由分析', held: '8 卡', amount: 8,
    task: '统计各层路由的负载分布', agent: 'Claude Code', device: 'Windows', since: '3 小时前', until: '明天 10:00',
  },
  {
    id: 'c4', resource: 'h100', project: '推测解码加速', held: '4 卡', amount: 4,
    task: '蒸馏 68M 草稿模型', agent: 'Codex', device: 'Mac', since: '1 小时前', until: '明天 08:00',
  },
  {
    id: 'c5', resource: 'cpu-box', project: 'MoE 路由分析', held: '整机', amount: 1,
    task: '预处理路由日志', agent: 'Claude Code', device: 'Mac', since: '昨天', until: '今天 09:30', stale: true,
  },
]

/** The usage habits record as the user saved it: it applies only to a resource whose group has no rules. */
export const DEMO_HABITS = `## 通用

- 结果写到 \`~/checkpoints/<项目>\`，日志写到 \`~/logs\`
`

export const DEMO_HABIT_CANDIDATES: DemoHabitCandidate[] = [
  {
    id: 'u1', resource: 'cpu-box', agent: 'Claude Code', project: 'MoE 路由分析',
    text: '- `ssh cpu-box`，在 tmux 里跑\n- `nice -n 10`，最多用 48 核\n- 可写：`/data/tmp`',
  },
]

/** The units of `resource` no live claim holds; a stale claim still counts until it is released. */
export function demoFree(resource: DemoResource): number {
  return resource.capacity - DEMO_CLAIMS.filter((claim) => claim.resource === resource.id)
    .reduce((total, claim) => total + claim.amount, 0)
}

/** The claims of project `name`. */
export function demoClaimsOf(name: string): DemoClaim[] {
  return DEMO_CLAIMS.filter((claim) => claim.project === name)
}

export function demoResource(id: string): DemoResource {
  return DEMO_RESOURCES.find((resource) => resource.id === id)!
}

/** The name a resource shows with: its group's name before its own when the group holds several. */
export function demoResourceName(resource: DemoResource): string {
  const group = DEMO_GROUPS.find((held) => held.id === resource.group)!
  return group.name === resource.name ? resource.name : `${group.name} ${resource.name}`
}
