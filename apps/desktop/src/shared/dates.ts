/** Number of milliseconds in one UTC day. */
export const D1 = 86400000

/** ISO date as an integer day so date comparisons stay timezone independent. */
export const dnum = (value: string) => Math.floor(Date.parse(`${value}T00:00:00Z`) / D1)

/** Inverse of `dnum`. */
export const isoOf = (day: number) => new Date(day * D1).toISOString().slice(0, 10)
