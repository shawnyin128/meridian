import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cliEnvironment, runChild, stderrExcerpt } from './child.js'

/** Variables each CLI's documentation or binary names for an API key, token, endpoint, provider or cloud account. */
const BILLING_VARIABLES = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_CUSTOM_HEADERS',
  'ANTHROPIC_BEDROCK_BASE_URL', 'ANTHROPIC_VERTEX_PROJECT_ID', 'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_AWS_API_KEY', 'ANTHROPIC_PROFILE',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_MANTLE',
  'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD', 'CLAUDE_CODE_USE_GATEWAY',
  'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', 'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
  'AWS_BEARER_TOKEN_BEDROCK', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE',
  'AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE',
  'CLOUD_ML_REGION', 'VERTEX_REGION_CLAUDE_HAIKU_4_5', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID',
  'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_ORGANIZATION', 'OPENAI_PROJECT',
  'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN',
]

const KEPT_VARIABLES = ['HOME', 'LANG', 'HTTPS_PROXY', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS']

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('the environment a CLI runs in', () => {
  it.each(BILLING_VARIABLES)('leaves out %s, which could bill another account', (name) => {
    const env = cliEnvironment({ [name]: 'must-not-cross', PATH: '/usr/bin' }, '/opt/cli/bin/claude')
    expect(env).not.toHaveProperty(name)
  })

  it('leaves such a variable out whatever its case, as Windows reads it', () => {
    expect(cliEnvironment({ Anthropic_Api_Key: 'x', openai_base_url: 'y' }, '/bin/claude')).toEqual({ PATH: '/bin' })
  })

  it.each(KEPT_VARIABLES)('keeps %s', (name) => {
    expect(cliEnvironment({ [name]: 'kept' }, '/bin/claude')).toMatchObject({ [name]: 'kept' })
  })
})

describe('the stderr excerpt a CLI failure carries', () => {
  it('keeps the end of stderr, bounded, with credentials and email addresses replaced', () => {
    const stderr = [
      'x'.repeat(2_000),
      'using key sk-ant-api03-abcdefghijklmnop for researcher@example.org',
      'Authorization: Bearer secret-token-value',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      'Error: usage limit reached',
    ].join('\n')

    const excerpt = stderrExcerpt(stderr)

    expect(excerpt.length).toBeLessThanOrEqual(500)
    expect(excerpt.endsWith('Error: usage limit reached')).toBe(true)
    expect(excerpt).not.toMatch(/sk-ant|researcher@|secret-token|eyJhbGci/)
  })
})

/**
 * A stand-in cmd.exe that undoes what cmd.exe and a batch file's `%*` do to a `/d /s /c "<line>"`
 * command line: one caret pass for cmd, one more for the arguments the shim passes on, then the C
 * runtime's argument rules. It records the command and the arguments the shim's program would get.
 */
const STAND_IN_CMD = String.raw`#!${process.execPath}
const fs = require('node:fs')
const [d, s, c, quoted] = process.argv.slice(2)
const line = quoted.slice(1, -1)
let command = ''
let at = 0
for (; at < line.length && line[at] !== ' '; at += 1) {
  if (line[at] === '^') at += 1
  command += line[at]
}
const uncaret = (text) => text.replace(/\^(.)/gs, '$1')
const rest = uncaret(uncaret(line.slice(at + 1)))
const argv = []
let current = ''
let quoting = false
let started = false
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i] === '\\') {
    let slashes = 0
    while (rest[i] === '\\') { slashes += 1; i += 1 }
    if (rest[i] === '"') {
      current += '\\'.repeat(slashes >> 1)
      if (slashes % 2 === 1) current += '"'
      else quoting = !quoting
    } else {
      current += '\\'.repeat(slashes)
      i -= 1
    }
    started = true
  } else if (rest[i] === '"') {
    quoting = !quoting
    started = true
  } else if (rest[i] === ' ' && !quoting) {
    if (started) argv.push(current)
    current = ''
    started = false
  } else {
    current += rest[i]
    started = true
  }
}
if (started) argv.push(current)
fs.writeFileSync(process.env.STAND_IN_RECORD, JSON.stringify({ flags: [d, s, c], command, argv }))
`

describe('a CLI that npm installed on Windows as a .cmd shim', () => {
  function standInCmd() {
    const folder = mkdtempSync(join(tmpdir(), 'meridian-cmd-test-'))
    folders.push(folder)
    const cmd = join(folder, 'cmd.exe')
    writeFileSync(cmd, STAND_IN_CMD)
    chmodSync(cmd, 0o755)
    const record = join(folder, 'record.json')
    return { folder, env: { ComSpec: cmd, STAND_IN_RECORD: record }, record }
  }

  it('starts through cmd.exe /d /s /c, every argument quoted so it arrives as it was', async () => {
    const { folder, env, record } = standInCmd()
    const shim = 'C:\\Users\\A & B (x86)\\AppData\\Roaming\\npm\\codex.cmd'
    const args = [
      'exec', '--output-schema', 'C:\\Users\\A & B\\Temp\\meridian-cli-x\\schema.json', '--model=gpt-5.5',
      'with "quotes" inside', 'trailing\\', 'back\\\\"slash', '100% & | < > ^ ! ( ) , ;', '', '-',
    ]

    await runChild(shim, args, { cwd: folder, env, timeoutMs: 10_000, platform: 'win32' })

    expect(JSON.parse(readFileSync(record, 'utf8'))).toEqual({ flags: ['/d', '/s', '/c'], command: shim, argv: args })
  })

  it('refuses arguments cmd.exe cannot carry, a line break or a line past its length limit, without starting it', async () => {
    const { folder, env, record } = standInCmd()
    const start = (args: string[]) => runChild('C:\\npm\\claude.cmd', args, {
      cwd: folder, env, timeoutMs: 10_000, platform: 'win32',
    })

    await expect(start(['--system-prompt', 'line one\nline two'])).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(start(['--json-schema', 'x'.repeat(9_000)])).rejects.toMatchObject({ kind: 'unavailable' })
    expect(existsSync(record)).toBe(false)
  })
})
