# Renderer component boundary

`components/` owns reusable UI behavior. A route may compose these components and pass domain data,
callbacks, slots, column layouts, or capability flags; it must not copy their interaction or visual
contract into another route.

Current shared contracts:

- `timeline/TimelineBoard`: scale, grid, rows, task bars, milestones, dragging, labels, priority, and
  history visibility hooks. Overview and project detail configure the same board.
- `InlineField`: one-field-at-a-time editing, validation, cancel/save behavior, and presentation hooks.
- `InlineDraftInput`: the shared input and lifecycle for placeholder/create rows. Hosts provide row
  layout, sibling controls, trigger refs, and persistence; trimming, validation, focus, Enter/Escape,
  outside cancellation, and async submission locking are implemented once.
- `PickerPopover`: the shared anchored surface for input suggestions and compact pickers. It owns
  portal positioning, focus retention, anchor-aware outside interaction, spacing, and optional event
  isolation; picker contents and domain selection policy stay configurable.
- `ActionMenu` and `ActionPopover`: the two shared interactive-surface shells. Menus own action and
  radio-item semantics; popovers retain normal focus for calendars and configuration forms. Routes
  provide triggers, contents, and capability flags instead of assembling Radix roots and portals.
- `ContextMenu`: the shared coordinate-menu shell for mouse and keyboard context actions. It owns
  portal placement, viewport clamping, focus, outside/Escape dismissal, and focus return.
- `FloatingTextEditor`: positioned short-text create/rename behavior, including async-dismiss locking
  and editor identity when the anchor changes.
- `ModalDialog`: the shared triggerless modal shell, overlay, accessibility defaults, and focus return.
- `DateTimeDisplay`: the app-wide `M月D日` date and optional time pair.
- `ConfirmDialog`: one confirmation/destructive-action contract for wording order, focus, and button
  presentation. Routes provide the consequence and callback only.
- `ShortTextEditor`: the shared create/rename popover body, including fixed input geometry, focus,
  Enter/Escape, async acceptance, and optional deletion.
- `StructuredList`: list shell and actionable/static row semantics; routes only supply columns and cells.
  A row that holds controls of its own is `composite`: it stays a div that forwards pointer clicks, and
  its children carry the keyboard-accessible control, so a button is never nested inside a button.
- `SegmentedControl`: the only switch between peer views in the app, with shared geometry, selected state,
  keyboard focus, and pressed-button semantics. The `.fchip` and `.segbtn` pill rows are retired.
- `EmptyState`: the two ways a list says it is empty. `page` is a centred sentence with an optional icon
  for a whole screen; `section` is one line of small grey text under a section heading.
- `PanelClose`: the close button of a detail panel, with one label and one glyph everywhere.
- `DetailPanel`: the shared open/closed state and motion contract for right-side details. Its `inline`,
  `overlay`, and `resize` modes cover panels that join layout, slide over it, or widen an existing rail;
  routes provide only final geometry and domain content.
- `DayHeading`: the small heading that opens one day in a list grouped by day, with an optional count.
- `hooks/useCandidateKeys`: arrow-key, Enter and Escape handling for a candidate list, shared by every
  suggestion and picker dropdown.
- `ResearchObjectCard`: one list-card shell for first-class research objects such as projects and ideas;
  routes provide their domain-specific identity and metadata without redefining width, spacing, borders,
  selection, management-menu visibility, or keyboard activation.
- `FormInput`, `FormTextarea`, and `FormSelect`: the native form-control baseline for stable geometry,
  inherited typography, and focus without browser-specific rings. Feature components still own their
  layout, validation, suggestions, and persistence.
- `ClearableInput`: the shared controlled single-line field with one trailing clear action. Global and
  library search configure the same focus restoration, icon geometry, and accessible naming.
- `GenerationControl`: the shared idle, spinning, and hover-to-stop button contract for model-backed
  actions. Chat composers and Wiki Harness generation do not define independent running animations.
- `CardTray`: progressive disclosure for secondary card details. It keeps a one-line summary visible,
  expands details below the host without moving its primary identity, and owns the shared animation,
  keyboard semantics, and reduced-motion behavior.
- `PageShell`: the shared page-level header/body/footer/error/section composition. Routes supply content
  and actions rather than copying the desktop shell structure. `SectionHeading` is the one section heading:
  its `variant` is `page`, `content`, `group` or `rail`, and `actions` is the only right-hand slot.
- `PickRow`, `Pager`, `Markdown`, `PaperMetadata`, `ParseProgress`, `AddAction`: shared feature widgets.
- `paper/PaperCard`: discovery-card composition, actions/notices slots, metadata badges, recommendations,
  and the shared LaTeX-capable `PaperAbstract`. Inbox and read-later configure the same card.
- `paper/PaperUnderstanding`: the reader-facing whole-paper remark and page-linked note summary. It
  keeps personal reading state visually and structurally separate from canonical Wiki Markdown.
- `chat/PaperChat` and `chat/ChatMessage`: paper-context composition, shared conversation rendering,
  explicit project-record actions, and chat-owned styling. Conversation text is not promoted to an
  idea or project conclusion by a generic last-message shortcut.
- `reader/ReaderSidePanel`: the configurable metadata/highlights/notes/remark tool rail; its note and
  remark editors are feature components rather than hidden route implementations.
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
  presentation and callbacks rather than rebuilding popovers and keyboard behavior. `DotsMenu` is the one
  overflow-menu trigger: `label` names it, `stopRowActivation` keeps a click from activating the row it
  sits in, and `open` with `onOpenChange` lets a host control it. The host owns the rule that reveals it.

Dependency direction is enforced by ESLint: `components/`, `hooks/`, and `lib/` cannot import from
`routes/`. If a shared component needs something currently owned by a route, move the smallest stable
contract down and pass route-specific policy in through props.

Cross-screen labels and pure policy helpers live in `lib/` (`paper-title`, `slug`, `chat`, `trash`),
so opening one screen never imports another screen just to borrow a constant or formatter.

Date arithmetic/formatting and project signal projection live in `shared/` because Renderer and Core
must agree on them without importing UI. They are pure runtime projections and never become Paper Wiki
schema or durable generated knowledge.

Route CSS may control placement and available space. A component owns its internal states, focus,
hover, truncation, and interaction styling in a colocated stylesheet.
