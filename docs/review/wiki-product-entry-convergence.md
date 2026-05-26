# Paper Wiki Product Entry Convergence

## Context/Test Plan

Goal: converge Meridian Paper Wiki around two product entries, Prompt/Skill and MCP, with two workflows under each entry: Update Wiki and Use Wiki.

Acceptance criteria:

- A unified product-facing prompt skill exists.
- MCP entry design exists and maps to Update Wiki / Use Wiki.
- A lightweight MCP adapter/prototype exposes compact scenario-facing functions.
- README and architecture diagram present entries first and CLI as execution primitives.
- Entry eval cases and rubric exist.
- Internal support skills point to the unified entry skill.
- Tests cover MCP context/read/trace/propose and canonical artifact boundaries.

Planned verification:

- Unit tests for MCP adapter.
- JSONL/rubric parseability check.
- README and architecture artifact inspection.
- `PYTHONPATH=src python3 -m unittest discover -s tests`.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`.
- `git diff --check`.
- `meridian wiki lint --wiki-root wiki`.
- `meridian wiki source-audit --wiki-root wiki`.
- `meridian wiki catalog --wiki-root wiki`.
- Arbor process-state and AGENTS drift checks.

Decision trace:

- Prompt/Skill and MCP are product entries.
- Update Wiki and Use Wiki are the only product workflows.
- CLI remains the testable execution layer.
- MCP wraps the Markdown vault and Meridian core; it does not replace `wiki/`.
- Prompt guidance uses concise positive canonical examples.

## Developer Round

Implemented product entry convergence:

- Added `.codex/skills/wiki/SKILL.md` as the product-facing skill with `Update Wiki` and `Use Wiki`.
- Added `docs/wiki-product-entry-contract.md`, `docs/wiki-mcp-entry-design.md`, and `docs/wiki-entry-demo.md`.
- Added `src/meridian/mcp/` adapter with `capabilities`, `context`, `read`, `trace`, `update`, `propose`, `apply`, and `audit`.
- Updated README first-level usage to describe Prompt/Skill and MCP entries before CLI commands.
- Replaced the architecture HTML with a minimal entry architecture diagram.
- Updated internal wiki skills to point to the unified entry skill.
- Updated `AGENTS.md` and `.arbor/workflow/features.json`.
- Added `eval/cases/wiki_entry_contract_mvp.jsonl` and `eval/rubrics/wiki_entry_contract_quality.md`.
- Added a unit test covering MCP capabilities, context, read, trace, propose, and draft exclusion.

Developer checks:

| Check | Expected | Result |
|---|---|---|
| MCP adapter targeted unit test | Adapter exposes compact product tools and rejects internal artifacts | passed: `test_mcp_adapter_context_read_trace_and_propose_use_canonical_corpus` |
| Entry docs inspection | Prompt/MCP and Update/Use are first-level concepts | passed: entry artifact assertion over contract, MCP design, skill, and architecture HTML |
| JSONL/rubric parseability | Entry eval artifacts parse cleanly | passed: 6 JSONL cases parsed and rubric exists |
| Full unit suite | Existing behavior remains intact | passed: `Ran 90 tests ... OK` |
| Compile check | Python modules compile | passed: `python3 -m compileall src tests` |
| Wiki gates | lint/source-audit/catalog pass | passed: wiki lint pass, source-audit 238 sources / 0 missing / 0 SHA mismatches / 0 duplicate SHA groups, catalog 236 paper entries |

## Evaluator Round

Evaluator checks:

| Check | Expected | Result |
|---|---|---|
| Product entry shape | Two entries and two workflows are visible before execution primitives | passed: README, entry contract, architecture HTML, and unified skill all use Prompt/Skill + MCP by Update Wiki / Use Wiki |
| MCP surface size | Scenario-facing tools instead of CLI command mirror | passed: adapter exposes `capabilities`, `context`, `read`, `trace`, `update`, `propose`, `apply`, `audit` |
| Progressive disclosure | Compact default outputs and detailed discovery on request | passed: `capabilities(detail="full")` adds examples; `context` writes full packet to files and returns summaries |
| Canonical boundary | MCP read/retrieve uses canonical corpus only | passed: unit test rejects `.drafts/ingests/**`; context result summaries use canonical paths |
| Core handoff | Adapter reuses Meridian core rather than duplicating CLI behavior | passed: adapter calls existing retrieval, proposal, insight, lint, publish, and catalog functions |

## Convergence Round

Converged. The implementation satisfies the entry contract:

- Prompt/Skill is represented by the new product-facing skill.
- MCP is represented by a dependency-light adapter ready for real MCP runtime wrapping.
- Update Wiki and Use Wiki are first-level concepts across docs, skill, README, tests, and architecture.
- CLI commands are now documented as execution primitives.

## Release Round

Release checks:

| Check | Result |
|---|---|
| Arbor process-state | passed: 24 feature rows, 0 findings |
| AGENTS project-map drift | passed: no missing or stale mapped paths |
| `git diff --check` | passed |
| Commit | pending after staging |
