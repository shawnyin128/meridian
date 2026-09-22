import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type {
  PaperHighlightRect, PaperReading, PaperRow, ReadingMutation,
} from '../../shared/contract.js'
import { papers } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import {
  useBanner, useCrumbTail, useJump, useToast, useVaultRevision, type CrumbSeg, type ScreenKey,
  type JumpAnchor,
} from '../shell/AppShell.js'
import { IconPlus } from '../components/icons.js'
import { mergedHighlightRects, normalizedHighlightRects } from './highlight-geometry.js'
import { PaperChat, type PaperChatPrompt } from '../components/chat/PaperChat.js'
import { ReaderSidePanel, type ReaderSideTab } from '../components/reader/ReaderSidePanel.js'
import { PageShell } from '../components/PageShell.js'
import './shell.css'
import './Reader.css'

const PAGE_WIDTH = 830
const MAX_FIT = 1.6
const MAX_DPR = 2
const ZOOM_STEP = 0.2
const ZOOM_MIN = 0.6
const ZOOM_MAX = 2.4
const WHEEL_MS = 180
const PROGRESS_MS = 800
const DOC_CACHE = 2

type PendingHighlight = {
  page: number
  quote: string
  rects: PaperHighlightRect[]
  anchor: { left: number; top: number }
}

const emptyReading = (paperId: string): PaperReading => ({ paperId, highlights: [], notes: [], remark: '' })

/** Redraws a set of highlights using the same path; it is called when the PDF is first loaded, when scaling the page feed tree, and when the reading status is updated. */
function paintHighlights(box: ParentNode, reading: PaperReading | null): void {
  box.querySelectorAll<HTMLElement>('.paper-highlights').forEach((marks) => marks.replaceChildren())
  if (reading === null) return
  for (const highlight of reading.highlights) {
    const marks = box.querySelector<HTMLElement>(
      `.pdfpagebox[data-page="${highlight.page}"] .paper-highlights`,
    )
    if (marks === null) continue
    for (const rect of mergedHighlightRects(highlight.rects)) {
      const mark = document.createElement('span')
      mark.className = `paper-highlight ${highlight.color}${highlight.note.trim() === '' ? '' : ' noted'}`
      mark.dataset.highlight = highlight.id
      mark.style.left = `${rect.x * 100}%`
      mark.style.top = `${rect.y * 100}%`
      mark.style.width = `${rect.width * 100}%`
      mark.style.height = `${rect.height * 100}%`
      marks.append(mark)
    }
  }
}

/** Take the original bytes of the article in the library and give them to pdf.js Worker for analysis. */
async function openDocument(id: string): Promise<PDFDocumentProxy> {
  const [data, pdfjs] = await Promise.all([papers.source(id), import('pdfjs-dist')])
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  return pdfjs.getDocument({ data }).promise
}

/**
 * PDF reader. Canvas is responsible for faithfully drawing the original text, and pdf.js TextLayer is responsible for native text selection and normalized rectangles.
 * Stacked separately between the two; the user's reading status is only persisted through Core commands, and this screen does not directly hold any files.
 */
export function Reader() {
  const m = useMessages()
  const { jump, returnTo } = useJump()
  const { revision, bump } = useVaultRevision()
  const toast = useToast()
  const banner = useBanner()
  const [opened, setOpened] = useState<string | null>(null)
  const [origin, setOrigin] = useState<ScreenKey | null>(null)
  const [paper, setPaper] = useState<PaperRow | null>(null)
  const [reading, setReading] = useState<PaperReading | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [zoom, setZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pending, setPending] = useState<PendingHighlight | null>(null)
  const [sideTab, setSideTab] = useState<ReaderSideTab | null>(null)
  const [focusHighlightId, setFocusHighlightId] = useState<string | null>(null)
  const [chatPrompt, setChatPrompt] = useState<PaperChatPrompt | null>(null)
  const [arrival, setArrival] = useState<JumpAnchor | null>(null)
  const [painted, setPainted] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const readingRef = useRef<PaperReading | null>(null)
  readingRef.current = reading
  const consumed = useRef(0)
  const zoomOf = useRef(new Map<string, number>())
  const docs = useRef(new Map<string, PDFDocumentProxy>())
  const loadingDocs = useRef(new Set<string>())
  const openedRef = useRef(opened)
  openedRef.current = opened
  const reportError = useCallback((cause: Error) => setError(cause.message), [])

  useEffect(() => {
    if (jump === null || jump.seq === consumed.current) return
    consumed.current = jump.seq
    setOrigin(jump.from)
    if (jump.target === opened) {
      if (jump.anchor !== undefined) setArrival(jump.anchor)
      return
    }
    setOpened(jump.target)
    setPaper(null)
    setReading(null)
    setDoc(null)
    setZoom(zoomOf.current.get(jump.target) ?? 1)
    setCurrentPage(1)
    setPending(null)
    setSideTab(null)
    setFocusHighlightId(null)
    setChatPrompt(null)
    setPainted(0)
    setArrival(jump.anchor ?? {})
  }, [jump, opened])

  useEffect(() => {
    if (opened === null) return
    setError(null)
    let live = true
    void papers.get(opened).then((value) => { if (live) setPaper(value) }).catch(reportError)
    return () => { live = false }
  }, [opened, revision, reportError])

  useEffect(() => {
    if (opened === null) return
    let live = true
    void papers.reading(opened)
      .then((value) => { if (live) setReading(value) })
      .catch(reportError)
    return () => { live = false }
  }, [opened, reportError])

  useEffect(() => {
    if (opened === null) return
    const cache = docs.current
    const hit = cache.get(opened)
    if (hit !== undefined) {
      // Move the reused entry to the end so it counts as the most recently used for eviction.
      cache.delete(opened)
      cache.set(opened, hit)
      setDoc(hit)
      return
    }
    // Re-entering a paper whose fetch is already in flight (e.g. rapid switching) must not start
    // a second parse for the same id; the fetch already underway will resolve into whichever id
    // is current then.
    if (loadingDocs.current.has(opened)) return
    loadingDocs.current.add(opened)
    const id = opened
    void openDocument(id).then((value) => {
      loadingDocs.current.delete(id)
      if (openedRef.current !== id) { void value.loadingTask.destroy(); return }
      cache.set(id, value)
      while (cache.size > DOC_CACHE) {
        const [oldest, entry] = cache.entries().next().value as [string, PDFDocumentProxy]
        cache.delete(oldest)
        void entry.loadingTask.destroy()
      }
      setDoc(value)
    }).catch((cause: Error) => {
      loadingDocs.current.delete(id)
      if (openedRef.current === id) reportError(cause)
    })
  }, [opened, reportError])

  // A kept document whose paper has left the library is dropped, so a later paper taking the same id never shows the old source.
  useEffect(() => {
    for (const id of docs.current.keys()) {
      if (id === opened) continue
      void papers.get(id).catch(() => {
        const entry = docs.current.get(id)
        if (entry === undefined || openedRef.current === id) return
        docs.current.delete(id)
        void entry.loadingTask.destroy()
      })
    }
  }, [opened, revision])

  // Every cached document must release its worker when the reader itself unmounts.
  useEffect(() => () => {
    for (const entry of docs.current.values()) void entry.loadingTask.destroy()
    docs.current.clear()
  }, [])

  useEffect(() => {
    const view = scroller.current
    const box = sheet.current
    if (view === null || box === null) return
    // A switched paper drops its document before the next one parses; the previous pages must not stay on screen meanwhile.
    if (doc === null) {
      box.replaceChildren()
      view.scrollTop = 0
      return
    }
    let live = true
    const textLayers: { cancel(): void }[] = []
    let renderTask: { cancel(): void } | null = null
    const at = view.scrollTop / (view.scrollHeight || 1)
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const pending = new Set<number>()
    const boxes = new Map<number, HTMLDivElement>()
    void (async () => {
      const pdfjs = await import('pdfjs-dist')
      const pages = await Promise.all(
        Array.from({ length: doc.numPages }, (_, index) => doc.getPage(index + 1)))
      if (!live) return
      const nextSheet = document.createDocumentFragment()
      for (const page of pages) {
        const scale = Math.min(PAGE_WIDTH / page.getViewport({ scale: 1 }).width, MAX_FIT) * zoom
        const viewport = page.getViewport({ scale })
        const pagebox = document.createElement('div')
        pagebox.className = 'pdfpagebox'
        pagebox.dataset.page = String(page.pageNumber)
        pagebox.style.width = `${Math.floor(viewport.width)}px`
        pagebox.style.height = `${Math.floor(viewport.height)}px`
        pagebox.style.setProperty('--scale-factor', String(viewport.scale))
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        pagebox.append(canvas)
        const marks = document.createElement('div')
        marks.className = 'paper-highlights'
        pagebox.append(marks)
        const text = document.createElement('div')
        text.className = 'textLayer'
        text.dataset.page = String(page.pageNumber)
        pagebox.append(text)
        nextSheet.append(pagebox)
        boxes.set(page.pageNumber, pagebox)
        pending.add(page.pageNumber)
      }
      // Every box has its final size now, so the sheet, the scroll position and the highlight overlays settle before any canvas is drawn.
      box.replaceChildren(nextSheet)
      paintHighlights(box, readingRef.current)
      view.scrollTop = at * view.scrollHeight
      setPainted((count) => count + 1)

      // The page whose top is nearest the viewport top goes first; each loop iteration re-ranks against live layout, so a scroll mid-render is picked up without extra bookkeeping.
      const nearestPending = (): number => {
        const top = view.getBoundingClientRect().top
        let best = pending.values().next().value!
        let distance = Number.POSITIVE_INFINITY
        for (const pageNumber of pending) {
          const delta = Math.abs(boxes.get(pageNumber)!.getBoundingClientRect().top - top)
          if (delta < distance) { best = pageNumber; distance = delta }
        }
        return best
      }

      while (live && pending.size > 0) {
        const pageNumber = nearestPending()
        const page = pages[pageNumber - 1]!
        const pagebox = boxes.get(pageNumber)!
        const canvas = pagebox.querySelector('canvas')!
        const viewport = page.getViewport({ scale: Number(pagebox.style.getPropertyValue('--scale-factor')) })
        const task = page.render({ canvas, viewport, transform: [dpr, 0, 0, dpr, 0, 0], intent: 'print' })
        renderTask = task
        await task.promise
        renderTask = null
        if (!live) return
        const textLayer = new pdfjs.TextLayer({
          textContentSource: await page.getTextContent(), container: pagebox.querySelector<HTMLElement>('.textLayer')!, viewport,
        })
        textLayers.push(textLayer)
        await textLayer.render()
        if (!live) return
        pagebox.dataset.painted = '1'
        pending.delete(pageNumber)
        // Yield one frame between pages so scrolling and the selection toolbar stay responsive while the rest renders.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    })().catch((cause: unknown) => {
      if (live && !(cause instanceof Error && cause.name === 'RenderingCancelledException')) reportError(cause as Error)
    })
    return () => {
      live = false
      renderTask?.cancel()
      for (const layer of textLayers) layer.cancel()
    }
  }, [doc, zoom, reportError])

  // Highlights are independent overlays; when you change notes or add new highlights, you only change these small rectangles and do not redraw the PDF canvas / text layer.
  useEffect(() => {
    const box = sheet.current
    if (box !== null) paintHighlights(box, reading)
  }, [reading])

  // The drop point must wait until the PDF page and reading history are ready; clear it after the drop, and the subsequent zooming and redrawing will not move the position.
  useEffect(() => {
    const view = scroller.current
    if (arrival === null || painted === 0 || reading === null || view === null) return
    const mark = arrival.highlight === undefined
      ? null
      : view.querySelector<HTMLElement>(`.paper-highlight[data-highlight="${arrival.highlight}"]`)
    if (mark !== null) mark.scrollIntoView({ block: 'center' })
    else {
      const page = arrival.page ?? reading.lastPage ?? 1
      view.querySelector<HTMLElement>(`.pdfpagebox[data-page="${page}"]`)
        ?.scrollIntoView({ block: 'start' })
    }
    const notedOnly = reading.notes.length === 0
      && reading.highlights.some((highlight) => highlight.note.trim() !== '')
    if (arrival.panel !== undefined) {
      setSideTab(arrival.panel === 'notes' && notedOnly ? 'highlights' : arrival.panel)
    }
    if (arrival.highlight !== undefined) setFocusHighlightId(arrival.highlight)
    setArrival(null)
  }, [arrival, painted, reading])

  const zoomBy = useCallback((delta: number) => {
    setZoom((held) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, held + delta)) * 10) / 10)
  }, [])

  useEffect(() => {
    const view = scroller.current
    if (view === null) return
    let last = 0
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      const now = Date.now()
      if (now - last < WHEEL_MS) return
      last = now
      zoomBy(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
    }
    view.addEventListener('wheel', wheel, { passive: false })
    return () => view.removeEventListener('wheel', wheel)
  }, [zoomBy])

  useEffect(() => {
    if (opened !== null) zoomOf.current.set(opened, zoom)
  }, [opened, zoom])

  // Stay on one page for a while before writing down, and do not frequently scroll through the middle pages.
  useEffect(() => {
    if (opened === null || doc === null || reading === null || reading.lastPage === currentPage) return
    if (reading.lastPage === undefined && currentPage === 1) return
    const timer = window.setTimeout(() => {
      void papers.mutateReading(opened, { kind: 'progress.set', page: currentPage })
        .then(setReading)
        .catch((cause: Error) => toast(cause.message))
    }, PROGRESS_MS)
    return () => window.clearTimeout(timer)
  }, [opened, doc, reading, currentPage, toast])

  useEffect(() => {
    const view = scroller.current
    if (view === null) return
    const locate = () => {
      const top = view.getBoundingClientRect().top + 28
      let nearest = 1
      let distance = Number.POSITIVE_INFINITY
      view.querySelectorAll<HTMLElement>('.pdfpagebox').forEach((pagebox) => {
        const delta = Math.abs(pagebox.getBoundingClientRect().top - top)
        if (delta < distance) {
          nearest = Number(pagebox.dataset.page)
          distance = delta
        }
      })
      setCurrentPage(nearest)
    }
    view.addEventListener('scroll', locate, { passive: true })
    return () => view.removeEventListener('scroll', locate)
  }, [doc])

  /** Replace the browser's native selection with a normalized rectangle within the same page; cross-page selections are left to the user to reselect. */
  const captureSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
      setPending(null)
      return
    }
    const range = selection.getRangeAt(0)
    const startParent = range.startContainer instanceof HTMLElement
      ? range.startContainer : range.startContainer.parentElement
    const endParent = range.endContainer instanceof HTMLElement
      ? range.endContainer : range.endContainer.parentElement
    const start = startParent?.closest<HTMLElement>('.textLayer') ?? null
    const end = endParent?.closest<HTMLElement>('.textLayer') ?? null
    if (start === null || start !== end) {
      setPending(null)
      return
    }
    const pagebox = start.closest<HTMLElement>('.pdfpagebox')
    if (pagebox === null) return
    const rects = normalizedHighlightRects(pagebox.getBoundingClientRect(), [...range.getClientRects()])
    const quote = selection.toString().replace(/\s+/g, ' ').trim()
    const selectionRect = range.getBoundingClientRect()
    const left = Math.min(window.innerWidth - 100, Math.max(100, selectionRect.left + selectionRect.width / 2))
    const top = Math.max(12, selectionRect.top - 44)
    setPending(quote === '' || rects.length === 0
      ? null : { page: Number(pagebox.dataset.page), quote, rects, anchor: { left, top } })
  }, [])

  const mutateReading = useCallback(async (mutation: ReadingMutation): Promise<PaperReading | null> => {
    if (opened === null || saving) return null
    setSaving(true)
    try {
      const next = await papers.mutateReading(opened, mutation)
      setReading(next)
      bump()
      return next
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause))
      return null
    } finally {
      setSaving(false)
    }
  }, [opened, saving, bump, toast])

  const mutate = useCallback(async (mutation: ReadingMutation): Promise<boolean> =>
    await mutateReading(mutation) !== null, [mutateReading])

  const saveRemark = async (text: string): Promise<boolean> => {
    const ok = await mutate({ kind: 'remark.set', text })
    if (ok) banner(m.papers.notices.remarkSaved)
    return ok
  }

  const addHighlight = async (withNote: boolean) => {
    if (pending === null) return
    const selection = pending
    const previous = new Set(reading?.highlights.map((highlight) => highlight.id) ?? [])
    // First remove the blue selection of the browser; do not let it continue to cover the persistent highlight while Core is writing.
    window.getSelection()?.removeAllRanges()
    setPending(null)
    const next = await mutateReading({
      kind: 'highlight.add', page: selection.page, quote: selection.quote, rects: selection.rects, color: 'yellow',
    })
    if (next === null) return
    if (withNote) {
      const created = next.highlights.find((highlight) => !previous.has(highlight.id))
      setFocusHighlightId(created?.id ?? null)
      setSideTab('highlights')
    }
  }

  const askAi = () => {
    if (pending === null) return
    setChatPrompt({ seq: Date.now(), quote: pending.quote })
    window.getSelection()?.removeAllRanges()
    setPending(null)
  }

  const jumpToPage = (page: number) => {
    scroller.current?.querySelector<HTMLElement>(`.pdfpagebox[data-page="${page}"]`)
      ?.scrollIntoView({ block: 'start' })
  }

  const tail = useMemo<CrumbSeg[]>(
    () => (paper === null ? [] : [{ text: paper.title }]), [paper])
  useCrumbTail(tail)

  const status = error ?? (opened !== null && (doc === null || reading === null) ? m.reader.loadingPdf : null)
  const heldReading = reading ?? (opened === null ? null : emptyReading(opened))

  return (
    <>
      <PaperChat
        paper={paper} prompt={chatPrompt}
        onBack={() => returnTo(origin ?? 'papers')}
      />
      <PageShell>
        <div className="reader">
          <div className="pdfwrap" ref={scroller} onMouseUp={captureSelection}>
            <div ref={sheet} className="pdfsheet" />
            {status === null ? null : <div className="pdfload">{status}</div>}
          </div>

          {pending === null ? null : (
            <div className="selection-tools" style={{ left: pending.anchor.left, top: pending.anchor.top }}>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { void addHighlight(false) }}>{m.reader.selection.highlight}</button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { void addHighlight(true) }}>{m.reader.selection.note}</button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={askAi}>{m.reader.selection.askAi}</button>
            </div>
          )}

          <ReaderSidePanel
            tab={sideTab} onTab={(tab) => { setSideTab(tab); setFocusHighlightId(null) }}
            paper={paper} onPaper={setPaper} reading={heldReading} currentPage={currentPage}
            saving={saving} onMutate={mutate} onSaveRemark={saveRemark}
            onJump={jumpToPage} focusHighlightId={focusHighlightId}
          />

          <div className="zoomctl">
            <button title={m.reader.zoom.out} onClick={() => zoomBy(-ZOOM_STEP)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 12h14" />
              </svg>
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button title={m.reader.zoom.in} onClick={() => zoomBy(ZOOM_STEP)}><IconPlus /></button>
          </div>
        </div>
      </PageShell>
    </>
  )
}
