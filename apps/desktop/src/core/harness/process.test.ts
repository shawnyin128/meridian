import { existsSync } from 'node:fs'
import { delimiter, resolve } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createHarnessRpc } from './rpc.js'
import { harnessProcessConfig, launchHarnessProcess } from './process.js'
import { HARNESS_CAPABILITIES } from './protocol.js'

const harnessPython = process.env['MERIDIAN_HARNESS_TEST_PYTHON']
const harnessExecutable = process.env['MERIDIAN_HARNESS_TEST_EXECUTABLE']
const realPythonIt = harnessPython === undefined ? it.skip : it
const realExecutableIt = harnessExecutable === undefined ? it.skip : it
const developmentHarnessIt = process.env['CONDA_EXE'] === undefined
  || !existsSync(resolve('apps/harness/.runtime')) ? it.skip : it

describe('Harness process', () => {
  it('resolves a shell-free UTF-8 Python module launch', () => {
    const cwd = resolve('/workspace')
    const config = harnessProcessConfig({
      PYTHON: '/opt/python',
      PYTHONPATH: '/shared/python',
      MERIDIAN_HARNESS_PYTHONPATH: '/bundle/harness',
    }, cwd)

    expect(config).toMatchObject({
      command: '/opt/python',
      args: ['-m', 'meridian_harness'],
      cwd,
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONPATH: `/bundle/harness${delimiter}/shared/python`,
      },
    })
  })

  it('finds the checkout Harness source when Electron runs from apps/desktop', () => {
    const config = harnessProcessConfig({ PYTHON: '/opt/python' }, resolve('apps/desktop'))

    expect(config.env.PYTHONPATH).toBe(resolve('apps/harness/src'))
  })

  it('uses the named Conda environment for development without a shell', () => {
    const config = harnessProcessConfig({
      PATH: '/opt/conda/bin:/bin',
      CONDA_EXE: '/opt/conda/bin/conda',
      MERIDIAN_HARNESS_CONDA_ENV: 'meridian',
    }, resolve('apps/desktop'))

    expect(config).toMatchObject({
      command: '/opt/conda/envs/meridian/bin/python',
      args: ['-m', 'meridian_harness'],
      env: {
        PYTHONPATH: [resolve('apps/harness/src'), resolve('apps/harness/.runtime')]
          .join(delimiter),
      },
    })
  })

  it('launches an installed sidecar directly without Python module arguments', () => {
    expect(harnessProcessConfig({
      MERIDIAN_HARNESS_EXECUTABLE: '/app/resources/harness/meridian-harness',
      PYTHONPATH: '/must/not/be/needed',
    }, '/app')).toMatchObject({
      command: '/app/resources/harness/meridian-harness',
      args: [],
      cwd: '/app',
    })
  })

  it('does not forward unrelated credentials into the Harness process', () => {
    const config = harnessProcessConfig({
      PATH: '/bin',
      HTTPS_PROXY: 'https://proxy.example',
      OPENAI_API_KEY: 'must-not-cross',
      AWS_SECRET_ACCESS_KEY: 'must-not-cross',
      MERIDIAN_HARNESS_EXECUTABLE: '/app/meridian-harness',
    }, '/app')

    expect(config.env).toMatchObject({ PATH: '/bin', HTTPS_PROXY: 'https://proxy.example' })
    expect(config.env).not.toHaveProperty('OPENAI_API_KEY')
    expect(config.env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY')
    expect(config.env).not.toHaveProperty('MERIDIAN_HARNESS_EXECUTABLE')
  })

  realPythonIt('starts the real Python server and completes the versioned handshake', async () => {
    const config = harnessProcessConfig({
      ...process.env,
      PYTHON: harnessPython,
      MERIDIAN_HARNESS_PYTHONPATH: resolve('apps/harness/src'),
    })
    const rpc = createHarnessRpc({
      launch: () => launchHarnessProcess(config),
      readyTimeoutMs: 10_000,
      requestTimeoutMs: 10_000,
      requiredCapabilities: HARNESS_CAPABILITIES,
    })
    try {
      await expect(rpc.request('system.ping', {})).resolves.toMatchObject({
        protocol: 'meridian.harness.v1',
        capabilities: [...HARNESS_CAPABILITIES],
      })
      await expect(rpc.request('model.check', {
        model: {
          provider: 'unsupported-provider',
          protocol: 'responses',
          baseUrl: 'https://api.example.test/v1',
          model: 'no-call',
          authentication: 'none',
        },
      })).resolves.toEqual({
        state: 'failed',
        reason: 'configuration',
        detail: 'Unsupported Harness model provider',
        modelCalls: 0,
        maxOutputTokens: 1,
      })
    } finally {
      rpc.close()
    }
  })

  developmentHarnessIt('starts the checkout Harness from apps/desktop through meridian Conda', async () => {
    const config = harnessProcessConfig({
      PATH: process.env['PATH'],
      CONDA_EXE: process.env['CONDA_EXE'],
      MERIDIAN_HARNESS_CONDA_ENV: 'meridian',
    }, resolve('apps/desktop'))
    const rpc = createHarnessRpc({
      launch: () => launchHarnessProcess(config),
      readyTimeoutMs: 10_000,
      requestTimeoutMs: 10_000,
      requiredCapabilities: ['model-check'],
    })
    try {
      await expect(rpc.request('model.check', {
        model: {
          provider: 'unsupported-provider', protocol: 'responses',
          baseUrl: 'https://api.example.test/v1', model: 'no-call',
          authentication: 'none',
        },
      })).resolves.toEqual({
        state: 'failed', reason: 'configuration',
        detail: 'Unsupported Harness model provider',
        modelCalls: 0, maxOutputTokens: 1,
      })
    } finally {
      rpc.close()
    }
  })

  developmentHarnessIt('checks a real compatible connection through one local one-token request', async () => {
    let providerRequest: Record<string, unknown> | null = null
    let rejectAuthentication = false
    const provider = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        providerRequest = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
        if (rejectAuthentication) {
          response.writeHead(401, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ error: { message: 'test credential rejected' } }))
          return
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          id: 'chatcmpl-meridian-check', object: 'chat.completion', created: 0,
          model: 'local-check',
          choices: [{
            index: 0, finish_reason: 'stop',
            message: { role: 'assistant', content: '.' },
          }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }))
      })
    })
    await new Promise<void>((resolveListen) => provider.listen(0, '127.0.0.1', resolveListen))
    const port = (provider.address() as AddressInfo).port
    const config = harnessProcessConfig({
      PATH: process.env['PATH'],
      CONDA_EXE: process.env['CONDA_EXE'],
      MERIDIAN_HARNESS_CONDA_ENV: 'meridian',
    }, resolve('apps/desktop'))
    const rpc = createHarnessRpc({
      launch: () => launchHarnessProcess(config),
      readyTimeoutMs: 10_000,
      requestTimeoutMs: 10_000,
      requiredCapabilities: ['model-check'],
    })
    try {
      await expect(rpc.request('model.check', {
        model: {
          provider: 'openai-compatible', protocol: 'chat-completions',
          baseUrl: `http://127.0.0.1:${port}/v1`, model: 'local-check',
          authentication: 'api-key', apiKey: 'local-test-key',
        },
      })).resolves.toEqual({ state: 'connected', modelCalls: 1, maxOutputTokens: 1 })
      expect(providerRequest).toMatchObject({ model: 'local-check', max_tokens: 1 })

      rejectAuthentication = true
      const failure = await rpc.request<{
        state: string; reason: string; detail: string; modelCalls: number; maxOutputTokens: number
      }>('model.check', {
        model: {
          provider: 'openai-compatible', protocol: 'chat-completions',
          baseUrl: `http://127.0.0.1:${port}/v1`, model: 'local-check',
          authentication: 'api-key', apiKey: 'local-test-key',
        },
      })
      expect(failure).toMatchObject({
        state: 'failed', reason: 'authentication', modelCalls: 1, maxOutputTokens: 1,
      })
      expect(failure.detail).toContain('401')
      expect(failure.detail).toContain('test credential rejected')
    } finally {
      rpc.close()
      await new Promise<void>((resolveClose) => provider.close(() => resolveClose()))
    }
  })

  realExecutableIt('starts the packaged sidecar and completes the versioned handshake', async () => {
    const config = harnessProcessConfig({ MERIDIAN_HARNESS_EXECUTABLE: harnessExecutable })
    const rpc = createHarnessRpc({
      launch: () => launchHarnessProcess(config),
      readyTimeoutMs: 20_000,
      requestTimeoutMs: 10_000,
      requiredCapabilities: HARNESS_CAPABILITIES,
    })
    try {
      await expect(rpc.request('system.ping', {})).resolves.toMatchObject({
        protocol: 'meridian.harness.v1',
        capabilities: [...HARNESS_CAPABILITIES],
      })
    } finally {
      rpc.close()
    }
  }, 30_000)

  realExecutableIt('loads both packaged LangGraph workflows and provider code without a paid request', async () => {
    const config = harnessProcessConfig({ MERIDIAN_HARNESS_EXECUTABLE: harnessExecutable })
    const rpc = createHarnessRpc({
      launch: () => launchHarnessProcess(config),
      readyTimeoutMs: 20_000,
      requestTimeoutMs: 20_000,
      requiredCapabilities: HARNESS_CAPABILITIES,
      callbacks: {
        'papers.get': () => ({ id: 'p1', title: 'Packaged workflow probe', authors: [] }),
        'papers.source': () => ({ pages: [{ number: 1, text: 'Grounded source.' }] }),
        'papers.reading': () => ({ highlights: [], notes: [], remark: '' }),
        'wiki.page': () => ({ id: 'papers/p1', body: '' }),
        'chat.context': () => ({ title: 'Packaged chat probe', history: [] }),
      },
    })
    try {
      await expect(rpc.request('paper-wiki.propose', {
        workflow: 'paper-wiki', targetId: 'p1', scopeDigest: 'packaged-probe', action: 'create',
        model: {
          provider: 'openai-compatible', protocol: 'responses',
          baseUrl: 'http://127.0.0.1:9/v1',
          model: 'no-network-probe', authentication: 'none',
        },
        limits: { maxOutputTokens: 128, maxModelCalls: 1 },
      })).rejects.toMatchObject({ kind: 'model_error' })
      await expect(rpc.request('chat.answer', {
        chatId: 'chat-1', text: 'Probe the packaged chat graph.',
        model: {
          provider: 'openai-compatible', protocol: 'responses',
          baseUrl: 'http://127.0.0.1:9/v1',
          model: 'no-network-probe', authentication: 'none',
        },
        limits: { maxOutputTokens: 128, maxModelCalls: 1 },
      })).rejects.toMatchObject({ kind: 'model_error' })
    } finally {
      rpc.close()
    }
  }, 30_000)

  realPythonIt('crosses the real Core-to-Python proposal boundary without a model call', async () => {
    const callbackMethods: string[] = []
    const config = harnessProcessConfig({
      ...process.env,
      PYTHON: harnessPython,
      MERIDIAN_HARNESS_MODULE: 'fixture_server',
      MERIDIAN_HARNESS_PYTHONPATH: [
        resolve('apps/harness/tests'),
        resolve('apps/harness/src'),
      ].join(delimiter),
    })
    const rpc = createHarnessRpc({
      launch: () => launchHarnessProcess(config),
      readyTimeoutMs: 10_000,
      requestTimeoutMs: 10_000,
      requiredCapabilities: ['paper-wiki'],
      callbacks: {
        'papers.get': () => {
          callbackMethods.push('papers.get')
          return { title: 'Fixture paper' }
        },
        'papers.source': () => {
          callbackMethods.push('papers.source')
          return { pages: [{ page: 1, text: 'Grounded fixture source.' }] }
        },
        'papers.reading': () => {
          callbackMethods.push('papers.reading')
          return { highlights: [], notes: [] }
        },
        'wiki.page': () => {
          callbackMethods.push('wiki.page')
          return { body: '' }
        },
      },
    })
    try {
      await expect(rpc.request('paper-wiki.propose', {
        workflow: 'paper-wiki',
        targetId: 'fixture-paper',
        scopeDigest: 'fixture-scope',
        action: 'create',
        model: {
          provider: 'openai-compatible',
          protocol: 'responses',
          baseUrl: 'http://127.0.0.1:11434/v1',
          model: 'zero-cost-fixture',
          authentication: 'none',
        },
        limits: { maxOutputTokens: 1_200 },
      })).resolves.toMatchObject({
        schemaVersion: 'meridian.paper-wiki-draft.v2',
        targetId: 'fixture-paper',
        scopeDigest: 'fixture-scope',
        reviewRequired: true,
        applied: false,
        draft: {
          what_to_remember: [expect.objectContaining({
            text: expect.stringContaining('zero-cost fixture crossed'),
            pages: [1],
          })],
        },
        quality: {
          schemaVersion: 'meridian.paper-wiki-calibration.v1',
          passed: true,
          findings: [],
        },
      })
      expect(callbackMethods).toEqual([
        'papers.get', 'papers.source', 'papers.reading', 'wiki.page',
      ])
    } finally {
      rpc.close()
    }
  })
})
