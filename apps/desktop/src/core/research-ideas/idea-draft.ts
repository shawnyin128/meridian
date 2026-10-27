import { createHash } from 'node:crypto'
import type { ChatIdeaPreview, IdeaDraft, ResearchIdea } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { VaultStore } from '../vault.js'
import { chatProject } from './design.js'

/** The idea draft of answer `messageId` of chat `chatId`; throws `not-found` when it holds none. */
function draftOf(store: VaultStore, chatId: string, messageId: string): IdeaDraft {
  const message = store.chatMessages(chatId).find((held) => held.id === messageId)
  if (message?.idea === undefined) throw new CallError('not-found', `这条回答没有想法草稿：${messageId}`)
  return message.idea
}

/**
 * The rounds of chat `chatId`, each a question and what follows it until the next, that the messages
 * `sources` name fall in, in order, each once; a message before the first question is in round 1.
 */
function roundsOf(store: VaultStore, chatId: string, sources: readonly string[]): number[] {
  const named = new Set(sources)
  const rounds = new Set<number>()
  let round = 0
  for (const message of store.chatMessages(chatId)) {
    if (message.role === 'you') round += 1
    if (named.has(message.id)) rounds.add(Math.max(round, 1))
  }
  return [...rounds]
}

/**
 * What saving the idea draft of answer `messageId` of chat `chatId` as an idea writes, with `title`
 * and `body` as the user left them: the idea and the project it relates to, the chat it comes from,
 * the rounds of that chat the draft came from, the fingerprint of all of it, and the idea the draft
 * was saved as, if it was. Throws `not-found` when the answer holds no idea draft.
 */
export function ideaPreview(store: VaultStore, chatId: string, messageId: string, title: string, body: string): ChatIdeaPreview {
  const draft = draftOf(store, chatId, messageId)
  const shown = {
    idea: { title, body, project: chatProject(store, chatId) },
    chat: store.chatSession(chatId).title,
    rounds: roundsOf(store, chatId, draft.sources),
  }
  return {
    ...shown,
    fingerprint: createHash('sha256').update(JSON.stringify(shown)).digest('hex').slice(0, 16),
    saved: draft.saved ?? null,
  }
}

/**
 * Saves the idea draft of answer `messageId` of chat `chatId` with `title` and `body` as an idea from
 * that chat, related to the project the preview names, and records the draft as saved, as one write.
 * Rejects with `refused` when `fingerprint` is not that of the preview as it stands or the draft was
 * saved already, and with `not-found` when the answer holds no idea draft.
 */
export function saveIdeaDraft(
  store: VaultStore, chatId: string, messageId: string, title: string, body: string, fingerprint: string,
): ResearchIdea {
  const preview = ideaPreview(store, chatId, messageId, title, body)
  if (preview.fingerprint !== fingerprint) throw new CallError('refused', '想法在确认之后变了，请重新查看')
  if (preview.saved !== null) throw new CallError('refused', '这个想法已经保存')
  return store.atomically(() => {
    const created = store.createIdea(chatId, preview.idea.title, preview.idea.body)
    const idea = preview.idea.project === null ? created
      : store.updateIdea(created.id, { relations: { projects: [preview.idea.project.id], pages: [] } })
    store.markIdeaDraftSaved(chatId, messageId, idea.id)
    return idea
  })
}
