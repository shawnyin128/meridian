import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import type { HarnessPlan, PaperReading, PaperRow, WikiPaper } from '../../shared/contract.js'
import type { VaultStore } from '../vault.js'
import { createCliRunner } from './cli/runner.js'
import type { HarnessModelConfig } from './model-config.js'
import { createPaperWikiHarnessRunner } from './paper-wiki.js'
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

  developmentHarnessIt('drafts a Paper Wiki proposal through the real Harness and a stand-in claude', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'meridian-cli-e2e-'))
    const record = join(folder, 'record.json')
    const draft = {
      problem: { text: 'Speculative decoding is bounded by the draft model.', pages: [1] },
      what_to_remember: [{ text: 'A small draft proposes tokens the target verifies.', pages: [1] }],
      retrieval: {
        fits: [
          { query: 'How does speculative decoding verify drafted tokens?', use_because: 'Mechanism.', pages: [1] },
          { query: 'Which draft model sizes keep acceptance high?', use_because: 'Ablation.', pages: [2] },
          { query: 'What speedups does speculative decoding report?', use_because: 'Evidence.', pages: [2] },
        ],
        scope_notes: { primary_fit: 'Decoding speed.', adjacent_fit: 'Serving.', weak_fit: 'Training.' },
      },
      mechanism: [{
        name: 'Draft and verify', input: 'Prefix tokens', transformation: 'Draft k tokens, verify in one pass',
        output: 'Accepted tokens', dependency: 'Target and draft share a vocabulary', pages: [1],
      }],
      mechanism_details_to_verify: [{ text: 'Check the acceptance rule.', pages: [1] }],
      evidence: [{ claim: 'Decoding gets faster', setting: 'Fixture setting', finding: 'Fewer target passes', pages: [2] }],
      implementation_hooks: [{ task: 'Add a draft model', first_check: 'Measure acceptance on ten prompts', pages: [1] }],
      limitations: [],
      user_observations: [{ text: 'Worth trying on our serving stack.', reading_refs: ['note:n1'] }],
      open_questions: ['Does acceptance hold for long outputs?'],
    }
    const claude = join(folder, 'claude')
    writeFileSync(claude, `#!${process.execPath}
const fs = require('node:fs')
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { stdin += chunk })
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({
    argv: process.argv.slice(2), stdin, apiKey: process.env.ANTHROPIC_API_KEY ?? null,
  }))
  process.stdout.write(JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, num_turns: 1,
    usage: { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 20 },
    structured_output: ${JSON.stringify(draft)},
  }))
})
`)
    chmodSync(claude, 0o755)
    const pdf = new Uint8Array(readFileSync(resolve(import.meta.dirname,
      '../fixtures/vault/sources/papers/paper-pdf-a6b750e25a61-13979-STAR-Speculative-Decodin.pdf')))
    const config = harnessProcessConfig({
      PATH: process.env['PATH'],
      CONDA_EXE: process.env['CONDA_EXE'],
      MERIDIAN_HARNESS_CONDA_ENV: 'meridian',
    }, resolve('apps/desktop'))
    const logs: string[] = []
    const runner = createPaperWikiHarnessRunner({
      store: {
        getPaper: () => ({ id: 'p1', title: 'STAR', authors: ['A. Researcher'], venue: 'arXiv' }),
        paperReading: () => ({ highlights: [], notes: [{ id: 'n1', page: 1, text: 'Try it on serving.' }], remark: '' }),
        paperSource: () => pdf,
        wikiPaper: () => ({ id: 'papers/p1', body: '' }),
      } as unknown as VaultStore,
      model: { runtime: async () => ({ source: 'cli', cli: 'claude' }) } as unknown as HarnessModelConfig,
      cli: createCliRunner({
        discover: async (cli) => ({
          cli, installed: true, binary: claude, version: '2.1.280', missingFlags: [], signIn: 'subscription',
        }),
        environment: { ...process.env, ANTHROPIC_API_KEY: 'sk-ant-must-not-cross' },
      }),
      launch: () => launchHarnessProcess(config),
      onLog: (level, line) => logs.push(`${level} ${line}`),
    })
    try {
      const result = await runner.run({
        plan: { workflow: 'paper-wiki', targetId: 'p1', scopeDigest: 'cli-scope', action: 'create' } as HarnessPlan,
        snapshot: {
          paper: { pageCount: 2 } as PaperRow,
          reading: { highlights: [], notes: [{ id: 'n1' }], remark: '' } as unknown as PaperReading,
          wiki: {} as WikiPaper,
        },
        signal: new AbortController().signal,
        limits: { maxOutputTokens: 6_000, maxModelCalls: 1, timeoutSeconds: 120 },
        requestTimeoutMs: 120_000,
      })

      expect(result).toMatchObject({ state: 'proposal-ready', proposalQuality: { caseId: 'p1' } })
      expect(result.proposalBody).toContain('A small draft proposes tokens the target verifies.')
      const seen = JSON.parse(readFileSync(record, 'utf8')) as { argv: string[]; stdin: string; apiKey: string | null }
      const flag = (name: string) => seen.argv[seen.argv.indexOf(name) + 1]!
      expect(flag('--system-prompt')).toMatch(/^Prepare one review-only Meridian Paper Wiki V2 proposal\./)
      expect(JSON.parse(flag('--json-schema'))).toMatchObject({
        additionalProperties: false, required: expect.arrayContaining(['limitations', 'open_questions']),
      })
      expect(seen.stdin).toMatch(/^Authorized Paper Wiki scope:\n\{/)
      expect(seen.stdin).toContain('"scopeDigest":"cli-scope"')
      expect(seen.apiKey).toBeNull()
      expect(logs).toContainEqual(expect.stringMatching(/^info claude: \d+\.\d s, 1 turns, 10 input tokens \(0 cached\), 20 output tokens$/))
    } finally {
      runner.close()
      rmSync(folder, { recursive: true, force: true })
    }
  }, 30_000)

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
