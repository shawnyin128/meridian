# Renderer component boundary

`components/` owns reusable UI behavior. A route may compose these components and pass domain data,
callbacks, slots, column layouts, or capability flags; it must not copy their interaction or visual
contract into another route.

Current shared contracts:

- `timeline/TimelineBoard`: scale, grid, rows, task bars, milestones, dragging, labels, priority, and
  history visibility hooks. Overview and project detail configure the same board. Its label column and its
  canvas are one Tab stop each, with the up and down arrow keys between labels, lanes, bars and stubs.
- `timeline/MilestoneEditor`: the one milestone editor of both boards. The milestone lane opens it to
  name a new milestone and a diamond to rename or delete one, at the click; Enter or Space on a lane
  opens it on today's date.
- `InlineField`: the one in-place edit of a value, a name included: the rail values, the paper title and
  metadata, the plan's task and milestone names, a project's name on its card or row, and, with `cell`, a
  paper table text cell that its table opens. At rest the value's hover fill reaches past its text by the
  inline field's padding, so the field's text starts where the value's was; Enter, focus leaving or a press
  outside saves, Escape cancels, and what is typed is kept as a draft. A rename starts from a click on the
  name, or, where the name's click opens its item, from the item's rename command (the … menu's 重命名, a
  task's pencil); it never opens a popover.
- `Button`: the one text button: `primary`, `secondary` or `ghost`, in the `neutral` or `danger` tone,
  `regular` (30px) in the page header bar and at dialog, popover and form feet and `compact` (24px) in
  section, group and panel headings, inside rows and cards, and in toolbars, with an optional glyph before
  its label. While `busy` it keeps its width and shows the
  `RunningRing`, in full colour, in place of its label; its busy label is only its accessible name. It is
  marked `aria-busy` and disabled, so a second press cannot start the action again. Each time `done`
  turns true it shows the check in place of its label for a moment. Screens render no raw `<button>`:
  `scripts/check-screen-elements.test.mjs` checks it, and `RAW_BUTTONS` there lists, with a reason
  each, the few that are not text buttons (a composite row's open button, a chip's open part, a link).
- `AddAction`: the one create or add control, the ＋ on a secondary Button's grey fill and never the
  accent, at its slot's size: `regular` in the page header bar, `compact` in headings, table headers and
  rows, and, as the ＋ alone, a `compact` square in a heading or a `chip` circle, a chip's height, after
  a field's chips.
- `CommitActions`: the one Cancel and Save of a draft, Cancel first. Its `place` sets the size and the
  primary rule: at a dialog's, popover's or form's `foot` Save is the primary action at the regular
  size; in a `heading` and inside an `item` both are secondary at the compact size.
- `EditActions`: the one edit contract of a long text: Edit in the heading's action slot, then Cancel and
  Save (CommitActions) in that same place. Save or ⌘Enter commits (Enter in a one-line field), Cancel or
  Escape restores.
- `InlineDraftInput`: the shared input and lifecycle for placeholder/create rows. Hosts provide row
  layout, sibling controls, trigger refs, and persistence; trimming, validation, focus, Enter/Escape,
  outside cancellation, and async submission locking are implemented once.
- `DraftForm`: the one form drafted in place, for a new item, or a change to one, that takes more than one
  field, its labelled ones `FieldRow`s. It opens where the item lands with its first field focused, and Cancel and Save at its foot. Enter
  in a one-line field or ⌘Enter in a long text saves, Escape cancels, and a press outside keeps the draft.
  An item that lands elsewhere names its destination after an arrow, on a card Item of its own. Hosts provide
  the fields and the write; the refused look of a missing field, input method keys, menu keys and the save
  lock are implemented once. No create action opens a dialog.
- `DraftSlot` and `useDraftSlot`: the place a new item's draft opens, the row or card it will be, holding
  its DraftForm or InlineDraftInput, and the one way its AddAction opens it: `start` opens the draft, or,
  when it is open, puts the caret back after what is typed (`focusDraft`). The draft it holds is kept with
  `useDraft` or `useDrafts`, so it comes back in its place after a restart.
- `PickerPopover`: the shared anchored surface for input suggestions and compact pickers. It owns
  portal positioning, focus retention, anchor-aware outside interaction, spacing, and optional event
  isolation; picker contents and domain selection policy stay configurable. Its `size` is a field's
  candidates, a `tall` list or a `wide` results panel. `PickOption` is the one candidate row: menu
  item anatomy, lit only as the active row, and the row under the pointer is it.
- `ActionMenu` and `ActionPopover`: the two shared interactive-surface shells. Menus own action and
  radio-item semantics, and radio and checkbox items draw the one checked mark themselves, in `--accent-mark`, while an
  `inset` action item keeps their empty check slot so its label lines up with theirs; popovers
  retain normal focus for calendars, configuration forms and the reader's selection toolbar, which a
  popover places against a box it measures (`anchorBox`). Routes provide triggers, contents, and
  capability flags instead of assembling Radix roots and portals. Every menu and popover keeps
  `COLLISION_PADDING` from the window edge, and lies on the one menu surface of `ActionMenu.css`,
  which ContextMenu and PickerPopover share; its `surface` holds items (`menu`), a ShortTextEditor
  (`editor`), a form (`form`) or a toolbar (`toolbar`), and `contentClassName` only names or places it.
- `ContextMenu`: the shared right-click menu of one element, opened by the pointer or by the
  ContextMenu key and Shift+F10. Radix owns placement at the point, roving focus with the arrow, Home
  and End keys, outside/Escape dismissal, and focus return.
- `FloatingTextEditor`: positioned short-text create/rename behavior, including async-dismiss locking
  and editor identity when the anchor changes. Only the timeline's milestones use it: a milestone named or
  renamed at a point on the timeline has no text of its own to edit in place.
- `ModalDialog`: the shared triggerless modal shell, overlay, accessibility defaults, and focus return.
  It owns the one dialog surface: the `confirm`, `form` and `wide` size steps on `--raised`, centring,
  a height cap with a scrolling body and pinned `actions`, the title role (`title` or `ModalTitle`),
  the shared close control (`closable`), and stacking above the dialog that opened it.
- `DateTimeDisplay`: the app-wide `M月D日` date and optional time pair.
- `TrailingDate`: an item's date at the end of its card or row, as wide as the widest date of the locale, so
  the trailing dates of cards and rows on one page start and end at one x.
- `ConfirmDialog`: one confirmation/destructive-action contract for wording order, focus, and button
  presentation, on the dialog surface's `confirm` step. Routes provide the consequence, the callback and,
  when the confirmation has one, a short `state` beside the buttons (a `Tag`, such as its cost). The
  trigger opens it, or, when several ways lead to the same confirmation, the host holds it open and focus
  returns to where it was.
- `ShortTextEditor`: the body of `FloatingTextEditor`, including fixed input geometry, focus,
  Enter/Escape, async acceptance, and optional deletion.
- `Item`: the one list item, in two densities that start their content at one `--item-inset`, so rows
  and cards line up on a page that mixes them: `row`, a line of a `List`, and `card`, a bordered item of its
  own. It owns the item's type, the hover, the selected look (the sidebar's current row's: `--accent-soft`
  with `--accent-text`), the drop feedback of `useDragReorder` and the look it keeps while one of its
  menus is open, and the slots leading, title, meta, tags, trailing, `actions` and the overflow `menu`,
  which go in its `RowActions` slot. A card's title is semibold, and so is a two-line row's (`lines={2}`);
  a one-line row's title is regular. `muted` dims an archived or switched-off item, `mark` colours a
  card's leading edge, `leaving` slides a dismissed item away. An actionable row is a button; an item that
  holds controls of its own is `composite` (an actionable card always is): it stays a div that forwards
  pointer clicks, and its `ItemOpen` around the name is the keyboard control, so a button is never nested
  inside a button. `ItemTitle` and `ItemMeta` give a row's own grid cell or a line inside a control of the
  item (Recent Changes' fold toggle) the slot's type. A `subgrid` row lays its cells in its list's grid
  columns, so a list's rows, new and saved, line up.
- `List`: the one container of Items: the outline (`card`) or none (`embedded`), the dividers between
  its rows, cards one under another or in a `grid` of the card width, and how many rows it shows before it
  scrolls inside itself (`rows`: five by default when embedded, `all`, or `fill` for the rest of its
  container's height), keeping its scrollbar's room. A `nested` list in a card's body or a message box
  starts its rows at that content's edge; a `flush` one lies in a surface that clips at its edges.
- `Table`: the one table, the paper table's, the Wiki comparison's and the ideas by project's. It owns the
  header, the cells, sorting, column resizing, the sticky header, first column and actions column with their
  fades, the row hover and selected looks, and cells that fade where they are cut off and show whole on hover
  or fold their chips behind +N. `rows` is `fill` or `capped` at five rows; `actions` is the header cell of the
  actions column (add a column, the column settings) and each `TableRow` puts its own actions in it; `draft` is
  a `TableDraftHead` for a column being created. Screens render no raw `<table>`:
  `scripts/check-screen-elements.test.mjs` checks it.
- `NavRow`: the one row of a navigation list, the sidebar's, the Settings categories' and the theme
  editor's modules, at one height: a glyph slot, the text, and a count or a state at its end. It is a
  button, or, when it holds controls of its own or a fold caret, a div whose label is the button; a row that
  opens nothing is the fold toggle of its group. `indent`, `sub` and `dim` are its looks under a group.
  While Meridian is not the active app, the current row's accent turns to the neutral selected look.
  Activating the selected row again calls its `onReselect`.
- `NavSection`: a titled section of a navigation list whose 24px heading folds the rows under it.
- `NavPane`: the sidebar's pane: its surface, width, collapse, the rows that scroll and the rows pinned
  under them, which keep the same room for the scrollbar so every row ends at one edge.
- `TitleBar` and `Breadcrumb`: the window's title bar, which drags and zooms the window, and the trail of
  where the user is, whose segments before the last link back. `AppFrame` is the window body under it and
  `ScreenSlot` keeps a screen mounted while it is hidden.
- `SegmentedControl`: the only switch between peer views in the app, including the timeline scale: a track of
  equal segments with a raised thumb that slides to the picked one, whose label is in `--accent-text`,
  radio-group semantics, and one Tab stop with arrow keys inside. Picking the picked segment again calls its
  `onReselect`, which `TabbedSection` passes on: with `useTopLevel` (`hooks/`), a switch chosen again takes a
  view that was drilled into back to its top level, scrolled to the top, and does nothing otherwise. The
  `.fchip` and `.segbtn` pill rows are retired.
- `TabbedSection`: the one section whose content switches between peer tabs: its heading, its `SegmentedControl`
  first in the heading's actions slot and then the section's own actions, and the picked tab's panel. A tab with
  nothing shows its sentence as the section `EmptyState`; that state and every row of the list a tab shows are
  one list row high, so switching between a tab with one row and an empty tab moves nothing below. Routes supply
  only the tabs, each tab's content and its empty sentence.
- `Toolbar`: the one roving group, on Radix Toolbar: a group of controls is one Tab stop, the arrow keys move
  between them, and Tab comes back to the one focused last. IconButton, AddAction, ChoicePicker's trigger and
  `ToolbarButton` join the toolbar they render in; a toolbar inside one of the same orientation joins it, and a
  menu, popover or dialog opened from a toolbar keeps its controls out of it. `ToggleGroup` is the group that
  picks a value, on its own or inside a toolbar. A paper row, the row-actions slot and the rating stars use them.
- `ChipToggles`: a multi-select of short values as chips that each turn on or off, with the same one Tab
  stop and arrow keys. An on chip takes the one selected look. A choice among many values is a menu picker, not a segment per value.
- `Swatches`: the one row of colour circles that picks a colour, the theme editor's presets and the reader's
  highlight colours. A picked circle wears the neutral picked ring, never the accent.
- `ZoomControl`: the one zoom control of a view that zooms, the reader's pages and the research graph:
  zoom out, the zoom in percent, which resets it, and zoom in, floating at the view's `bottom` or in its
  `corner`. A step is `zoomStep`, 20% to a round percentage; the wheel stays `hooks/useWheelZoom`.
- `StatTile`: a figure with its label under it on a card, the Overview's counts; `state` `error` colours
  only the figure's text.
- `Switch`: a binary setting that takes effect as soon as it flips. Its name stays the same in both states;
  a button whose label flips between two actions is not used for a setting.
- `Notice`: the app's one notice. AppShell places it on the canvas and screens show it through
  `useNotice()`. It is a live region (`role="status"`), stays `NOTICE_MS`, pauses while the pointer or the
  focus is on it, and offers at most one action. Which tone an action uses:
  - `success`: the action took effect, or what it asked for already held (the paper is already in the vault).
  - `refusal`: the action did not take effect, because Core refused it, the input was invalid or the call
    failed, and nothing was written.
  - A form's save button that stays on screen shows its success in place (CommitActions' `done`, the
    check) and sends no notice. An error that belongs to a pane or card on screen stays with that pane or
    card instead of becoming a notice.
- `LoadingPlaceholder`: the one loading state, grey blocks in the shape of the result (`rows`, `cards`,
  `lines`, `sheet`), or, for one value of a field row, a `ring`: the `RunningRing` in a box as tall as the
  value it holds (a line of text, a tag or a field), so the row keeps its height when the value arrives. Data
  that has not arrived is `null`, and a screen shows this placeholder for it, never an empty state and never a
  loading sentence.
- `EmptyState`: the ways a list says it is empty. `page` is a centred line with an optional icon for a
  whole screen; `section` is one line of small grey text under a section heading, flush with it and one list
  row high, so tabs that share a slot keep one height; `option` is that line in a list of options, its text
  where an option's text starts. The words follow one pattern: 还没有… (No … yet), or
  没有找到… (No … found) for a search, without a full stop. A section the user fills (tasks, milestones,
  attachments, links, linked ideas) keeps its heading and a section empty state; a derived section (signals,
  recent progress, upcoming milestones, backups, a node's branches, records and document) is hidden while it
  has nothing to show. A control that orders or groups a list is hidden while the list is empty; adding,
  filtering and settings stay.
- `Tag`: every tag, chip and status pill, on the one neutral chip. Only a `state` colours its text, `error`,
  `warning`, `done`, `p0` or `p1`; a kind, source, name or any other word is neutral. `shape` picks the
  box (`label` for a status, kind, priority or source word; `chip` for a name, topic, date or value).
  `TagButton` is the clickable tag and `tagClass` gives a trigger another component renders the same classes.
  A tag keeps the width of its text: the text beside it gives way first, and when its row still has no
  room the tag hides as a whole. Only a `capped` tag, whose placement caps it for a long value, fades its text.
  A host places and sizes a tag through `className` but never sets its fill, colour, border, radius or padding.
- `CountBadge`: the one count beside a row or button label, zero shown as 0. With `more` it is a button in the
  same look that counts the items folded away as +N and unfolds them. A property's value is not a count beside
  a label: a property list shows a count as plain text, like its other values.
  A host only places it. A heading's count is not a badge: the heading shows it after its text as `· N`.
- `StatusDot`: the one state dot, in two sizes, filled, half-filled or a ring. A dot whose state no nearby text names
  carries a `label`.
- `ReadDots`: one neutral `StatusDot` per paper's reading state on one fading line, read first, then reading, then
  the rest, named by its `label`.
- `Tooltip`: the one tooltip, under the one `TooltipProvider` at the renderer root. Its text is the element's
  name plus the platform's shortcut (`commandShortcut`); it opens after one delay on hover and at once on
  keyboard focus, and with `whenClipped` only while a cut-off text needs showing whole. `IconButton`'s `label`
  is its tooltip, and its `note` the line under it: a disabled button that has a reason, such as a Trash row's
  Restore, states it there, never as a tag or a sentence beside the button. The pointer still opens the tooltip of
  a disabled button.
- `SidePanel`: the one panel that opens beside a page body for one item or tool. Its `surface` is a
  `card` inside the page body, beside its content, or an `edge` panel against the window's edge, with a
  rule on its inner side; each surface has one width and one inset. It takes its width at once and only
  its content moves in. Its content is a column: `PanelHead` stays at the top and `PanelBody`, under it,
  scrolls and fades. `PanelHead` sets its buttons, the panel's actions and then the one close button,
  compact on a row of their own at the top right, and under them the title, which spans the head and
  wraps; the title comes first in the markup, so Tab reaches a title that is a control first. The panel
  is named by that title, or by its `label`. Screens only place it: its position, its height and the gap
  beside it.
- `SplitPage`: the one page of two columns side by side, a master and its detail: the Wiki's pages and
  their rail, the Ideas list and its panel, the research map's index and detail. It takes the height its
  page body has left, and both columns start at its top and end at its bottom, each scrolling inside
  itself and fading at a hidden edge: a `SplitColumn`, a `SplitRail` (properties and links after a rule,
  in small text) or a `ListColumn` fills its column, and a `SidePanel` or a card is as tall as its content
  up to the column's height. `columns` is `rail` (a main column and a rail or panel as wide as it is),
  `index` (a narrow index and its detail) or `dialog`, the Settings modal and the theme editor: a
  `SplitNav`, the navigation with its title and back button in a head, and a `SplitMain`, a head that
  stays above a body that scrolls, or with `fill` a body that fills the column and never scrolls, whose
  own parts, such as a `List` with `rows="fill"`, scroll inside it. The head is the pane's heading, which
  spaces itself, or, with `fields`, the fields of what the column edits (the theme editor's name and base),
  which stand the item gap above the body; the body keeps room for focus rings inside its top and bottom.
  Every scrolling column scrolls through `ScrollArea`.
- `GroupedList` and `Group`: items grouped by status, kind, day, source, project or archive. Each group opens
  with the group heading, the third heading level, and the first group sits flush with the list's top; a
  group with `fold` folds its items through its heading, and `sticky` pins that heading while they scroll.
  The list draws no box, so its groups' items keep the grid, column or stream around it.
- `hooks/useCandidateKeys`: arrow-key, pointer and Enter handling for a candidate list, shared by every
  suggestion and picker dropdown.
- `hooks/useDrafts`: the one home of unsaved text. Every editor holds what is typed in `useDrafts`, scoped by
  the item it belongs to, so the draft is kept on this machine as it is typed, comes back in its place
  after a restart, and goes once it is saved or cancelled; a host that loads a list passes its ids
  (`live`, `usePruneDrafts`) so a kept draft of a deleted item is dropped.
- `hooks/useWheelZoom`: the one wheel rule of a zoomable view, shared by the reader and the research graph:
  a pinch or a Ctrl- or ⌘-scroll zooms about the pointer, and every other scroll scrolls the page.
- `FormInput`, `FormTextarea`, and `FormSelect`: the one field, in two appearances: `field`, the boxed field
  of forms, dialogs, popovers and filters (the default), and `inline`, which edits a value in the place of its
  text in a row, cell or property list. Both share one edge, fill, radius and the one focus rule in
  `shell/tokens.css`; no other stylesheet draws a field's box or sets its text. A `field` sets its own font,
  the body text, whatever the text around it; an `inline` field takes the text it replaces. Feature
  components still own their layout, validation, suggestions, and persistence.
- `FieldRow` and `FieldRows` (in `FormControls`): the one labelled field. The label stands in the label
  column, in the meta size and `--ter`, and names the text field after it; the rows of one `FieldRows`, or of
  a `DraftForm`, share a label column as wide as their longest label. Screens render no `<label>` of their own.
- `PropertyList` and `Property`: the one label/value list, in the project and Wiki rails, the paper
  metadata, a run's cost plan, the Wiki ingest scope and proposal cards. Labels stand in a column as wide as
  the longest, in the meta size and `--ter`, values after them in `--sec`; `aligned` lists take the label
  column of the grid around them. Screens render no `dl` of their own.
- `SshFolderPicker`: choosing a folder on an SSH host the way a local one is chosen. `SshHostField` is the
  host field: it offers the `Host` aliases Core reads from `~/.ssh/config` and keeps any host typed.
  `useSshFolders` connects through Core and lists one folder at a time, dropping answers that arrive late.
  `SshFolderBrowser` shows the folder: the enclosing-folder control and its path as a field, where Enter goes
  to a typed path (absolute or under `~`, hidden folders too), then its subfolders in a list five rows high,
  the loading state while the next folder lists, and a failure under the list. The
  project's workspace dialog uses all three, and any other choice of a remote folder reuses them.
- `ClearableInput`: the shared controlled single-line field with one trailing clear action. `SearchField` is
  the one search, a `ClearableInput` with the search glyph at its start: the sidebar search, the command
  palette and the library search configure the same focus restoration, icon geometry, and accessible naming.
- `GenerationControl`: the shared idle and running button contract for model-backed actions: while
  running it is the stop control, the stop square inside the turning ring. Chat composers and Wiki
  Harness generation do not define independent running animations.
- `ComposerBox`: the one composer box, a rounded field with what is typed on top and, under it, a row
  of chips ending with the send control, a GenerationControl. The chat screen and the reader's paper
  chat compose it through `chat/ChatComposer`.
- `ModelChips`: the composer's three pickers for one chat, each ChoicePicker's `capsule` look: the source,
  ending with 模型设置…, the model of that source, and the reasoning effort. A pick changes only that
  chat's own choice, which Core keeps. While no model is set up it is the shared "AI not connected" tag.
- `ElapsedTime`: the one time since a moment, `12s` under a minute and `1m 05s` after, counting up each
  second in tabular numerals; a pending chat answer shows it after 思考中….
- `RunningRing` (in `icons`): the one running indicator, `DownloadRing` without a total, turning once per
  `--t-spin` in `--accent-mark`. GenerationControl, Button and About use it; on a
  solid accent fill (a primary button, the composer's send) it turns in the fill's ink, by its own rule in
  `icons.css`, and a running job is never drawn in a danger tone.
- `ProgressFill`: the one progress presentation, a 2px `--accent-mark` line on a `--track` groove along its
  host's bottom edge, filled to the progress. ParseProgress and InlineMessage host it.
- `CardTray`: progressive disclosure for secondary card details. It keeps a one-line summary visible,
  expands details below the host without moving its primary identity, and owns the shared animation,
  keyboard semantics, and reduced-motion behavior.
- `CommandTray`: the one command the user runs in their own terminal, on a `CardTray`: its heading and the
  command on one line, the whole command once opened, and Copy, which shows the check once the command is on
  the clipboard. The agent plugins' install and update commands and the subscription CLIs' sign-in commands use it.
- `PageShell`: the shared page-level header/body/footer/error/section composition. Routes supply content
  and actions rather than copying the desktop shell structure. `PageHeader` heads a page or, at `size: 'pane'`,
  a pane beside it, such as the reader's paper chat and rail panels. `PageBody` keeps its content to the
  page's column, `page` or `prose`. `SectionHeading` is the one heading of a section or a group: its `level`
  is `section` or `group` (a rail, panel or card section is a group), `count` and `meta` follow the title,
  `fold` makes the title a fold toggle, and `actions` is the only right-hand slot.
- `ScrollArea`: the one scroll container, with the fade of every hidden edge, the fill of a flex column
  and the fade a sticky element lays under itself while stuck (`data-stuck-fade`).
- `HeadingCount`: a heading's count, ` · N` after its text in the heading's own type. `PageTitle`,
  `SectionHeading` (and with it `Group`) and `CardTray` show it through their `count`; no message or screen
  writes `· N` itself.
- `PickRow`, `Pager`, `Markdown`, `PaperMetadata`, `ParseProgress`: shared feature widgets.
- `RatingStars`, `ReadStatePicker` (in `PaperMetadata`) and `PaperTopics`: the one rating, reading-status and
  topic editor of a paper, used by both the paper table and the detail panel.
- `ChipList`: the one list of removable chips. Each chip's name opens what it names, and its pencil and
  × sit in the chip's row-actions slot; the `+` after the chips is AddAction's chip-sized circle, in the
  row's actions slot with `reveal="hover"`; with `label` the list is a relation row (`wkrel`). It draws a
  paper's topics and projects, a project's areas and relations, and an idea's relations. `ChipList.css`
  holds the chip base every row of chips uses: a chip's spacing (`tagchip`), its name button
  (`tagchip-open`) and the relation row with its label (`wkrel`).
- `TagChips`: the one editor of a list of values as chips on ChipList, with `+` to add from a vocabulary
  and an optional click on a chip to edit it in place; a paper's topics and a project's areas use it.
- `paper/PaperCard`: the discovery card, a card Item: its actions, notices, metadata badges and
  recommendations, and the shared LaTeX-capable `PaperAbstract`. Inbox and read-later configure the same card.
- `paper/PaperText`: every display of a paper title (inline) or abstract (block, through `Markdown`) with
  the LaTeX of arXiv metadata; `plainTitle` is the same title for tooltips, aria labels, breadcrumbs and notices.
- `paper/PaperUnderstanding`: the reader-facing whole-paper remark and page-linked note summary. It
  keeps personal reading state visually and structurally separate from canonical Wiki Markdown.
- `chat/PaperChat` and `chat/ChatMessage`: paper-context composition, shared conversation rendering,
  explicit project-record actions, and chat-owned styling. Conversation text is not promoted to an
  idea or project conclusion by a generic last-message shortcut.
- `reader/ReaderSidePanel`: the configurable metadata/highlights/notes/remark tool rail; its note and
  remark editors are feature components rather than hidden route implementations. Every panel opens with
  the pane-size `PageHeader`.
- `paper-table/PaperTable`: the complete library table, including configurable columns, grouping,
  cell pickers, column type editors, reading summaries, and table-owned styling. The route is only
  a page-shell adapter, while Wiki reuses the same column-creation control directly.
- `project/ResearchGraph` and `project/ResearchNodePanel`: topology-based tree layout, active-path
  rendering, zoom/pan state, node selection, branch summaries, and Agent-owned node documents. The
  project route only selects the data source and holds the selected node id.
- `project/ProjectPlan`: the complete task/milestone editor, including segmented mode, create rows that pick
  their fields with the saved rows' pickers in the saved rows' columns,
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
  presentation and callbacks rather than rebuilding popovers and keyboard behavior. A value is picked the same
  way in a new item as in a saved one: a menu for a choice, the one calendar for a date, never a native date
  input or a click that cycles values. `ChoicePicker` is the one
  single-value picker: `appearance="field"` makes it the boxed field of a form in place of a native select,
  and `appearance="capsule"` the composer's picker, text and a small caret on a neutral capsule whose fill
  deepens under the pointer and while open. `note` marks an option's row at its end, and `after` ends the menu with
  commands after a divider.
  `DateRangeField` is the one start and end, a task's schedule and a project's dates alike, under one rule:
  the end's calendar starts at the start, and a start picked after the end takes the end along to it. `DotsMenu` is the one
  overflow-menu trigger: `label` names it, `stopRowActivation` keeps a click from activating the row it
  sits in, and `open` with `onOpenChange` lets a host control it. The host owns the rule that reveals it.
  A right-click on the row or card that holds it (an `Item`'s `menu` slot, or a row hosting `RowActions`)
  opens this same menu at the pointer,
  and the ContextMenu key or Shift+F10 there opens it at the trigger, so a row never defines a second,
  right-click menu of its own.

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
