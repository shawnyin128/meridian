import type { CallFailure, HarnessCli } from '../../../shared/contract.js'
import type { CliFailureKind } from './child.js'
import type { CliDiscovery } from './discovery.js'

/** Why a CLI cannot run a call on the user's subscription, in the kind and words its call fails with. */
export type CliUnready = { kind: 'unavailable' | 'unsupported' | 'signed-out'; message: string }

/**
 * How each CLI words the error it reports once the user's plan has no usage left: the limit messages
 * Claude Code 2.1.280 lists for itself, and the usage-limit errors of Codex CLI 0.163.0. Either
 * apostrophe matches, as Codex prints a curly one.
 */
export const USAGE_LIMIT_MESSAGES: readonly { cli: HarnessCli; pattern: RegExp }[] = [
  { cli: 'claude', pattern: /You['’]ve hit your / },
  { cli: 'claude', pattern: /You['’]ve reached your / },
  { cli: 'claude', pattern: /You['’]re out of usage credits/ },
  { cli: 'claude', pattern: /You['’]re out of extra usage/ },
  { cli: 'claude', pattern: /Your org is out of usage/ },
  { cli: 'codex', pattern: /You['’]ve hit your usage limit/ },
  { cli: 'codex', pattern: /You hit your spend cap/ },
  { cli: 'codex', pattern: /Your workspace is out of credits/ },
  { cli: 'codex', pattern: /Quota exceeded\. Check your plan and billing details/ },
]

/** The reason a contract call fails with when its CLI call failed as `kind`; any other failure is a failed model call. */
export const CLI_CALL_FAILURES = {
  unavailable: 'cli-missing',
  unsupported: 'cli-unsupported',
  'signed-out': 'cli-signed-out',
  'usage-limit': 'usage-limit',
  timeout: 'cli-timeout',
  cancelled: 'cancelled',
  failed: 'model',
} as const satisfies Record<CliFailureKind, CallFailure>

/** Whether `text`, what `cli` reported or printed to stderr for a failed call, says the plan's usage limit is reached. */
export function reachedUsageLimit(cli: HarnessCli, text: string): boolean {
  return USAGE_LIMIT_MESSAGES.some((message) => message.cli === cli && message.pattern.test(text))
}

/**
 * The binary of `found` when it can run a call on the user's subscription: installed, its help
 * listing every flag the runner passes, and signed in with the subscription. Otherwise why not; a
 * sign-in that cannot be read is not taken for the subscription.
 */
export function readiness(found: CliDiscovery): { binary: string } | CliUnready {
  if (!found.installed) return { kind: 'unavailable', message: `没有找到 ${found.cli} 命令` }
  if (found.missingFlags.length > 0) {
    return { kind: 'unsupported', message: `这个版本的 ${found.cli} 不支持 Meridian 需要的选项，请更新` }
  }
  switch (found.signIn) {
    case 'subscription':
      return { binary: found.binary }
    case 'other':
      return {
        kind: 'signed-out', message: found.cli === 'claude' ? 'claude 没有用 Claude 订阅登录' : 'codex 没有用 ChatGPT 登录',
      }
    case 'signed-out':
      return { kind: 'signed-out', message: `${found.cli} 还没有登录` }
    case 'unknown':
      return { kind: 'signed-out', message: `读不出 ${found.cli} 的登录状态` }
  }
}
