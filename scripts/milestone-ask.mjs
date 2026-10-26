/**
 * PreToolUse hook for Bash: asks the user before a command that changes a GitHub milestone, since
 * milestones are the owner's (.github/MILESTONE_MANAGERS) and agents act through the owner's login.
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const REASON = 'Milestones are the owner\'s: only the accounts in .github/MILESTONE_MANAGERS change them, and an agent only when the owner asked.'

/**
 * Whether shell command `command` changes a milestone through gh: a gh issue or pr create or edit
 * that sets or removes one, or a gh api write to a milestones path or to an issue's milestone field.
 * @param {string} command
 * @returns {boolean}
 */
export function changesMilestone(command) {
  return command.split(/&&|\|\||;|\||\n/).some((part) => {
    const segment = ` ${part.trim()} `
    if (!/\sgh\s/.test(segment)) return false
    if (/\sgh\s+(issue|pr)\s+(create|edit)\s/.test(segment)) return /\s--(remove-)?milestone(\s|=)/.test(segment)
    if (!/\sgh\s+api\s/.test(segment) || /\s(-X|--method)[\s=]+GET\s/i.test(segment)) return false
    const writes = /\s(-X|--method)[\s=]+(POST|PATCH|PUT|DELETE)\s/i.test(segment) || /\s(-f|-F|--field|--raw-field)[\s=]/.test(segment)
    return writes && (/\/milestones(\/|\s|\?)/.test(segment) || /\s(-f|-F|--field|--raw-field)[\s=]+milestone=/.test(segment))
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  if (input.tool_name === 'Bash' && changesMilestone(String(input.tool_input?.command ?? ''))) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: REASON },
    }))
  }
}
