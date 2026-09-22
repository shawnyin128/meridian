# Meridian Harness

`apps/harness` is Meridian's stateless model-orchestration process. Desktop Core launches it over
JSON Lines on stdio. It never receives vault paths, opens source files, performs retrieval, or
writes durable state.

The implementation uses LangGraph for workflow state and control flow, and LangChain chat-model
integrations for provider access, prompt composition, and Pydantic structured output. JSON Lines is
only the application IPC boundary; it is not an orchestration framework.

## Boundary

- Core waits for the exact `meridian.harness.v1` ready event and verifies the requested workflow
  capability before sending work. An outdated sidecar therefore fails before a model request can
  incur cost.
- Harness asks Core for allowlisted reads through callback messages.
- `model.check` is an explicit, read-free connection probe. A deterministic socket or configuration
  check is insufficient because it cannot verify the selected model ID, authentication, protocol,
  and inference permission together. The probe therefore reuses the existing LangChain model
  adapter for one `.` request, with retries disabled, a 20-second timeout, and at most one output
  token. It discards provider content and returns only a closed success or failure code. This adds
  one user-triggered cost boundary but no LangGraph node, provider client, vault read, or durable
  state.
- `paper-wiki.propose` reads the paper, extracted source pages, personal reading state, and current
  Wiki page only after an explicitly confirmed Core cost plan crosses the boundary.
- The workflow returns `meridian.paper-wiki-draft.v2` with `reviewRequired: true` and
  `applied: false`. Its closed semantic sections carry explicit PDF-page and reading-record
  anchors; Harness cannot return arbitrary Markdown. The response also carries a deterministic
  seven-dimension quality report produced without another model call. Core revalidates the draft
  and report, renders both the canonical Markdown body and a provenance-visible structured review
  projection, persists the generation-time report with the proposal audit event, and remains
  responsible for review and line-level application.
- Cancellation is terminal for Meridian: the result is discarded and the plan cannot be reused.
  A provider request already in flight may still finish and incur cost. A process or provider
  failure is never retried automatically because a failed model request may already have incurred
  cost.
- Core starts Harness with an allowlisted environment rather than inheriting the desktop process
  environment. Unrelated provider and cloud credentials therefore cannot leak into the sidecar.
  The selected profile's key exists only in the confirmed request, never in prompts, logs, events,
  proposal audits, or renderer state.
- Both protocol implementations reject missing and unknown envelope fields. A crashed sidecar
  fails its active requests without retry; the next explicit user action starts a clean process.

Create a Python 3.12+ environment and install the Harness with its LangChain/LangGraph runtime:

```sh
python -m pip install -e apps/harness
```

Run the deterministic tests without contacting an external model:

```sh
PYTHONPATH=apps/harness/src python -m unittest discover -s apps/harness/tests -v
```

Print the committed Paper Wiki calibration report without loading a provider or making a model
call:

```sh
PYTHONPATH=apps/harness/src python apps/harness/tests/calibration_report.py
```

The report evaluates fixed create, personal-note, and update cases across grounding, source/user
separation, retrieval routing, mechanism contracts, evidence, implementation hooks, and explicit
uncertainty. The fixed calibration suite remains outside the runtime LangGraph. Production reuses
the same deterministic checks at the end of the existing `generate_draft` node, so evaluation adds
neither an orchestration node nor a model call.

Start the stdio process from a checkout:

```sh
PYTHONPATH=apps/harness/src python -m meridian_harness
```

Build the platform-matched production sidecar before packaging the desktop app:

```sh
python -m pip install -e 'apps/harness[build]'
node scripts/build-harness-sidecar.mjs
```

The build uses PyInstaller's on-directory layout so Electron can start it without unpacking a
self-extracting executable. `npm --prefix apps/desktop run package` builds this sidecar first and
copies its whole runtime directory to `resources/harness`; an installed Core launches that bundled
executable directly and does not depend on a system Python installation.

The production graph dispatches Core's private runtime model configuration through LangChain's
`ChatOpenAI`, `ChatAnthropic`, or `ChatGoogleGenerativeAI`. OpenAI uses `ChatOpenAI` with the
Responses API and `store=False`; a generic OpenAI-compatible endpoint can select either the
Responses or Chat Completions protocol without a Meridian-owned provider adapter. LangChain
provider retries and LangGraph node retries are disabled because another paid attempt requires a
new user confirmation.
Missing configuration returns `no_model`; provider failures return sanitized `model_error`
responses. Tests inject a LangChain `Runnable` and never contact a model.

The Paper Wiki graph is deliberately short and auditable: `read_scope` asks Core for the authorized
paper/source/reading/Wiki values, and `generate_draft` performs one structured model invocation and
validates its closed output schema and authorized anchors before anything enters downstream state.
That same node attaches advisory deterministic quality findings after structural validation; a
finding never triggers a repair or retry. The run budget is exactly one model call: malformed
output, provider failure, or cancellation never triggers a hidden repair call. The compiled graph
has no checkpointer, store, or memory backend, so process restarts cannot make Harness a second
source of truth.

The chat graph follows the same constraint: `read_context` requests one bounded Core-owned packet
and `generate_answer` makes one model call. The existing generation node rejects blank output,
malformed page-citation syntax, and citations to pages Core did not supply. It never adds a repair
call or retries a rejected answer. Core packs at most 80,000 source characters, the newest 20
non-status conversation turns within 12,000 characters, and 12,000 characters of prioritized
personal reading state. Harness rejects any chat packet above 140,000 total characters before
model invocation. Paper Wiki applies an independent 200,000-character aggregate limit across
metadata, source pages, reading state, and the existing Wiki page.
