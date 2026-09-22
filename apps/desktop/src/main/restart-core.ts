type RestartableProcess = {
  pid: number | undefined
  once(event: 'exit', listener: (code: number) => void): unknown
  off(event: 'exit', listener: (code: number) => void): unknown
  kill(): boolean
}

/** Run the replacement only after the current Core has stopped, without relaunching Electron. */
export function afterCoreStops(previous: RestartableProcess, replace: () => void): void {
  if (previous.pid === undefined) {
    replace()
    return
  }
  previous.once('exit', replace)
  if (!previous.kill()) {
    previous.off('exit', replace)
    replace()
  }
}
