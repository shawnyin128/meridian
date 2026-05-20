---
type: review
title: "Wiki Layer Full Feature Review"
status: done
created: 2026-05-19
updated: 2026-05-19
tags:
  - arbor
  - paper-wiki
  - wiki-layer
---

# Wiki Layer Full Feature Review

## Context/Test Plan

Goal: turn high-quality paper ingest into a usable Paper Wiki layer with source file management, canonical wiki file management, and an agent-facing retrieval skill.

Acceptance criteria:

- Initialize an Obsidian-compatible wiki scaffold with raw source, canonical page, index, draft, template, and generated-index directories.
- Manage raw paper sources through immutable managed PDFs, a registry, and an audit command.
- Publish a draft ingest run into canonical `papers/` and promote candidate methods, claims, evidence, and topics into linked Markdown pages.
- Rebuild `wiki/index.md` and `.index/papers.jsonl`.
- Produce a lightweight wiki lint report.
- Provide an agent-facing retrieval skill that uses Meridian context packets and optional Obsidian CLI navigation.
- Keep the existing ingest/retrieval tests passing.

Verification scope:

- CLI unit tests for scaffold, publish/promotion, unmanaged-source registration, source audit, lint, catalog, and retrieval context packets.
- Compile checks for new Python modules.
- CLI help checks for new management commands.
- `git diff --check`.

## Developer Round 1

Implemented:

- Added `src/meridian/wiki/vault.py` for vault initialization, source audit, index rebuild, wiki lint, and append-only logging helpers.
- Added `src/meridian/wiki/promote.py` for `publish-run`, candidate record promotion, topic page upserts, catalog rebuild, and unmanaged source registration fallback.
- Added CLI commands: `wiki init`, `wiki publish-run`, `wiki source-audit`, `wiki rebuild-index`, and `wiki lint`.
- Added `.codex/skills/wiki-retrieve/SKILL.md` for the retrieval workflow, including Meridian context packets and optional Obsidian CLI inspection.
- Updated README, MVP workflow docs, and AGENTS project map.

Developer checks:

| Check | Expected | Result |
| --- | --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | All CLI and wiki tests pass | Passed, 36 tests |
| `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` | New modules compile | Passed |
| `git diff --check` | No whitespace errors | Passed |
| CLI help for `init`, `publish-run`, `source-audit`, `lint` | Commands are exposed | Passed |

Implementation decisions:

- Kept the wiki layer Markdown-first; no database or vector store was added.
- Promotion creates candidate `methods/`, `claims/`, `evidence/`, and `topics/` pages, but keeps them draft/candidate state.
- Retrieval remains a context-packet workflow, not final answer synthesis.
- Obsidian CLI is used as an optional live-vault navigation layer in the skill; deterministic project writes remain direct Markdown file operations.

## Evaluator Round 1

Evaluation findings:

- Source management covers both normal managed ingests and older unmanaged run manifests through publish-time registration.
- Canonical wiki management now creates durable page families and rebuilds both human-readable and machine-readable indexes.
- Retrieval skill correctly instructs agents to retrieve through Meridian first, then inspect selected pages/sections and optionally use Obsidian CLI.
- Remaining gap: topic/method/claim pages are still simple promoted candidate pages, not deep synthesis pages. This is acceptable for the requested full wiki foundation because the next quality bottleneck should be evaluated through retrieval scenarios over real canonical pages.

Decision: pass for current full-wiki foundation.

## Convergence Round 1

The developer and evaluator evidence agree that the requested wiki layer foundation is complete for the current scope:

- Source files are managed through a registry, immutable managed PDFs, and `source-audit`.
- Canonical wiki files are managed through vault initialization, publish/promotion, index rebuild, lint, and Obsidian-compatible templates.
- Retrieval is supported through a project skill and context-packet command.

Status: converged.

## Release Round 1

Checkpoint evidence:

- Planned commit scope: wiki management commands, promotion/source audit modules, wiki retrieval skill, docs, and tests.
- Verification before release: unit suite, compile check, CLI help checks, diff hygiene, AGENTS drift check, and Arbor process-state check.
- No push, tag, or external publish requested.
