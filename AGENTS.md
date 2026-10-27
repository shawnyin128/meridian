# Meridian Agent Guide

This file binds every coding agent (Codex, Claude Code, Cursor, and others)
working in this repository. The rules below are the project's development
standard, not suggestions. When a request conflicts with them, stop and ask the
human; do not work around a rule.

## What Meridian Is

Meridian is a desktop research workbench. A Paper Wiki internalizes papers into
a Markdown knowledge base, and a Lab layer turns that knowledge into ideas,
projects, experiments, and findings. The user's vault is their research record:
treat every write to it as irreversible.

## Before You Change Anything

- Read the code you are about to change and the code that calls it. The
  current code is the reference for style, naming, and structure.
- If the task is ambiguous or touches more than a few files, write a short plan
  and get the human's sign-off before editing.
- Implement exactly what was asked. A case nobody asked for (extra formats,
  defensive branches, new options) goes into your reply as a question, not
  into the code.
- Every changed line must trace to the task. Report unrelated problems instead
  of fixing them in the same change.
- Never claim something works without running it. Say "unverified" when you
  could not run it.

## Owner Checkpoints

Besides the questions other rules require, work stops for the owner at three
points:

1. **Plan.** Before editing, when the task is ambiguous or touches more than a
   few files.
2. **Change review.** When a version's pull requests are open, check out in the
   owner's main checkout a branch that holds them: the work branch for one pull
   request, or a local-only `review/vX.Y.Z.F` branch that merges the release
   branch and every work branch. Build it, seed a fresh test library with that
   build (see Test Library) and open it for the owner. List the files and lines
   to check, issue by issue. The owner's OK in the conversation is the approval
   `.github/pull-requests.md` requires; pull requests are opened from the
   owner's account, so GitHub cannot record an approving review. Then merge each
   pull request into the release branch with `gh pr merge --merge`, close its
   issue, switch the main checkout to the release branch and delete the review
   branch. Parallel sessions work in their own worktrees under `.worktrees/`, so
   the main checkout stays free for review: switch it only when `git status` is
   clean there and no other `review/` branch is checked out.
3. **Build review.** Releasing step 5: nothing is tagged until the owner
   approves the unpacked build, reviewed on a test library freshly seeded with
   that build.

Once the owner has asked for a change or a release, carry everything between
these points forward without asking: issues, branches, pull requests, merging
after the change review, the version bump, the unpacked build and the upgrade
smoke. Milestones are not among them (see Git).

## Architecture

One frontend, two backends. The directory layout is the architecture.

| Path | Role | Owns |
|---|---|---|
| `apps/desktop/src/renderer` | React UI | Presentation only. No Node, no Electron. |
| `apps/desktop/src/core` | Stateful backend | The vault, every disk write, network access, validation. |
| `apps/desktop/src/main` | Electron host | Windows, menus, OS integration, credential encryption. |
| `apps/desktop/src/shared/contract.ts` | Renderer/Core interface | The only types both sides share. |
| `apps/harness` | Stateless Python service | LLM orchestration. Owns no data. |
| `src/meridian`, `plugins/` | CLI, MCP server, agent plugins | Agent-facing access to the same vault. |

These boundaries are enforced by `eslint.config.js` and by Ruff's banned-API
list in `apps/harness/pyproject.toml`. A violation is a build break. Never
silence one with a disable comment or by loosening the lint config.

- The renderer talks to Core only through the preload surface
  (`window.meridian`) and the contract in `shared/contract.ts`. It imports
  types from the contract, never its zod schemas; validation happens in Core.
- Core never imports renderer code. Each Core domain (`recommendation`,
  `project-management`, `paper-library`, `wiki`, `harness`, `research-ideas`)
  exposes itself only through its `index.ts`; do not reach into another
  domain's internals. A new domain, a directory under `core/` with its own
  `index.ts`, joins `coreDomainBoundaries` in `eslint.config.js` in the same
  change that creates it.
- Only Core writes the vault, only through the vault writer, and only as
  line-level edits that leave every other byte untouched.
- The Harness never touches the filesystem or handles paths. It refers to
  data by entity ID and asks Core for it over RPC.
- Payloads crossing a process boundary are plain serializable data: no class
  instances, functions, `Date`, `Map`, or `Set`.

Put an interface only where a boundary is structural: a process or language
edge, a genuinely swappable external service, or a seam a test must substitute
(for example `HarnessRpc`, `VaultStore`, `MetadataProvider`,
`RecommendationProvider`). Everywhere else, one concrete implementation with no
interface is correct.

## Version Compatibility

The vault, project workspaces, and Lab state are read and written by different versions of the
App, the Python package, and the agent plugins. Data formats are compatible in both directions:

- **Backward (mandatory).** A newer version reads and displays everything an older version wrote:
  vault pages, workspace surfaces, Lab state, graph exports, events, queues. When a format
  changes, keep the reader for the old shape and prove it with a test on an old-format sample.
  Data an older version produced must never disappear after an upgrade.
- **Forward (graceful).** When reading a file another process or version wrote, ignore unknown
  additive fields instead of rejecting the whole file. A part that genuinely cannot be read is
  reported on its own with the reason (for example "update the App") while every other part keeps
  showing. One unreadable surface never hides the others.
- Contract types are often stored whole (undo snapshots in the change log, trash, queues), so
  renaming or removing a field of a stored type is a storage-format change: find every stored copy
  and give each a reader for the old shape.
- Stored data is read record by record: a record that cannot be read is reported and skipped or
  degraded, and never keeps the library from opening.
- A change that adds or tightens a rule here audits every existing stored format against it, and
  opens an issue for each format that breaks it.
- A new stored kind or field ships first in a version whose readers tolerate it, and is written only
  by a later version, once the versions that cannot read it are no longer in use.
- Before a release, open a read-only copy of a real library written by the previous version with the
  new build and confirm its projects, overview, Wiki and feed load.
- A change that is not purely additive bumps the schema version, and readers keep supporting the
  previous versions.
- These readers are required compatibility, not the "backwards-compatibility shims" discouraged
  below. Closed schemas for model output (Harness rules) are unaffected.

## Paper Wiki Data Rules

- Raw sources (PDFs and their extracted text) are immutable.
- The Markdown wiki is the durable, canonical knowledge layer. Frontmatter,
  page templates, and this file define its schema; do not invent new fields,
  page types, or link syntax without the human's approval.
- Model output never lands in the wiki directly. It becomes a proposal that
  Core validates and the user confirms.

## Harness Rules

- Model access and orchestration use LangChain and LangGraph. Do not write
  provider HTTP clients, agent loops, state machines, structured-output
  parsers, retry frameworks, memory, or checkpointing by hand.
- Subscription CLIs are a model source alongside the LangChain providers. For
  one model call, Core runs the user's own signed-in `claude` or `codex` as a
  child process:
  - its own tools, hooks, plugins and the user's MCP servers are off, and so
    are the user's instructions wherever the CLI allows it (Codex always reads
    its global `AGENTS.md`);
  - the only tools it may call are those of Meridian's internal read-only MCP
    server for that call, which Core answers;
  - it runs in an empty temporary folder, or, for a chat turn, in a
    Meridian-owned folder for that chat that holds only the CLI's session and is
    deleted with the chat;
  - API-key variables are removed from its environment;
  - Core never reads or stores the CLI's credentials.

  The Harness asks Core for that call over RPC, and validates the result at the
  node boundary like any other model output. A CLI call may take several turns
  and cannot cap its output; the run confirmation says so.
- The Harness stays stateless: no persistent checkpointer or store.
- Deterministic work (selection, filtering, deduplication, formatting,
  routing, validation, persistence) belongs in typed Core code, not in a
  graph node or a prompt. Use the model only for semantic work.
- Treat Harness complexity as a budget. Before adding a node, edge, state
  field, tool, dependency, or retry, show that no existing component does it,
  that a concrete workflow or failing evaluation requires it, and that it
  needs model reasoning.
- Every model-facing node uses provider-native structured output with a
  closed schema: forbidden extra fields, bounded strings and lists, enums for
  finite choices. Validate the result at the node boundary. Malformed output
  is a classified failure; never coerce it, repair-prompt it, or retry
  automatically. A new paid model call needs a new user-confirmed run.
- Prompts are product code. A prompt change must be compared on
  representative fixtures for correctness, groundedness, tokens, and latency;
  longer is not better by default.

## Code Standards

- Docstrings state the contract: what the function does, its parameters,
  return value, and notable errors. No design rationale or history; that goes
  in the commit message.
- Comment only what the code cannot say: a counter-intuitive constraint, an
  external system's quirk, an ordering that must hold. Match the comment
  density of the surrounding code.
- All comments, docstrings, and test comments are written in English
  (checked by `scripts/check-comment-language.mjs`). User-facing copy and
  localized test titles may use their target language.
- Extract a helper only when it has two or more call sites or its name makes
  reading the body unnecessary. No `*Utils`, `*Helper`, or `*Manager` grab
  bags.
- Fail fast. Do not swallow errors or substitute defaults unless the task is
  error handling.
- Edit files in place. No `_v2`/`_new` copies, no commented-out code, no
  backwards-compatibility shims unless asked. Delete code that is proven dead.
- Before writing a helper, search for an existing one. Confirm unfamiliar
  library APIs against their source or docs.
- One concept, one word: `vault` (not library or workspace), `entity`,
  `page`, `proposal` (a Paper Wiki write-back only), `candidate` (unconfirmed,
  not a vault write), `anchor` (not citation or locator). A type suffixed
  `Record` is the stored shape and never crosses the contract.

## UI Rules

- The UI is hand-written CSS tokens plus Radix primitives. Do not add
  Tailwind or a component library.
- The renderer has three layers: tokens (`shell/tokens.css`), shared
  components (the flat `renderer/components/*`, one per function, each look an
  explicit variant), and screens (`routes/*`, the feature folders
  `components/<feature>/*` and `shell/AppShell`). Feature folders are screen
  parts, not design-system components.
- Screens hold no visual CSS. A screen stylesheet only places shared
  components: grid and flex placement, `grid-template-*`, `grid-area`,
  `order`, alignment, widths, heights and gaps through tokens, positions, and
  container queries that drop whole columns. Colour, background, border,
  radius, shadow, padding, item margins, font, line height, opacity, motion,
  and hover, focus and selected states belong to shared components and tokens.
  `scripts/check-screen-css.test.mjs` enforces this against
  `scripts/screen-css-ratchet.txt`, the violations that predate it. The list
  only shrinks: a change that edits a screen stylesheet removes the entries it
  makes dead, and a later version clears the rest. Domain views (the
  timeline board, the research graph, the PDF page) keep their own drawing:
  `DOMAIN_DRAWING` in `scripts/check-screen-css.mjs` lists, with a reason
  each, the drawing classes their stylesheets may style. Their chrome follows
  this rule like any screen's.
- No restyling through `className`. A screen rule that targets a shared
  component's class, its own or one a screen passes in through `className`,
  only places it. A component that needs another look gets a variant.
- No raw elements for a pattern that has a component. A screen renders no
  `<button>` (use `Button` or `IconButton`), no `<table>` (use `Table`) and no
  hand-built list markup. `scripts/check-screen-elements.test.mjs` enforces the
  `<button>` part; `RAW_BUTTONS` in `scripts/check-screen-elements.mjs` lists,
  with a reason each, the raw buttons that are not text buttons.
- One spacing and type system. Spacing takes the roles in `shell/tokens.css`:
  `--page-inset`, `--section-gap`, `--item-gap`, and `--item-inset`, which
  rows and cards share. Text takes a type role: page title, section heading,
  group heading, item title, body, meta or small (`--fs-page-title`,
  `--fs-section`, `--fs-group`, `--fs-item-title`, `--fs-body`, `--fs-meta`,
  `--fs-label`). Reading typography applies only inside Markdown bodies.
- A UI function that no shared component covers becomes a shared component
  first, with its variants; it is never built in a screen.
- Behaviour lives in shared components and hooks: keyboard handling, hover
  reveal, focus return, the selected look, busy and empty states, and drag
  feedback are each implemented once.
- Before building or restyling a UI pattern, find the shared component that
  owns it (`components/FormControls`, `components/PageShell`,
  `components/ConfirmDialog`, `components/InlineDraftInput`, and the others in
  `renderer/components`). Routes do not rebuild borders, separators, hover and
  focus states, dialogs, menus, or popovers. If a shared component lacks a
  variant you need, extend the component.
- One operation, one component: adding, removing, confirming, switching views,
  opening an overflow menu, closing a panel, and showing an empty list each
  have exactly one implementation.
- Embedded lists have no outer top or bottom divider, only dividers between
  rows, and show at most five rows before scrolling inside the list.
- Destructive actions confirm only when they cannot be undone. Anything that
  goes to the trash or the change log proceeds without a dialog.
- A visual bug in a repeated pattern means auditing every use of that
  pattern, not only the one reported.

## Security and Privacy

- The app never reads API keys or other secrets from environment variables.
  Keys are entered in Settings and stored encrypted by the OS through the
  main process.
- Never log, print, commit, or put in a URL any key, token, or personal data.
- Tests never touch the user's real vault, `~/.meridian` or the App's
  user-data folder (`~/Library/Application Support/@meridian/desktop` on
  macOS, `%APPDATA%\@meridian\desktop` on Windows), where the App keeps the
  user's settings and drafts. End-to-end cases run against fixtures with an
  isolated config home and their own `--user-data-dir`.
- Do not add network calls, telemetry, or new external services without the
  human's approval.

## Tests and Gates

Each change runs only the checks it can affect: the unit tests of the files it
changes (`npx vitest related --run <files>`) and of the components it could
affect, `npm run check`, and the Python gates only when it touches Python,
`plugins/`, the CLI or the MCP server. Run each check once. The full gates run
when a batch of changes is integrated for the owner's review, and again before a
release:

```bash
npm run check                    # eslint, comment language, tsc
npm test                         # vitest
python -m ruff check apps/harness
python -m pytest tests           # CLI, MCP, and Lab
python -m pytest apps/harness/tests
```

Run every gate with one Python that has
`python -m pip install -e . -e "apps/harness[build]"` and comes first on `PATH`
(on the owner's Mac, the `meridian` conda env): one vitest case starts `python`
itself, and the CLI tests need PyYAML.

- A failing check means the work is not done. Never pass it by weakening an
  assertion, skipping a case, or adding an ignore marker.
- After writing a test, break the implementation on purpose and confirm the
  test fails for the reason you expect. A test that cannot fail is worse than
  none.
- Test names state behavior, not method names.
- UI changes are checked in both light and dark themes, at 1440×900, and also
  at 1280×800 when the change affects layout. Shoot only the screens a change
  affects.
- End-to-end specs (`npm run e2e`, Playwright against the built Electron app)
  run once per release, after the owner approves the build, and only the specs
  covering the changed areas. Components are decoupled so that unit tests can
  cover them; add an end-to-end case only for behaviour no unit test can reach.
  Let a started run finish, and do not re-run specs that already passed on the
  same code.
- Automated launches never take the owner's keyboard focus or cover the
  owner's screen: the owner works on the same machine while agents build, seed,
  screenshot and run end-to-end cases. Every automated launch sets
  `MERIDIAN_SHOW_WINDOW`, `0` for a hidden window and `isolated` for one that
  paints, passes `--force-color-profile=srgb` so screenshots store the page's
  own colours and `--use-mock-keychain` so no ad-hoc-signed build asks the owner
  for the login keychain, and passes its own `--user-data-dir`, a temporary folder removed
  afterwards, as the e2e fixture (`LAUNCH_SWITCHES` and `profile` in
  `e2e/app.ts`) and `scripts/test-library/app.mjs` already do. The App refuses
  to start an automated launch on its own user-data folder. On macOS both run the App
  without a Dock icon and never make it the active app; an isolated window is
  unfocusable and sits right of every display. Nothing automated calls
  `show()`, `focus()`, `setFocusable(true)` or `app.focus()`; a case about the
  window losing focus uses `appSwitcher` in `e2e/app.ts`. The only normal
  windows are the one opened for the owner's review
  (`node scripts/test-library.mjs open`) and the launch case that proves an
  App started without the variable still shows its window, which runs only in
  the release run. Known limits: the App can still count as a Dock app for up
  to 0.1 s at launch, before its main script runs; the off-screen placement is
  unverified on Windows, so check it at the next Windows release.
- Everything a build, a seed or a test run generates goes under the
  checkout's `outputs/` folder, which git ignores, never onto the Desktop:
  unpacked builds in `outputs/builds/`, test libraries in
  `outputs/test-library/`, end-to-end artifacts and screenshots in
  `outputs/e2e/`.

## Test Library

`scripts/test-library.mjs` builds a library that covers every screen and stored
kind through the App's own Core, so a review never depends on what happens to be
on the reviewing machine.

- `node scripts/test-library.mjs seed --out <dir> [--app <build>]` writes
  `<dir>` from scratch with its own config home and user-data folder;
  `node scripts/test-library.mjs open --out <dir> [--app <build>]` opens it.
  Without `--app` both use the checkout's built `apps/desktop`.
- `node scripts/test-library.mjs relocate --out <dir>` points a copied test
  library's stored paths at the copy without starting any App, so an agent
  prepares a review copy with no window; `open` does the same before it opens.
- Test libraries live in `outputs/test-library/<display version>/` in the
  checkout, on macOS and Windows alike.
- A pull request that adds a screen or a stored kind adds its scenario to the
  seed.

## Git

- Branches, versions and releases follow `.github/versioning.md`; issues follow
  `.github/issues.md`; pull requests follow `.github/pull-requests.md`.
- Milestones are the versions' scope, and only the accounts listed in
  `.github/MILESTONE_MANAGERS` change them. That covers creating, editing,
  closing and deleting a milestone, and setting or clearing an issue's milestone.
  An agent makes a milestone change only when the owner asked for that change;
  once the owner says to release, closing the released milestone counts as
  asked. Otherwise the agent names the milestone it suggests in its reply and
  leaves the issue in the backlog. The milestone-guard workflow undoes changes
  by unlisted accounts, but agents act through the owner's login, so only this
  rule stops them.
- Commit messages follow Conventional Commits:
  `<type>(<scope>): <description>`, imperative, lowercase, no trailing period.
- Stage explicit paths. Do not use `git add -A`, `git stash`, force-push, or
  history rewrites on shared branches.
- Do not bump versions, push tags, or edit release workflows unless the human
  asks; a `v*` tag publishes a release.
- Commit with a pathspec (`git commit -- <paths>`), so nothing another process
  staged is swept into your commit.
- `Closes #N` in a pull request closes the issue only when it merges into the
  default branch. Work merges into release branches, so whoever merges a pull
  request closes its issue with a comment naming the pull request and the
  release branch.

## Releasing

`.github/versioning.md` defines the version number, the branches and the release
checks. This is the order to follow, on the version's release branch and never on
`master`:

1. **Scope.** Every issue in the version's milestone is closed, each one when its
   pull request merged.
2. **Bump.** `node scripts/bump-version.mjs app X.Y.Z.F`. Also bump the plugin
   version (`node scripts/bump-version.mjs plugin a.b.c`) whenever `src/meridian`,
   `plugins/` or an MCP tool changed since the last release, so installed Apps
   prompt their users to update the agent plugin. Commit
   `chore(release): bump the app to X.Y.Z.F …` by explicit paths; do not push yet.
3. **Build an unpacked copy.** Build the Harness sidecar for this machine first:
   install the build extra once (`python -m pip install -e "apps/harness[build]"`),
   then run `node scripts/build-harness-sidecar.mjs`, which writes
   `apps/harness/dist/<platform>-<arch>`. Then run
   `npm --prefix apps/desktop run build` and, in `apps/desktop`:
   - macOS: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --config electron-builder.config.mjs --dir`
     writes `dist/mac-arm64/Meridian.app` on Apple silicon.
   - Windows (PowerShell): `npx electron-builder --config electron-builder.config.mjs --dir`
     writes `dist\win-unpacked`.

   Copy that output into a new folder under `outputs/builds/` for every build
   (`ditto` on macOS, `Copy-Item -Recurse` on Windows): the owner may still have
   the previous one open, and overwriting a running build breaks it.
4. **Upgrade smoke.** Copy a real library written by the previous release, the
   `.meridian` folder of every workspace it links, and a config home into a
   temporary directory, and rewrite the copied workspace paths to the copies.
   The library is `active_library_root` in
   `<config home>/paper-wiki-workspaces.json`, or else `library` in the App's
   user data folder (`~/Library/Application Support/@meridian/desktop` on macOS,
   `%APPDATA%\@meridian\desktop` on Windows); the config home is `~/.meridian`.
   Launch the copied build with `MERIDIAN_VAULT_ROOT` and `MERIDIAN_CONFIG_HOME`
   pointing at the copies and `--user-data-dir` at a new empty folder: an
   installed Meridian holds the single-instance lock of its user data folder,
   and a build sharing that folder quits at once. Unset `ELECTRON_RUN_AS_NODE`
   first; shells started from VS Code extensions set it, and the build then runs
   as plain Node.
   - macOS: `env -u ELECTRON_RUN_AS_NODE MERIDIAN_SHOW_WINDOW=0 MERIDIAN_VAULT_ROOT=<copy>/library MERIDIAN_CONFIG_HOME=<copy>/config <build>/Meridian.app/Contents/MacOS/Meridian --user-data-dir=<copy>/user-data --force-color-profile=srgb --use-mock-keychain`
   - Windows (PowerShell): `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction Ignore; $env:MERIDIAN_SHOW_WINDOW = '0'; $env:MERIDIAN_VAULT_ROOT = '<copy>\library'; $env:MERIDIAN_CONFIG_HOME = '<copy>\config'; & '<build>\Meridian.exe' --user-data-dir='<copy>\user-data' --force-color-profile=srgb`

   `library.location`, `vault.today`, `project.list`, `project.get` for every
   project, `wiki.home`, `wiki.proposals`, `wiki.signals` and `feed.list` must
   all succeed. Never point a test at the original library, the App's user data
   folder, or `~/.meridian`. Beside the real-library copy, copy the test library
   the previous release seeded to a temporary folder `<testlib>`, point the
   paths it stores at the copy with
   `node scripts/test-library.mjs relocate --out <testlib>`, and launch the build
   on it the same quiet way:
   - macOS: `env -u ELECTRON_RUN_AS_NODE MERIDIAN_SHOW_WINDOW=0 MERIDIAN_VAULT_ROOT=<testlib>/library MERIDIAN_CONFIG_HOME=<testlib>/config <build>/Meridian.app/Contents/MacOS/Meridian --user-data-dir=<testlib>/user-data --force-color-profile=srgb --use-mock-keychain`
   - Windows (PowerShell): `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction Ignore; $env:MERIDIAN_SHOW_WINDOW = '0'; $env:MERIDIAN_VAULT_ROOT = '<testlib>\library'; $env:MERIDIAN_CONFIG_HOME = '<testlib>\config'; & '<build>\Meridian.exe' --user-data-dir='<testlib>\user-data' --force-color-profile=srgb`

   The same calls must succeed there, made the same way.
5. **Owner review.** Hand the owner the unpacked build with a list of what to
   check, issue by issue. Nothing is tagged until the owner approves. Any change
   after that means a new build in a new folder and another review.
6. **End-to-end.** After approval, run the specs covering the changed areas. A
   failing spec blocks the release.
7. **Tag.** With the owner's go-ahead, push the release branch, then tag its head
   `v<stored version>` (see "How the number is stored"). The tag starts the
   release workflow. Check the published release: its title shows the four-part
   version and every installer is attached.
8. **After the release.** Move `master` as `.github/versioning.md` section 4
   says, merge a fix release branch into every feature release branch in
   progress, delete merged branches as its section 7 says, and close the
   version's milestone. Seed a test library with the released build into its
   display-version folder (see Test Library) and keep it for the next release's
   upgrade smoke.

## Mistakes Made Here Before

Each of these happened in this repository. The rule after each one is binding.

- **A new App version hid data an older one wrote, or an older App went blank on
  new data.** Readers parsed stored data strictly: a strict change-log parse of
  old snapshots, a new event field, a new key inside a strictly parsed task.
  New stored fields go where older readers already ignore unknown keys (for a
  project page, its top level), never inside a nested object an older version
  parses strictly. Prove it by parsing the new output with a copy of the
  previous release's schema (`git show v<previous>:<path>`).
- **A review accepted a proxy for the requirement.** The issue asked for date
  chips of equal width; the review checked that the columns after them lined up.
  Review against the issue's own words and the screenshot, element by element.
- **A test could not fail.** The fixture held no single-day task, so the width
  bug was invisible; another check compared two transparent wrappers. Before
  trusting a test, confirm its fixture contains the case the issue is about,
  then break the implementation and quote the assertion that goes red.
- **Per-change checks left the end-to-end specs behind.** In v0.0.16.0, changes
  to copy, selectors, row actions and shared components ran only their unit
  tests, and at the release 80 end-to-end cases still asserted the old UI; the
  same run found two regressions no unit test covered. A change searches `e2e/`
  and the unit tests for every string, selector, class and behaviour it
  touches, and updates those specs in the same pull request, even though
  end-to-end specs run only at the release.
- **A restyled list drifted from its siblings three times.** It had its own
  chips, padding and hover. Start from the shared component, and compare a
  screenshot of the whole page with the neighbouring sections before handing it
  over.
- **Agent-written text changed a file's structure.** A newline or a line
  starting with `###` or `- evidence:` created a node or broke a region.
  Serialize untrusted text so no content can change structure, and add a
  round-trip test with such strings.
- **The owner confirmed content they had not seen.** A review queue showed a
  count instead of the evidence it would write, and a verification applied to a
  conclusion that changed after it was displayed. A confirmation screen shows
  everything that will be written, and a confirmation carries a fingerprint of
  what was shown; Core rejects it if the content changed.
- **A product surface was removed without asking.** A component or decision the
  owner has not discussed (an extension, a workflow, a new service) is raised as
  its own question before any change.
- **The update dialog showed `0.0.14001`.** Anything a user sees shows the
  four-part display version, never the stored semver.
- **An older agent plugin regenerated a derived file without the new keys.**
  Keep canonical data where older writers preserve it byte for byte, treat
  generated files such as `graph.json` as rebuildable, and bump the plugin
  version with every plugin change.
- **Removing a worktree almost deleted the main checkout's dependencies.**
  Worktrees link `node_modules` to the main checkout, as a junction on Windows
  and a symlink on macOS. Remove each link before removing the worktree, never
  with a recursive delete: `cmd /c rmdir <path>` on Windows, `rm <path>` with no
  `-r` and no trailing slash on macOS.
- **Several Electron apps at once exhausted the desktop.** Launches failed with
  `0xC0000142`. Do not run end-to-end suites from several worktrees at once. A
  hidden window also timed out on screenshots and reported styles from before a
  transition; take visual checks with an isolated window, which paints.
- **Automated launches took the owner's keyboard focus and covered their
  screen.** Screenshot drivers opened normal windows, whose `show()` makes
  Meridian the active app; two e2e cases called `focus()` on purpose; isolated
  windows still appeared over the owner's work; and every launch put an icon in
  the Dock. Launch only in the modes under Tests and Gates, and before trusting
  a new kind of launch, record the frontmost app, the Dock and the windows on
  the displays while it runs.
- **End-to-end runs used the owner's real App profile.** No launch passed
  `--user-data-dir`, so every case ran in the App's own user-data folder: the
  fixture cleared the owner's language and drafts before each case, specs wrote
  their themes into it, and `english.spec.ts` left the next spec in English.
  Every automated launch passes its own `--user-data-dir`. Prove a change to how
  the App is launched with the profile's modification times, never by reading
  or writing it.
- **Screens used the shared components, then restyled them.** The v0.0.19.0
  inventory found 59 of the 66 patterns a shared component draws restyled by a
  route or feature stylesheet; `routes/shell.css` alone restyled shared
  components 141 times, and screens held 441 colour, 608 padding and margin
  and 392 font declarations against 180, 207 and 104 in the shared
  components. Each fix bent a component locally, so the same pattern drifted
  apart screen by screen. Screens only place shared components; a look a
  screen needs becomes a variant of the component.
