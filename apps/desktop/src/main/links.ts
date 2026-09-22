/**
 * Returns the window-open handler for a page: `http(s)` URLs are handed to
 * `open`, every other URL is dropped, and no new window is ever opened.
 */
export const openLinks = (open: (url: string) => Promise<void>) =>
  ({ url }: { url: string }): { action: 'deny' } => {
    if (/^https?:\/\//.test(url)) void open(url)
    return { action: 'deny' }
  }
