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
npm run e2e                      # Playwright against the built Electron app
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

## Git

- Branches, versions and releases follow `.github/versioning.md`; issues follow
  `.github/issues.md`; pull requests follow `.github/pull-requests.md`.
- Commit messages follow Conventional Commits:
  `<type>(<scope>): <description>`, imperative, lowercase, no trailing period.
- Stage explicit paths. Do not use `git add -A`, `git stash`, force-push, or
  history rewrites on shared branches.
- Do not bump versions, push tags, or edit release workflows unless the human
  asks; a `v*` tag publishes a release.
