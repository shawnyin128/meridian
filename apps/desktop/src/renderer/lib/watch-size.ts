/**
 * Calls `changed` whenever `area` or one of its children changes size, a child being added or removed
 * included, until the returned function is called.
 */
export function watchSize(area: HTMLElement, changed: () => void): () => void {
  const sizes = new ResizeObserver(changed)
  const observe = () => {
    sizes.disconnect()
    sizes.observe(area)
    for (const child of area.children) sizes.observe(child)
  }
  observe()
  const children = new MutationObserver(() => { observe(); changed() })
  children.observe(area, { childList: true })
  return () => {
    sizes.disconnect()
    children.disconnect()
  }
}
