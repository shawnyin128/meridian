---
type: review
title: "Paper Wiki MVP Completion Review"
status: done
created: 2026-05-20
updated: 2026-05-20
tags:
  - arbor
  - paper-wiki
  - retrieval
  - writeback
---

# Paper Wiki MVP Completion Review

## Context/Test Plan

Goal: complete the practical Paper Wiki MVP from the existing ingest/source/canonical/retrieval-v0 foundation.

Acceptance criteria:

- Add a retrieval evaluation runner that consumes retrieval JSONL cases, runs catalog/retrieve, writes `context.md`, `context.json`, `judge-packet.md`, and `retrieval_manifest.json`.
- Compute deterministic retrieval metrics for required page recall, distractor hits, section hit rate, context compactness, source-quality routing, and hard failures.
- Support later LLM-as-Judge aggregation through per-case `judge-result.json` discovery and summary output.
- Run retrieval evaluation on representative canonical wiki pages and record a quality brief.
- Add a draft-only query write-back flow that keeps source facts, wiki synthesis, user ideas/decisions, uncertainty, and publish plans separate.
- Clarify Obsidian CLI, MCP, and Zotero/user-note delivery boundaries.
- Keep the feature inside Paper Wiki MVP scope, not Research Dev Agent scope.

Verification scope:

- Unit/CLI tests for retrieval eval, judge-result aggregation, and query write-back proposal creation.
- Compile checks for new modules.
- Real retrieval smoke over representative canonical quantization pages.
- Project map drift and Arbor process-state checks.
- Full unit suite before final convergence.

## Developer Round 1

Implemented:

- Added `src/meridian/wiki/retrieval_eval.py` with retrieval case validation, per-case retrieval execution, deterministic metrics, judge packet rendering, manifest writing, and summary aggregation.
- Added `meridian wiki retrieval-eval` and `meridian wiki retrieval-eval-summary`.
- Added `src/meridian/wiki/proposals.py` and `meridian wiki propose-writeback` for draft-only query write-back proposals under `.drafts/proposals`.
- Added intent-aware section scoring so implementation/evidence/scope queries surface `Implementation Hooks`, `Evidence Map`, and `Limitations / Uncertainty` more reliably.
- Added tracked smoke cases in `eval/cases/wiki_retrieval_quantization_smoke.jsonl`.
- Added `docs/retrieval-smoke-quality-brief.md` and `docs/paper-wiki-mvp-delivery-boundaries.md`.
- Updated README, AGENTS project map, wiki-retrieve skill, and test strategy docs.

Developer checks:

| Check | Expected | Result |
| --- | --- | --- |
| `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` | New modules compile | Passed |
| Targeted unit tests for retrieval eval and write-back | New CLI surfaces work | Passed |
| Retrieval smoke on `round4-final` canonical wiki | Representative cases produce metrics and packets | Passed after scoring refinement, 4/4 deterministic pass |

Implementation decisions:

- Retrieval eval uses a retrieval-specific case schema rather than reusing paper ingest cases.
- Judge packets evaluate the context packet, not final answer fluency.
- Query write-back creates proposals only; canonical synthesis publish remains a future reviewed operation.
- Obsidian CLI remains optional navigation, not a dependency for deterministic writes.

## Evaluator Round 1

Independent replay completed:

| Check | Expected | Result |
| --- | --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | Existing and new CLI behavior remain stable | Passed, 39 tests |
| JSONL parse check for `eval/cases/wiki_retrieval_quality.example.jsonl` and `eval/cases/wiki_retrieval_quantization_smoke.jsonl` | Retrieval eval cases are valid JSONL | Passed, 9 total cases |
| `PYTHONPATH=src python3 -m meridian wiki --help` | New commands are registered in the wiki namespace | Passed |
| `PYTHONPATH=src python3 -m meridian wiki retrieval-eval --help` | Retrieval eval CLI surface is inspectable | Passed |
| `PYTHONPATH=src python3 -m meridian wiki propose-writeback --help` | Query write-back CLI surface is inspectable | Passed |
| `git diff --check` | No whitespace errors | Passed |
| `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` | Source and tests compile | Passed |
| Arbor AGENTS drift hook | Project map reflects new docs/surfaces | Passed |

Retrieval smoke evidence:

- Command: `PYTHONPATH=src python3 -m meridian wiki retrieval-eval eval/cases/wiki_retrieval_quantization_smoke.jsonl --wiki-root eval/runs/2026-05-19-quality-selfcheck/round4-final/wiki --out-dir eval/runs/2026-05-20-retrieval-smoke --rubric eval/rubrics/wiki_retrieval_quality_v0.md --top-k 5 --overwrite`
- Result: 4/4 deterministic pass, average required recall at k = 1.0, average section hit rate = 1.0.
- Durable summary: `docs/retrieval-smoke-quality-brief.md`.

Residual risks:

- The representative smoke set is quantization-heavy; broader user-library domains still need retrieval calibration.
- No LLM-as-Judge retrieval result has been recorded yet, though packet/result aggregation is implemented.
- Obsidian CLI is documented as an optional navigation layer, not a deterministic dependency.
- MCP and Zotero/user-note support are boundary-designed and schema-reserved, not implemented.

## Convergence Round 1

Converged for MVP completion.

Rationale:

- The retrieval eval runner now creates the required context packets, judge packets, manifest, summary, and deterministic metrics.
- The runner has unit coverage and was exercised on representative canonical wiki pages.
- Query results can now be written back as draft-only proposals with source facts, wiki synthesis, user ideas, uncertainty, and publish plans separated.
- The Obsidian CLI, future MCP delivery, and Zotero/user-note boundaries are explicitly documented without expanding scope into Research Dev Agent work.

## Release Round 1

Ready for checkpoint commit after process-state replay and git staging.
