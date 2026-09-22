import { describe, expect, it, vi } from 'vitest'
import { afterCoreStops } from './restart-core.js'

type ExitListener = (code: number) => void

function runningProcess(killed = true) {
  let exit: ExitListener | undefined
  const process = {
    pid: 42 as number | undefined,
    once: vi.fn((_event: 'exit', listener: ExitListener) => {
      exit = listener
      return process
    }),
    off: vi.fn(() => process),
    kill: vi.fn(() => killed),
  }
  return { process, exit: () => exit?.(0) }
}

describe('afterCoreStops', () => {
  it('waits for a running Core to exit before replacing it', () => {
    const { process, exit } = runningProcess()
    const replace = vi.fn()

    afterCoreStops(process, replace)

    expect(process.kill).toHaveBeenCalledOnce()
    expect(replace).not.toHaveBeenCalled()
    exit()
    expect(replace).toHaveBeenCalledOnce()
  })

  it('replaces immediately when Core is already stopped or cannot be killed', () => {
    const stopped = runningProcess().process
    stopped.pid = undefined
    const replaceStopped = vi.fn()
    afterCoreStops(stopped, replaceStopped)
    expect(replaceStopped).toHaveBeenCalledOnce()
    expect(stopped.kill).not.toHaveBeenCalled()

    const failed = runningProcess(false).process
    const replaceFailed = vi.fn()
    afterCoreStops(failed, replaceFailed)
    expect(failed.off).toHaveBeenCalledOnce()
    expect(replaceFailed).toHaveBeenCalledOnce()
  })
})
