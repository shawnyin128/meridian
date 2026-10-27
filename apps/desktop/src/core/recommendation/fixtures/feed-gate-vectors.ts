import { gateId } from './feed-gate.js'

/** SPECTER2 vectors as `outputs/review/v0.0.23.0/feed/capture-vectors.mjs` writes them, by batch id. */
export type CapturedVectors = { model: string; capturedAt: string; vectors: Record<string, number[]> }

/**
 * SLOT FOR FROZEN REAL VECTORS. Null until a capture run with the owner's OK fills it: run
 * `capture-vectors.mjs --ids <GATE_PAPER_IDS, one per line> --out <file>` and paste the file's `model`,
 * `capturedAt` and `vectors` here. While it is null the gate's API path runs on `stubVectors`.
 */
export const FROZEN_SPECTER2: CapturedVectors | null = null

const DIMENSIONS = 768
type Topic = 'speculative' | 'onPolicy' | 'distillation' | 'quantization' | 'diffusion' | 'graphs' | 'security' | 'quantum'

/** How much of each subject the stub vector of each gate paper carries, by arXiv id. */
const SUBJECTS: Record<string, Partial<Record<Topic, number>>> = {
  '2605.29343': { speculative: 0.6, onPolicy: 0.8 },
  '2604.14084': { onPolicy: 1, distillation: 0.3 },
  '2605.26844': { onPolicy: 1, distillation: 0.3 },
  '2510.15982': { distillation: 1, onPolicy: 0.2 },
  '2505.04560': { distillation: 1 },
  '2609.09338': { speculative: 1, onPolicy: 0.2 },
  '2310.08461': { speculative: 0.8, distillation: 0.6, onPolicy: 0.4 },
  '2310.07177': { speculative: 0.9, onPolicy: 0.4 },
  '2401.15077': { speculative: 1 },
  '2401.10774': { speculative: 0.9 },
  '2211.17192': { speculative: 1 },
  '1801.01203': { security: 1 },
  '1801.01207': { security: 1 },
  '2306.13649': { onPolicy: 1, distillation: 0.6 },
  '2306.08543': { distillation: 1, onPolicy: 0.3 },
  '2402.03898': { distillation: 1, onPolicy: 0.3 },
  '1503.02531': { distillation: 1 },
  '1910.01108': { distillation: 0.8 },
  'quant-ph/9511027': { quantum: 1 },
  'quant-ph/9604024': { quantum: 1 },
  ...Object.fromEntries(['2210.17323', '2306.00978', '2211.10438', '2208.07339', '2404.00456', '2305.14314'].map((id) => [id, { quantization: 1 }])),
  ...Object.fromEntries(['2006.11239', '2010.02502', '2112.10752', '2011.13456', '2207.12598'].map((id) => [id, { diffusion: 1 }])),
  ...Object.fromEntries(['1609.02907', '1710.10903', '1706.02216', '1704.01212'].map((id) => [id, { graphs: 1 }])),
}

/** A deterministic generator of numbers in [-0.5, 0.5), seeded by `text`. */
const generator = (text: string) => {
  let state = [...text].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16_777_619) >>> 0, 2_166_136_261)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296 - 0.5
  }
}

const direction = (name: string): number[] => {
  const next = generator(name)
  return Array.from({ length: DIMENSIONS }, next)
}

/**
 * Stub SPECTER2-shaped vectors of every gate paper, by batch id: 768 numbers each, an offset every
 * paper shares, as real SPECTER2 vectors have, plus each subject's direction weighted by how much of it
 * the paper carries, plus noise of its own.
 */
export function stubVectors(): Record<string, number[]> {
  const shared = direction('shared')
  const topics = new Map<string, number[]>()
  const topic = (name: string): number[] => {
    if (!topics.has(name)) topics.set(name, direction(name))
    return topics.get(name)!
  }
  return Object.fromEntries(Object.entries(SUBJECTS).map(([arxiv, mix]) => {
    const noise = generator(arxiv)
    const vector = shared.map((value) => 1.5 * value + 0.35 * noise())
    for (const [name, weight] of Object.entries(mix)) topic(name).forEach((value, at) => { vector[at]! += weight * value })
    return [gateId(arxiv), vector]
  }))
}
