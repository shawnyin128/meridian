import { ideas as zh } from '../zh/ideas.js'

/** English counterpart of `zh/ideas`. */
export const ideas = {
  title: 'Ideas',
  groups: {
    open: 'Not started',
    active: 'In progress',
    done: 'Done',
  },
  sort: 'Sort',
  sortUpdated: 'By updated',
  create: 'New idea',
  emptyGroup: { open: 'No unstarted ideas yet', active: 'No ideas in progress yet', done: 'No finished ideas yet' },
  byProject: { heading: 'Ideas by project', ideas: 'Ideas', active: 'In progress', done: 'Done' },
  sourceKind: { chat: 'Chat', paperReading: 'Paper notes' },
  link: {
    unavailable: 'Linked project unavailable',
    project: (name: string) => `Project · ${name}`,
    originalUnavailable: 'The original linked project is unavailable',
  },
  relation: { rows: { projects: 'Projects', pages: 'Wiki' }, candidate: 'Source', page: (title: string) => `Wiki · ${title}` },
  work: {
    heading: 'Carried out in',
    none: 'Not in a project',
    selectAriaLabel: (title: string) => `Carried out in: ${title}`,
    cleared: 'Idea taken out of the project',
    placed: 'Idea put into the project',
  },
  candidate: { dismiss: 'Dismiss', confirmed: 'Idea put at this node of its source project', dismissed: 'Node dismissed' },
  manage: (title: string) => `Manage idea: ${title}`,
  projectFinished: 'Project finished',
  updated: (date: string) => `Updated ${date}`,
  detailHeading: 'Idea details',
  bodyLabel: 'Idea',
  restoredNote: 'Idea restored',
  archivedNote: 'Idea archived',
  updatedNote: 'Idea updated',
  promote: {
    action: 'Convert to project',
    openProject: 'Open project',
    createdNote: 'Project created and linked to this idea',
  },
  openSourceChat: 'Open original chat',
  sourceChatDeleted: 'Chat deleted',
  editor: {
    sourceLabel: (source: string) => `Source: ${source}`,
    titleLabel: 'Title',
    titlePlaceholder: 'What problem does this idea solve?',
    bodyPlaceholder: 'Mechanism, hypothesis, or direction…',
  },
  nodeDraft: {
    nodeTitleLabel: 'Node title',
    afterLabel: 'Place after',
    newRootOption: 'Create as a root node',
  },
} satisfies typeof zh
