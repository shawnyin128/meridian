// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { CallError } from '../call-error.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { useScreenLoad, type ScreenLoad } from './useScreenLoad.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A call the test answers or fails by hand. */
function deferred<T>() {
  let answer: (value: T) => void = () => {}
  let fail: (cause: unknown) => void = () => {}
  const call = new Promise<T>((resolve, reject) => { answer = resolve; fail = reject })
  return { call, answer: (value: T) => act(async () => { answer(value) }), fail: (cause: unknown) => act(async () => { fail(cause) }) }
}

/** Renders nothing; hands the hook from the latest render to the test. */
function Probe({ sections, onRender }: { sections?: readonly string[] | undefined; onRender: (screen: ScreenLoad) => void }) {
  onRender(useScreenLoad(sections))
  return null
}

/** Mounts the probe, with the section keys `sections` when given, and returns the hook as last rendered. */
function mount(sections?: readonly string[]): () => ScreenLoad {
  const host = document.createElement('div')
  document.body.append(host)
  let screen: ScreenLoad | undefined
  act(() => { createRoot(host).render(<MessagesProvider><Probe sections={sections} onRender={(held) => { screen = held }} /></MessagesProvider>) })
  return () => screen!
}

const newer = new CallError('trash.list', 'newer-version')
const notFound = new CallError('papers.get', 'not-found')

describe('useScreenLoad', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  it('读取失败时报出原因的标签，同一个读取下次成功就清掉', async () => {
    const screen = mount()
    const first = deferred<string>()
    act(() => { screen().load('rows', first.call, () => {}) })
    await first.fail(newer)
    expect(screen().error).toBe('需要更新 App')

    const shown: string[] = []
    const second = deferred<string>()
    act(() => { screen().load('rows', second.call, (value) => shown.push(value)) })
    expect(screen().error).toBe('需要更新 App')
    await second.answer('第二次')
    expect([screen().error, shown]).toEqual([null, ['第二次']])
  })

  it('晚到的旧回答不顶替新的，旧的失败也不上屏', async () => {
    const screen = mount()
    const shown: string[] = []
    const older = deferred<string>()
    const later = deferred<string>()
    act(() => { screen().load('rows', older.call, (value) => shown.push(value)) })
    act(() => { screen().load('rows', later.call, (value) => shown.push(value)) })
    await later.answer('新的')
    await older.answer('旧的')
    expect(shown).toEqual(['新的'])

    const failing = deferred<string>()
    act(() => { screen().load('rows', failing.call, (value) => shown.push(value)) })
    act(() => { screen().load('rows', Promise.resolve('最新'), (value) => shown.push(value)) })
    await failing.fail(newer)
    expect([screen().error, shown]).toEqual([null, ['新的', '最新']])
  })

  it('一个读取成功不清掉另一个仍失败的读取；横幅报最近的那次失败', async () => {
    const screen = mount()
    act(() => { screen().load('home', Promise.reject(newer), () => {}) })
    await act(async () => {})
    act(() => { screen().load('page', Promise.reject(notFound), () => {}) })
    await act(async () => {})
    expect(screen().error).toBe('这一项已不存在')

    act(() => { screen().load('page', Promise.resolve('页面'), () => {}) })
    await act(async () => {})
    expect(screen().error).toBe('需要更新 App')
  })

  it('report 的失败留到它之后开始的读取成功，之前就在途的读取成功不清它', async () => {
    const screen = mount()
    const inFlight = deferred<string>()
    act(() => { screen().load('rows', inFlight.call, () => {}) })
    act(() => { screen().report(notFound) })
    await inFlight.answer('在途的')
    expect(screen().error).toBe('这一项已不存在')

    act(() => { screen().load('rows', Promise.resolve('之后的'), () => {}) })
    await act(async () => {})
    expect(screen().error).toBeNull()
  })

  it('清理掉的读取不再生效；同一处不再读这一项时它的失败也清掉，接着再读时失败留到新的结果', async () => {
    const screen = mount()
    act(() => { screen().load('detail', Promise.reject(notFound), () => {}) })
    await act(async () => {})
    const shown: string[] = []
    const pending = deferred<string>()
    let drop = () => {}
    act(() => { drop = screen().load('detail', pending.call, (value) => shown.push(value)) })
    expect(screen().error).toBe('这一项已不存在')

    await act(async () => { drop() })
    await pending.answer('关掉之后才到')
    expect([screen().error, shown]).toEqual([null, []])

    act(() => { drop = screen().load('detail', Promise.reject(notFound), () => {}) })
    await act(async () => {})
    const next = deferred<string>()
    await act(async () => {
      drop()
      screen().load('detail', next.call, (value) => shown.push(value))
    })
    expect(screen().error).toBe('这一项已不存在')
    await next.answer('重新读到的')
    expect([screen().error, shown]).toEqual([null, ['重新读到的']])
  })

  it('一节自己的读取失败写在那一节里：屏头的错误不算它，按键取得到它，下次读成功就清掉', async () => {
    const screen = mount(['ideas'])
    act(() => { screen().load('ideas', Promise.reject(newer), () => {}) })
    await act(async () => {})
    expect([screen().error, screen().failure('ideas')]).toEqual([null, '需要更新 App'])

    act(() => { screen().load('project', Promise.reject(notFound), () => {}) })
    await act(async () => {})
    expect([screen().error, screen().failure('ideas'), screen().failure('project')])
      .toEqual(['这一项已不存在', '需要更新 App', '这一项已不存在'])

    act(() => { screen().load('ideas', Promise.resolve('想法'), () => {}) })
    await act(async () => {})
    expect(screen().failure('ideas')).toBeNull()
  })
})
