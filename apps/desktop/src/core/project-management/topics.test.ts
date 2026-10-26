import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_TOPIC } from '../../shared/vocabulary.js'
import { servedTopics, storedTopics, titledTopics, topicPinsOf, topicScopeOf, type TopicPages } from './topics.js'

const PAGES: TopicPages = new Map([
  ['topics/spec', { title: '推测解码', parents: [] }],
  ['topics/trees', { title: '树形草稿', parents: ['topics/spec'] }],
  ['topics/wide', { title: '宽树', parents: ['topics/trees'] }],
  ['topics/kv', { title: 'KV cache', parents: [] }],
])

describe('项目的主题', () => {
  it('钉住的页按它现在的标题给出;改了名的主题页跟着新名字', () => {
    const project = { topic: '推测', topicPins: [{ page: 'topics/spec', title: '推测' }] }
    expect(servedTopics(project, PAGES)).toEqual({ topic: '推测解码', topicPages: ['topics/spec'] })
  })

  it('旧版 App 加的标题没有钉住的页,按名字对上同名的主题页,大小写与空白不计', () => {
    const project = { topic: '推测', topics: ['推测', 'kv  CACHE'], topicPins: [{ page: 'topics/spec', title: '推测' }] }
    expect(servedTopics(project, PAGES)).toEqual({
      topic: '推测解码', topics: ['推测解码', 'KV cache'], topicPages: ['topics/spec', 'topics/kv'],
    })
  })

  it('旧版 App 去掉的标题,它的页也不再算这个项目的主题', () => {
    const project = { topic: 'KV cache', topicPins: [{ page: 'topics/spec', title: '推测' }, { page: 'topics/kv', title: 'KV cache' }] }
    expect(topicPinsOf(project, PAGES)).toEqual([{ title: 'KV cache', page: 'topics/kv' }])
  })

  it('没有主题页的标题原样给出,对应的页是 null;新项目的默认值是没有主题', () => {
    expect(servedTopics({ topic: '低比特量化' }, PAGES)).toEqual({ topic: '低比特量化', topicPages: [null] })
    expect(servedTopics({ topic: DEFAULT_PROJECT_TOPIC }, PAGES)).toEqual({ topic: DEFAULT_PROJECT_TOPIC })
  })

  it('钉住的页在垃圾桶里:项目不显示这个主题,存的照旧;改主题时它留在存的里面', () => {
    const project = {
      topic: '推测', topics: ['推测', 'KV cache'],
      topicPins: [{ page: 'topics/gone', title: '推测' }, { page: 'topics/kv', title: 'KV cache' }],
    }
    expect(servedTopics(project, PAGES)).toEqual({ topic: 'KV cache', topicPages: ['topics/kv'] })
    expect(storedTopics(titledTopics(['KV cache', '宽树'], PAGES), project, PAGES)).toEqual({
      topic: 'KV cache', topics: ['KV cache', '宽树', '推测'],
      topicPins: [{ page: 'topics/kv', title: 'KV cache' }, { page: 'topics/wide', title: '宽树' }, { page: 'topics/gone', title: '推测' }],
    })
  })

  it('一个主题的范围是它自己的页和它上面的每一层', () => {
    expect(topicScopeOf(['topics/wide', 'topics/kv'], PAGES)).toEqual(['topics/wide', 'topics/trees', 'topics/spec', 'topics/kv'])
  })
})
