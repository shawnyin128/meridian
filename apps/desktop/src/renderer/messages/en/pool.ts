import { pool as zh } from '../zh/pool.js'

/** English counterpart of `zh/pool`. `satisfies` makes a missing, extra or re-parameterised key a compile error. */
export const pool = {
  heading: 'Resources',
  registered: 'Registered',
  addResource: 'Resource',
  addResourceLabel: 'Register a resource',
  namePlaceholder: 'Name',
  kinds: { gpu: 'GPU', machine: 'Machine' },
  amount: (n: number, kind: 'gpu' | 'machine') => (kind === 'gpu' ? `${n} GPU${n === 1 ? '' : 's'}` : `${n} machine${n === 1 ? '' : 's'}`),
  members: (n: number) => `${n} resources`,
  rules: 'Rules',
  habits: 'Usage habits',
  candidate: 'Candidate',
  add: 'Add',
  dismiss: 'Dismiss',
  rename: 'Rename',
  retire: 'Retire',
  free: (free: number, total: number) => `${free}/${total} free`,
  until: (time: string) => `until ${time}`,
  state: { running: 'Running', stale: 'Expired' },
  release: 'Release',
} satisfies typeof zh
