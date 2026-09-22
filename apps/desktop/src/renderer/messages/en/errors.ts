import { errors as zh } from '../zh/errors.js'

/** English counterpart of `zh/errors`. */
export const errors = {
  screen: {
    title: 'This screen could not be shown',
    note: 'The rest of the app still works. Try again, and if it keeps failing, include the error below in your report.',
    retry: 'Try again',
  },
} satisfies typeof zh
