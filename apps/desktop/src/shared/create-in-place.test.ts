import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { describe, expect, it } from 'vitest'

const RENDERER = join(import.meta.dirname, '..', 'renderer')

/** Every component and route source under the renderer, tests excluded, as paths relative to it. */
const SOURCES = readdirSync(RENDERER, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))

type Node = { type: string; [key: string]: unknown }

/** A dialog: the modal shell, or a component named `…Dialog` that wraps it. A confirmation is not one. */
const isDialog = (name: string) => name === 'ModalDialog' || (name.endsWith('Dialog') && name !== 'ConfirmDialog')

/**
 * Every dialog placed in the source file `path`, as `<path> <Dialog>` followed by the dotted names its
 * `title` reads, which say what the dialog is for.
 */
function dialogsIn(path: string): string[] {
  const source = readFileSync(join(RENDERER, path), 'utf8')
  const found: string[] = []
  const visit = (node: unknown) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    const held = node as Node
    const name = held.type === 'JSXOpeningElement' && (held.name as Node).type === 'JSXIdentifier'
      ? (held.name as Node).name as string : ''
    if (isDialog(name)) {
      const title = (held.attributes as Node[])
        .find((attr) => attr.type === 'JSXAttribute' && (attr.name as Node).name === 'title')
      const reads = title === undefined
        ? []
        : source.slice(title.start as number, title.end as number).match(/\b[a-z]\w*(?:\.\w+)+/g) ?? []
      found.push([`${path} <${name}>`, ...[...new Set(reads)].sort()].join(' '))
    }
    for (const [key, value] of Object.entries(held)) if (key !== 'loc') visit(value)
  }
  visit(parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program)
  return found
}

const PLACED = SOURCES.flatMap(dialogsIn)

/** The dialogs that do not create anything, each with what it is for. */
const NOT_CREATING: Record<string, string> = {
  'components/AboutDialog.tsx <ModalDialog>': 'shows the App version and its update',
  'shell/AppShell.tsx <AboutDialog>': 'opens About from the App menu',
  'shell/CommandPalette.tsx <ModalDialog>': 'runs a command',
  'routes/Settings.tsx <ModalDialog>': 'holds Settings',
  'routes/ProjectDetail.tsx <ModalDialog> m.project.workspace.dialogTitle': 'connects the project to a workspace',
  'components/SshFolderPicker.tsx <ModalDialog>': 'chooses a folder of an SSH host',
}

describe('新建就地起草', () => {
  it('新建不弹对话框：每个对话框都写明它做什么，没有一个是新建', () => {
    expect(PLACED.filter((dialog) => !(dialog in NOT_CREATING)).sort()).toEqual([])
  })

  it('点名的对话框都还在源码里', () => {
    expect(Object.keys(NOT_CREATING).filter((dialog) => !PLACED.includes(dialog))).toEqual([])
  })
})
