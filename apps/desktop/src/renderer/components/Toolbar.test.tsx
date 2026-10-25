// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ActionPopover } from './ActionPopover.js'
import { AddAction } from './AddAction.js'
import { ChoicePicker } from './FieldPickers.js'
import { IconButton } from './IconButton.js'
import { RowActions } from './Item.js'
import { ToggleGroup, ToggleItem, Toolbar, ToolbarButton } from './Toolbar.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('Toolbar', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  /** The elements a Tab press can land on, in document order. */
  const tabStops = () => [...host.querySelectorAll<HTMLElement>('*')]
    .filter((element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled)
  const focused = () => document.activeElement!.getAttribute('aria-label') ?? document.activeElement!.textContent
  /** Presses `key` on the focused element; Radix moves the roving focus on the next task. */
  const press = async (key: string) => {
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      await new Promise((done) => setTimeout(done, 0))
    })
  }

  it('是一个 Tab 停靠点：进来先到第一个控件，方向键在控件之间走，Home 与 End 到两头', async () => {
    act(() => root.render(
      <Toolbar label="缩放">
        <div className="zoom">
          <IconButton label="缩小"><span /></IconButton>
          <ToolbarButton>100%</ToolbarButton>
          <IconButton label="放大"><span /></IconButton>
        </div>
      </Toolbar>,
    ))
    const group = host.querySelector<HTMLElement>('.zoom')!
    expect([group.getAttribute('role'), group.getAttribute('aria-label')]).toEqual(['toolbar', '缩放'])
    expect(tabStops()).toEqual([group])
    await act(async () => { group.focus() })
    expect(focused()).toBe('缩小')
    await press('ArrowRight')
    expect(focused()).toBe('100%')
    await press('End')
    expect(focused()).toBe('放大')
    await press('Home')
    expect(focused()).toBe('缩小')
  })

  it('同方向的工具栏里再套一层不多占一站：里面的控件并进外面那一组', async () => {
    act(() => root.render(
      <Toolbar label="一行">
        <div className="row">
          <ToolbarButton>打开</ToolbarButton>
          <RowActions><IconButton label="删除"><span /></IconButton></RowActions>
        </div>
      </Toolbar>,
    ))
    expect(tabStops()).toEqual([host.querySelector('.row')])
    expect(host.querySelector('.row-actions')!.getAttribute('role')).toBeNull()
    await act(async () => { host.querySelector<HTMLElement>('.row')!.focus() })
    await press('ArrowRight')
    expect(focused()).toBe('删除')
  })

  it('行尾的操作槽单独是一个工具栏，槽里的操作用方向键切换', async () => {
    act(() => root.render(
      <RowActions><IconButton label="恢复"><span /></IconButton><IconButton label="彻底删除"><span /></IconButton></RowActions>,
    ))
    const slot = host.querySelector<HTMLElement>('.row-actions')!
    expect(slot.getAttribute('role')).toBe('toolbar')
    expect(tabStops()).toEqual([slot])
    await act(async () => { slot.focus() })
    await press('ArrowRight')
    expect(focused()).toBe('彻底删除')
  })

  it('单独的一组开关是一个 Tab 停靠点，进来落在选中的那个；放进工具栏后开关并进工具栏', async () => {
    const stars = (
      <ToggleGroup label="评分" value="2" onValueChange={() => undefined} className="stars">
        {['1', '2', '3'].map((star) => <ToggleItem key={star} value={star} aria-label={`${star} 星`}>★</ToggleItem>)}
      </ToggleGroup>
    )
    act(() => root.render(stars))
    const group = host.querySelector<HTMLElement>('.stars')!
    expect(tabStops()).toEqual([group])
    await act(async () => { group.focus() })
    expect(focused()).toBe('2 星')

    act(() => root.render(<Toolbar label="一行"><div className="row"><ToolbarButton>打开</ToolbarButton>{stars}</div></Toolbar>))
    expect(tabStops()).toEqual([host.querySelector('.row')])
    await act(async () => { host.querySelector<HTMLElement>('.row>button')!.focus() })
    await press('ArrowRight')
    expect(focused()).toBe('1 星')
  })

  it('从工具栏里打开的浮层不属于这个工具栏：浮层里的图标按钮仍各是 Tab 停靠点', () => {
    act(() => root.render(
      <Toolbar label="一行">
        <div className="row">
          <ActionPopover open trigger={<ToolbarButton>日期</ToolbarButton>}>
            <IconButton label="上个月"><span /></IconButton>
            <IconButton label="下个月"><span /></IconButton>
          </ActionPopover>
        </div>
      </Toolbar>,
    ))
    const months = ['上个月', '下个月'].map((name) => document.body.querySelector<HTMLElement>(`[aria-label="${name}"]`)!)
    expect(months.map((button) => button.tabIndex)).toEqual([0, 0])
  })

  it('在工具栏外面，图标按钮、添加和选择器的触发按钮各是自己的 Tab 停靠点', () => {
    act(() => root.render(
      <div>
        <IconButton label="删除"><span /></IconButton>
        <AddAction size="chip" label="添加主题" />
        <ChoicePicker value="未读" options={['未读', '在读']} onPick={() => undefined} aria-label="状态" />
      </div>,
    ))
    expect(tabStops().map((element) => element.getAttribute('aria-label'))).toEqual(['删除', '添加主题', '状态'])
  })
})
