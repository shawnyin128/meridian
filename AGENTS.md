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
  `project-management`, `paper-library`, `wiki`, `harness`) exposes itself
  only through its `index.ts`; do not reach into another domain's internals.
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
- Tests never touch the user's real vault or `~/.meridian`. End-to-end cases
  run against fixtures with an isolated config home.
- Do not add network calls, telemetry, or new external services without the
  human's approval.

## Tests and Gates

Run the narrowest relevant check after each change, then the gates before you
finish:

```bash
npm run check                    # eslint, comment language, tsc
npm test                         # vitest
python -m ruff check apps/harness
python -m pytest tests           # CLI, MCP, and Lab
python -m pytest apps/harness/tests
```

The Harness tests need the Harness installed first:
`python -m pip install -e apps/harness`.

- A failing check means the work is not done. Never pass it by weakening an
  assertion, skipping a case, or adding an ignore marker.
- After writing a test, break the implementation on purpose and confirm the
  test fails for the reason you expect. A test that cannot fail is worse than
  none.
- Test names state behavior, not method names.
- UI changes are checked at several window sizes and in both light and dark
  themes.
- End-to-end specs (`npm run e2e`, Playwright against the built Electron app)
  run once per release, after the owner approves the build, and only the specs
  covering the changed areas. Components are decoupled so that unit tests can
  cover them; add an end-to-end case only for behaviour no unit test can reach.
  Let a started run finish, and do not re-run specs that already passed on the
  same code.

## Git

- Branches, versions and releases follow `.github/versioning.md`; issues follow
  `.github/issues.md`; pull requests follow `.github/pull-requests.md`.
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
3. **Build an unpacked copy.** `npm --prefix apps/desktop run build`, then in
   `apps/desktop`:
   `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --config electron-builder.config.mjs --dir`.
   The Harness sidecar must already exist under `apps/harness/dist`. Copy
   `dist/win-unpacked` into a new folder for every build: the owner may still
   have the previous one open, and overwriting a running build breaks it.
4. **Upgrade smoke.** Copy a real library written by the previous release, the
   `.meridian` folder of every workspace it links, and a config home into a
   temporary directory, rewrite the copied workspace paths to the copies, and
   launch the new build with `MERIDIAN_VAULT_ROOT` and `MERIDIAN_CONFIG_HOME`
   pointing at them. `library.location`, `vault.today`, `project.list`,
   `project.get` for every project, `wiki.home`, `wiki.proposals`, `wiki.signals`
   and `feed.list` must all succeed. Never point a test at the original library
   or `~/.meridian`.
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
   progress, and delete merged branches as its section 7 says.

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
  Worktrees link `node_modules` as junctions. Remove each junction with
  `cmd /c rmdir <path>` before removing the worktree, never with a recursive
  delete.
- **Several Electron apps at once exhausted the desktop.** Launches failed with
  `0xC0000142`. Do not run end-to-end suites from several worktrees at once. An
  offscreen window can also time out on screenshots and report styles from
  before a transition; take visual checks with a visible window.
