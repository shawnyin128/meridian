/** Where Undos on offer go: the shell's ⌘Z, while it is mounted. */
type Taker = (run: () => void) => void
let taker: Taker | null = null

/** Takes every Undo offered from now on, until the returned function is called. */
export function takeUndoOffers(next: Taker): () => void {
  taker = next
  return () => { if (taker === next) taker = null }
}

/** Offers `run`, which undoes a write, to ⌘Z (see `useNotice`); with no shell mounted nothing takes it. */
export function offerUndo(run: () => void): void {
  taker?.(run)
}
