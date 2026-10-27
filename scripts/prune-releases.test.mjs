import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const MODULE = join(process.cwd(), '.github/scripts/prune-releases.mjs')
const load = () => import(MODULE)

/** actions/github-script's client and core for a repository with these releases, tags, branches and containment. */
function run({ releases, tags, branches, contained = () => true }) {
  const writes = []
  const rest = {
    repos: {
      listReleases: 'listReleases', listTags: 'listTags', listBranches: 'listBranches',
      deleteRelease: vi.fn(async (params) => { writes.push(['deleteRelease', params.release_id]); return { data: {} } }),
      compareCommitsWithBasehead: vi.fn(async ({ basehead }) => {
        const [base, head] = basehead.split('...')
        return { data: { ahead_by: contained(head, base) ? 0 : 3 } }
      }),
    },
    git: { deleteRef: vi.fn(async (params) => { writes.push(['deleteRef', params.ref]); return { data: {} } }) },
  }
  const lists = { listReleases: releases, listTags: tags.map((name) => ({ name })), listBranches: branches.map((name) => ({ name })) }
  const github = { rest, paginate: async (method) => lists[method] }
  const warnings = []
  const core = { info: vi.fn(), warning: vi.fn((text) => warnings.push(text)) }
  return { deps: { github, context: { repo: { owner: 'shawnyin128', repo: 'meridian' } }, core }, writes, warnings }
}

/** A published release of stored tag `tag`, created `day` days into October. */
const release = (id, tag, day) => ({ id, tag_name: tag, draft: false, created_at: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z` })

describe('发布页面和发布分支一起删：只留最新五个发布', () => {
  it('存储的版本号换成四段的显示版本和它的发布分支：F 为 0 是 feature 分支，否则是 fix 分支', async () => {
    const { releaseBranch } = await load()
    expect(releaseBranch('v0.0.22000')).toBe('feature/v0.0.22.0/release')
    expect(releaseBranch('v0.0.21005')).toBe('fix/v0.0.21.5/release')
    expect(releaseBranch('v1.2.3004')).toBe('fix/v1.2.3.4/release')
    expect(releaseBranch('v0.0.15000')).toBe('feature/v0.0.15.0/release')
  })

  it('超出最新五个的发布：删页面，同一步删它的发布分支；最新五个和进行中的版本分支都不动', async () => {
    const releases = [
      release(1, 'v0.0.20000', 1), release(2, 'v0.0.21000', 2), release(3, 'v0.0.21001', 3), release(4, 'v0.0.21002', 4),
      release(5, 'v0.0.21003', 5), release(6, 'v0.0.21004', 6), release(7, 'v0.0.21005', 7), release(8, 'v0.0.22000', 8),
      { ...release(9, 'v0.0.23000', 9), draft: true },
    ]
    const tags = ['v0.0.15000', 'v0.0.19000', 'v0.0.20000', 'v0.0.21000', 'v0.0.21001', 'v0.0.21002', 'v0.0.21003', 'v0.0.21004', 'v0.0.21005', 'v0.0.22000']
    const branches = [
      'master', 'feature/v0.0.15.0/release', 'feature/v0.0.19.0/release', 'feature/v0.0.20.0/release', 'feature/v0.0.21.0/release',
      'fix/v0.0.21.4/release', 'feature/v0.0.22.0/release', 'feature/v0.0.23.0/release', 'feature/v0.0.23.0/desktop/feed',
    ]
    const { deps, writes } = run({ releases, tags, branches })
    await (await load()).prune(deps)
    expect(writes).toEqual([
      ['deleteRelease', 3], ['deleteRelease', 2], ['deleteRelease', 1],
      ['deleteRef', 'heads/feature/v0.0.15.0/release'], ['deleteRef', 'heads/feature/v0.0.19.0/release'],
      ['deleteRef', 'heads/feature/v0.0.20.0/release'], ['deleteRef', 'heads/feature/v0.0.21.0/release'],
    ])
  })

  it('没有包含在 master 或任何 baseline 里的发布分支留着，并报出来；包含在 baseline 里的照删', async () => {
    const releases = [1, 2, 3, 4, 5].map((n) => release(n, `v0.0.2${n}000`, n))
    const tags = releases.map((held) => held.tag_name)
    const branches = ['master', 'baseline/v0.1.0.0', 'feature/v0.0.21.0/release', 'feature/v0.0.22.0/release']
    const contained = (head, base) => base.startsWith('baseline/')
    const { deps, writes, warnings } = run({ releases: [...releases, release(7, 'v0.0.30000', 7)], tags: [...tags, 'v0.0.30000'], branches, contained })
    await (await load()).prune(deps)
    expect(writes).toEqual([['deleteRelease', 1], ['deleteRef', 'heads/feature/v0.0.21.0/release']])
    expect(warnings).toEqual([])

    const unmerged = run({ releases: [...releases, release(7, 'v0.0.30000', 7)], tags: [...tags, 'v0.0.30000'], branches, contained: () => false })
    await (await load()).prune(unmerged.deps)
    expect(unmerged.writes).toEqual([['deleteRelease', 1]])
    expect(unmerged.warnings).toEqual(['kept feature/v0.0.21.0/release: it is not contained in master or a baseline branch'])
  })
})
