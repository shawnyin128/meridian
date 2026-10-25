import { describe, expect, it } from 'vitest'
import type { HarnessCli } from '../../../shared/contract.js'
import type { CliDiscovery } from './discovery.js'
import { readiness, reachedUsageLimit, USAGE_LIMIT_MESSAGES } from './failure.js'

/**
 * What each CLI prints once the user's plan has no usage left, one message per pattern of the table
 * and in its order: Claude Code 2.1.280's limit messages and Codex CLI 0.163.0's usage-limit errors.
 */
const PRINTED: [HarnessCli, string][] = [
  ['claude', "You've hit your session limit · resets 3pm (Europe/Paris)"],
  ['claude', "You've reached your Fable limit."],
  ['claude', "You're out of usage credits. Switch to another model"],
  ['claude', "You're out of extra usage"],
  ['claude', 'Your org is out of usage · contact your admin'],
  ['codex', 'You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 3:05 PM.'],
  ['codex', 'You hit your spend cap set in your workspace. Increase your spend cap to continue.'],
  ['codex', 'Your workspace is out of credits. Add credits to continue.'],
  ['codex', 'Quota exceeded. Check your plan and billing details.'],
]

const installed = (fields: Partial<Extract<CliDiscovery, { installed: true }>> = {}): CliDiscovery => ({
  cli: 'claude', installed: true, binary: '/bin/claude', version: '2.1.280', missingFlags: [], signIn: 'subscription',
  ...fields,
})

describe('subscription CLI failures', () => {
  it('holds one printed message for each usage-limit pattern, each matched by its own pattern', () => {
    expect(PRINTED.map(([cli]) => cli)).toEqual(USAGE_LIMIT_MESSAGES.map((row) => row.cli))
    expect(PRINTED.map(([, text], at) => USAGE_LIMIT_MESSAGES[at]!.pattern.test(text))).toEqual(PRINTED.map(() => true))
  })

  it.each(PRINTED)('takes %s printing "%s" as a reached usage limit, wherever the line says it', (cli, text) => {
    expect(reachedUsageLimit(cli, text)).toBe(true)
    expect(reachedUsageLimit(cli, `${cli} 运行失败：${text}`)).toBe(true)
    expect(reachedUsageLimit(cli, `starting\n${text}\n`)).toBe(true)
  })

  it('takes any other failure, a usage warning included, as no reached limit', () => {
    expect(reachedUsageLimit('claude', "You've used 90% of your session limit · resets 3pm")).toBe(false)
    expect(reachedUsageLimit('claude', 'API Error: 500 Internal server error')).toBe(false)
    expect(reachedUsageLimit('codex', 'stream disconnected before completion')).toBe(false)
    expect(reachedUsageLimit('codex', '')).toBe(false)
  })

  it('a CLI can run a call only when installed, supported and signed in with the subscription', () => {
    expect(readiness({ cli: 'claude', installed: false })).toEqual({ kind: 'unavailable', message: '没有找到 claude 命令' })
    expect(readiness(installed({ missingFlags: ['--json-schema'] }))).toMatchObject({ kind: 'unsupported' })
    expect(readiness(installed({ signIn: 'other' }))).toEqual({ kind: 'signed-out', message: 'claude 没有用 Claude 订阅登录' })
    expect(readiness(installed({ cli: 'codex', signIn: 'other' }))).toEqual({ kind: 'signed-out', message: 'codex 没有用 ChatGPT 登录' })
    expect(readiness(installed({ signIn: 'signed-out' }))).toEqual({ kind: 'signed-out', message: 'claude 还没有登录' })
    expect(readiness(installed({ signIn: 'unknown' }))).toEqual({ kind: 'signed-out', message: '读不出 claude 的登录状态' })
    expect(readiness(installed())).toEqual({ binary: '/bin/claude' })
  })
})
