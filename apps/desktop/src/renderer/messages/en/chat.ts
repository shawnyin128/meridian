import { chat as zh } from '../zh/chat.js'

/** English counterpart of `zh/chat`. */
export const chat = {
  newChat: 'New chat',
  saveIdeaLabel: 'Save as idea',
  saveIdea: 'Turn this discussion into a research idea',
  saveIdeaDisabled: 'Start a discussion first',
  mentionGroup: { project: 'Projects', paper: 'Papers', page: 'Wiki' },
  conflictQuestion: 'Why do these two conclusions conflict?',
  quotePrefix: (quote: string) => `About this passage: “${quote}” `,
  quickMentionTitle: (group: string, meta: string) => `Add ${group} context: ${meta}`,
  composerPlaceholder: 'A question or an idea',
  mentionPickerHeading: 'Add context from a project, paper, or Wiki page',
  currentChat: 'This chat',
  ideaSavedNote: 'Idea saved — find it under “Research → Ideas”',
  recordedNote: (project: string) => `Added to the research log for “${project}”`,
  recordedTo: (project: string) => `This conclusion was added to the research log for “${project}”.`,
  archivedSuffix: (title: string) => `${title} · Archived`,
  paperChatLabel: 'Paper chat',
  paperHeader: (title: string) => `${title} · Paper chat`,
  paperEmpty: 'Ask a question or capture an idea. This conversation stays linked to the paper and is saved automatically.',
  askAboutPaper: 'Ask about this paper',
  paperComposerPlaceholder: 'Ask about this paper, or note a related idea…',
  actionDone: 'Added to the research log',
  noModel: 'Connect an AI model in Settings to get an answer.',
} satisfies typeof zh
