---
type: review
title: "Wiki Test Generalization Review"
status: done
created: 2026-05-20
updated: 2026-05-20
tags:
  - arbor
  - paper-wiki
  - retrieval
  - testing
---

# Wiki Test Generalization Review

## Context/Test Plan

Goal: avoid overfitting Paper Wiki retrieval tests to quantization-only happy paths.

Acceptance criteria:

- Add deterministic retrieval-eval tests that cover multiple research domains and intents.
- Add a source-quality cleanup test so weak sources are routed as cleanup targets rather than scientific evidence.
- Add a reusable generalized JSONL example set for future library-scale retrieval evaluation.
- Update the wiki-layer test strategy so release gates distinguish implemented generalized unit coverage from future broad canonical smoke coverage.

## Developer Round 1

Implemented:

- Added a cross-domain retrieval-eval unit test with alignment/RLHF, agent tool-use, audio-language, and quantization distractor pages.
- Added a source-quality cleanup retrieval-eval unit test with a low-confidence scanned-PDF hold and a reliable-paper distractor.
- Extended the test paper helper so fixtures can set `review_state`, `quality_gate`, and `confidence`.
- Added `eval/cases/wiki_retrieval_generalization.example.jsonl` with alignment/RLHF, agent implementation, audio evidence, survey synthesis, and source-quality cleanup scenarios.
- Updated `docs/wiki-layer-test-strategy.md` to mark generalized unit coverage as implemented and broad canonical fixture execution as the next step.

Developer checks:

| Check | Expected | Result |
| --- | --- | --- |
| Targeted generalized retrieval tests | New generalized cases pass deterministically | Passed |

## Evaluator Round 1

Independent replay completed:

| Check | Expected | Result |
| --- | --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | Existing and generalized retrieval behavior remain stable | Passed, 41 tests |
| JSONL parse check for retrieval case files | Existing and new retrieval cases are valid JSONL | Passed, 14 total cases |
| `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` | Source and tests compile | Passed |
| `git diff --check` | No whitespace errors | Passed |
| Arbor AGENTS drift hook | Project map still covers new artifacts through existing `eval/` and `docs/review/` map entries | Passed |

Evaluator notes:

- The new unit coverage is intentionally synthetic so it can run every commit without depending on the user's full paper library.
- The generalized JSONL file is an example suite; it still needs a real broad canonical fixture before it can serve as a release smoke.
- The tests now protect source-quality routing and non-quantization retrieval intents, but they do not replace future LLM-as-Judge calibration.

## Convergence Round 1

Converged.

Rationale:

- Retrieval eval is no longer tested only on MoE/PTQ/rotation-style pages.
- Source-quality cleanup is explicitly covered as a separate retrieval intent.
- The documented next step is correctly scoped: build a real broad canonical fixture from the user's library rather than treating synthetic tests as library-level proof.

## Release Round 1

Ready for checkpoint commit after final process-state replay and git staging.
