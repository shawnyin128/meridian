import { chat as zh } from '../zh/chat.js'

/** English counterpart of `zh/chat`. */
export const chat = {
  newChat: 'New chat',
  saveIdeaLabel: 'Save as idea',
  mentionGroup: { project: 'Projects', paper: 'Papers', page: 'Wiki' },
  conflictQuestion: 'Why do these two conclusions conflict?',
  quotePrefix: (quote: string) => `About this passage: “${quote}” `,
  composerPlaceholder: 'A question or an idea',
  mentionPickerHeading: 'Add context from a project, paper, or Wiki page',
  currentChat: 'This chat',
  ideaSavedNote: 'Idea saved — find it under “Research → Ideas”',
  recordedNote: (project: string) => `Added to the research log for “${project}”`,
  recordedTo: (project: string) => `This conclusion was added to the research log for “${project}”.`,
  archivedSuffix: (title: string) => `${title} · Archived`,
  paperChatLabel: 'Paper chat',
  expandPaperChat: 'Expand the paper chat',
  paperHeaderSuffix: ' · Paper chat',
  empty: 'No conversation yet',
  askAboutPaper: 'Ask about this paper',
  paperComposerPlaceholder: 'Ask about this paper, or note a related idea…',
  actionDone: 'Added to the research log',
  noModel: 'Connect an AI model in Settings to get an answer.',
} satisfies typeof zh
