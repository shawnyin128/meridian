import { Component, type ErrorInfo, type ReactNode } from 'react'
import { PageFailure } from './PageShell.js'
import { useMessages } from '../messages/useMessages.js'

/**
 * Keeps one screen's failure inside that screen. Every screen stays mounted at once, so without a
 * boundary a single render error unmounts the whole app, sidebar included. Only a class component
 * can catch a render error, so the copy is read by a function component underneath.
 */
export class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Main forwards the renderer console to its own output, so this reaches the application log.
    console.error(`[screen] ${error.message}\n${info.componentStack ?? ''}`)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    return <ScreenFailure message={error.message} onRetry={() => this.setState({ error: null })} />
  }
}

/**
 * Clearing the error remounts the subtree. Navigation deliberately does not clear it: screens are
 * kept alive, so a screen broken by its own data would silently break again on return.
 */
function ScreenFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const m = useMessages()
  return (
    <PageFailure
      className="screen-failure" title={m.errors.screen.title} error={message}
      note={m.errors.screen.note}
      action={<button className="btn" onClick={onRetry}>{m.errors.screen.retry}</button>}
    />
  )
}
