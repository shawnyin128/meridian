import { describe, expect, it } from 'vitest'
import { RefreshProgressRecordSchema } from '../../apps/desktop/src/core/vault/records.ts'
import { discoveryProgress, setAreas } from './projects.mjs'

/** A seed `call` that answers `project.update` the way an App does, recording each patch it takes. */
const app = ({ takesTopics }) => {
  const patches = []
  const call = async (method, { patch }) => {
    const known = takesTopics ? 'topics' : 'topic'
    // The seed's call rejects with the method and the App's CallRejection, as Playwright passes it on.
    if (Object.keys(patch).some((key) => key !== known)) throw new Error(`page.evaluate: Error: ${method}: {"reason":"invalid"}`)
    patches.push(patch)
  }
  return { call, patches }
}

describe('种子按 App 收不收 topics 写项目的领域', () => {
  it('收 topics 的 App:几个领域一次写全', async () => {
    const seed = {}
    const { call, patches } = app({ takesTopics: true })
    expect(await setAreas(seed, call, 'moe', ['混合专家', '推理加速'])).toEqual(['混合专家', '推理加速'])
    expect(patches).toEqual([{ topics: ['混合专家', '推理加速'] }])
    expect(seed.areas).toBe(true)
  })

  it('0.0.16.1 这样不收 topics 的 App:只写第一个领域到 topic,之后不再问', async () => {
    const seed = {}
    const { call, patches } = app({ takesTopics: false })
    expect(await setAreas(seed, call, 'spec', ['推理加速'])).toEqual(['推理加速'])
    expect(await setAreas(seed, call, 'moe', ['混合专家', '推理加速'])).toEqual(['混合专家'])
    expect(patches).toEqual([{ topic: '推理加速' }, { topic: '混合专家' }])
    expect(seed.areas).toBe(false)
  })

  it('已经收过 topics 的 App 又拒了一次:照实报错,不改写 topic', async () => {
    const seed = { areas: true }
    const call = async () => { throw new Error('project.update: {"reason":"invalid"}') }
    await expect(setAreas(seed, call, 'moe', ['混合专家', '混合专家'])).rejects.toThrow(/invalid/)
  })
})

describe('种子里 KV cache 项目的候选池', () => {
  it('按 App 存刷新进度的形状写,两篇候选都读得进来', () => {
    const records = discoveryProgress({ projects: { kv: { id: 'project-7' } } })
    expect(records.map((record) => RefreshProgressRecordSchema.safeParse(record).success)).toEqual([true])
    expect(records[0].candidates.map((paper) => paper.id)).toEqual(['2403.05527', '2402.12065'])
  })
})
