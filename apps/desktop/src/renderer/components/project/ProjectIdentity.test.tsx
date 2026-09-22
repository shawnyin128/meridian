// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectIdentity, ProjectIdentityFields } from './ProjectIdentity.js'

const project = { name: '校准实验', status: '进行中' as const, priority: 'p1' as const, topic: 'decoding' }

describe('ProjectIdentity', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('按参数调整密度但保持统一字段顺序', () => {
    const header = renderToStaticMarkup(<ProjectIdentity project={project} showTopic />)
    expect(header.indexOf('校准实验')).toBeLessThan(header.indexOf('进行中'))
    expect(header.indexOf('进行中')).toBeLessThan(header.indexOf('P1'))
    expect(header.indexOf('P1')).toBeLessThan(header.indexOf('decoding'))
    const row = renderToStaticMarkup(
      <ProjectIdentity project={project} variant="row" showPriority={false} />,
    )
    expect(row).not.toContain('P1')
  })

  it('属性面板允许注入编辑控件而不改变字段次序', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider>
        <ProjectIdentityFields project={project} fields={{ name: <button>改名</button> }} />
      </MessagesProvider>,
    )
    expect(html.indexOf('名称')).toBeLessThan(html.indexOf('改名'))
    expect(html.indexOf('改名')).toBeLessThan(html.indexOf('状态'))
  })
})
