import { errors as zh } from '../zh/errors.js'

/** English counterpart of `zh/errors`. */
export const errors = {
  screen: {
    title: 'This screen could not be shown',
    note: 'Include this error when you report it',
    retry: 'Try again',
  },
} satisfies typeof zh
