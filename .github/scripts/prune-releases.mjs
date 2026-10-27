/**
 * Keeps the newest five releases: deletes the release pages beyond them and, in the same step, the
 * release branches of every release that is no longer among them. Tags are never deleted, and a
 * branch of a version that has no tag yet is never touched. The release workflow calls `prune` from
 * actions/github-script after it publishes a release.
 */

/** How many published releases keep their page and their release branch. */
const KEPT = 5
/** A release branch: `feature/vX.Y.Z.0/release` or `fix/vX.Y.Z.F/release`. */
const RELEASE_BRANCH = /^(feature|fix)\/v\d+\.\d+\.\d+\.\d+\/release$/

/**
 * The release branch a stored tag was released from: `vX.Y.N` is display version X.Y.Z.F with
 * Z = N / 1000 and F = N % 1000, a feature branch when F is 0 and a fix branch otherwise.
 * @param {string} tag A stored tag such as `v0.0.21005`.
 * @returns {string}
 */
export function releaseBranch(tag) {
  const [major, large, stored] = tag.replace(/^v/, '').split('.').map(Number)
  const small = Math.floor(stored / 1000)
  const fix = stored % 1000
  return `${fix === 0 ? 'feature' : 'fix'}/v${major}.${large}.${small}.${fix}/release`
}

/**
 * Deletes the pages of published releases beyond the newest five, then every release branch whose
 * release has a tag but is not among the newest five, once GitHub's compare shows the branch
 * contained in `master` or a `baseline/` branch. A branch that is not contained is kept and reported.
 * @param {{ github: any, context: { repo: { owner: string, repo: string } }, core: { info: (text: string) => void, warning: (text: string) => void } }} deps
 */
export async function prune({ github, context, core }) {
  const { owner, repo } = context.repo
  const releases = (await github.paginate(github.rest.repos.listReleases, { owner, repo, per_page: 100 }))
    .filter((held) => !held.draft)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const kept = new Set(releases.slice(0, KEPT).map((held) => releaseBranch(held.tag_name)))
  for (const old of releases.slice(KEPT)) {
    await github.rest.repos.deleteRelease({ owner, repo, release_id: old.id })
    core.info(`deleted the release page of ${old.tag_name}`)
  }

  const released = new Set((await github.paginate(github.rest.repos.listTags, { owner, repo, per_page: 100 }))
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag.name)).map((tag) => releaseBranch(tag.name)))
  const branches = (await github.paginate(github.rest.repos.listBranches, { owner, repo, per_page: 100 })).map((held) => held.name)
  const holders = ['master', ...branches.filter((name) => name.startsWith('baseline/'))]
  const contained = async (branch) => {
    for (const base of holders) {
      const { data } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${base}...${branch}` })
      if (data.ahead_by === 0) return true
    }
    return false
  }
  for (const branch of branches.filter((name) => RELEASE_BRANCH.test(name) && released.has(name) && !kept.has(name))) {
    if (!(await contained(branch))) {
      core.warning(`kept ${branch}: it is not contained in master or a baseline branch`)
      continue
    }
    await github.rest.git.deleteRef({ owner, repo, ref: `heads/${branch}` })
    core.info(`deleted ${branch} with its release`)
  }
}
