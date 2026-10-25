// The in-page half of the component review. `measureInPage` runs in the App's renderer through
// Playwright's `evaluate`, which sends only the function's source, so it must not use anything
// declared outside its own body.

/**
 * Measures every element the `entries` match inside the `scope` roots and returns one record per
 * element: its entry, a stable element id, its box, a short label and the metric values of its
 * pattern class, and its `path`, the element's position in the document as each ancestor's
 * index among its siblings, which stays the same when a later state draws the same screen again.
 * `scope` is `screen` (the visible screen and open overlays), `shell` (sidebar and title bar) or
 * `overlay` (open overlays only). At most `cap` elements are measured per entry; the total each
 * entry matched is returned in `totals`. The element id lives in `data-review-id`, so the same
 * element measured again carries the same id. Colours are named by the tokens in
 * `colourTokens` they resolve to, or given as `rgb(...)`. A field's `focus` is its current look,
 * which the caller compares with its look under a forced `:focus`.
 */
export function measureInPage({ entries, scope, cap, colourTokens, shadowTokens, variantClasses }) {
  const r1 = (n) => Math.round(n * 10) / 10
  const norm = (v) => v.replace(/\s+/g, '')
  const probe = document.createElement('div')
  probe.style.display = 'none'
  document.body.append(probe)
  const colourMap = new Map()
  for (const name of colourTokens) {
    probe.style.color = ''
    probe.style.color = `var(--${name})`
    const value = norm(getComputedStyle(probe).color)
    if (!colourMap.has(value)) colourMap.set(value, [])
    colourMap.get(value).push(`--${name}`)
  }
  const shadowMap = new Map()
  for (const name of shadowTokens) {
    probe.style.boxShadow = `var(--${name})`
    shadowMap.set(norm(getComputedStyle(probe).boxShadow), `--${name}`)
  }
  probe.remove()

  const tok = (value) => {
    const n = norm(value)
    if (n === 'rgba(0,0,0,0)' || n === 'transparent') return 'transparent'
    return colourMap.get(n)?.join('|') ?? n
  }
  const px = (value) => r1(parseFloat(value) || 0)
  const shorthand = (values) => {
    const [t, r, b, l] = values
    if (t === r && r === b && b === l) return `${t}`
    if (t === b && r === l) return `${t} ${r}`
    return `${t} ${r} ${b} ${l}`
  }
  const four = (cs, prop) => shorthand(['Top', 'Right', 'Bottom', 'Left'].map((side) => px(cs[`${prop}${side}`])))
  const side = (cs, s) => (cs[`border${s}Style`] === 'none' || px(cs[`border${s}Width`]) === 0 ? null : `${px(cs[`border${s}Width`])} ${cs[`border${s}Style`]} ${tok(cs[`border${s}Color`])}`)
  const border = (cs) => {
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => side(cs, s))
    if (sides.every((s) => s === null)) return 'none'
    if (sides.every((s) => s === sides[0])) return sides[0]
    return ['t', 'r', 'b', 'l'].map((k, i) => (sides[i] === null ? null : `${k}:${sides[i]}`)).filter(Boolean).join(' ')
  }
  const radius = (cs) => shorthand(['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map((k) => px(cs[k])))
  const shadow = (cs) => (cs.boxShadow === 'none' ? 'none' : shadowMap.get(norm(cs.boxShadow)) ?? cs.boxShadow.replace(/rgba?\([^)]*\)/g, (c) => tok(c)))
  const font = (cs) => `${px(cs.fontSize)}/${cs.fontWeight}`
  const fontColour = (el) => { const cs = getComputedStyle(el); return `${font(cs)} ${tok(cs.color)}` }
  const shown = (el) => el.getClientRects().length > 0 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  const rect = (el) => el.getBoundingClientRect()
  const roots = () => {
    const overlays = [...document.body.children].filter((el) => el.id !== 'root' && el.tagName !== 'SCRIPT')
    if (scope === 'shell') return [...document.querySelectorAll('#sidebar, .titlebar')]
    if (scope === 'overlay') return overlays
    return [document.querySelector('.screenslot:not([hidden])'), ...overlays].filter(Boolean)
  }

  /**
   * The nearest block above (`dir` -1) or below (+1) `el` in document order, below `root`: a
   * visible sibling of `el` or of an ancestor that shares some of its width and lies wholly on
   * that side, so blocks in another column or overlaid ones are passed over. Null when `el` is
   * the first or last block in `root`.
   */
  const neighbour = (el, dir, root) => {
    const own = rect(el)
    const beside = (box) => box.height > 0 && box.right > own.left && box.left < own.right
      && (dir < 0 ? box.bottom <= own.top + 0.5 : box.top >= own.bottom - 0.5)
    for (let node = el; node && node !== root; node = node.parentElement) {
      for (let next = dir < 0 ? node.previousElementSibling : node.nextElementSibling; next; next = dir < 0 ? next.previousElementSibling : next.nextElementSibling) {
        if (shown(next) && beside(rect(next))) return next
      }
    }
    return null
  }
  /** The visible text and glyph boxes inside `el`. */
  const contentBoxes = (el) => {
    const boxes = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent.trim() || !shown(node.parentElement)) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const box of range.getClientRects()) if (box.width > 0) boxes.push(box)
      } else if (['svg', 'IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'CANVAS'].includes(node.tagName) && shown(node)) {
        boxes.push(rect(node))
      }
    }
    return boxes
  }
  /** The elements that hold visible text inside `el`, in document order, without those inside a value or control of `el`. */
  const textHosts = (el, skip = '') => {
    const hosts = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const host = node.parentElement
      if (!node.textContent.trim() || !shown(host) || hosts.includes(host)) continue
      let inside = false
      for (let up = host; skip && up && up !== el; up = up.parentElement) if (up.matches(skip)) inside = true
      if (!inside) hosts.push(host)
    }
    return hosts
  }
  /** The element that holds the first visible text inside `el`. */
  const textHost = (el) => textHosts(el)[0] ?? null
  const part = (el, selector) => {
    if (!selector) return null
    const found = [...el.querySelectorAll(selector)].find(shown)
    return found ?? null
  }
  const pathOf = (el) => {
    const steps = []
    for (let node = el; node.parentElement; node = node.parentElement) steps.unshift([...node.parentElement.children].indexOf(node))
    return steps.join('.')
  }
  const classesOf = (el) => (typeof el.className === 'string' ? el.className : el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
  const variant = (el) => classesOf(el).filter((c) => variantClasses.includes(c)).join(' ') || 'plain'
  const glyph = (el) => {
    const svg = [...el.querySelectorAll('svg')].find(shown)
    if (!svg) return 'none'
    const box = rect(svg)
    return `${r1(box.width)}x${r1(box.height)}`
  }
  const scroller = (el) => {
    const candidates = [el, ...el.querySelectorAll('*')].slice(0, 400)
    const found = candidates.find((node) => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY) && shown(node))
    if (!found) return 'none'
    const cs = getComputedStyle(found)
    const faded = cs.maskImage !== 'none' || found.hasAttribute('data-fade-paint')
    return `${cs.overflowY}${faded ? ' fade' : ''}${found === el ? '' : ' inner'}`
  }
  const headOf = (el, selector) => {
    const head = part(el, selector) ?? [...el.children].find(shown)
    if (!head) return 'none'
    const host = textHost(head)
    return `h${r1(rect(head).height)} ${host ? fontColour(host) : 'no text'} pad ${four(getComputedStyle(head), 'padding')}`
  }
  const divider = (el) => {
    const items = [...el.children].filter(shown)
    if (items.length < 2) return { divider: null, dividerInset: null }
    const second = items[1]
    const cs = getComputedStyle(second)
    const top = side(cs, 'Top')
    const above = side(getComputedStyle(items[0]), 'Bottom')
    if (top || above) return { divider: top ?? above, dividerInset: r1(rect(second).left - rect(el).left) }
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(second, pseudo)
      if (ps.content === 'none' || ps.position === 'static') continue
      const height = px(ps.height)
      if (height > 0 && height <= 2) {
        const colour = ps.backgroundColor === 'rgba(0, 0, 0, 0)' ? tok(ps.borderTopColor) : tok(ps.backgroundColor)
        return { divider: `${pseudo.slice(2)} ${height} ${colour}`, dividerInset: r1(rect(second).left - rect(el).left + px(ps.left)) }
      }
    }
    return { divider: 'none', dividerInset: null }
  }
  /**
   * The outline, shadow and border colour of the control that takes focus in field `el` (the
   * field, or the first editable element inside it), then of the field box when that is another element.
   */
  const fieldLook = (el) => {
    const look = (node) => {
      const cs = getComputedStyle(node)
      const outline = cs.outlineStyle === 'none' ? 'none' : `${px(cs.outlineWidth)} ${cs.outlineStyle} ${tok(cs.outlineColor)}`
      return `outline ${outline}; shadow ${shadow(cs)}; border ${tok(cs.borderTopColor)}`
    }
    const editable = 'input, textarea, select, [contenteditable="true"]'
    const control = el.matches(editable) ? el : el.querySelector(editable) ?? el
    return control === el ? look(el) : `${look(control)} | box ${look(el)}`
  }

  const listSelector = entries.filter((item) => item.metrics === 'list').map((item) => item.selector).join(', ')
  const metricsOf = (el, item) => {
    const cs = getComputedStyle(el)
    const box = rect(el)
    const parts = item.parts ?? {}
    switch (item.metrics) {
      case 'heading': {
        // Gaps are taken inside the heading's scroll container, so a scrolled page reads the same.
        let root = el.parentElement
        while (root !== document.body && !['auto', 'scroll'].includes(getComputedStyle(root).overflowY)
          && !root.matches('.desk, .modal, [data-radix-popper-content-wrapper]')) root = root.parentElement
        const top = rect(root).top + root.clientTop - root.scrollTop
        const before = neighbour(el, -1, root)
        const after = neighbour(el, 1, root)
        const host = part(el, parts.title) ?? textHost(el)
        const badge = part(el, parts.count ?? '.count-badge, .collapsible-group-count, .day-heading-count')
        const inline = /·\s*\d+/.test(el.textContent ?? '')
        return {
          font: host ? font(getComputedStyle(host)) : null,
          color: host ? tok(getComputedStyle(host).color) : null,
          above: r1(box.top - (before ? rect(before).bottom : top)),
          below: r1((after ? rect(after).top : top + root.scrollHeight) - box.bottom),
          count: badge ? `badge ${fontColour(badge)}` : inline ? 'inline' : 'none',
        }
      }
      case 'list': {
        const { divider: line, dividerInset } = divider(el)
        return {
          border: border(cs), radius: radius(cs), background: tok(cs.backgroundColor), divider: line, dividerInset,
          rowCap: cs.maxHeight === 'none' ? 'none' : `max ${px(cs.maxHeight)}`,
          scroll: `${cs.overflowY}${el.scrollHeight > el.clientHeight + 1 ? ' overflowing' : ''}`,
          padding: four(cs, 'padding'),
        }
      }
      case 'item': {
        const boxes = contentBoxes(el)
        const container = (listSelector ? el.parentElement?.closest(listSelector) : null) ?? el.parentElement
        const cbox = container ? rect(container) : box
        let next = el.nextElementSibling
        while (next && !shown(next)) next = next.nextElementSibling
        // Text inside a tag, badge, date or control is a value, not the item's title or meta line.
        const hosts = textHosts(el, '.tag, .count-badge, .date-chip, .row-actions, .btn, .icbtn')
        const title = part(el, parts.title) ?? hosts[0] ?? null
        const titleCs = title ? getComputedStyle(title) : null
        const meta = part(el, parts.meta) ?? hosts.find((host) => {
          const hs = getComputedStyle(host)
          return host !== title && !title?.contains(host) && px(hs.fontSize) <= px(titleCs.fontSize) && fontColour(host) !== fontColour(title)
        }) ?? null
        const children = [...el.children].filter(shown)
        const trailing = part(el, parts.trailing) ?? (children.length > 1 ? children.at(-1) : null)
        const end = trailing ? rect(trailing).right : null
        return {
          height: r1(box.height), padding: four(cs, 'padding'),
          inset: boxes.length ? r1(Math.min(...boxes.map((b) => b.left)) - box.left) : null,
          reach: `${r1(box.left - cbox.left)}/${r1(cbox.right - box.right)}`,
          // The next item of a grid row sits beside this one; of a column, below it.
          gap: next && next.matches(item.selector)
            ? r1(Math.abs(rect(next).top - box.top) < 1 ? rect(next).left - box.right : rect(next).top - box.bottom) : null,
          titleFont: title ? fontColour(title) : null,
          metaFont: meta ? fontColour(meta) : null,
          trailingEnd: end === null ? null : r1(box.right - end),
        }
      }
      case 'button':
        return {
          height: r1(box.height), padding: four(cs, 'padding'), font: font(cs), radius: radius(cs),
          variant: `${variant(el)} · ${tok(cs.backgroundColor)}`, glyph: glyph(el),
        }
      case 'tag':
        return {
          height: r1(box.height), padding: four(cs, 'padding'), font: font(cs), radius: radius(cs),
          tone: `${classesOf(el).filter((c) => /--(?!chip|label|capped|yielded)/.test(c)).join(' ') || 'plain'} · ${tok(cs.backgroundColor)}/${tok(cs.color)}`,
        }
      case 'field':
        return { height: r1(box.height), padding: four(cs, 'padding'), border: border(cs), radius: radius(cs), focus: fieldLook(el) }
      case 'state': {
        const host = textHost(el)
        return {
          height: r1(box.height), text: host ? fontColour(host) : 'no text',
          style: `pad ${four(cs, 'padding')}; bg ${tok(cs.backgroundColor)}; border ${border(cs)}; align ${cs.textAlign}/${cs.justifyContent}`,
        }
      }
      case 'panel':
        return {
          width: r1(box.width), surface: `${tok(cs.backgroundColor)}; border ${border(cs)}; shadow ${shadow(cs)}; radius ${radius(cs)}`,
          head: headOf(el, parts.head), scroll: scroller(el),
        }
      case 'head': {
        const host = part(el, parts.title) ?? textHost(el)
        return { height: r1(box.height), padding: four(cs, 'padding'), titleFont: host ? fontColour(host) : null, border: border(cs), background: tok(cs.backgroundColor) }
      }
      case 'page': {
        const column = [...el.children].find(shown)
        const target = column && rect(column).width < box.width - 1 ? column : el
        const tbox = rect(target)
        return { x: r1(tbox.left), width: r1(tbox.width), padding: four(cs, 'padding'), gap: cs.gap === 'normal' ? '0' : cs.gap }
      }
      case 'overlay': {
        const option = part(el, parts.item ?? '.mi, [role="menuitem"], [role="option"], [role="menuitemradio"]')
        return {
          width: r1(box.width), surface: `${tok(cs.backgroundColor)}; border ${border(cs)}; shadow ${shadow(cs)}`,
          padding: four(cs, 'padding'), radius: radius(cs),
          item: option ? `h${r1(rect(option).height)} ${fontColour(option)} pad ${four(getComputedStyle(option), 'padding')}` : 'none',
        }
      }
      case 'text': {
        const host = textHost(el) ?? el
        const hs = getComputedStyle(host)
        return { font: font(hs), color: tok(hs.color), lineHeight: hs.lineHeight === 'normal' ? 'normal' : px(hs.lineHeight) }
      }
      default:
        throw new Error(`Unknown metric class ${item.metrics}`)
    }
  }

  window.__reviewNextId ??= 1
  const records = []
  const totals = {}
  const claimed = new Map()
  for (const item of entries) {
    const seen = claimed.get(item.pattern) ?? new Set()
    claimed.set(item.pattern, seen)
    const matched = roots().flatMap((root) => [root, ...root.querySelectorAll(item.selector)].filter((el) => el.matches(item.selector)))
      // A visually hidden element, such as a 1px accessible title, is not an instance.
      .filter((el) => shown(el) && rect(el).width > 1 && rect(el).height > 1 && !seen.has(el) && !(item.not && el.matches(item.not)))
    totals[item.id] = matched.length
    for (const el of matched) seen.add(el)
    for (const el of matched.slice(0, cap)) {
      el.dataset.reviewId ??= String(window.__reviewNextId++)
      const box = rect(el)
      records.push({
        entry: item.id, pattern: item.pattern, impl: item.impl, id: Number(el.dataset.reviewId), path: pathOf(el),
        box: [r1(box.left), r1(box.top), r1(box.width), r1(box.height)],
        label: `${classesOf(el).slice(0, 3).join('.')} ${(el.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)}`.trim(),
        metrics: metricsOf(el, item),
      })
    }
  }
  return { records, totals }
}

/**
 * Marks with `data-review-focus` the control that takes focus in the field whose `data-review-id`
 * is `id` (the field itself, or the first input, textarea, select or editable element inside it),
 * every element from it up to the field, and three ancestors beyond. Returns how many it marked.
 */
export function markFocusPathInPage(id) {
  const field = document.querySelector(`[data-review-id="${id}"]`)
  const editable = 'input, textarea, select, [contenteditable="true"]'
  let el = field.matches(editable) ? field : field.querySelector(editable) ?? field
  let beyond = 0
  let marked = 0
  while (el && el !== document.body && beyond < 4) {
    el.dataset.reviewFocus = String(marked)
    if (!field.contains(el) || el === field) beyond += 1
    el = el.parentElement
    marked += 1
  }
  return marked
}

/** Removes every `data-review-focus` mark. */
export function clearFocusPathInPage() {
  for (const el of document.querySelectorAll('[data-review-focus]')) delete el.dataset.reviewFocus
}
