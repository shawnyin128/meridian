import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ServiceConnectionStatus, ServiceError } from './ServiceCard.js'

describe('ServiceCard', () => {
  it('写服务卡片的错误时用共享的错误行', () => {
    expect(renderToStaticMarkup(<ServiceError>没能保存密钥</ServiceError>))
      .toBe('<div class="inline-message inline-message--line inline-message--error service-error" role="alert">'
        + '<div class="inline-message-text">没能保存密钥</div></div>')
  })

  it('连接成功是一行完成的提示,连接失败是带详情的错误行', () => {
    expect(renderToStaticMarkup(<ServiceConnectionStatus state="connected" message="连接成功" detail="HTTP 200" detailLabel="详情" />))
      .toBe('<div class="inline-message inline-message--line inline-message--done service-connection-status" role="status">'
        + '<div class="inline-message-text"><div>连接成功</div></div></div>')
    expect(renderToStaticMarkup(<ServiceConnectionStatus state="failed" message="认证失败" detail="HTTP 401" detailLabel="详情" />))
      .toBe('<div class="inline-message inline-message--line inline-message--error service-connection-status" role="alert">'
        + '<div class="inline-message-text"><div>认证失败</div><div class="service-connection-detail">详情: HTTP 401</div></div></div>')
  })
})
