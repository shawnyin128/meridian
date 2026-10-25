# Component review

Scripts for the v0.0.20.0 componentization reviews (#558, catalog section 6). `measure`
re-measures every pattern of the component inventory and reports how far each one drifts.

They launch the App the quiet way the review brief requires:
- an isolated window, `--force-color-profile=srgb`, and the profile of a fresh library copy;
- the copy is made with `ditto` from `outputs/test-library/v0.0.19.0`, with its `Singleton*` files
  deleted and then relocated, under `outputs/review/v0.0.20.0/components/libs/`;
- the copy is deleted when the run ends.

Each App run takes the Electron lock `outputs/review/v0.0.20.0/electron.lock`, waiting for it in
15-second steps. It holds the lock for one batch of states and releases it afterwards. A watchdog
closes the App after nine minutes, and the run fails if a batch would go past that. A full run is
four batches of about 10 to 50 seconds each. Input goes through Playwright only. Nothing calls
`show()` or `focus()`. The focus look of fields is read through the DevTools protocol, which forces
`:focus` without focusing anything.

Paths are taken from the main checkout, so the scripts write to the same `outputs/` folder when
they run from a worktree. Build the App before a run: `npm --prefix apps/desktop run build`.

## measure

```bash
node scripts/component-review/measure.mjs [--name baseline] [--app <app>] [--library <dir>] [--out <dir>]
```

The script walks every state of `screens.mjs` at 1440×900 and 1280×800, in light and dark. In
each state it measures every element the selector map in `patterns.mjs` finds. It writes two
files to `outputs/review/v0.0.20.0/components/drift/`:

- `<name>.json` holds every measurement, with its size and theme, screen, state, selector entry,
  element box and metric values. It also holds the summary and the states that were not reached.
- `<name>.md` is the drift summary. It ranks the patterns by the number of distinct values of their
  most varied metric, at 1440×900 light. For each pattern and metric it lists every distinct
  value, how many instances have it, and the screens where it appears. For the other sizes and
  themes, it lists only the metrics whose values differ.

An element counts once per screen, in the first state that shows it. A later state that shows it
again, or draws it anew at the same place with the same label and values, adds nothing. Two runs on the same code and
library write byte-identical files. A later phase compares its run with the baseline, for example
`--name phase1`.

`--app` takes a built `apps/desktop` folder, the default being this checkout's, or a
`Meridian.app`. `--library` takes another test library to copy.

### Metric keys

Each pattern belongs to a metric class. The classes follow the inventory brief:

| Class | Keys |
|---|---|
| heading | `font` (size/weight), `color`, `above` and `below` (the gap to the nearest block above and below), `count` (`badge …`, `inline` for `· N`, or `none`) |
| list | `border`, `radius`, `background`, `divider` (the line between the first two items) and `dividerInset`, `rowCap` (max-height), `scroll`, `padding` |
| item (rows and cards) | `height`, `padding`, `inset` (the left edge of the first text or glyph, from the item's edge), `reach` (left/right distance to its container), `gap` (to the next item), `titleFont`, `metaFont`, `trailingEnd` (the right inset of the last child) |
| button | `height`, `padding`, `font`, `radius`, `variant` (variant classes · background), `glyph` (icon size) |
| tag | `height`, `padding`, `font`, `radius`, `tone` (tone classes · background/colour) |
| field | `height`, `padding`, `border`, `radius`, `focus` (what changes under `:focus`) |
| state (empty, loading, error) | `height`, `text` (font and colour), `style` (padding, background, border, alignment) |
| panel | `width`, `surface`, `head` (height, title font, padding), `scroll` |

The inventory brief leaves out some patterns. They get four more classes:
- `head` (page and panel heads);
- `page` (column `x`, `width`, `padding`, `gap`);
- `overlay` (menus, popovers and dialogs);
- `text` (titles, meta lines and captions).

Colours are named by the tokens of `shell/tokens.css` they resolve to. When several tokens share a
value, all of them are listed, for example `--ink|--on-selected`.

## The maps

- `patterns.mjs` is the selector map. It lists every inventory pattern with its metric class and
  its entries: the shared component's classes first, then the hand-built classes the inventory
  lists, each tagged `shared:<Component>` or `hand:<file>`. Patterns the review does not measure
  are listed in `UNMEASURED`, each with its reason. A component migration that renames a class
  updates its entry here. `patterns.test.mjs` fails on any class the renderer no longer declares.
- `screens.mjs` is the navigation map. It lists every screen and state the inventory walked, each
  reached from any screen by Playwright input. A state that needs a new screen or setup is added
  there, in the batch of its area.

Tests: `npx vitest run scripts/component-review/`.
