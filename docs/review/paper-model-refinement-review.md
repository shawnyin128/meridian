# Paper Model Refinement Review

## Context/Test Plan

### Raw Request

The user approved continuing development under an automatic develop/evaluate/converge loop, with the constraint that the work must stay aligned with the LLM Wiki requirements and should move toward a high-quality automatic Paper Wiki flow.

### Problem Summary

The previous prototype established extraction, draft publishing, LLM-as-Judge packaging, and convergence records. However, the ingest packet still depended too much on placeholder sections and human review scaffolding. For Meridian to become useful as a Paper Wiki, a one-paper ingest should produce source-grounded candidate knowledge objects by default: paper summary, claims, methods, evidence, uncertainty, and retrieval metadata.

### Goals

- Replace unfilled packet prompts with generated draft content.
- Preserve the LLM Wiki distinction between extracted source facts, candidate synthesis, and reviewed canonical knowledge.
- Make generated pages and records retrieval-ready through frontmatter and machine-readable JSONL fields.
- Keep canonical publishing draft-only and quality-gated.
- Preserve full flow compatibility with judge packet creation and convergence.

### Non-Goals

- Do not claim full semantic understanding from a heuristic text pass.
- Do not promote standalone canonical claim or method pages.
- Do not add MCP, Zotero sync, vector search, or scenario-specific evaluation in this feature.
- Do not require mandatory human review for every successful structural ingest.

### Acceptance Criteria

- `paper.md` contains generated retrieval summary, method notes, candidate claims, candidate methods, evidence index, and frontmatter suitable for retrieval.
- `review.md` no longer contains unfilled `Agent task` sections.
- `claims.jsonl`, `methods.jsonl`, and `evidence.jsonl` contain draft candidate records with provenance and extraction strategy.
- `run.json` records paper-model strategy and candidate counts.
- A real PDF smoke flow passes the structural quality gate and emits a judge packet where the generated paper model is visible.

### Done-When Criteria

| Criterion | Minimum proof | Evidence owner |
| --- | --- | --- |
| Generated packet replaces prompt scaffold | Tests and real smoke show no `Agent task` placeholders in review or paper artifacts | develop/evaluate |
| Candidate records are source-grounded | JSONL records include provenance and `extraction_strategy` | develop/evaluate |
| Retrieval metadata is present | `paper.md` frontmatter includes topics, datasets, metrics, claims, and `model_strategy` | develop/evaluate |
| Flow remains compatible | Existing unit tests and real PDF `meridian wiki flow` pass | develop/evaluate |
| Limits remain explicit | Review packet names heuristic strategy and multimodal/table/formula gaps | develop/evaluate |

### Test Plan

Developer checks:

- Run unit tests.
- Run compile check.
- Run a real PDF smoke flow on `/Users/shawn/Desktop/2604.10496v1.pdf`.
- Inspect `run.json`, `paper.md`, `review.md`, `claims.jsonl`, `methods.jsonl`, and `judge-packet.md`.

Evaluator checks:

- Replay tests and real PDF smoke.
- Run a negative placeholder search across generated artifacts.
- Parse candidate JSONL and confirm provenance/extraction strategy fields.
- Check that the quality gate and judge packet expose model strategy and candidate counts.

### Decision Trace Handoff

Key decisions:

- Use a deterministic `heuristic_text_v0` model layer as the current baseline.
- Keep the output honest by tagging strategy and keeping records in draft/review states.
- Improve the packet enough for LLM-as-Judge evaluation without pretending this is final multimodal understanding.

Rejected options:

- Leave `review.md` as an agent prompt scaffold.
- Auto-promote claims or methods to standalone canonical wiki pages.
- Block all successful ingests on human review.

Allowed implementation discretion:

- Use heuristic extraction until a real LLM/multimodal orchestrator is wired in.
- Keep generated method inputs/outputs as empty lists when they are not safely extractable.
- Use page-level provenance before section/figure/equation-level extraction is mature.

Decision invariants:

- Raw PDFs remain immutable.
- Canonical mutations remain draft-only and quality-gated.
- Source facts, candidate synthesis, and review state remain machine-distinguishable.
- Human calibration remains available without being mandatory for every structurally successful ingest.

## Developer Round 1

### Implementation Summary

Implemented a source-grounded Paper Model layer for the one-paper ingest path:

- Added `src/meridian/wiki/model.py` to derive retrieval summary, claim candidates, method candidates, evidence records, topics, datasets, metrics, and open questions from extracted PDF text.
- Updated `paper.md` rendering to use the generated model instead of placeholder objects.
- Updated `review.md` rendering to become a filled review packet rather than an agent prompt scaffold.
- Tagged generated output with `model_strategy: heuristic_text_v0`.
- Added `paper_model` strategy/count metadata to `run.json`.
- Added extraction strategy fields to claims, methods, and evidence JSONL records.
- Strengthened tests against `Agent task` placeholder leakage.

### Files Changed

- `src/meridian/wiki/model.py`
- `src/meridian/wiki/ingest.py`
- `src/meridian/wiki/packet.py`
- `tests/test_cli.py`
- `.arbor/workflow/features.json`
- `docs/review/paper-model-refinement-review.md`

### Developer Self-Tests

| Check | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Unit tests | Existing CLI, ingest, eval, review, judge, flow, and converge tests pass | `Ran 7 tests ... OK` | Passed |
| Compile check | Python sources compile | `compileall src tests` passed | Passed |
| Real PDF flow | CodeQuant PDF produces flow manifest, run manifest, and judge packet | `Flow status: awaiting_judge` | Passed |
| Quality gate | Real PDF smoke is not structurally blocked | `decision: pass`, `review_state: auto_ingested` | Passed |
| Candidate counts | Real PDF run records generated candidates | 5 claims, 1 method, 19 evidence records | Passed |
| Placeholder negative check | `review.md`, `paper.md`, and `judge-packet.md` should not expose unfilled `Agent task` placeholders | Search found no `Agent task` matches in generated current smoke artifacts | Passed |
| Metadata visibility | Model strategy is visible to retrieval and judge workflows | `model_strategy: "heuristic_text_v0"` appears in draft/canonical pages and judge packet | Passed |

### Implementation Defaults

- The method candidate is intentionally conservative: one primary method record with page-level provenance rather than many weak method objects.
- Method inputs, outputs, and assumptions remain empty when not safely extractable.
- Page evidence records cover every extracted page and link claims only when claim provenance points to that page.
- Known dataset/metric extraction is dictionary-based for now; it is enough for retrieval metadata, not final benchmark interpretation.

### Risks And Gaps

- `heuristic_text_v0` is not a substitute for final multimodal understanding; figures, tables, and formulas are still page-level signals.
- Some extracted claims may be background or generic statements rather than main contributions.
- Method naming can be affected by title override during smoke tests.
- Section hints are still weak because they come from page text heuristics.

### Developer Handoff

Ready for independent evaluation. The evaluator should replay tests, parse generated JSONL, inspect the real PDF smoke artifacts, and challenge whether the packet is genuinely free of unfilled prompts and transparent about its limits.

## Evaluator Round 1

### Evaluation Summary

Accepted. The implementation moves the one-paper ingest flow from placeholder packet scaffolding to a source-grounded draft Paper Model that is usable by retrieval and judge workflows. It remains appropriately conservative: the artifacts disclose `heuristic_text_v0`, keep records in draft/review state, and do not promote canonical claim or method pages.

### Evidence Replayed

| Check | Command Or Artifact | Result |
| --- | --- | --- |
| Unit replay | `PYTHONPATH=src python3 -m unittest discover -s tests` | 7 tests passed |
| Compile replay | `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache python3 -m compileall src tests` | Passed |
| Real PDF flow replay | `PYTHONPATH=/private/tmp/meridian-deps:src python3 -m meridian wiki flow /Users/shawn/Desktop/2604.10496v1.pdf --out /private/tmp/meridian-eval-f4-codequant --wiki-root /private/tmp/meridian-eval-f4-wiki --rubric eval/rubrics/paper_wiki_quality_v0.md --title CodeQuant-Eval-F4 --overwrite` | Flow wrote run manifest and judge packet; status `awaiting_judge` |
| Quality gate replay | `/private/tmp/meridian-eval-f4-codequant/run.json` | `decision: pass`, `review_state: auto_ingested`, no warnings/errors |

### Independent Checks

| Check | Expected Result | Actual Result | Verdict |
| --- | --- | --- | --- |
| Placeholder negative search | Current generated review, paper, judge, claims, and methods artifacts should not include `Agent task` or `needs_agent_fill` | `rg` returned no matches | Accepted |
| Candidate JSONL contract | Candidate records should parse and expose provenance/strategy | 5 claims, 1 method, and 19 evidence records parsed; no missing strategy/provenance in claim/method rows | Accepted |
| Retrieval metadata visibility | Model strategy and review state should be visible to downstream retrieval/judge tools | `model_strategy: "heuristic_text_v0"` appears in review/paper/judge artifacts; `paper_model` appears in `run.json` | Accepted |
| Judge packet visibility | Judge packet should contain enough model content to evaluate the generated ingest | Judge packet includes rubric, run metadata, generated review packet, paper page, and candidate JSONL | Accepted |

### Findings

No blocking findings.

Non-blocking residual risks:

- The current method name may inherit a smoke-test title override; this is acceptable for the smoke path but should be revisited when title normalization becomes a retrieval-quality target.
- The strategy is intentionally text-heuristic. It can identify useful candidate objects but should not be treated as final figure/table/formula interpretation.
- Some candidate claims are broad background claims, so a later judge or promotion step should separate main contributions from contextual statements.

### Recommended Outcome

The feature should converge. The result satisfies the current acceptance criteria for an automatic, transparent, draft-only Paper Model refinement.

## Convergence Round 1

### Decision

Converged.

### Agreement Check

| Question | Developer Side | Evaluator Side | Decision |
| --- | --- | --- | --- |
| Does the ingest packet still depend on unfilled prompts? | Developer replaced review and paper placeholders with generated model content and added negative checks | Evaluator replayed placeholder search across current smoke artifacts with no matches | Agreed |
| Are generated records usable for retrieval and judging? | Developer added frontmatter strategy, `run.json` model metadata, and JSONL strategy/provenance fields | Evaluator parsed candidate JSONL and verified metadata visibility in judge artifacts | Agreed |
| Does the flow stay draft-only and honest about limits? | Developer kept canonical mutation to draft paper pages and named heuristic limitations in review packet | Evaluator accepted the explicit residual risks and found no claim promotion | Agreed |
| Does the real PDF flow remain functional? | Developer ran a CodeQuant smoke flow | Evaluator replayed the flow and observed `awaiting_judge` with passing structural quality gate | Agreed |

### Goal Alignment

The implementation satisfies the F4 goal: a one-paper ingest now produces a source-grounded draft Paper Model with retrieval metadata and candidate records, without requiring mandatory human review for every structurally successful paper. The result remains within LLM Wiki boundaries because raw sources are immutable, canonical writes are draft-only, provenance is preserved, and unreviewed content is clearly marked as generated candidates.

### Remaining Issues

| Issue | Source | Blocks Completion | Next Owner |
| --- | --- | --- | --- |
| Method title can inherit title override in smoke runs | Evaluator residual risk | No | Future retrieval-quality refinement |
| Figure/table/formula understanding is still page-level | Developer and evaluator residual risk | No | Future multimodal ingest/refine work |
| Candidate claims can include contextual statements | Evaluator residual risk | No | Future LLM-as-Judge rubric and promotion policy |

### Next Step

Finalize the local workflow state for F4 and use this as the baseline before building the scenario-specific evaluation set.

## Release Round 1

### Finalization Summary

F4 is finalized locally as an Arbor workflow checkpoint. No git commit was created because the user did not request commit or push.

### Final State

- Feature registry marks F4 as `done`.
- Review evidence is preserved in this document.
- `.arbor/memory.md` records that F4 converged and that the next expected scope is scenario-specific evaluation design.
