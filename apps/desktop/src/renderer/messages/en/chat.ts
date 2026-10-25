import { chat as zh } from '../zh/chat.js'

/** English counterpart of `zh/chat`. */
export const chat = {
  newChat: 'New chat',
  saveIdeaLabel: 'Save as idea',
  noModel: 'AI not connected',
  mentionGroup: { project: 'Projects', paper: 'Papers', page: 'Wiki' },
  conflictTitle: 'Conflicting findings',
  conflictQuestion: 'Why do these two findings conflict?',
  quotePrefix: (quote: string) => `About this passage: “${quote}” `,
  composerPlaceholder: 'A question or an idea',
  currentChat: 'This chat',
  ideaSavedNote: 'Idea saved',
  recordedNote: (project: string) => `Added to the research log for “${project}”`,
  archivedSuffix: (title: string) => `${title} · Archived`,
  paperChatLabel: 'Paper chat',
  expandPaperChat: 'Expand the paper chat',
  collapsePaperChat: 'Collapse the paper chat',
  paperChatWidth: 'Paper chat width',
  empty: 'No conversation yet',
  askAboutPaper: 'Ask about this paper',
  paperComposerPlaceholder: 'Ask about this paper, or note a related idea…',
  actionDone: 'Added to the research log',
} satisfies typeof zh
