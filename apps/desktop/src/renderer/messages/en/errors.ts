import { errors as zh } from '../zh/errors.js'

/** English counterpart of `zh/errors`. */
export const errors = {
  screen: {
    title: 'This screen could not be shown',
    retry: 'Try again',
  },
} satisfies typeof zh
