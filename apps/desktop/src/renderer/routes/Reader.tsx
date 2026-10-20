import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask, TextLayer } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type {
  PaperHighlightRect, PaperReading, PaperRow, ReadingMutation,
} from '../../shared/contract.js'
import { papers } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import { useMessages } from '../messages/useMessages.js'
import {
  useCrumbTail, useJump, useNotice, useVaultRevision, type CrumbSeg, type ScreenKey, type JumpAnchor,
} from '../shell/AppShell.js'
import { IconButton } from '../components/IconButton.js'
import { IconMinus, IconPlus } from '../components/icons.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { PickerPopover, type AnchorBox } from '../components/PickerPopover.js'
import { Toolbar, ToolbarButton } from '../components/Toolbar.js'
import { Tooltip } from '../components/Tooltip.js'
import {
  highlightLines, highlightShape, normalizedHighlightRects, selectedTextRanges, selectionBox,
} from './highlight-geometry.js'
import {
  ZOOM_MAX, ZOOM_MIN, clampZoom, keptScroll, pageScale, scaledAbout, wheelZoom, type SheetTransform,
} from './reader-zoom.js'
import { PaperChat, type PaperChatPrompt } from '../components/chat/PaperChat.js'
import { ReaderSidePanel, type ReaderSideTab } from '../components/reader/ReaderSidePanel.js'
import { PageShell } from '../components/PageShell.js'
import { plainTitle } from '../components/paper/paper-text.js'
import './shell.css'
import './Reader.css'

const MAX_DPR = 2
const ZOOM_STEP = 0.2
/** How long zooming and scrolling pause before the pages are laid out and drawn at the zoom shown. */
const SETTLE_MS = 150
const PROGRESS_MS = 800
const DOC_CACHE = 2
const SVG_NS = 'http://www.w3.org/2000/svg'
const UNSCALED: SheetTransform = { x: 0, y: 0, scale: 1 }

/**
 * One PDF page on the sheet: its box, the scale its canvas holds or is being drawn at, the canvas
 * draw in flight, and its text layer once made.
 */
type PageSlot = {
  pdf: PDFPageProxy
  box: HTMLDivElement
  scale: number
  task: RenderTask | null
  text: TextLayer | null
}

type PendingHighlight = {
  page: number
  quote: string
  rects: PaperHighlightRect[]
  /** The selected text's box on screen, measured from its page each time it is read. */
  box: AnchorBox
}

const emptyReading = (paperId: string): PaperReading => ({ paperId, highlights: [], notes: [], remark: '' })

/** Redraws every highlight through one path; called when the PDF first loads and when the reading state updates. */
function paintHighlights(box: ParentNode, reading: PaperReading | null): void {
  box.querySelectorAll<HTMLElement>('.paper-highlights').forEach((marks) => marks.replaceChildren())
  if (reading === null) return
  for (const highlight of reading.highlights) {
    const pagebox = box.querySelector<HTMLElement>(`.pdfpagebox[data-page="${highlight.page}"]`)
    if (pagebox === null) continue
    const noted = highlight.note.trim() !== ''
    const { box: bounds, path } = highlightShape(
      highlightLines(highlight.rects, Number(pagebox.dataset.aspect)), noted)
    const mark = document.createElementNS(SVG_NS, 'svg')
    mark.setAttribute('class', `paper-highlight ${highlight.color}${noted ? ' noted' : ''}`)
    mark.dataset.highlight = highlight.id
    mark.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)
    mark.setAttribute('preserveAspectRatio', 'none')
    mark.style.left = `${bounds.x * 100}%`
    mark.style.top = `${bounds.y * 100}%`
    mark.style.width = `${bounds.width * 100}%`
    mark.style.height = `${bounds.height * 100}%`
    const shape = document.createElementNS(SVG_NS, 'path')
    shape.setAttribute('d', path)
    mark.append(shape)
    pagebox.querySelector('.paper-highlights')!.append(mark)
  }
}

/** True when `cause` is pdf.js cancelling a render that a newer draw or a closed document replaced. */
const cancelled = (cause: unknown): boolean => cause instanceof Error && cause.name === 'RenderingCancelledException'

/**
 * Sizes a page box for `zoom` in a scroll area `room` px wide; its canvas, text layer and highlights
 * follow the box's size and `--scale-factor`.
 */
function layOut(slot: PageSlot, zoom: number, room: number): void {
  const viewport = slot.pdf.getViewport({
    scale: pageScale(slot.pdf.getViewport({ scale: 1 }).width, room, zoom),
  })
  slot.box.style.width = `${Math.floor(viewport.width)}px`
  slot.box.style.height = `${Math.floor(viewport.height)}px`
  slot.box.style.setProperty('--scale-factor', String(viewport.scale))
}

/** The content width of the pages' scroll area, in px: its width inside the padding and the scrollbar. */
function roomOf(view: HTMLElement): number {
  const style = getComputedStyle(view)
  return view.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
}

/** The page whose box is nearest the client point `point`, measured vertically. */
function slotNearest(slots: Iterable<PageSlot>, point: { y: number }): PageSlot {
  const offset = (slot: PageSlot) => {
    const rect = slot.box.getBoundingClientRect()
    return Math.max(rect.top - point.y, point.y - rect.bottom, 0)
  }
  return [...slots].reduce((best, slot) => (offset(slot) < offset(best) ? slot : best))
}

/** The scale a page box is laid out at. */
const laidOutScale = (slot: PageSlot): number => Number(slot.box.style.getPropertyValue('--scale-factor'))

/**
 * Draws a page at the scale its box is laid out at. The first drawing paints into the page's empty
 * canvas; a redraw paints into a new canvas that replaces the old one once complete, so the old
 * drawing stays on screen meanwhile. Cancels the page's draw in flight. Returns the viewport drawn,
 * or rejects with pdf.js's RenderingCancelledException when cancelled.
 */
async function drawCanvas(slot: PageSlot): Promise<PageViewport> {
  const viewport = slot.pdf.getViewport({ scale: laidOutScale(slot) })
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const held = slot.box.querySelector('canvas')!
  const canvas = slot.scale === 0 ? held : document.createElement('canvas')
  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  slot.task?.cancel()
  slot.scale = viewport.scale
  slot.task = slot.pdf.render({ canvas, viewport, transform: [dpr, 0, 0, dpr, 0, 0], intent: 'print' })
  await slot.task.promise
  slot.task = null
  if (canvas !== held) held.replaceWith(canvas)
  return viewport
}

/** Fetches the paper's source PDF bytes from the vault and hands them to the pdf.js worker to parse. */
async function openDocument(id: string): Promise<PDFDocumentProxy> {
  const [data, pdfjs] = await Promise.all([papers.source(id), import('pdfjs-dist')])
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  return pdfjs.getDocument({ data }).promise
}

/**
 * PDF reader. A canvas draws the original pages faithfully, and a pdf.js TextLayer stacked over it
 * provides native text selection and the normalized highlight rectangles. The user's reading state
 * persists only through Core commands; this screen holds no files itself.
 */
export function Reader() {
  const m = useMessages()
  const { jump, returnTo } = useJump()
  const { revision, bump } = useVaultRevision()
  const notice = useNotice()
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
  const selectionAnchor = useRef<AnchorBox | null>(null)
  selectionAnchor.current = pending?.box ?? null
  const sheet = useRef<HTMLDivElement>(null)
  const readingRef = useRef<PaperReading | null>(null)
  readingRef.current = reading
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  // The scroll area's content width the pages are laid out to fit; unbounded until it is first measured.
  const room = useRef(Number.POSITIVE_INFINITY)
  const slots = useRef(new Map<number, PageSlot>())
  // While zooming, the sheet stays laid out at `zoom` and a CSS transform shows it at `shownZoom`.
  const transform = useRef(UNSCALED)
  const shownZoom = useRef(zoom)
  const zoomPoint = useRef({ x: 0, y: 0 })
  const settleTimer = useRef(0)
  const consumed = useRef(0)
  const zoomOf = useRef(new Map<string, number>())
  const docs = useRef(new Map<string, PDFDocumentProxy>())
  const loadingDocs = useRef(new Set<string>())
  const openedRef = useRef(opened)
  openedRef.current = opened
  const reportError = useCallback((cause: unknown) => setError(errorLabel(m, cause)), [m])

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
  }, [opened, revision, reportError])

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

  /**
   * Lays the text layer out again and redraws the canvas of each page on screen whose canvas is not
   * at the scale its box is laid out at; pages off screen keep their stretched canvas until they
   * come into view.
   */
  const redrawVisible = useCallback(() => {
    const frame = scroller.current!.getBoundingClientRect()
    for (const slot of slots.current.values()) {
      if (slot.box.dataset.painted !== '1' || slot.scale === laidOutScale(slot)) continue
      const rect = slot.box.getBoundingClientRect()
      if (rect.bottom <= frame.top || rect.top >= frame.bottom) continue
      slot.text!.update({ viewport: slot.pdf.getViewport({ scale: laidOutScale(slot) }) })
      void drawCanvas(slot).catch((cause: unknown) => {
        if (!cancelled(cause)) reportError(cause as Error)
      })
    }
  }, [reportError])

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
    const placed = new Map<number, PageSlot>()
    const pending = new Set<number>()
    void (async () => {
      const pdfjs = await import('pdfjs-dist')
      const pages = await Promise.all(
        Array.from({ length: doc.numPages }, (_, index) => doc.getPage(index + 1)))
      if (!live) return
      const nextSheet = document.createDocumentFragment()
      const measured = roomOf(view)
      if (measured > 0) room.current = measured
      for (const pdf of pages) {
        const pagebox = document.createElement('div')
        pagebox.className = 'pdfpagebox'
        pagebox.dataset.page = String(pdf.pageNumber)
        const { width, height } = pdf.getViewport({ scale: 1 })
        pagebox.dataset.aspect = String(width / height)
        const canvas = document.createElement('canvas')
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        pagebox.append(canvas)
        const marks = document.createElement('div')
        marks.className = 'paper-highlights'
        pagebox.append(marks)
        const text = document.createElement('div')
        text.className = 'textLayer'
        text.dataset.page = String(pdf.pageNumber)
        pagebox.append(text)
        nextSheet.append(pagebox)
        const slot: PageSlot = { pdf, box: pagebox, scale: 0, task: null, text: null }
        layOut(slot, zoomRef.current, room.current)
        placed.set(pdf.pageNumber, slot)
        pending.add(pdf.pageNumber)
      }
      // Every box has its final size now, so the sheet and the highlight overlays settle before any canvas is drawn.
      box.replaceChildren(nextSheet)
      slots.current = placed
      paintHighlights(box, readingRef.current)
      setPainted((count) => count + 1)

      // The page whose top is nearest the viewport top goes first; each loop iteration re-ranks against live layout, so a scroll mid-render is picked up without extra bookkeeping.
      const nearestPending = (): number => {
        const top = view.getBoundingClientRect().top
        let best = pending.values().next().value!
        let distance = Number.POSITIVE_INFINITY
        for (const pageNumber of pending) {
          const delta = Math.abs(placed.get(pageNumber)!.box.getBoundingClientRect().top - top)
          if (delta < distance) { best = pageNumber; distance = delta }
        }
        return best
      }

      while (live && pending.size > 0) {
        const pageNumber = nearestPending()
        const slot = placed.get(pageNumber)!
        const viewport = await drawCanvas(slot)
        if (!live) return
        const container = slot.box.querySelector<HTMLElement>('.textLayer')!
        slot.text = new pdfjs.TextLayer({ textContentSource: await slot.pdf.getTextContent(), container, viewport })
        await slot.text.render()
        if (!live) return
        const endOfContent = document.createElement('div')
        endOfContent.className = 'endOfContent'
        container.append(endOfContent)
        slot.box.dataset.painted = '1'
        pending.delete(pageNumber)
        // A zoom that settled while this page was drawn the first time left it at the earlier scale.
        redrawVisible()
        // Yield one frame between pages so scrolling and the selection toolbar stay responsive while the rest renders.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    })().catch((cause: unknown) => {
      if (live && !cancelled(cause)) reportError(cause as Error)
    })
    return () => {
      live = false
      for (const slot of placed.values()) {
        slot.task?.cancel()
        slot.text?.cancel()
      }
      slots.current = new Map()
      window.clearTimeout(settleTimer.current)
      box.style.transform = ''
      transform.current = UNSCALED
      shownZoom.current = zoomRef.current
    }
  }, [doc, reportError, redrawVisible])

  // pdf.js's TextLayerBuilder selection support: a text layer is `.selecting` from a press on it, or
  // while a selection being made covers it, until the pointer or key is released; its endOfContent
  // then covers the whole page, so a drag across the gaps between lines and columns stays in the
  // text. TextLayerBuilder also moves endOfContent next to the selection, but only on Chromium
  // before 148; Electron's Chromium is newer.
  useEffect(() => {
    const box = sheet.current
    if (box === null) return
    const listening = new AbortController()
    const { signal } = listening
    const layers = () => box.querySelectorAll<HTMLElement>('.textLayer')
    const reset = () => layers().forEach((layer) => layer.classList.remove('selecting'))
    let pointerDown = false
    box.addEventListener('mousedown', (event) => {
      (event.target as Element).closest('.textLayer')?.classList.add('selecting')
    }, { signal })
    document.addEventListener('pointerdown', () => { pointerDown = true }, { signal })
    document.addEventListener('pointerup', () => { pointerDown = false; reset() }, { signal })
    window.addEventListener('blur', () => { pointerDown = false; reset() }, { signal })
    document.addEventListener('keyup', () => { if (!pointerDown) reset() }, { signal })
    document.addEventListener('selectionchange', () => {
      const selection = document.getSelection()
      if (selection === null || selection.rangeCount === 0) { reset(); return }
      const range = selection.getRangeAt(0)
      layers().forEach((layer) => layer.classList.toggle('selecting', range.intersectsNode(layer)))
    }, { signal })
    return () => listening.abort()
  }, [])

  // Highlights are independent overlays; when you change notes or add new highlights, you only change these small rectangles and do not redraw the PDF canvas / text layer.
  useEffect(() => {
    const box = sheet.current
    if (box !== null) paintHighlights(box, reading)
  }, [reading])

  // Landing on the jump's anchor waits until the PDF pages and the reading state are ready. The
  // anchor is cleared once used, so later zooms and redraws do not move the view.
  useEffect(() => {
    const view = scroller.current
    if (arrival === null || painted === 0 || reading === null || view === null) return
    const mark = arrival.highlight === undefined
      ? null
      : view.querySelector(`.paper-highlight[data-highlight="${arrival.highlight}"]`)
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

  /**
   * Once zooming and scrolling pause, lays every page out at the zoom shown, which ends the CSS
   * scaling with the page point under the last zoom position kept in place, then redraws the pages
   * on screen.
   */
  const settle = useCallback(() => {
    const view = scroller.current!
    if (transform.current !== UNSCALED) {
      const point = zoomPoint.current
      const nearest = slotNearest(slots.current.values(), point)
      const before = nearest.box.getBoundingClientRect()
      for (const slot of slots.current.values()) layOut(slot, shownZoom.current, room.current)
      sheet.current!.style.transform = ''
      transform.current = UNSCALED
      // A reader hidden behind another screen lays out no boxes, so there is no point to keep.
      if (before.width > 0) {
        const shift = keptScroll(before, nearest.box.getBoundingClientRect(), point)
        view.scrollLeft += shift.left
        view.scrollTop += shift.top
      }
      zoomRef.current = shownZoom.current
      setZoom(shownZoom.current)
    }
    redrawVisible()
  }, [redrawVisible])

  const settleLater = useCallback(() => {
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(settle, SETTLE_MS)
  }, [settle])

  /**
   * Shows the sheet at `target` zoom, within the zoom limits, at once by scaling it with CSS about
   * `point` in client pixels, and settles it after a pause. Before the pages are placed, `target`
   * only becomes the zoom they are laid out at.
   */
  const zoomTo = useCallback((target: number, point: { x: number; y: number }) => {
    setPending(null)
    shownZoom.current = clampZoom(target)
    if (slots.current.size === 0) {
      zoomRef.current = shownZoom.current
      setZoom(shownZoom.current)
      return
    }
    const box = sheet.current!
    const held = transform.current
    // The transformed sheet's corner is its laid-out corner moved by the held translation.
    const corner = box.getBoundingClientRect()
    const next = scaledAbout(held, shownZoom.current / zoomRef.current, {
      x: point.x - corner.left + held.x, y: point.y - corner.top + held.y,
    })
    transform.current = next
    zoomPoint.current = point
    box.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`
    settleLater()
  }, [settleLater])

  const zoomBy = (delta: number) => {
    const frame = scroller.current!.getBoundingClientRect()
    zoomTo(Math.round((shownZoom.current + delta) * 10) / 10, {
      x: frame.left + frame.width / 2, y: frame.top + frame.height / 2,
    })
  }

  useEffect(() => {
    const view = scroller.current
    if (view === null) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      zoomTo(wheelZoom(shownZoom.current, event.deltaY), { x: event.clientX, y: event.clientY })
    }
    view.addEventListener('wheel', wheel, { passive: false })
    // Pages scrolled into view after a zoom are drawn at it once scrolling pauses.
    view.addEventListener('scroll', settleLater, { passive: true })
    return () => {
      view.removeEventListener('wheel', wheel)
      view.removeEventListener('scroll', settleLater)
      window.clearTimeout(settleTimer.current)
    }
  }, [zoomTo, settleLater])

  // Opening or closing the paper chat or a rail tab, or resizing the window, changes the room the
  // pages fit; they are laid out again with the page at the top of the view kept in place.
  useEffect(() => {
    const view = scroller.current!
    const observer = new ResizeObserver(() => {
      const measured = roomOf(view)
      // A reader hidden behind another screen measures nothing, and its pages keep their layout.
      if (measured <= 0 || measured === room.current) return
      room.current = measured
      if (slots.current.size === 0) return
      const frame = view.getBoundingClientRect()
      const point = { x: frame.left, y: frame.top }
      const nearest = slotNearest(slots.current.values(), point)
      const before = nearest.box.getBoundingClientRect()
      for (const slot of slots.current.values()) layOut(slot, zoomRef.current, measured)
      view.scrollTop += keptScroll(before, nearest.box.getBoundingClientRect(), point).top
      settleLater()
    })
    observer.observe(view)
    return () => observer.disconnect()
  }, [settleLater])

  useEffect(() => {
    if (opened !== null) zoomOf.current.set(opened, zoom)
  }, [opened, zoom])

  // Record the page only once the user stays on it for a while, not every page scrolled past.
  useEffect(() => {
    if (opened === null || doc === null || reading === null || reading.lastPage === currentPage) return
    if (reading.lastPage === undefined && currentPage === 1) return
    const timer = window.setTimeout(() => {
      void papers.mutateReading(opened, { kind: 'progress.set', page: currentPage })
        .then(setReading)
        .catch((cause: unknown) => notice.refusal(errorLabel(m, cause)))
    }, PROGRESS_MS)
    return () => window.clearTimeout(timer)
  }, [opened, doc, reading, currentPage, notice])

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

  /**
   * Turns the browser's native selection into normalized rectangles on its page; a selection that
   * spans pages is dropped for the user to reselect.
   */
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
    const bounds = pagebox.getBoundingClientRect()
    const rects = normalizedHighlightRects(
      bounds, selectedTextRanges(range).flatMap((piece) => [...piece.getClientRects()]))
    const quote = selection.toString().replace(/\s+/g, ' ').trim()
    setPending(quote === '' || rects.length === 0 ? null : {
      page: Number(pagebox.dataset.page), quote, rects,
      box: { getBoundingClientRect: () => selectionBox(pagebox.getBoundingClientRect(), rects) },
    })
  }, [])

  // The toolbar is placed against the selection when it opens, so it closes once the pages scroll.
  useEffect(() => {
    const view = scroller.current
    if (pending === null || view === null) return
    const close = () => setPending(null)
    view.addEventListener('scroll', close, { passive: true })
    return () => view.removeEventListener('scroll', close)
  }, [pending])

  const mutateReading = useCallback(async (mutation: ReadingMutation): Promise<PaperReading | null> => {
    if (opened === null || saving) return null
    setSaving(true)
    try {
      const next = await papers.mutateReading(opened, mutation)
      setReading(next)
      bump()
      return next
    } catch (cause) {
      notice.refusal(errorLabel(m, cause))
      return null
    } finally {
      setSaving(false)
    }
  }, [opened, saving, bump, notice])

  const mutate = useCallback(async (mutation: ReadingMutation): Promise<boolean> =>
    await mutateReading(mutation) !== null, [mutateReading])

  const saveRemark = async (text: string): Promise<boolean> => {
    const ok = await mutate({ kind: 'remark.set', text })
    if (ok) notice.success(m.papers.notices.remarkSaved)
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
    () => (paper === null ? [] : [{ text: plainTitle(paper.title) }]), [paper])
  useCrumbTail(tail)

  const loading = error === null && opened !== null && (doc === null || reading === null)
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
            {error === null ? null : <div className="pdfload">{error}</div>}
            {loading ? <LoadingPlaceholder shape="sheet" /> : null}
          </div>

          <PickerPopover
            open={pending !== null} anchorBox={selectionAnchor}
            onOpenChange={(open) => { if (!open) setPending(null) }}
            contentClassName="ctxmenu selection-tools" side="bottom" align="center" sideOffset={10}
            content={pending === null ? null : (
              <Toolbar>
                <div className="selection-tools-row">
                  <ToolbarButton className="mi" onClick={() => { void addHighlight(false) }}>{m.reader.selection.highlight}</ToolbarButton>
                  <ToolbarButton className="mi" onClick={() => { void addHighlight(true) }}>{m.reader.selection.note}</ToolbarButton>
                  <ToolbarButton className="mi" onClick={askAi}>{m.reader.selection.askAi}</ToolbarButton>
                </div>
              </Toolbar>
            )}
          />

          <ReaderSidePanel
            tab={sideTab} onTab={(tab) => { setSideTab(tab); setFocusHighlightId(null) }}
            paper={paper} onPaper={setPaper} reading={heldReading} currentPage={currentPage}
            saving={saving} onMutate={mutate} onSaveRemark={saveRemark}
            onJump={jumpToPage} focusHighlightId={focusHighlightId}
          />

          <Toolbar>
            <div className="zoomctl">
              <IconButton label={m.reader.zoom.out} size="nested" disabled={zoom <= ZOOM_MIN} onClick={() => zoomBy(-ZOOM_STEP)}>
                <IconMinus />
              </IconButton>
              <Tooltip label={m.reader.zoom.reset}>
                <ToolbarButton className="btn ghost sm zoom-reset" onClick={() => zoomBy(1 - shownZoom.current)}>
                  {Math.round(zoom * 100)}%
                </ToolbarButton>
              </Tooltip>
              <IconButton label={m.reader.zoom.in} size="nested" disabled={zoom >= ZOOM_MAX} onClick={() => zoomBy(ZOOM_STEP)}>
                <IconPlus />
              </IconButton>
            </div>
          </Toolbar>
        </div>
      </PageShell>
    </>
  )
}
