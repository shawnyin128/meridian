import { describe, expect, it } from 'vitest'
import { DEFAULT_WINDOW, placeWindow, readWindowState } from './window-state.js'

const LAPTOP = { x: 0, y: 25, width: 1512, height: 920 }
const LEFT_MONITOR = { x: -2560, y: 0, width: 2560, height: 1415 }

describe('readWindowState', () => {
  it('读出上次关窗时的位置、大小和是否最大化,别的键不管', () => {
    expect(readWindowState('{"x":10,"y":40,"width":1200,"height":800,"maximized":false,"later":1}'))
      .toEqual({ x: 10, y: 40, width: 1200, height: 800, maximized: false })
  })

  it('不是 JSON、缺一项、类型不对或大小不为正时读不出', () => {
    for (const text of [
      '', 'not json', 'null', '[]', '{"x":1,"y":2,"width":3,"height":4}',
      '{"x":"1","y":2,"width":3,"height":4,"maximized":false}',
      '{"x":1,"y":2,"width":0,"height":4,"maximized":false}',
      '{"x":1,"y":2,"width":3,"height":4,"maximized":"no"}',
    ]) expect([text, readWindowState(text)]).toEqual([text, null])
  })
})

describe('placeWindow', () => {
  it('没存过时用默认大小,不给位置,由系统居中', () => {
    expect(placeWindow(null, [LAPTOP])).toEqual(DEFAULT_WINDOW)
  })

  it('存下的位置还在某块屏上时原样放回,副屏在左边的负坐标也算', () => {
    expect(placeWindow({ x: 40, y: 60, width: 1200, height: 800, maximized: false }, [LAPTOP]))
      .toEqual({ x: 40, y: 60, width: 1200, height: 800 })
    expect(placeWindow({ x: -2400, y: 100, width: 1600, height: 1000, maximized: true }, [LAPTOP, LEFT_MONITOR]))
      .toEqual({ x: -2400, y: 100, width: 1600, height: 1000 })
  })

  it('那块屏拔掉了、标题栏开头落在屏外时不给位置,大小不超过最大的那块屏', () => {
    expect(placeWindow({ x: -2400, y: 100, width: 2400, height: 1300, maximized: false }, [LAPTOP]))
      .toEqual({ width: 1512, height: 920 })
    expect(placeWindow({ x: 1480, y: 60, width: 800, height: 600, maximized: false }, [LAPTOP]))
      .toEqual({ width: 800, height: 600 })
    expect(placeWindow({ x: 40, y: 0, width: 800, height: 600, maximized: false }, [LAPTOP]))
      .toEqual({ width: 800, height: 600 })
  })
})
