// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResearchGraph, ResearchIdea } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { IdeaGraphDialog } from './IdeaGraphDialog.js'

const withMessages = (node: ReactNode) => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  return <MessagesProvider>{node}</MessagesProvider>
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const IDEA: ResearchIdea = {
  id: 'idea-1',
  title: '验证动态预算',
  body: '比较固定预算与动态预算。',
  source: { chatId: 'chat-1', chatTitle: '论文讨论' },
  project: 'project-1',
  archived: false,
  created: '2026-09-17',
  updated: '2026-09-18',
}

const GRAPH: ResearchGraph = {
  nodes: [{
    id: 'node-1', label: '现有节点', state: 'act', x: 12, y: 12, width: 120, writebacks: [],
  }],
  edges: [],
}

describe('IdeaGraphDialog', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => act(() => root.unmount()))

  it('creates a node from the idea title only after confirmation', async () => {
    const submit = vi.fn(async () => true)
    await act(async () => {
      root.render(withMessages(
        <IdeaGraphDialog
          open mode="create" idea={IDEA} graph={GRAPH}
          onOpenChange={() => {}}
          onSubmit={submit}
        />,
      ))
    })
    expect(document.querySelector<HTMLInputElement>('input')?.value).toBe(IDEA.title)
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === '创建并关联')!.click()
      await Promise.resolve()
    })
    expect(submit).toHaveBeenCalledWith({
      kind: 'create', label: IDEA.title, after: null,
    })
  })

  it('links an existing node through the same explicit confirmation surface', async () => {
    const submit = vi.fn(async () => true)
    await act(async () => {
      root.render(withMessages(
        <IdeaGraphDialog
          open mode="link" idea={IDEA} graph={GRAPH}
          onOpenChange={() => {}}
          onSubmit={submit}
        />,
      ))
    })
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === '确认关联')!.click()
      await Promise.resolve()
    })
    expect(submit).toHaveBeenCalledWith({ kind: 'link', nodeId: 'node-1' })
  })
})
