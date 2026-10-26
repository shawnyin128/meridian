/**
 * Undoes milestone changes made by accounts that `.github/MILESTONE_MANAGERS` does not list. The
 * milestone-guard workflow calls `guard` from actions/github-script on `milestone` events and on the
 * `issues` events `milestoned` and `demilestoned`.
 */

/** The bot the workflow acts as, whose own undo writes count as allowed. */
const WORKFLOW_BOT = 'github-actions[bot]'

/**
 * The GitHub logins a managers file lists: one per line, lower-cased, `#` starting a comment.
 * @param {string} text The file's text.
 * @returns {Set<string>}
 */
export function managersFrom(text) {
  return new Set(text.split('\n').map((line) => line.replace(/#.*/, '').trim().toLowerCase()).filter(Boolean))
}

/**
 * Whether `login` may change milestones: a listed manager, or the workflow's own bot.
 * @param {string} login
 * @param {Set<string>} managers
 */
export function isAllowed(login, managers) {
  return login === WORKFLOW_BOT || managers.has(login.toLowerCase())
}

/**
 * How to undo one `milestone` event: delete a milestone that was created, restore the fields an
 * edit changed, flip a state change back, or recreate a deleted milestone, which cannot bring back
 * the issues it held.
 * @param {string} action The event's action: created, edited, closed, opened or deleted.
 * @param {{ number: number, title: string, description: string | null, due_on: string | null, state: string }} milestone
 * @param {Record<string, { from: string | null }> | undefined} changes An edit's previous values.
 * @returns {{ kind: 'delete', number: number } | { kind: 'update', number: number, fields: Record<string, string> } | { kind: 'create', fields: Record<string, string> } | null}
 */
export function milestoneUndo(action, milestone, changes) {
  if (action === 'created') return { kind: 'delete', number: milestone.number }
  if (action === 'closed') return { kind: 'update', number: milestone.number, fields: { state: 'open' } }
  if (action === 'opened') return { kind: 'update', number: milestone.number, fields: { state: 'closed' } }
  const kept = (fields) => Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined))
  if (action === 'edited') {
    const fields = kept(Object.fromEntries(['title', 'description', 'due_on'].map((key) => [key, changes?.[key]?.from])))
    return Object.keys(fields).length === 0 ? null : { kind: 'update', number: milestone.number, fields }
  }
  if (action === 'deleted') {
    return { kind: 'create', fields: kept({ title: milestone.title, description: milestone.description, due_on: milestone.due_on, state: milestone.state }) }
  }
  return null
}

/**
 * The milestone title an issue should carry: the one it had after the last milestone change an
 * allowed account made, or none when no allowed account ever set one.
 * @param {Array<{ event: string, actor: { login: string } | null, milestone?: { title: string } }>} events The issue's events, oldest first.
 * @param {Set<string>} managers
 * @returns {string | null}
 */
export function allowedIssueMilestone(events, managers) {
  let current = null
  let allowed = null
  for (const event of events) {
    if (event.event !== 'milestoned' && event.event !== 'demilestoned') continue
    current = event.event === 'milestoned' ? event.milestone?.title ?? null : null
    if (isAllowed(event.actor?.login ?? '', managers)) allowed = current
  }
  return allowed
}

/**
 * Undoes the milestone change in the workflow's event when an account `managersText` does not list
 * made it, and says what it did: in a comment on the issue for an issue's milestone, and in the
 * run's summary for a milestone itself.
 * @param {{ github: any, context: any, core: any, managersText: string }} deps actions/github-script's client, context and core, and the managers file.
 */
export async function guard({ github, context, core, managersText }) {
  const managers = managersFrom(managersText)
  const actor = context.payload.sender?.login ?? ''
  if (isAllowed(actor, managers)) {
    core.info(`${actor} may change milestones.`)
    return
  }
  const { owner, repo } = context.repo
  if (context.eventName === 'milestone') {
    const { milestone, action, changes } = context.payload
    const undo = milestoneUndo(action, milestone, changes)
    if (undo === null) return
    if (undo.kind === 'delete') await github.rest.issues.deleteMilestone({ owner, repo, milestone_number: undo.number })
    if (undo.kind === 'update') await github.rest.issues.updateMilestone({ owner, repo, milestone_number: undo.number, ...undo.fields })
    if (undo.kind === 'create') await github.rest.issues.createMilestone({ owner, repo, ...undo.fields })
    const done = { delete: 'deleted it', update: 'restored it', create: 'recreated it without its issues' }[undo.kind]
    await core.summary.addRaw(`${actor} is not a milestone manager: milestone "${milestone.title}" was ${action}, so the guard ${done}.`).write()
    return
  }
  const issue = context.payload.issue.number
  const events = await github.paginate(github.rest.issues.listEvents, { owner, repo, issue_number: issue, per_page: 100 })
  const title = allowedIssueMilestone(events, managers)
  const milestones = title === null ? [] : await github.paginate(github.rest.issues.listMilestones, { owner, repo, state: 'all', per_page: 100 })
  const restored = milestones.find((held) => held.title === title)?.number ?? null
  await github.rest.issues.update({ owner, repo, issue_number: issue, milestone: restored })
  await github.rest.issues.createComment({
    owner, repo, issue_number: issue,
    body: `Only the accounts in .github/MILESTONE_MANAGERS change milestones, so the milestone change by ${actor} was undone`
      + (restored === null ? '; this issue has no milestone.' : `; this issue is back on ${title}.`),
  })
}
