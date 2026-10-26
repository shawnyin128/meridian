import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HOOK = join(process.cwd(), 'scripts/milestone-ask.mjs')
const { changesMilestone } = await import(HOOK).catch(() => ({ changesMilestone: () => null }))

describe('agent 改 milestone 前先问所有者', () => {
  it('改 milestone 的 gh 命令要先问：建、改、关 milestone，给 issue 或 PR 挂上或摘掉 milestone', () => {
    for (const command of [
      'gh issue edit 717 -R shawnyin128/meridian --milestone v0.0.21.4',
      'gh issue create -R shawnyin128/meridian --label bug --milestone v0.0.21.4 --title x --body-file /tmp/b.md',
      'gh pr edit 714 --remove-milestone',
      'gh api repos/shawnyin128/meridian/milestones -f title=v0.0.21.5',
      'gh api -X PATCH repos/shawnyin128/meridian/milestones/17 -f state=closed',
      'gh api --method DELETE repos/shawnyin128/meridian/milestones/9',
      'gh api -X PATCH repos/shawnyin128/meridian/issues/717 -F milestone=18',
      'cd /tmp && gh issue edit 1 --milestone v1 >/dev/null; echo done',
    ]) expect(changesMilestone(command), command).toBe(true)
  })

  it('只读的命令不问：查看 milestone、按 milestone 列 issue、看 issue', () => {
    for (const command of [
      'gh api repos/shawnyin128/meridian/milestones/16 -q .title',
      'gh api -X GET repos/shawnyin128/meridian/milestones -f state=all',
      'gh issue list -R shawnyin128/meridian --milestone v0.0.21.1 --state open',
      'gh issue view 717 --json milestone',
      'git commit -m "mention --milestone in a message"',
    ]) expect(changesMilestone(command), command).toBe(false)
  })

  it('钩子收到改 milestone 的 Bash 命令时回 ask 并说明原因，其他命令不出声', () => {
    const run = (command) => spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8',
    })
    const asked = run('gh issue edit 717 --milestone v0.0.21.4')
    expect(asked.status).toBe(0)
    expect(JSON.parse(asked.stdout).hookSpecificOutput).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'ask' })
    const quiet = run('gh issue view 717')
    expect([quiet.status, quiet.stdout]).toEqual([0, ''])
  })
})
