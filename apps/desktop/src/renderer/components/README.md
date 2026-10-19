# Renderer component boundary

`components/` owns reusable UI behavior. A route may compose these components and pass domain data,
callbacks, slots, column layouts, or capability flags; it must not copy their interaction or visual
contract into another route.

Current shared contracts:

- `timeline/TimelineBoard`: scale, grid, rows, task bars, milestones, dragging, labels, priority, and
  history visibility hooks. Overview and project detail configure the same board.
- `timeline/MilestoneEditor`: the one milestone editor of both boards. The milestone lane opens it to
  name a new milestone and a diamond to rename or delete one, at the click.
- `InlineField`: one-field-at-a-time editing, validation, cancel/save behavior, and presentation hooks.
- `EditActions`: the one edit contract of a long text: Edit in the heading's action slot, then Cancel and
  Save in that same place. Save or ⌘Enter commits (Enter in a one-line field), Cancel or Escape restores.
- `InlineDraftInput`: the shared input and lifecycle for placeholder/create rows. Hosts provide row
  layout, sibling controls, trigger refs, and persistence; trimming, validation, focus, Enter/Escape,
  outside cancellation, and async submission locking are implemented once.
- `PickerPopover`: the shared anchored surface for input suggestions and compact pickers. It owns
  portal positioning, focus retention, anchor-aware outside interaction, spacing, and optional event
  isolation; picker contents and domain selection policy stay configurable. `PickOption` is the one
  candidate row: menu item anatomy, lit only as the active row, and the row under the pointer is it.
- `ActionMenu` and `ActionPopover`: the two shared interactive-surface shells. Menus own action and
  radio-item semantics, and radio and checkbox items draw the one checked mark themselves; popovers
  retain normal focus for calendars and configuration forms. Routes provide triggers, contents, and
  capability flags instead of assembling Radix roots and portals. Every menu and popover keeps
  `COLLISION_PADDING` from the window edge.
- `ContextMenu`: the shared right-click menu of one element, opened by the pointer or by the
  ContextMenu key and Shift+F10. Radix owns placement at the point, roving focus with the arrow, Home
  and End keys, outside/Escape dismissal, and focus return.
- `FloatingTextEditor`: positioned short-text create/rename behavior, including async-dismiss locking
  and editor identity when the anchor changes.
- `ModalDialog`: the shared triggerless modal shell, overlay, accessibility defaults, and focus return.
  It owns the one dialog surface: the `confirm`, `form` and `wide` size steps on `--raised`, centring,
  a height cap with a scrolling body and pinned `actions`, the title role (`title` or `ModalTitle`),
  the shared close control (`closable`), and stacking above the dialog that opened it.
- `DateTimeDisplay`: the app-wide `M月D日` date and optional time pair.
- `ConfirmDialog`: one confirmation/destructive-action contract for wording order, focus, and button
  presentation, on the dialog surface's `confirm` step. Routes provide the consequence and callback only.
- `ShortTextEditor`: the shared create/rename popover body, including fixed input geometry, focus,
  Enter/Escape, async acceptance, and optional deletion.
- `StructuredList`: list shell and actionable/static row semantics; routes only supply columns and cells.
  A row that holds controls of its own is `composite`: it stays a div that forwards pointer clicks, and
  its children carry the keyboard-accessible control, so a button is never nested inside a button.
- `NavRow`: the one row of a navigation list, the sidebar's and the Settings categories'. It is a button,
  or, when it holds controls of its own, a div whose label is the button; the row's class gives the look.
- `SegmentedControl`: the only switch between peer views in the app, including the timeline scale: a track of
  equal segments with a raised thumb that slides to the picked one, radio-group semantics, and one Tab stop
  with arrow keys inside. The `.fchip` and `.segbtn` pill rows are retired.
- `ChipToggles`: a multi-select of short values as chips that each turn on or off, with the same one Tab
  stop and arrow keys. A choice among many values is a menu picker, not a segment per value.
- `Switch`: a binary setting that takes effect as soon as it flips. Its name stays the same in both states;
  a button whose label flips between two actions is not used for a setting.
- `Notice`: the app's one notice. AppShell places it on the canvas and screens show it through
  `useNotice()`. It is a live region (`role="status"`), stays `NOTICE_MS`, pauses while the pointer or the
  focus is on it, and offers at most one action. Which tone an action uses:
  - `success`: the action took effect, or what it asked for already held (the paper is already in the vault).
  - `refusal`: the action did not take effect, because Core refused it, the input was invalid or the call
    failed, and nothing was written.
  - A form's save button that stays on screen shows its success in place (Saved) until the form changes
    again and sends no notice. An error that belongs to a pane or card on screen stays with that pane or
    card instead of becoming a notice.
- `LoadingPlaceholder`: the one loading state, grey blocks in the shape of the result (`rows`, `cards`,
  `lines`, `sheet`). Data that has not arrived is `null`, and a screen shows this placeholder for it, never
  an empty state and never a loading sentence.
- `EmptyState`: the two ways a list says it is empty. `page` is a centred line with an optional icon for a
  whole screen; `section` is one line of small grey text under a section heading, flush with it and one list
  row high, so tabs that share a slot keep one height. The words follow one pattern: 还没有… (No … yet), or
  没有找到… (No … found) for a search, without a full stop. A section the user fills (tasks, milestones,
  attachments, links, linked ideas) keeps its heading and a section empty state; a derived section (signals,
  recent progress, upcoming milestones, backups, a node's branches, records and document) is hidden while it
  has nothing to show. A control that orders or groups a list is hidden while the list is empty; adding,
  filtering and settings stay.
- `Tag`: every tag, chip and status pill. `tone` picks the fill and text colour (`neutral`, `accent`, `good`,
  `warn`, `bad`, `info`, `paper`, `wiki`, and `ghost` for the slot that adds a tag to a row) and `shape` the
  box (`label` for a status, kind, priority or source word; `chip` for a name, topic, date or value).
  `TagButton` is the clickable tag and `tagClass` gives a trigger another component renders the same classes.
  `CountBadge` is the one count beside a label. A host places and sizes these through `className` but never
  sets their fill, colour, border, radius or padding.
- `StatusDot`: the one state dot, in two sizes. A dot whose state no nearby text names carries a `label`.
- `Tooltip`: the one tooltip, under the one `TooltipProvider` at the renderer root. Its text is the element's
  name plus the platform's shortcut (`commandShortcut`); it opens after one delay on hover and at once on
  keyboard focus, and with `whenClipped` only while a cut-off text needs showing whole. `IconButton`'s `label`
  is its tooltip.
- `PanelClose`: the close button of a detail panel, with one label and one glyph everywhere.
- `DetailPanel`: the shared open/closed state and motion contract for right-side details. Its `inline`,
  `overlay`, and `resize` modes cover panels that join layout, slide over it, or widen an existing rail;
  routes provide only final geometry and domain content.
- `DayHeading`: the small heading that opens one day in a list grouped by day, with an optional count.
- `hooks/useCandidateKeys`: arrow-key, pointer and Enter handling for a candidate list, shared by every
  suggestion and picker dropdown.
- `ResearchObjectCard`: one list-card shell for first-class research objects such as projects and ideas;
  routes provide their domain-specific identity and metadata without redefining width, spacing, borders,
  selection, management-menu visibility, or keyboard activation.
- `FormInput`, `FormTextarea`, and `FormSelect`: the one field, in two appearances: `field`, the boxed field
  of forms, dialogs, popovers and filters (the default), and `inline`, which edits a value in the place of its
  text in a row, cell or property list. Both share one edge, fill, radius and the one focus rule in
  `shell/tokens.css`; no other stylesheet draws a field's box. Feature components still own their layout,
  validation, suggestions, and persistence.
- `ClearableInput`: the shared controlled single-line field with one trailing clear action. Global and
  library search configure the same focus restoration, icon geometry, and accessible naming.
- `GenerationControl`: the shared idle, spinning, and hover-to-stop button contract for model-backed
  actions. Chat composers and Wiki Harness generation do not define independent running animations.
- `RunningRing` (in `icons`): the one running indicator, `DownloadRing` without a total, turning once per
  `--t-spin` in the colour of the text around it. GenerationControl and About use it; a running job is
  never drawn in a danger tone.
- `CardTray`: progressive disclosure for secondary card details. It keeps a one-line summary visible,
  expands details below the host without moving its primary identity, and owns the shared animation,
  keyboard semantics, and reduced-motion behavior.
- `PageShell`: the shared page-level header/body/footer/error/section composition. Routes supply content
  and actions rather than copying the desktop shell structure. `SectionHeading` is the one section heading:
  its `variant` is `page`, `content`, `group` or `rail`, and `actions` is the only right-hand slot.
- `PickRow`, `Pager`, `Markdown`, `PaperMetadata`, `ParseProgress`, `AddAction`: shared feature widgets.
- `RatingStars`, `ReadStatePicker` (in `PaperMetadata`) and `PaperTopics`: the one rating, reading-status and
  topic editor of a paper, used by both the paper table and the detail panel.
- `paper/PaperCard`: discovery-card composition, actions/notices slots, metadata badges, recommendations,
  and the shared LaTeX-capable `PaperAbstract`. Inbox and read-later configure the same card.
- `paper/PaperText`: every display of a paper title (inline) or abstract (block, through `Markdown`) with
  the LaTeX of arXiv metadata; `plainTitle` is the same title for tooltips, aria labels, breadcrumbs and notices.
- `paper/PaperUnderstanding`: the reader-facing whole-paper remark and page-linked note summary. It
  keeps personal reading state visually and structurally separate from canonical Wiki Markdown.
- `chat/PaperChat` and `chat/ChatMessage`: paper-context composition, shared conversation rendering,
  explicit project-record actions, and chat-owned styling. Conversation text is not promoted to an
  idea or project conclusion by a generic last-message shortcut.
- `reader/ReaderSidePanel`: the configurable metadata/highlights/notes/remark tool rail; its note and
  remark editors are feature components rather than hidden route implementations. Every panel opens with
  `reader/ReaderPanelHeader`.
- `paper-table/PaperTable`: the complete library table, including configurable columns, grouping,
  cell pickers, column type editors, reading summaries, and table-owned styling. The route is only
  a page-shell adapter, while Wiki reuses the same column-creation control directly.
- `project/ResearchGraph` and `project/ResearchNodePanel`: topology-based tree layout, active-path
  rendering, zoom/pan state, node selection, branch summaries, and Agent-owned node documents. The
  project route only selects the data source and holds the selected node id.
- `project/ProjectPlan`: the complete task/milestone editor, including segmented mode, create rows,
  per-field editing, deletion, focus restoration, and timeline-location highlighting. Persistence and
  timeline coordination are injected by the project route.
- `project/ProjectControl`: one visual contract for the resolved next action and blocker. Project
  detail, overview, and the project list select `detail`, `summary`, or `inline` density; none of them
  reinterpret focus, tasks, or graph state. The pure resolver lives in `shared/project-control` so
  Core can put the same projection on lightweight project summaries.
- `project/ProjectIdentity`: one project-name/status/priority/topic hierarchy for list headers, compact
  rows, overview progress, and editable detail fields.
- `project/ProjectSections` and `project/ProjectTimeline`: the detail page's reusable topic, memo,
  relations, attachments, Agent sessions, and timeline feature sections. The route coordinates data
  and persistence instead of implementing their internal UI.
- `FieldPickers`: shared choice, priority, date, and overflow-menu controls. Screens supply trigger
  presentation and callbacks rather than rebuilding popovers and keyboard behavior. `ChoicePicker` is the one
  single-value picker: `appearance="field"` makes it the boxed field of a form in place of a native select. `DotsMenu` is the one
  overflow-menu trigger: `label` names it, `stopRowActivation` keeps a click from activating the row it
  sits in, and `open` with `onOpenChange` lets a host control it. The host owns the rule that reveals it.

Dependency direction is enforced by ESLint: `components/`, `hooks/`, and `lib/` cannot import from
`routes/`. If a shared component needs something currently owned by a route, move the smallest stable
contract down and pass route-specific policy in through props.

Cross-screen labels and pure policy helpers live in `lib/` (`slug`, `chat`, `format`, `plural`),
so opening one screen never imports another screen just to borrow a constant or formatter.

Date arithmetic/formatting and project signal projection live in `shared/` because Renderer and Core
must agree on them without importing UI. They are pure runtime projections and never become Paper Wiki
schema or durable generated knowledge.

Route CSS may control placement and available space. A component owns its internal states, focus,
hover, truncation, and interaction styling in a colocated stylesheet.
