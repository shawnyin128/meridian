export const HARNESS_PROTOCOL_VERSION = 'meridian.harness.v1'
export const HARNESS_CAPABILITIES = ['paper-wiki', 'chat', 'model-check'] as const

export type HarnessCapability = typeof HARNESS_CAPABILITIES[number]

export type HarnessReadyData = {
  protocol: string
  capabilities: string[]
}

export const HARNESS_ERROR_KINDS = [
  'bad_request', 'no_model', 'model_error', 'cancelled', 'harness_gone', 'internal',
] as const

export type HarnessErrorKind = typeof HARNESS_ERROR_KINDS[number]

export type HarnessProtocolError = {
  kind: HarnessErrorKind
  message: string
  detail?: unknown
}

export type HarnessInboundMessage =
  | { type: 'event'; id: number; event: string; data: unknown }
  | { type: 'response'; id: number; ok: true; result: unknown }
  | { type: 'error'; id: number; ok: false; error: HarnessProtocolError }
  | { type: 'callback'; id: number; callbackId: string; method: string; params: unknown }

export type HarnessRequestMessage = {
  type: 'request'
  id: number
  method: string
  params: unknown
}

export type HarnessCancelMessage = { type: 'cancel'; id: number }

export type HarnessCallbackResultMessage =
  | { type: 'response'; id: number; callbackId: string; ok: true; result: unknown }
  | { type: 'error'; id: number; callbackId: string; ok: false; error: HarnessProtocolError }

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(', ')}`)
}

function idOf(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error('Harness message id must be a non-negative integer')
  }
  return value as number
}

function textOf(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${label} must be a non-empty string`)
  return value
}

function errorOf(value: unknown): HarnessProtocolError {
  const payload = record(value, 'Harness error')
  rejectUnknownKeys(payload, ['kind', 'message', 'detail'], 'Harness error')
  const kind = textOf(payload['kind'], 'Harness error kind')
  if (!(HARNESS_ERROR_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Unknown Harness error kind: ${kind}`)
  }
  return {
    kind: kind as HarnessErrorKind,
    message: textOf(payload['message'], 'Harness error message'),
    ...('detail' in payload ? { detail: payload['detail'] } : {}),
  }
}

/** Validate the startup payload before Core sends work to the Harness process. */
export function parseHarnessReadyData(value: unknown): HarnessReadyData {
  const data = record(value, 'Harness ready data')
  rejectUnknownKeys(data, ['protocol', 'capabilities'], 'Harness ready data')
  const capabilities = data['capabilities']
  if (!Array.isArray(capabilities)
    || capabilities.some((capability) => typeof capability !== 'string' || capability === '')
    || new Set(capabilities).size !== capabilities.length) {
    throw new Error('Harness capabilities must be unique non-empty strings')
  }
  return {
    protocol: textOf(data['protocol'], 'Harness protocol'),
    capabilities: capabilities as string[],
  }
}

/** Parse one complete stdout line; stdout is protocol-only and rejects every unknown shape. */
export function parseHarnessMessage(line: string): HarnessInboundMessage {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new Error('Harness stdout contained invalid JSON')
  }
  const message = record(value, 'Harness message')
  const type = textOf(message['type'], 'Harness message type')
  const id = idOf(message['id'])
  switch (type) {
    case 'event':
      rejectUnknownKeys(message, ['type', 'id', 'event', 'data'], 'Harness event')
      return { type, id, event: textOf(message['event'], 'Harness event'), data: message['data'] }
    case 'response':
      rejectUnknownKeys(message, ['type', 'id', 'ok', 'result'], 'Harness response')
      if (message['ok'] !== true) throw new Error('Harness response must set ok=true')
      return { type, id, ok: true, result: message['result'] }
    case 'error':
      rejectUnknownKeys(message, ['type', 'id', 'ok', 'error'], 'Harness error envelope')
      if (message['ok'] !== false) throw new Error('Harness error must set ok=false')
      return { type, id, ok: false, error: errorOf(message['error']) }
    case 'callback':
      rejectUnknownKeys(
        message,
        ['type', 'id', 'callbackId', 'method', 'params'],
        'Harness callback',
      )
      if (id === 0) throw new Error('Harness callback id must name an active request')
      return {
        type, id,
        callbackId: textOf(message['callbackId'], 'Harness callback id'),
        method: textOf(message['method'], 'Harness callback method'),
        params: message['params'],
      }
    default:
      throw new Error(`Unknown Harness message type: ${type}`)
  }
}
