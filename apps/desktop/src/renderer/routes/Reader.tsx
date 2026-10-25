import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask, TextLayer } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type {
  PaperHighlight, PaperHighlightRect, PaperReading, PaperRow, ReadingMutation,
} from '../../shared/contract.js'
import { sharesText } from '../../shared/highlight-overlap.js'
import { papers } from '../ipc.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useWheelZoom } from '../hooks/useWheelZoom.js'
import { sendsMessage } from '../lib/chat.js'
import { errorLabel } from '../lib/failure-label.js'
import { typesText } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { useDrafts } from '../hooks/useDrafts.js'
import { useOnLeave } from '../hooks/useOnLeave.js'
import { land } from '../hooks/useArrival.js'
import {
  useCrumbTail, useJump, useNotice, useVaultRevision, type ScreenKey, type JumpAnchor,
} from '../shell/AppShell.js'
import type { CrumbSeg } from '../components/Breadcrumb.js'
import { ActionPopover } from '../components/ActionPopover.js'
import type { AnchorBox } from '../components/floating-layer.js'
import { FormTextarea } from '../components/FormControls.js'
import { IconButton } from '../components/IconButton.js'
import { IconAskAi, IconTrash } from '../components/icons.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { Swatches } from '../components/Swatches.js'
import { Toolbar } from '../components/Toolbar.js'
import {
  drawnLines, highlightAt, highlightLines, highlightOutline, highlightShape, selectedLinesByPage, selectionBox,
} from './highlight-geometry.js'
import {
  ZOOM_MAX, ZOOM_MIN, clampZoom, keptScroll, pageScale, scaledAbout, type SheetTransform,
} from './reader-zoom.js'
import { PaperChat, type PaperChatPrompt } from '../components/chat/PaperChat.js'
import { ReaderSidePanel, type ReaderSideTab } from '../components/reader/ReaderSidePanel.js'
import { PageError, PageShell } from '../components/PageShell.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { ZoomControl, zoomStep } from '../components/ZoomControl.js'
import './shell.css'
import './Reader.css'

const MAX_DPR = 2
/** How long zooming and scrolling pause before the pages are laid out and drawn at the zoom shown. */
const SETTLE_MS = 150
const PROGRESS_MS = 800
const DOC_CACHE = 2
const SVG_NS = 'http://www.w3.org/2000/svg'
const UNSCALED: SheetTransform = { x: 0, y: 0, scale: 1 }
/** Each stored highlight colour and the token that paints it, in the selection toolbar's order. */
const HIGHLIGHT_COLOURS: readonly (readonly [PaperHighlight['color'], string])[] = [
  ['yellow', 'var(--hl-yellow)'], ['green', 'var(--hl-green)'], ['blue', 'var(--hl-blue)'], ['pink', 'var(--hl-pink)'],
]

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
  /** The highlight a click on it selected, which the toolbar edits; absent for selected text. */
  highlight?: string
}

/** A note being typed in the selection toolbar, kept as a draft with the selection it is about. */
type SelectionNote = Pick<PendingHighlight, 'page' | 'quote' | 'rects'> & { note: string }

const emptyReading = (paperId: string): PaperReading => ({ paperId, highlights: [], notes: [], remark: '' })

/** The highlights of `reading` on page `page`, in stored order. */
const highlightsOn = (reading: PaperReading, page: number): PaperHighlight[] =>
  reading.highlights.filter((highlight) => highlight.page === page)

/** The highlights of `reading` on page `page` that cover some of the text `rects` cover. */
const highlightsOver = (reading: PaperReading | null, page: number, rects: PaperHighlightRect[]): PaperHighlight[] =>
  reading?.highlights.filter((highlight) => highlight.page === page && sharesText(highlight.rects, rects)) ?? []

/**
 * The SVG drawing of `lines` on their page as one filled shape, placed over the page box in
 * percentages of its size, with class `className`; `underline` adds one line along the bottom of
 * each line.
 */
function linesMark(lines: PaperHighlightRect[], className: string, underline = false): SVGSVGElement {
  const shape = highlightShape(lines)
  const mark = document.createElementNS(SVG_NS, 'svg')
  mark.setAttribute('class', className)
  mark.setAttribute('viewBox', `${shape.box.x} ${shape.box.y} ${shape.box.width} ${shape.box.height}`)
  mark.setAttribute('preserveAspectRatio', 'none')
  mark.style.left = `${shape.box.x * 100}%`
  mark.style.top = `${shape.box.y * 100}%`
  mark.style.width = `${shape.box.width * 100}%`
  mark.style.height = `${shape.box.height * 100}%`
  const fill = document.createElementNS(SVG_NS, 'path')
  fill.setAttribute('d', shape.fill)
  mark.append(fill)
  if (underline) {
    const note = document.createElementNS(SVG_NS, 'path')
    note.setAttribute('class', 'paper-highlight-note')
    note.setAttribute('d', shape.underline)
    mark.append(note)
  }
  return mark
}

/**
 * Redraws every highlight through one path; called when the PDF first loads and when the reading
 * state updates. Where highlights an older version stored overlap, only the newest, the later one in
 * the list, is drawn on the stretch they share, and one covered whole is not drawn.
 */
function paintHighlights(box: ParentNode, reading: PaperReading | null): void {
  box.querySelectorAll<HTMLElement>('.paper-highlights').forEach((marks) => marks.replaceChildren())
  if (reading === null) return
  for (const page of new Set(reading.highlights.map((highlight) => highlight.page))) {
    const pagebox = box.querySelector<HTMLElement>(`.pdfpagebox[data-page="${page}"]`)
    if (pagebox === null) continue
    const highlights = highlightsOn(reading, page)
    drawnLines(highlights, Number(pagebox.dataset.aspect)).forEach((lines, at) => {
      if (lines.length === 0) return
      const highlight = highlights[at]!
      const mark = linesMark(lines, `paper-highlight ${highlight.color}`, highlight.note.trim() !== '')
      mark.dataset.highlight = highlight.id
      pagebox.querySelector('.paper-highlights')!.append(mark)
    })
  }
}

/**
 * Redraws the document's selection on the pages of `sheet` it covers, as a highlight of it would be
 * drawn, in each page's `.paper-selection` layer; while the document's selection covers no page,
 * `held` is drawn in its place.
 */
function paintSelection(sheet: HTMLElement, held: PendingHighlight | null): void {
  sheet.querySelectorAll<HTMLElement>('.paper-selection').forEach((layer) => layer.replaceChildren())
  const selection = document.getSelection()
  const live = selection === null || selection.isCollapsed || selection.rangeCount === 0
    ? new Map<HTMLElement, PaperHighlightRect[]>()
    : selectedLinesByPage(selection.getRangeAt(0))
  const heldPage = held === null ? null : sheet.querySelector<HTMLElement>(`.pdfpagebox[data-page="${held.page}"]`)
  const drawn = live.size > 0 || held === null || heldPage === null ? live : new Map([[heldPage, held.rects]])
  for (const [pagebox, lines] of drawn) {
    pagebox.querySelector('.paper-selection')!.append(linesMark(lines, 'paper-selected'))
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
  // What the selection toolbar's note box holds. While typed, it is kept as a draft by paper, and a
  // paper opened with one lands on its selection with the toolbar open again.
  const [noteDraft, setNoteDraft] = useState('')
  const selectionNotes = useDrafts<SelectionNote>(['paper'])
  const toolsPaper = useRef<string | null>(null)
  // A new selection replaces the toolbar's, and with it the note kept for the one before.
  const dropSelectionNote = useRef(() => {})
  dropSelectionNote.current = () => { if (opened !== null) selectionNotes.drop(opened) }
  const [sideTab, setSideTab] = useState<ReaderSideTab | null>(null)
  const [focusHighlightId, setFocusHighlightId] = useState<string | null>(null)
  const [chatPrompt, setChatPrompt] = useState<PaperChatPrompt | null>(null)
  const [arrival, setArrival] = useState<JumpAnchor | null>(null)
  const [painted, setPainted] = useState(0)
  const [saving, setSaving] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const tools = useRef<HTMLDivElement>(null)
  // Closes the selection toolbar as leaving it does; set once `leaveTools` is defined below.
  const leave = useRef(() => {})
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
  const { error, load, report } = useScreenLoad()

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
    return load('paper', papers.get(opened), setPaper)
  }, [opened, revision, load])

  useEffect(() => {
    if (opened === null) return
    return load('reading', papers.reading(opened), setReading)
  }, [opened, revision, load])

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
      if (openedRef.current === id) report(cause)
    })
  }, [opened, report])

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
        if (!cancelled(cause)) report(cause as Error)
      })
    }
  }, [report])

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
        const selected = document.createElement('div')
        selected.className = 'paper-selection'
        pagebox.append(selected)
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
      if (live && !cancelled(cause)) report(cause as Error)
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
  }, [doc, report, redrawVisible])

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

  // The highlights the toolbar's selection covers text of: none, the one it edits, or several, which
  // it offers only to ask AI about. A highlight selected by a click is the one it edits.
  const touched = pending === null ? []
    : pending.highlight === undefined ? highlightsOver(reading, pending.page, pending.rects)
      : reading?.highlights.filter((highlight) => highlight.id === pending.highlight) ?? []
  const edited = touched.length === 1 ? touched[0]! : null
  const selected = pending?.highlight === undefined ? null : edited

  // Chromium paints a selection line by line over the text layer's spans, and on tightly set text one
  // line's paint overlaps the next, which shows darker there; the text layer paints none, and the
  // selection is drawn as a highlight is, at most once a frame while it changes. Focus in the
  // toolbar's note box takes the document's selection, so the toolbar's stays drawn until it
  // covers a highlight.
  const heldSelection = touched.length === 0 ? pending : null
  useEffect(() => {
    const box = sheet.current
    if (box === null) return
    let frame = 0
    const repaint = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => paintSelection(box, heldSelection))
    }
    repaint()
    document.addEventListener('selectionchange', repaint)
    return () => {
      document.removeEventListener('selectionchange', repaint)
      cancelAnimationFrame(frame)
    }
  }, [heldSelection])

  // Highlights are independent overlays; when you change notes or add new highlights, you only change these small rectangles and do not redraw the PDF canvas / text layer.
  useEffect(() => {
    const box = sheet.current
    if (box !== null) paintHighlights(box, reading)
  }, [reading])

  // The highlight a click selected is outlined along the lines it is drawn with, until it is deselected.
  const outlined = selected?.id ?? null
  useEffect(() => {
    const box = sheet.current
    if (box === null || reading === null) return
    box.querySelectorAll('.paper-highlight-outline').forEach((mark) => mark.remove())
    const highlight = reading.highlights.find((item) => item.id === outlined)
    const pagebox = highlight === undefined ? null : box.querySelector<HTMLElement>(`.pdfpagebox[data-page="${highlight.page}"]`)
    if (highlight === undefined || pagebox === null) return
    const highlights = highlightsOn(reading, highlight.page)
    const lines = drawnLines(highlights, Number(pagebox.dataset.aspect))[highlights.indexOf(highlight)]!
    if (lines.length === 0) return
    const mark = linesMark(lines, 'paper-highlight-outline')
    mark.querySelector('path')!.setAttribute('d', highlightOutline(lines))
    pagebox.querySelector('.paper-highlights')!.append(mark)
  }, [reading, outlined, painted])

  // Landing on the jump's anchor waits until the PDF pages and the reading state are ready. The
  // anchor is cleared once used, so later zooms and redraws do not move the view.
  useEffect(() => {
    const view = scroller.current
    if (arrival === null || painted === 0 || reading === null || view === null) return
    const mark = arrival.highlight === undefined
      ? null
      : view.querySelector(`.paper-highlight[data-highlight="${arrival.highlight}"]`)
    const note = arrival.page === undefined && arrival.highlight === undefined && opened !== null
      ? selectionNotes.get(opened) : undefined
    if (mark !== null) land(mark, 'center')
    else {
      const page = note?.page ?? arrival.page ?? reading.lastPage ?? 1
      const pagebox = view.querySelector<HTMLElement>(`.pdfpagebox[data-page="${page}"]`)
      // Opening a paper resumes at its last page, and a note being written shows again: neither names an anchor.
      if (pagebox !== null && arrival.page !== undefined) land(pagebox, 'start', 'over')
      else pagebox?.scrollIntoView({ block: note === undefined ? 'start' : 'center' })
    }
    // The toolbar opens once the landing's scroll has been handled, as a scroll closes it.
    if (note !== undefined) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const pagebox = view.querySelector<HTMLElement>(`.pdfpagebox[data-page="${note.page}"]`)
        if (pagebox === null) return
        setNoteDraft(note.note)
        setPending({
          page: note.page, quote: note.quote, rects: note.rects,
          box: { getBoundingClientRect: () => selectionBox(pagebox.getBoundingClientRect(), note.rects) },
        })
      }))
    }
    const notedOnly = reading.notes.length === 0
      && reading.highlights.some((highlight) => highlight.note.trim() !== '')
    if (arrival.panel !== undefined) {
      setSideTab(arrival.panel === 'notes' && notedOnly ? 'highlights' : arrival.panel)
    }
    if (arrival.highlight !== undefined) setFocusHighlightId(arrival.highlight)
    setArrival(null)
  }, [arrival, painted, reading, opened, selectionNotes])

  // Closing the toolbar, by saving its note, leaving it or Escape, drops the note's kept copy.
  useEffect(() => {
    if (pending !== null) {
      toolsPaper.current = opened
      return
    }
    if (toolsPaper.current !== null) selectionNotes.drop(toolsPaper.current)
    toolsPaper.current = null
  }, [pending, opened, selectionNotes])

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
    leave.current()
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

  /** Zooms to `target` about the middle of the pages' view. */
  const zoomAtCentre = (target: number) => {
    const frame = scroller.current!.getBoundingClientRect()
    zoomTo(target, { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 })
  }

  useWheelZoom(scroller, (factor, point) => zoomTo(shownZoom.current * factor, point))

  useEffect(() => {
    const view = scroller.current
    if (view === null) return
    // Pages scrolled into view after a zoom are drawn at it once scrolling pauses.
    view.addEventListener('scroll', settleLater, { passive: true })
    return () => {
      view.removeEventListener('scroll', settleLater)
      window.clearTimeout(settleTimer.current)
    }
  }, [settleLater])

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
        .then((written) => setReading(written.reading))
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
   * spans pages is dropped for the user to reselect. A plain click, which selects no text, selects
   * the highlight drawn where it lands, if any.
   */
  const captureSelection = useCallback((event: ReactMouseEvent) => {
    const selection = window.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
      const pagebox = (event.target as Element).closest<HTMLElement>('.pdfpagebox')
      const held = readingRef.current
      if (pagebox === null || held === null) {
        setPending(null)
        return
      }
      const frame = pagebox.getBoundingClientRect()
      const page = Number(pagebox.dataset.page)
      const aspect = Number(pagebox.dataset.aspect)
      const hit = highlightAt(highlightsOn(held, page), aspect, {
        x: (event.clientX - frame.left) / frame.width, y: (event.clientY - frame.top) / frame.height,
      })
      if (hit === null) {
        setPending(null)
        return
      }
      const lines = highlightLines(hit.rects, aspect)
      dropSelectionNote.current()
      setNoteDraft(hit.note)
      setPending({
        page, quote: hit.quote, rects: hit.rects, highlight: hit.id,
        box: { getBoundingClientRect: () => selectionBox(pagebox.getBoundingClientRect(), lines) },
      })
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
    const rects = selectedLinesByPage(range).get(pagebox) ?? []
    const quote = selection.toString().replace(/\s+/g, ' ').trim()
    const page = Number(pagebox.dataset.page)
    const covered = highlightsOver(readingRef.current, page, rects)
    dropSelectionNote.current()
    setNoteDraft(covered.length === 1 ? covered[0]!.note : '')
    setPending(quote === '' || rects.length === 0 ? null : {
      page, quote, rects,
      box: { getBoundingClientRect: () => selectionBox(pagebox.getBoundingClientRect(), rects) },
    })
  }, [])

  // The toolbar is placed against the selection when it opens, so it closes once the pages scroll.
  useEffect(() => {
    const view = scroller.current
    if (pending === null || view === null) return
    const close = () => leave.current()
    view.addEventListener('scroll', close, { passive: true })
    return () => view.removeEventListener('scroll', close)
  }, [pending])

  const mutateReading = useCallback(async (mutation: ReadingMutation): Promise<PaperReading | null> => {
    if (opened === null || saving) return null
    setSaving(true)
    try {
      const { reading: next } = await papers.mutateReading(opened, mutation)
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

  const write = useVaultWrite()
  const undo = useUndo()
  /**
   * Deletes a note or a highlight: puts the reading after it into state and shows a notice offering
   * Undo of the change Core recorded. Returns whether it was written.
   */
  const removeFromReading = useCallback(async (
    mutation: Extract<ReadingMutation, { kind: 'note.delete' | 'highlight.delete' }>,
  ): Promise<boolean> => {
    if (opened === null || saving) return false
    setSaving(true)
    const removed = await write(papers.mutateReading(opened, mutation).then(({ reading: next, change }) => {
      setReading(next)
      // Core records every deletion of a note or a highlight.
      return { change: change! }
    }), {
      note: mutation.kind === 'note.delete' ? m.reader.notes.deleted : m.reader.highlights.deleted,
      action: undo.change,
    })
    setSaving(false)
    return removed
  }, [opened, saving, write, undo, m])

  const mutate = useCallback(async (mutation: ReadingMutation): Promise<boolean> =>
    mutation.kind === 'note.delete' || mutation.kind === 'highlight.delete'
      ? removeFromReading(mutation)
      : await mutateReading(mutation) !== null, [mutateReading, removeFromReading])

  const saveRemark = (text: string): Promise<boolean> => mutate({ kind: 'remark.set', text })

  /** Writes the toolbar's `selection` as a new highlight in `color`; returns it, or null when Core refused. */
  const highlightSelection = async (selection: PendingHighlight, color: PaperHighlight['color']) => {
    const previous = new Set(reading?.highlights.map((highlight) => highlight.id) ?? [])
    // The document's selection gives way to the highlight made of it.
    window.getSelection()?.removeAllRanges()
    const next = await mutateReading({
      kind: 'highlight.add', page: selection.page, quote: selection.quote, rects: selection.rects, color,
    })
    return next === null ? null : next.highlights.find((highlight) => !previous.has(highlight.id))!
  }

  /**
   * Highlights the toolbar's selection in `color`, or recolours the one highlight it covers; the
   * toolbar stays open.
   */
  const pickColour = async (color: PaperHighlight['color']) => {
    if (pending === null) return
    if (edited === null) {
      await highlightSelection(pending, color)
      return
    }
    window.getSelection()?.removeAllRanges()
    await mutateReading({ kind: 'highlight.update', id: edited.id, note: edited.note, color })
  }

  /**
   * Saves `note` onto the one highlight the toolbar's selection covers, or onto a new yellow
   * highlight of the selection when it covers none, then closes the toolbar. An empty note on a
   * selection that covers no highlight does nothing.
   */
  const saveNote = async (note: string) => {
    if (pending === null || (note === '' && edited === null)) return
    const selection = pending
    const target = edited ?? await highlightSelection(selection, 'yellow')
    if (target === null) return
    if (note === target.note || await mutateReading({ kind: 'highlight.update', id: target.id, note }) !== null) {
      setPending((held) => (held?.box === selection.box ? null : held))
    }
  }

  /**
   * Closes the selection toolbar the way a draft is left: what its note box holds is saved as Enter
   * saves it. Escape is the one way to close the toolbar that drops the typed text.
   */
  const leaveTools = () => {
    if (pending === null) return
    const note = noteDraft.trim()
    setPending(null)
    if (note !== '') void saveNote(note)
  }
  leave.current = leaveTools
  useOnLeave(tools, leaveTools)

  /** Deletes the one existing highlight the toolbar acts on and closes the toolbar; the notice offers Undo. */
  const deleteEdited = () => {
    if (edited === null) return
    setPending(null)
    void removeFromReading({ kind: 'highlight.delete', id: edited.id })
  }
  const deleteKey = useRef(deleteEdited)
  deleteKey.current = deleteEdited
  // Delete and Backspace delete that highlight, unless focus is where text is typed.
  useEffect(() => {
    if (edited === null) return
    const press = (event: KeyboardEvent) => {
      if ((event.key !== 'Delete' && event.key !== 'Backspace') || typesText(event.target)) return
      event.preventDefault()
      deleteKey.current()
    }
    document.addEventListener('keydown', press)
    return () => document.removeEventListener('keydown', press)
  }, [edited?.id])

  const askAi = () => {
    if (pending === null) return
    setChatPrompt({ seq: Date.now(), quote: pending.quote })
    window.getSelection()?.removeAllRanges()
    leaveTools()
  }

  const jumpToPage = (page: number) => {
    const pagebox = scroller.current?.querySelector(`.pdfpagebox[data-page="${page}"]`)
    if (pagebox) land(pagebox, 'start', 'over')
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
            <PageError variant="section" error={error} />
            {loading ? <LoadingPlaceholder shape="sheet" /> : null}
          </div>

          <ActionPopover
            open={pending !== null} anchorBox={selectionAnchor}
            onOpenChange={(open) => { if (!open) setPending(null) }}
            surface="toolbar" contentClassName="selection-tools" side="bottom" align="center" sideOffset={10}
            contentProps={{
              // Opening leaves focus where it is, so the selection can still be copied.
              onOpenAutoFocus: (event) => event.preventDefault(),
              // A press outside or focus leaving goes through useOnLeave, which saves the note first.
              onInteractOutside: (event) => event.preventDefault(),
            }}
          >
            {pending === null ? null : (
              <div ref={tools} className="selection-tools-body">
                <Toolbar>
                  <div className="selection-tools-row">
                    <IconButton label={m.reader.selection.askAi} size="nested" round onClick={askAi}><IconAskAi /></IconButton>
                    {touched.length > 1 ? null : (
                      <Swatches
                        label={m.reader.selection.highlight} value={edited?.color ?? ''}
                        swatches={HIGHLIGHT_COLOURS.map(([colour, token]) => ({
                          value: colour, colour: token, label: m.reader.selection.colours[colour],
                        }))}
                        onPick={(colour) => { void pickColour(colour) }}
                      />
                    )}
                    {edited === null ? null : (
                      <IconButton label={m.common.delete} size="nested" round tone="danger" onClick={deleteEdited}>
                        <IconTrash />
                      </IconButton>
                    )}
                  </div>
                </Toolbar>
                {touched.length > 1 ? null : (
                  <FormTextarea
                    aria-label={m.reader.selection.note} rows={1} value={noteDraft}
                    onChange={(event) => {
                      setNoteDraft(event.target.value)
                      if (opened !== null) {
                        selectionNotes.set(opened, {
                          page: pending.page, quote: pending.quote, rects: pending.rects, note: event.target.value,
                        })
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!sendsMessage(event.nativeEvent)) return
                      event.preventDefault()
                      void saveNote(noteDraft.trim())
                    }}
                  />
                )}
              </div>
            )}
          </ActionPopover>

          <ReaderSidePanel
            tab={sideTab} onTab={(tab) => { setSideTab(tab); setFocusHighlightId(null) }}
            paper={paper} onPaper={setPaper} reading={heldReading} currentPage={currentPage}
            saving={saving} onMutate={mutate} onSaveRemark={saveRemark}
            onJump={jumpToPage} focusHighlightId={focusHighlightId} selectedHighlightId={selected?.id ?? null}
          />

          <ZoomControl
            place="bottom" zoom={zoom} min={ZOOM_MIN} max={ZOOM_MAX}
            onZoom={(direction) => zoomAtCentre(zoomStep(shownZoom.current, direction))} onReset={() => zoomAtCentre(1)}
            labels={{ out: m.reader.zoom.out, in: m.reader.zoom.in, reset: m.reader.zoom.reset }}
          />
        </div>
      </PageShell>
    </>
  )
}
