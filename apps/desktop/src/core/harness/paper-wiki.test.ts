import { EventEmitter } from 'node:events'
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type {
  HarnessPaperWikiQuality, HarnessPlan, PaperReading, PaperRow, WikiPaper,
} from '../../shared/contract.js'
import { callFailure } from '../call-error.js'
import { extractPdfPages } from '../paper-library/index.js'
import type { VaultStore } from '../vault.js'
import { createVaultStore } from '../vault-store.js'
import { type CliFailureKind, CliRunError } from './cli/child.js'
import { type CliCall, type CliRunner, createCliRunner } from './cli/runner.js'
import type { HarnessExecution } from './cost-gate.js'
import type { HarnessModelConfig, HarnessRuntimeModel } from './model-config.js'
import type { PaperWikiDraft } from './paper-wiki.js'
import {
  citablePages, createPaperWikiHarnessRunner, pageHoldsAbstract, paperWikiHarnessError, projectPaperWikiReview,
  renderPaperWikiDraft, validatePaperWikiDraftScope, validatePaperWikiDraftSemantics, validatePaperWikiQuality,
  withoutBibliography,
} from './paper-wiki.js'
import { HARNESS_CAPABILITIES, HARNESS_PROTOCOL_VERSION } from './protocol.js'
import { type HarnessChild, HarnessRpcError } from './rpc.js'

const draft = (): PaperWikiDraft => ({
  problem: { text: 'Exact bottleneck', pages: [1] },
  what_to_remember: [{ text: 'Main contribution', pages: [1, 3] }],
  retrieval: {
    fits: [
      { query: 'How does the method work?', use_because: 'It explains the mechanism.', pages: [2] },
      { query: 'What should I implement first?', use_because: 'It identifies the first probe.', pages: [2] },
      { query: 'What evidence supports the method?', use_because: 'It reports the result.', pages: [4] },
    ],
    scope_notes: {
      primary_fit: 'Mechanism and evidence questions.',
      adjacent_fit: 'Implementation planning.',
      weak_fit: 'Unrelated application domains.',
    },
  },
  mechanism: [{
    name: 'Mechanism', input: 'Input state', transformation: 'Apply the transform',
    output: 'Output state', dependency: 'Reported setting', pages: [2],
  }],
  mechanism_details_to_verify: [{ text: 'Verify the operation order', pages: [2] }],
  evidence: [{
    claim: 'The method improves the target metric', setting: 'Controlled evaluation',
    finding: 'Measured result', pages: [4],
  }],
  implementation_hooks: [{
    task: 'Implement the transform', first_check: 'Run the smallest sanity check', pages: [2],
  }],
  limitations: [],
  user_observations: [{ text: 'Try this next', reading_refs: ['note:n1'] }],
  open_questions: ['Does it transfer?'],
})

describe('Paper Wiki Harness draft boundary', () => {
  it('lets a draft cite the pages the paper has: its stored count, or its PDF\'s when none is stored', async () => {
    const pdf = new Uint8Array(readFileSync(resolve(import.meta.dirname,
      '../fixtures/vault/sources/papers/paper-pdf-a6b750e25a61-13979-STAR-Speculative-Decodin.pdf')))
    const paper = (pageCount: number) => ({ pageCount }) as PaperRow
    expect(await citablePages(paper(0), () => pdf)).toBe(2)
    expect(await citablePages(paper(7), () => { throw new Error('the stored count is enough') })).toBe(7)
  })

  it('renders only the canonical Core-owned section layout', () => {
    expect(renderPaperWikiDraft(draft())).toBe([
      '## What To Remember',
      '**Source-grounded problem:** Exact bottleneck (p. 1)',
      '**Wiki synthesis:**',
      '- Main contribution (p. 1, 3)',
      '',
      '## When To Retrieve This Paper',
      '**Wiki synthesis for retrieval:**',
      '**Canonical retrieval fits:**',
      '1. **Query:** "How does the method work?"',
      '   **Use because:** It explains the mechanism. (p. 2)',
      '2. **Query:** "What should I implement first?"',
      '   **Use because:** It identifies the first probe. (p. 2)',
      '3. **Query:** "What evidence supports the method?"',
      '   **Use because:** It reports the result. (p. 4)',
      '**Scope notes:**',
      '- **Primary fit:** Mechanism and evidence questions.',
      '- **Adjacent fit:** Implementation planning.',
      '- **Weak fit:** Unrelated application domains.',
      '',
      '## Mechanism',
      '### Mechanism',
      '- **Input:** Input state',
      '- **Transformation:** Apply the transform',
      '- **Output:** Output state',
      '- **Dependency:** Reported setting',
      '- **Source:** p. 2',
      '',
      '## Mechanism Details To Verify',
      '- Verify the operation order (p. 2)',
      '',
      '## Evidence Map',
      '### Evidence 1',
      '- **Claim:** The method improves the target metric',
      '- **Setting:** Controlled evaluation',
      '- **Finding:** Measured result',
      '- **Source:** p. 4',
      '',
      '## Implementation Hooks',
      '**Wiki synthesis for implementation:**',
      '- **Task:** Implement the transform',
      '  **First check:** Run the smallest sanity check (p. 2)',
      '',
      '## Limitations / Uncertainty',
      '- No source-grounded limitation was captured in this proposal.',
      '',
      '## User Insights',
      '- Try this next (note:n1)',
      '',
      '## Open Questions',
      '- Does it transfer?',
    ].join('\n'))
  })

  it('rejects unknown source pages and reading records before review', () => {
    expect(() => validatePaperWikiDraftScope(draft(), {
      paperPages: 3,
      readingRefs: new Set(['note:n1']),
    })).toThrow('范围外的论文页')

    const unknownNote = draft()
    unknownNote.evidence[0]!.pages = [3]
    unknownNote.user_observations[0]!.reading_refs = ['note:other']
    expect(() => validatePaperWikiDraftScope(unknownNote, {
      paperPages: 4,
      readingRefs: new Set(['note:n1']),
    })).toThrow('范围外的阅读记录')
  })

  it('fails a draft Core finds outside the run\'s scope or malformed as malformed output', () => {
    const reason = (check: () => void) => {
      try {
        check()
      } catch (cause) {
        return callFailure(cause)
      }
      return null
    }
    const duplicate = draft()
    duplicate.retrieval.fits[1]!.query = duplicate.retrieval.fits[0]!.query
    const statement = draft()
    statement.open_questions = ['Test generalization']
    expect([
      reason(() => validatePaperWikiDraftScope(draft(), { paperPages: 3, readingRefs: new Set(['note:n1']) })),
      reason(() => validatePaperWikiDraftScope(draft(), { paperPages: 4, readingRefs: new Set() })),
      reason(() => validatePaperWikiDraftSemantics(duplicate)),
      reason(() => validatePaperWikiDraftSemantics(statement)),
    ]).toEqual(['malformed-output', 'malformed-output', 'malformed-output', 'malformed-output'])
  })

  it('projects provenance and source anchors without reparsing Markdown', () => {
    const review = projectPaperWikiReview(draft())
    expect(review.schemaVersion).toBe('meridian.paper-wiki-review.v1')
    expect(review.sections.find((section) => section.id === 'remember')?.groups).toEqual([
      expect.objectContaining({
        id: 'problem', provenance: 'paper-source', anchors: ['page:1'],
        rows: [{ text: 'Exact bottleneck' }],
      }),
      expect.objectContaining({
        id: 'takeaway-1', provenance: 'wiki-synthesis', anchors: ['page:1', 'page:3'],
      }),
    ])
    expect(review.sections.find((section) => section.id === 'user-insights')?.groups[0])
      .toMatchObject({ provenance: 'user-insight', anchors: ['note:n1'] })
    expect(review.sections.find((section) => section.id === 'limitations')).toMatchObject({
      groups: [],
      emptyLabel: '本提案没有提取到有原文依据的局限。',
    })
  })

  it('rejects duplicate anchors instead of silently normalizing them', () => {
    const duplicate = draft()
    duplicate.implementation_hooks[0]!.pages = [2, 2]
    expect(() => validatePaperWikiDraftScope(duplicate, {
      paperPages: 4,
      readingRefs: new Set(['note:n1']),
    })).toThrow('范围外的论文页')
  })

  it('mirrors semantic uniqueness and question-shape checks at the Core boundary', () => {
    const duplicate = draft()
    duplicate.retrieval.fits[1]!.query = duplicate.retrieval.fits[0]!.query
    expect(() => validatePaperWikiDraftSemantics(duplicate)).toThrow('重复的检索问题')

    const statement = draft()
    statement.open_questions = ['Test generalization']
    expect(() => validatePaperWikiDraftSemantics(statement)).toThrow('问题形式')
  })

  it('accepts only a complete, internally consistent quality report for the target paper', () => {
    const quality: HarnessPaperWikiQuality = {
      schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: true,
      dimensions: [
        'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
      ].map((id) => ({ id, passed: true })) as HarnessPaperWikiQuality['dimensions'],
      findings: [],
    }
    expect(() => validatePaperWikiQuality(quality, 'p1')).not.toThrow()
    expect(() => validatePaperWikiQuality({ ...quality, caseId: 'p2' }, 'p1'))
      .toThrow('不属于当前论文')
    expect(() => validatePaperWikiQuality({
      ...quality, passed: false,
      dimensions: quality.dimensions.map((dimension) => ({ ...dimension })),
    }, 'p1')).toThrow('结论不一致')
  })

  it('fails a run the user stopped as cancelled, invalid output as malformed and every other Harness failure as a model failure', () => {
    const failure = (kind: 'cancelled' | 'harness_gone' | 'bad_request' | 'model_error', detail?: string) =>
      callFailure(paperWikiHarnessError(new HarnessRpcError({ kind, message: kind, ...(detail === undefined ? {} : { detail }) })))
    expect(failure('cancelled')).toBe('cancelled')
    expect(failure('harness_gone')).toBe('model')
    expect(failure('bad_request')).toBe('model')
    expect(failure('model_error')).toBe('model')
    expect(failure('model_error', 'rate_limit')).toBe('model')
    expect(failure('model_error', 'structured_output')).toBe('malformed-output')
    expect(failure('model_error', 'invalid_anchor')).toBe('malformed-output')
  })

  it('turns cancellation and process loss into explicit no-retry messages', () => {
    expect(paperWikiHarnessError(new HarnessRpcError({
      kind: 'cancelled', message: 'cancelled',
    })).message).toContain('仍可能计费')
    expect(paperWikiHarnessError(new HarnessRpcError({
      kind: 'harness_gone', message: 'gone',
    })).message).toContain('不会自动重试')
  })
})

class FakeHarness extends EventEmitter implements HarnessChild {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly kill = vi.fn(() => true)

  send(message: object) {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }

  ready() {
    this.send({
      type: 'event', id: 0, event: 'ready',
      data: { protocol: HARNESS_PROTOCOL_VERSION, capabilities: [...HARNESS_CAPABILITIES] },
    })
  }

  frame(): Promise<Record<string, unknown>> {
    return new Promise((resolveFrame) => {
      this.stdin.once('data', (chunk: Buffer) => resolveFrame(JSON.parse(chunk.toString('utf8').trim())))
    })
  }

  callModel(callbackId: string) {
    this.send({
      type: 'callback', id: 1, callbackId, method: 'model.invoke',
      params: { system: 'System rules', prompt: 'Paper scope', schema: { type: 'object' } },
    })
  }
}

const CLI_MODEL: HarnessRuntimeModel = { source: 'cli', cli: 'claude', model: 'opus' }
const API_MODEL: HarnessRuntimeModel = {
  provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5', authentication: 'api-key', apiKey: 'sk-test',
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const execution = (signal = new AbortController().signal): HarnessExecution => ({
  plan: {
    workflow: 'paper-wiki', targetId: 'p1', scopeDigest: 'digest-1', action: 'create',
  } as HarnessPlan,
  snapshot: {
    paper: { pageCount: 4 } as PaperRow,
    reading: { highlights: [], notes: [{ id: 'n1' }], remark: '' } as unknown as PaperReading,
    wiki: {} as WikiPaper,
  },
  signal,
  limits: { maxOutputTokens: 6_000, maxModelCalls: 1, timeoutSeconds: 120 },
  requestTimeoutMs: 120_000,
})

const envelope = () => ({
  schemaVersion: 'meridian.paper-wiki-draft.v2', workflow: 'paper-wiki', targetId: 'p1',
  scopeDigest: 'digest-1', action: 'create', draft: draft(), reviewRequired: true, applied: false,
  quality: {
    schemaVersion: 'meridian.paper-wiki-calibration.v1', caseId: 'p1', passed: true,
    dimensions: ['grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty']
      .map((id) => ({ id, passed: true })),
    findings: [],
  },
})

function paperWikiRunner(model: HarnessRuntimeModel, cli: CliRunner) {
  const child = new FakeHarness()
  const logs: string[] = []
  const runner = createPaperWikiHarnessRunner({
    store: {} as VaultStore,
    model: { runtime: async () => model } as unknown as HarnessModelConfig,
    cli,
    launch: () => child,
    onLog: (level, line) => logs.push(`${level} ${line}`),
  })
  return { child, runner, logs }
}

describe('Paper Wiki run on a subscription CLI', () => {
  it('answers the run\'s one model call through the CLI runner with the run\'s own model', async () => {
    const calls: CliCall[] = []
    const { child, runner, logs } = paperWikiRunner(CLI_MODEL, async (call) => {
      calls.push(call)
      return {
        output: { draft: 'candidate' }, turns: 3, durationMs: 86_200,
        usage: { inputTokens: 93_516, cachedInputTokens: 87_410, outputTokens: 11_382 },
      }
    })
    const running = runner.run(execution())
    child.ready()
    expect(await child.frame()).toMatchObject({ method: 'paper-wiki.propose', params: { model: CLI_MODEL } })

    child.callModel('first')
    expect(await child.frame()).toMatchObject({
      type: 'response', callbackId: 'first', result: { output: { draft: 'candidate' } },
    })
    expect(calls).toEqual([expect.objectContaining({
      cli: 'claude', model: 'opus', system: 'System rules', prompt: 'Paper scope', schema: { type: 'object' },
    })])
    child.callModel('second')
    expect(await child.frame()).toMatchObject({ type: 'error', callbackId: 'second', error: { kind: 'bad_request' } })
    expect(calls).toHaveLength(1)

    child.send({ type: 'response', id: 1, ok: true, result: envelope() })
    await expect(running).resolves.toMatchObject({ state: 'proposal-ready' })
    expect(logs).toEqual([
      'info claude: 86.2 s, 3 turns, 93516 input tokens (87410 cached), 11382 output tokens',
      'error Harness callback model.invoke failed: A run makes one model call',
    ])
    runner.close()
  })

  it('makes the run\'s CLI call at the reasoning effort the run\'s model sets', async () => {
    const calls: CliCall[] = []
    const { child, runner } = paperWikiRunner({ source: 'cli', cli: 'codex', model: 'gpt-6.1-sol', effort: 'high' }, async (call) => {
      calls.push(call)
      return { output: { draft: 'candidate' }, durationMs: 1_000 }
    })
    const running = runner.run(execution())
    child.ready()
    await child.frame()
    child.callModel('first')
    await child.frame()
    child.send({ type: 'response', id: 1, ok: true, result: envelope() })
    await expect(running).resolves.toMatchObject({ state: 'proposal-ready' })

    expect(calls).toEqual([expect.objectContaining({ cli: 'codex', model: 'gpt-6.1-sol', effort: 'high' })])
    runner.close()
  })

  it('passes a CLI failure to Harness as a model error in its own words', async () => {
    const { child, runner } = paperWikiRunner(CLI_MODEL, async () => {
      throw new CliRunError('failed', 'claude 运行失败：Claude AI usage limit reached')
    })
    const running = runner.run(execution())
    child.ready()
    await child.frame()

    child.callModel('limit')
    expect(await child.frame()).toMatchObject({
      type: 'error', callbackId: 'limit',
      error: { kind: 'model_error', message: 'claude 运行失败：Claude AI usage limit reached' },
    })
    child.send({ type: 'error', id: 1, ok: false, error: { kind: 'model_error', message: 'claude 运行失败' } })
    await expect(running).rejects.toMatchObject({ reason: 'model' })
    runner.close()
  })

  it('logs a failed CLI call\'s exit code and the end of its stderr, with no secret in the line', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'meridian-cli-log-test-'))
    try {
      const claude = join(folder, 'claude')
      writeFileSync(claude, [
        `#!${process.execPath}`,
        "process.stdin.resume()",
        "process.stdin.on('end', () => {",
        "  process.stderr.write('starting\\nAuthorization: Bearer sk-ant-oat01-supersecretvalue\\n')",
        "  process.stderr.write('signed in as researcher@example.org\\nError: usage limit reached\\n')",
        "  process.exitCode = 1",
        "})",
      ].join('\n'))
      chmodSync(claude, 0o755)
      const { child, runner, logs } = paperWikiRunner(CLI_MODEL, createCliRunner({
        discover: async (cli) => ({
          cli, installed: true, binary: claude, version: '2.1.280', missingFlags: [], signIn: 'subscription',
        }),
        environment: { PATH: '/usr/bin:/bin' },
      }))
      const running = runner.run(execution())
      child.ready()
      await child.frame()

      child.callModel('fails')
      expect(await child.frame()).toMatchObject({ type: 'error', callbackId: 'fails', error: { kind: 'model_error' } })
      expect(logs).toHaveLength(2)
      expect(logs[0]).toMatch(/^error claude failed, exit 1: starting \| .* \| Error: usage limit reached$/)
      expect(logs[1]).toMatch(/^error Harness callback model.invoke failed: /)

      child.send({ type: 'error', id: 1, ok: false, error: { kind: 'model_error', message: 'claude 运行失败' } })
      await expect(running).rejects.toMatchObject({ reason: 'model' })
      expect(logs).toHaveLength(3)
      expect(logs[2]).toMatch(/^error Paper Wiki run of .+ failed at cli \(failed\): exit 1: starting .* Error: usage limit reached$/)
      for (const line of logs) expect(line).not.toMatch(/sk-ant|supersecret|researcher@/)
      runner.close()
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('stops the CLI call when the user cancels the run, and when the run ends any other way', async () => {
    const signals: AbortSignal[] = []
    const hanging: CliRunner = (call) => new Promise((_, reject) => {
      signals.push(call.signal)
      call.signal.addEventListener('abort', () => reject(new CliRunError('cancelled', '已停止 claude')))
    })

    const cancelled = paperWikiRunner(CLI_MODEL, hanging)
    const controller = new AbortController()
    const running = cancelled.runner.run(execution(controller.signal))
    cancelled.child.ready()
    await cancelled.child.frame()
    cancelled.child.callModel('call')
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    controller.abort()
    await expect(running).rejects.toMatchObject({ reason: 'cancelled' })
    expect(signals[0]!.aborted).toBe(true)
    cancelled.runner.close()

    const crashed = paperWikiRunner(CLI_MODEL, hanging)
    const failing = crashed.runner.run(execution())
    crashed.child.ready()
    await crashed.child.frame()
    crashed.child.callModel('call')
    await vi.waitFor(() => expect(signals).toHaveLength(2))
    crashed.child.emit('exit', 1, null)
    await expect(failing).rejects.toMatchObject({ reason: 'model' })
    expect(signals[1]!.aborted).toBe(true)
  })

  it('fails a run with the reason its CLI call failed for, each kind a reason of its own', async () => {
    const reasons: Record<CliFailureKind, string> = {
      unavailable: 'cli-missing', unsupported: 'cli-unsupported', 'signed-out': 'cli-signed-out',
      'sign-in-unknown': 'cli-sign-in-unknown', 'usage-limit': 'usage-limit', 'model-unavailable': 'model', timeout: 'cli-timeout',
      cancelled: 'cancelled', failed: 'model',
    }
    const failed: Record<string, unknown> = {}
    for (const kind of Object.keys(reasons) as CliFailureKind[]) {
      const { child, runner } = paperWikiRunner(CLI_MODEL, async () => { throw new CliRunError(kind, `claude ${kind}`) })
      const running = runner.run(execution()).catch((cause: unknown) => cause)
      child.ready()
      await child.frame()
      child.callModel(kind)
      await child.frame()
      child.send({ type: 'error', id: 1, ok: false, error: { kind: 'model_error', message: `claude ${kind}`, detail: 'subscription_cli' } })
      failed[kind] = callFailure(await running)
      runner.close()
    }
    expect(failed).toEqual(reasons)
  })

  it('fails a run whose output Harness found invalid as malformed output, on a subscription and an API alike', async () => {
    const output = async () => ({ output: { draft: 'not a draft' }, durationMs: 1 })
    const failed = []
    for (const [model, detail] of [
      [CLI_MODEL, 'structured_output'], [CLI_MODEL, 'invalid_anchor'], [API_MODEL, 'structured_output'],
    ] as const) {
      const { child, runner } = paperWikiRunner(model, output)
      const running = runner.run(execution()).catch((cause: unknown) => cause)
      child.ready()
      await child.frame()
      child.send({ type: 'error', id: 1, ok: false, error: { kind: 'model_error', message: '草稿不符合结构要求', detail } })
      failed.push(callFailure(await running))
      runner.close()
    }
    expect(failed).toEqual(['malformed-output', 'malformed-output', 'malformed-output'])
  })

  it('cancelling a run on a subscription ends the CLI\'s child process', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'meridian-cli-cancel-test-'))
    const pidFile = join(folder, 'pid')
    let pid: number | undefined
    try {
      const claude = join(folder, 'claude')
      writeFileSync(claude, [
        `#!${process.execPath}`,
        "require('node:fs').writeFileSync(process.env.PID_FILE, String(process.pid))",
        'setInterval(() => {}, 1000)',
      ].join('\n'))
      chmodSync(claude, 0o755)
      const { child, runner } = paperWikiRunner(CLI_MODEL, createCliRunner({
        discover: async (cli) => ({
          cli, installed: true, binary: claude, version: '2.1.280', missingFlags: [], signIn: 'subscription',
        }),
        environment: { PATH: '/usr/bin:/bin', PID_FILE: pidFile },
      }))
      const controller = new AbortController()
      const running = runner.run(execution(controller.signal))
      child.ready()
      await child.frame()
      child.callModel('call')
      await vi.waitFor(() => { pid = Number(readFileSync(pidFile, 'utf8')) }, { timeout: 5_000 })
      expect(alive(pid!)).toBe(true)

      controller.abort()
      await expect(running).rejects.toMatchObject({ reason: 'cancelled' })
      await vi.waitFor(() => expect(alive(pid!)).toBe(false), { timeout: 5_000 })
      runner.close()
    } finally {
      if (pid !== undefined && alive(pid)) process.kill(pid, 'SIGKILL')
      rmSync(folder, { recursive: true, force: true })
    }
  }, 15_000)

  it('sends an API run\'s limits to Harness and gives up on its request after the run\'s own timeout', async () => {
    const { child, runner } = paperWikiRunner(API_MODEL, vi.fn<CliRunner>())
    const limits = { maxOutputTokens: 38_000, maxModelCalls: 1, timeoutSeconds: 600 }
    const running = runner.run({ ...execution(), limits, requestTimeoutMs: 50 })
    child.ready()

    expect(await child.frame()).toMatchObject({ method: 'paper-wiki.propose', params: { limits } })
    await expect(running).rejects.toThrow()
    runner.close()
  })

  it('offers no model call to a run on an API model', async () => {
    const cli = vi.fn<CliRunner>()
    const { child, runner } = paperWikiRunner(API_MODEL, cli)
    const running = runner.run(execution())
    child.ready()
    await child.frame()

    child.callModel('call')
    expect(await child.frame()).toMatchObject({ type: 'error', callbackId: 'call', error: { kind: 'bad_request' } })
    expect(cli).not.toHaveBeenCalled()
    child.send({ type: 'response', id: 1, ok: true, result: envelope() })
    await running
    runner.close()
  })
})

/** A seeded test library (`node scripts/test-library.mjs seed`), whose four real arXiv PDFs the cases below read. */
const testLibrary = process.env['MERIDIAN_TEST_LIBRARY']
const testLibraryIt = testLibrary === undefined ? it.skip : it

/**
 * The test library's real papers: their page count, the page with the references heading, the last
 * page of reference entries, one entry's text, and whether page 1 holds the stored abstract.
 */
const REAL_PAPERS = [
  { id: '2401-15077', pages: 13, heading: 9, last: 11, entry: 'NEFTune: Noisy em- beddings improve instruction finetuning', abstractOnPage1: true },
  { id: '2309-06180', pages: 16, heading: 14, last: 16, entry: 'Check- mate: Breaking the memory wall', abstractOnPage1: true },
  { id: '2402-02750', pages: 15, heading: 10, last: 11, entry: 'The refinedweb dataset for falcon llm', abstractOnPage1: true },
  { id: '2401-10774', pages: 27, heading: 10, last: 12, entry: 'Judging llm-as-a-judge with mt-bench and chatbot arena', abstractOnPage1: false },
]

/** What a Paper Wiki run on `store` answers Harness's `papers.get` and `papers.source` reads of paper `id`. */
async function sentPaper(store: VaultStore, id: string) {
  const child = new FakeHarness()
  const runner = createPaperWikiHarnessRunner({
    store, model: { runtime: async () => API_MODEL } as unknown as HarnessModelConfig, cli: vi.fn<CliRunner>(), launch: () => child,
  })
  const running = runner.run({ ...execution(), plan: { ...execution().plan, targetId: id } }).catch(() => undefined)
  child.ready()
  await child.frame()
  const read = async (method: string) => {
    const reply = child.frame()
    child.send({ type: 'callback', id: 1, callbackId: method, method, params: { id } })
    return ((await reply) as { result: unknown }).result
  }
  const paper = await read('papers.get') as Record<string, unknown>
  const source = await read('papers.source') as { pages: Array<{ number: number; text: string }> }
  child.send({ type: 'error', id: 1, ok: false, error: { kind: 'model_error', message: 'stand-in ends the run' } })
  await running
  runner.close()
  return { paper, pages: source.pages }
}

describe('What a Paper Wiki run sends of its paper', () => {
  testLibraryIt('leaves out each real paper\'s bibliography text but keeps every page, and every other page\'s text as extracted', async () => {
    const vault = mkdtempSync(join(tmpdir(), 'meridian-wiki-ingest-'))
    cpSync(join(testLibrary!, 'library'), vault, { recursive: true })
    try {
      const store = createVaultStore(vault)
      for (const paper of REAL_PAPERS) {
        const extracted = await extractPdfPages(store.paperSource(paper.id))
        const sent = await sentPaper(store, paper.id)
        expect(extracted.map((page) => page.text).join(' ')).toContain(paper.entry)
        expect(sent.pages.map((page) => page.number)).toEqual(Array.from({ length: paper.pages }, (_, at) => at + 1))
        for (const [at, page] of sent.pages.entries()) {
          const original = extracted[at]!.text
          if (page.number === paper.heading) {
            expect(page.text).toMatch(/\sReferences$/u)
            expect(original.startsWith(page.text)).toBe(true)
          } else if (page.number > paper.heading && page.number <= paper.last) {
            expect(page.text).toBe('')
          } else {
            expect(page.text).toBe(original)
          }
        }
        expect(sent.pages.map((page) => page.text).join(' ')).not.toContain(paper.entry)
        const stored = store.getPaper(paper.id)
        expect(stored.abstract).toBeTruthy()
        expect(sent.paper).toEqual({
          id: stored.id, title: stored.title, authors: stored.authors, year: stored.year, venue: stored.venue,
          identifier: stored.identifier, ...(paper.abstractOnPage1 ? {} : { abstract: stored.abstract }),
        })
      }
    } finally {
      rmSync(vault, { recursive: true, force: true })
    }
  })

  testLibraryIt('sends a real paper whole when its references heading is gone', async () => {
    const vault = mkdtempSync(join(tmpdir(), 'meridian-wiki-ingest-'))
    cpSync(join(testLibrary!, 'library'), vault, { recursive: true })
    try {
      const store = createVaultStore(vault)
      for (const paper of REAL_PAPERS) {
        const unheaded = (await extractPdfPages(store.paperSource(paper.id)))
          .map((page) => ({ ...page, text: page.text.replace(/\sReferences\s/gu, ' Literature ') }))
        expect(withoutBibliography(unheaded)).toEqual(unheaded)
      }
    } finally {
      rmSync(vault, { recursive: true, force: true })
    }
  })

  const entries = (from: number) => Array.from({ length: 12 }, (_, at) =>
    `[${from + at}] Mei Lin, Arjun Rao, and Sofia Costa. 20${10 + at}. Paged attention for serving model ${from + at}. In Proceedings of the Systems Conference. 1${at}1–1${at}9.`).join(' ')
  const appendix = 'A. Implementation Details  The draft head reads the second-to-top features of the target model, as in speculative sampling (Leviathan et al., 2023), and it predicts the next feature from them before the token is sampled. '.repeat(4)

  it('sends every page unchanged when no page has a references heading', () => {
    const pages = [
      { number: 1, text: 'Paged attention  Abstract  We serve models with paged memory.' },
      { number: 2, text: `Related work. ${entries(1)}` },
      { number: 3, text: entries(13) },
    ]
    expect(withoutBibliography(pages)).toEqual(pages)
  })

  it('leaves out the references from their heading through the last whole page of entries, and keeps the appendix after them', () => {
    const pages = [
      { number: 1, text: 'Paged attention  Abstract  We serve models with paged memory.' },
      { number: 2, text: `We thank the reviewers.  References  ${entries(1)}` },
      { number: 3, text: entries(13) },
      { number: 4, text: appendix },
      { number: 5, text: entries(25) },
    ]
    expect(withoutBibliography(pages)).toEqual([
      pages[0], { number: 2, text: 'We thank the reviewers.  References' }, { number: 3, text: '' }, pages[3], pages[4],
    ])
  })

  it('keeps a page where the reference entries give way to the appendix', () => {
    const pages = [
      { number: 1, text: `We thank the reviewers.  References  ${entries(1)}` },
      { number: 2, text: `${entries(13)}  B. Numeric appendix  ${'Throughput rises with batch size until memory runs out. '.repeat(20)}` },
      { number: 3, text: appendix },
    ]
    expect(withoutBibliography(pages)).toEqual([{ number: 1, text: 'We thank the reviewers.  References' }, pages[1], pages[2]])
  })

  it('sends every page unchanged when the text after the heading does not read as reference entries', () => {
    const pages = [
      { number: 1, text: 'Paged attention  Abstract  We serve models with paged memory.' },
      { number: 2, text: `Table 3 lists the sources.  References  ${appendix}` },
      { number: 3, text: entries(1) },
    ]
    expect(withoutBibliography(pages)).toEqual(pages)
  })

  it('sends every page unchanged when more than one page has a references heading', () => {
    const pages = [
      { number: 1, text: `Main text.  References  ${entries(1)}` },
      { number: 2, text: `Appendix.  References  ${entries(13)}` },
    ]
    expect(withoutBibliography(pages)).toEqual(pages)
  })

  it('finds the abstract on a page despite line-break hyphens, LaTeX, typography and case, and not when its words differ', () => {
    const page = 'KIVI : A Tuning-Free Asymmetric 2bit Quantization  Abstract  KIVI   can enable Llama mod- els to keep almost the same qual- ity while using   2 . 6 ×   less peak memory. vLLM’s source code is public.  1 Introduction'
    expect(pageHoldsAbstract('KIVI can enable Llama models to keep almost the same quality while using $\\mathbf{2.6\\times}$ less peak memory. vLLM\'s source code is public.', page)).toBe(true)
    expect(pageHoldsAbstract('KIVI can enable Llama models to keep almost the same quality while using $\\mathbf{2.6\\times}$ less peak memory. The source code is public.', page)).toBe(false)
  })
})
