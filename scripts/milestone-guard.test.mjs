import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const MODULE = join(process.cwd(), '.github/scripts/milestone-guard.mjs')
const MANAGERS = 'shawnyin128 # the owner\n'

/** actions/github-script's client, context and core for one event by `sender`, with every write recorded. */
function run(eventName, payload, { events = [], milestones = [] } = {}) {
  const writes = []
  const record = (name) => vi.fn(async (params) => { writes.push([name, params]); return { data: {} } })
  const rest = {
    issues: {
      deleteMilestone: record('deleteMilestone'), updateMilestone: record('updateMilestone'), createMilestone: record('createMilestone'),
      update: record('update'), createComment: record('createComment'), listEvents: 'listEvents', listMilestones: 'listMilestones',
    },
  }
  const github = { rest, paginate: async (method) => (method === 'listEvents' ? events : milestones) }
  const summary = { addRaw: vi.fn(() => summary), write: vi.fn(async () => {}) }
  const context = { eventName, payload, repo: { owner: 'shawnyin128', repo: 'meridian' } }
  return { deps: { github, context, core: { info: vi.fn(), summary }, managersText: MANAGERS }, writes }
}
const guard = async (deps) => (await import(MODULE)).guard(deps)
const V21 = { number: 18, title: 'v0.0.21.4', description: 'Fix release', due_on: null, state: 'open' }

describe('只有名单里的人能改 milestone', () => {
  it('名单里的人改 milestone 时守卫什么都不动，包括 agent 用这个账号做的改动', async () => {
    const { deps, writes } = run('milestone', { action: 'created', milestone: V21, sender: { login: 'ShawnYin128' } })
    await guard(deps)
    expect(writes).toEqual([])
  })

  it('名单外的人新建、改名、关闭或删除 milestone 时，守卫撤回：删掉新建的，改回原样，重建删掉的', async () => {
    const outsider = { login: 'someone-else' }
    const cases = [
      [{ action: 'created', milestone: V21 }, [['deleteMilestone', { owner: 'shawnyin128', repo: 'meridian', milestone_number: 18 }]]],
      [{ action: 'edited', milestone: { ...V21, title: 'v9' }, changes: { title: { from: 'v0.0.21.4' } } },
        [['updateMilestone', { owner: 'shawnyin128', repo: 'meridian', milestone_number: 18, title: 'v0.0.21.4' }]]],
      [{ action: 'closed', milestone: { ...V21, state: 'closed' } },
        [['updateMilestone', { owner: 'shawnyin128', repo: 'meridian', milestone_number: 18, state: 'open' }]]],
      [{ action: 'deleted', milestone: V21 },
        [['createMilestone', { owner: 'shawnyin128', repo: 'meridian', title: 'v0.0.21.4', description: 'Fix release', state: 'open' }]]],
    ]
    for (const [payload, expected] of cases) {
      const { deps, writes } = run('milestone', { ...payload, sender: outsider })
      await guard(deps)
      expect(writes).toEqual(expected)
    }
  })

  it('名单外的人给 issue 挂上或换掉 milestone 时，守卫把它改回名单里的人最后定的那个，并留言说明', async () => {
    const events = [
      { event: 'milestoned', actor: { login: 'shawnyin128' }, milestone: { title: 'v0.0.21.4' } },
      { event: 'demilestoned', actor: { login: 'someone-else' }, milestone: { title: 'v0.0.21.4' } },
      { event: 'milestoned', actor: { login: 'someone-else' }, milestone: { title: 'v0.0.22.0' } },
    ]
    const { deps, writes } = run('issues', {
      action: 'milestoned', issue: { number: 717 }, milestone: { title: 'v0.0.22.0' }, sender: { login: 'someone-else' },
    }, { events, milestones: [{ number: 14, title: 'v0.0.22.0' }, { number: 18, title: 'v0.0.21.4' }] })
    await guard(deps)
    expect(writes[0]).toEqual(['update', { owner: 'shawnyin128', repo: 'meridian', issue_number: 717, milestone: 18 }])
    expect(writes[1][0]).toBe('createComment')
    expect(writes[1][1].body).toContain('back on v0.0.21.4')
  })

  it('名单外的人新建 issue 时带上的 milestone 被去掉', async () => {
    const events = [{ event: 'milestoned', actor: { login: 'someone-else' }, milestone: { title: 'v0.0.22.0' } }]
    const { deps, writes } = run('issues', {
      action: 'milestoned', issue: { number: 720 }, milestone: { title: 'v0.0.22.0' }, sender: { login: 'someone-else' },
    }, { events, milestones: [{ number: 14, title: 'v0.0.22.0' }] })
    await guard(deps)
    expect(writes[0]).toEqual(['update', { owner: 'shawnyin128', repo: 'meridian', issue_number: 720, milestone: null }])
  })

  it('守卫流程在默认分支上监听 milestone 的每种改动和 issue 的挂上摘下，名单文件里有所有者', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/milestone-guard.yml'), 'utf8')
    expect(workflow).toMatch(/milestone:\n\s+types: \[created, edited, opened, closed, deleted\]/)
    expect(workflow).toMatch(/issues:\n\s+types: \[milestoned, demilestoned\]/)
    expect(readFileSync(join(process.cwd(), '.github/MILESTONE_MANAGERS'), 'utf8')).toMatch(/^shawnyin128\b/m)
  })
})
