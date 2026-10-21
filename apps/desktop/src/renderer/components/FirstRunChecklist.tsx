import { useEffect, useState } from 'react'
import { extensions, harness, library } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { useJump, usePaperCount, useSettingsOpen, useVaultRevision } from '../shell/AppShell.js'
import { Card } from './Card.js'
import { IconCheck } from './icons.js'
import './FirstRunChecklist.css'

/** The renderer localStorage key of the checklist's state for the library at `root`: `open` or `closed`. */
export const firstRunKey = (root: string): string => `meridian.firstRun:${root}`

/**
 * Whether the checklist shows, given its stored state, the library's paper count and each step's done
 * state: never once it is `closed`; otherwise while a step is not done, on a library that had no papers
 * when the checklist first showed there (`open`) or has none now.
 */
export function firstRunShown(stored: string | null, papers: number, done: boolean[]): boolean {
  return stored !== 'closed' && (stored === 'open' || papers === 0) && done.some((d) => !d)
}

/**
 * What the checklist read: the library's root, its stored state there, and whether each of the first
 * three steps is done, or null for the steps when the checklist cannot show and they were not read.
 */
type Setup = { root: string; stored: string | null; steps: { library: boolean; model: boolean; plugin: boolean } | null }

/**
 * The first-run checklist of an empty or new library, one line: choose a library, set up a model,
 * install the agent plugin, import a first paper. Each step is done or not as the library and Settings
 * stand, read again on every vault write and whenever Settings closes, and a step not done opens where
 * it is done. The checklist closes for good on this machine, per library, once every step is done or
 * the user hides it. `className` places it; `onError` receives a read that failed.
 */
export function FirstRunChecklist({ className, onError }: {
  className?: string
  onError: (error: unknown) => void
}) {
  const m = useMessages()
  const f = m.feed.firstRun
  const papers = usePaperCount()
  const { revision } = useVaultRevision()
  const { open: settingsOpen, openCategory } = useSettingsOpen()
  const { open } = useJump()
  const [setup, setSetup] = useState<Setup | null>(null)

  useEffect(() => {
    if (settingsOpen || papers === null) return
    let live = true
    void library.location().then(async (where) => {
      const stored = window.localStorage.getItem(firstRunKey(where.root))
      if (stored === 'closed' || (stored !== 'open' && papers > 0)) {
        if (live) setSetup({ root: where.root, stored, steps: null })
        return
      }
      const [model, plugins] = await Promise.all([harness.modelSettings(), extensions.status()])
      if (live) {
        setSetup({
          root: where.root, stored, steps: {
            library: where.openError === null,
            model: model.configured,
            plugin: plugins.some((plugin) => plugin.state !== 'not-installed'),
          },
        })
      }
    }).catch(onError)
    return () => { live = false }
  }, [revision, settingsOpen, papers, onError])

  const steps = setup === null || setup.steps === null || papers === null ? null : [
    { key: 'library', done: setup.steps.library, go: () => openCategory('storage') },
    { key: 'model', done: setup.steps.model, go: () => openCategory('model') },
    { key: 'plugin', done: setup.steps.plugin, go: () => openCategory('extensions') },
    { key: 'paper', done: papers > 0, go: () => open('papers', '', { importPdf: true }) },
  ] as const
  const allDone = steps !== null && steps.every((step) => step.done)

  /** Stores `state` for the library at `root` and shows the checklist by it. */
  const keep = (root: string, state: 'open' | 'closed') => {
    window.localStorage.setItem(firstRunKey(root), state)
    setSetup((held) => (held === null ? held : { ...held, stored: state }))
  }

  // A library first seen empty is remembered as open, so the checklist stays through its first import.
  const next = setup === null || steps === null ? null
    : setup.stored === null && papers === 0 ? 'open' : setup.stored === 'open' && allDone ? 'closed' : null
  useEffect(() => {
    if (next !== null) keep(setup!.root, next)
  }, [next, setup])

  if (setup === null || steps === null || !firstRunShown(setup.stored, papers!, steps.map((step) => step.done))) return null
  return (
    <Card as="section" flush className={className === undefined ? 'firstrun' : `firstrun ${className}`} aria-label={f.heading}>
      <div className="firstrun-row">
        <span className="firstrun-heading">{f.heading}</span>
        <ul className="firstrun-steps">
          {steps.map((step) => (
            <li key={step.key} data-step={step.key} data-done={step.done}>
              {step.done
                ? <span className="firstrun-done"><IconCheck />{f.steps[step.key]}</span>
                : <button type="button" className="btn sm" onClick={step.go}>{f.steps[step.key]}</button>}
            </li>
          ))}
        </ul>
        <button type="button" className="btn ghost sm firstrun-hide" onClick={() => keep(setup.root, 'closed')}>{f.dismiss}</button>
      </div>
    </Card>
  )
}
