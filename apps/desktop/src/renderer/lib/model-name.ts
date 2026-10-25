import type { ChatAnswerModel, HarnessCli } from '../../shared/contract.js'

/** The product names of the subscription CLIs. */
const CLI_NAMES: Record<HarnessCli, string> = { claude: 'Claude Code', codex: 'Codex' }
const CLAUDE_FAMILIES = new Set(['opus', 'sonnet', 'haiku', 'fable'])
/** The words after a GPT version that name a size or a variant of the model, written as OpenAI writes them. */
const GPT_VARIANTS: Readonly<Record<string, string>> = { mini: 'mini', nano: 'nano', pro: 'Pro', codex: 'Codex' }

const capital = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

/**
 * The name model `id` shows by: a Claude, GPT or Gemini model id written the way its maker names the
 * model (`claude-opus-5-5[1m]` as Claude Opus 5.5, `gpt-6.1-sol` as GPT-6.1), and any other id as it
 * is.
 */
export function modelDisplayName(id: string): string {
  const bare = id.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')
  if (CLAUDE_FAMILIES.has(bare)) return `Claude ${capital(bare)}`
  const claude = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/.exec(bare)
  if (claude !== null && CLAUDE_FAMILIES.has(claude[1]!)) {
    return `Claude ${capital(claude[1]!)} ${claude[2]}${claude[3] === undefined ? '' : `.${claude[3]}`}`
  }
  const older = /^claude-(\d+)(?:-(\d+))?-([a-z]+)$/.exec(bare)
  if (older !== null && CLAUDE_FAMILIES.has(older[3]!)) {
    return `Claude ${capital(older[3]!)} ${older[1]}${older[2] === undefined ? '' : `.${older[2]}`}`
  }
  const gpt = /^gpt-(\d+(?:\.\d+)?)((?:-[a-z0-9]+)*)$/.exec(bare)
  if (gpt !== null) {
    const variants = gpt[2]!.split('-').flatMap((word) => GPT_VARIANTS[word] ?? [])
    return [`GPT-${gpt[1]}`, ...variants].join(' ')
  }
  const gemini = /^gemini-(\d+(?:\.\d+)?)-([a-z]+(?:-[a-z]+)*)$/.exec(bare)
  if (gemini !== null) return `Gemini ${gemini[1]} ${gemini[2]!.split('-').map(capital).join('-')}`
  return id
}

/** The name an AI answer shows its model by: the model's, or the CLI's when it ran its own default and named none. */
export function modelName(model: ChatAnswerModel): string {
  if (model.route === 'api') return modelDisplayName(model.id)
  return model.id === undefined ? CLI_NAMES[model.cli] : modelDisplayName(model.id)
}
