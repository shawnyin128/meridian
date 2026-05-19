# Paper Ingest Rubric System Review

## Context/Test Plan

### User Request

The user requires all three paper-ingest self-check agents to have complete, complex, detailed rubric mechanisms, and the rubrics must be reasonable and effective.

The three agents are:

- Understanding agent: validates whether `paper.md` alone lets a reader reconstruct the paper, then compares that understanding to a source-grounded reading and attributes mismatches to improvable generation mechanisms.
- Quality agent: validates generated `paper.md` quality for human readability, high information density, and robust retrieval under complex downstream research scenarios.
- Structural agent: validates structural completeness of ingest outputs and catches random schema/artifact/frontmatter/provenance failures caused by skill or implementation drift.

### Current Evidence

- `src/meridian/wiki/reader_check.py` already contains a detailed two-reader packet and output schema, but the rubric is embedded in prose and not yet a first-class reusable rubric artifact.
- `src/meridian/wiki/quality_check.py` has deterministic weighted dimensions and retrieval scenarios, but score anchors, hard-fail rules, scenario calibration, and rationale fields are still too shallow.
- `src/meridian/wiki/structural_check.py` has deterministic structural dimensions and blocking findings, but it needs richer completeness anchors, negative-case coverage, and explicit distinction between critical and noncritical structural failures.
- `eval/rubrics/paper_wiki_quality_v0.md` exists as a general LLM-as-Judge rubric, but it does not yet define the three-agent rubric system.
- `.codex/skills/paper-ingest/SKILL.md` now names the three agent roles, but not their full rubric requirements.

### Problem Summary

Right now the system has three self-check surfaces, but the rubric layer is uneven:

- Understanding quality depends on a large packet prompt rather than a versioned rubric contract.
- Quality scoring is useful but can become heuristic pattern-matching unless each score has human-interpretable anchors and hard-fail cases.
- Structural scoring can detect broken artifacts, but it needs a fuller rubric for severity, recoverability, and false-pass prevention.

The next feature should make rubric quality itself a first-class part of the ingest architecture.

### Goals

- Make each agent's rubric explicit, complete, and inspectable.
- Keep the three rubrics role-specific instead of creating one vague mega-rubric.
- Add a shared rubric contract so scores, hard failures, evidence, recommendations, and calibration notes use consistent fields.
- Include score anchors for 1 through 5 for every dimension.
- Include hard-fail rules that override weighted averages.
- Include evidence requirements: what artifact/page/field/scenario proves each score.
- Include scenario and negative-case requirements so rubrics can catch shallow-but-polished output.
- Preserve the separation between semantic understanding, prose/retrieval quality, and structural completeness.

### Non-Goals

- Do not implement a live LLM judge service in this feature.
- Do not merge the three agents into one agent.
- Do not use structural checks to decide semantic correctness.
- Do not require human review for every paper as the steady-state workflow.
- Do not redesign the ingest generator itself unless rubric tests reveal a blocking integration issue.

### Recommended Approach

Use a two-layer rubric design:

1. Shared rubric contract: a small common schema used by all three agents for dimensions, weights, score anchors, hard-fail rules, evidence, findings, confidence, and recommended fixes.
2. Agent-specific rubric definitions:
   - Understanding rubric: focuses on teach-back completeness, source-grounded mismatch detection, mechanism reconstruction, evidence/claim separation, uncertainty, and generation-bucket attribution.
   - Quality rubric: focuses on human-readable density, retrieval coverage, precision under complex research scenarios, actionability, signal-to-noise, and downstream idea/dev usefulness.
   - Structural rubric: focuses on required files, machine-readable schemas, frontmatter, section contract, candidate JSONL, provenance graph, extraction artifacts, source registry, and recoverability.

### Feature Split

| Step | Purpose | Deliverable |
| --- | --- | --- |
| Define shared rubric contract | Prevent three inconsistent scoring formats | Shared schema/module or markdown contract with common fields and decision rules |
| Upgrade understanding rubric | Make Reader A/B comparison stricter and more calibrated | Versioned understanding rubric with 1-5 anchors, hard-fails, required comparison dimensions, and output schema |
| Upgrade quality rubric | Make quality/retrieval checks harder to game | Versioned quality rubric with complex retrieval scenarios, anchors, hard-fails, density/readability/retrieval criteria, and rationale fields |
| Upgrade structural rubric | Make structure completeness checks more robust | Versioned structural rubric with critical/noncritical severity, anchors, hard-fails, and recoverability categories |
| Integrate rubric artifacts into flow | Make the rubric layer inspectable in outputs | Flow/check JSON points to rubric versions and includes complete score rationale |
| Add calibration and adversarial tests | Prove rubrics catch bad outputs and do not overfit one paper | Unit/schema tests, mutation tests, and calibration replay over existing paper set |

### Acceptance Criteria

1. Each of the three agents has an explicit rubric version and role-specific dimensions.
2. Every dimension has a weight, 1-5 score anchors, evidence requirements, and failure examples.
3. Each agent has hard-fail rules that can override weighted score.
4. Agent outputs include enough rationale for a developer to know whether to fix extraction, generation, schema, retrieval metadata, source selection, or rubric design.
5. The understanding agent rubric requires concrete Reader A/B mismatch analysis, not only a final score.
6. The quality agent rubric includes complex downstream retrieval and research-use scenarios, not only keyword presence.
7. The structural agent rubric distinguishes critical breakage from minor recoverable drift.
8. The rubrics are referenced in `paper-ingest` skill guidance so future modifications preserve them.
9. Tests include positive examples and adversarial negative examples for all three agents.
10. Calibration replay over existing paper outputs produces interpretable scores and does not collapse all papers into indistinguishable perfect scores unless the rubric dimension is strictly structural.

### Done-When Criteria

| Criterion | Minimum Proof | Evidence Owner |
| --- | --- | --- |
| Three rubric mechanisms are complete | Inspectable rubric definitions for understanding, quality, and structural agents with anchors and hard-fails | develop/evaluate |
| Rubrics are role-specific | Evaluator confirms semantic, quality, and structural concerns are not merged or duplicated incorrectly | evaluate |
| Output schemas carry rationale | Unit tests inspect JSON/packet fields for dimension rationale, hard-fail findings, evidence pointers, and recommended fixes | develop |
| Adversarial failures are caught | Negative tests for shallow teach-back, keyword-stuffed quality, and malformed structure produce non-pass decisions | develop/evaluate |
| Calibration remains useful | Existing calibration papers can be replayed and summarized by agent/rubric without blocking on human review | develop/evaluate |
| Workflow guidance is durable | `paper-ingest` skill documents rubric expectations and boundaries | develop/evaluate |

### Test Plan

Developer checks:

- Add tests for rubric metadata and output schema completeness for all three agents.
- Add a shallow `paper.md` understanding negative case that should fail or need refinement.
- Add a keyword-stuffed but low-density quality negative case.
- Add structural mutations for critical frontmatter, missing section, invalid JSONL, missing page image, and missing registry link.
- Run full unit suite and compile check.
- Replay all three checks on at least a small subset of existing calibration papers.

Evaluator checks:

- Inspect rubric definitions for score-anchor quality and non-overlap between agents.
- Run at least one adversarial mutation per agent category.
- Confirm hard-fail rules override high weighted averages.
- Confirm outputs identify the correct repair bucket.
- Confirm the rubrics are not overfitted to quantization papers only.

### Decision Trace Handoff

Key decisions:

- Rubrics should be explicit artifacts/contracts, not hidden scoring assumptions.
- The three-agent split is preserved: understanding, quality, and structure remain separately inspectable.
- Complete rubrics must include anchors and hard-fail rules, not only dimension names and weights.
- Reasonable and effective means rubrics catch realistic failure modes while producing actionable repair guidance.

Rejected options:

- One generic rubric for all agents.
- Pure deterministic keyword counts as the quality rubric.
- Human-only rubric with no machine-checkable schema.
- Treating a high weighted average as pass when a hard-fail rule is triggered.

Allowed implementation discretion:

- The implementation may choose Python dataclasses, JSON files, markdown rubric files, or a hybrid, as long as the rubric is inspectable and tests can verify it.
- The first version can keep deterministic structural/quality checks while making rubric rationale and anchors explicit.
- The understanding agent can remain packet-driven if its rubric contract is clearly versioned and testable.

Decision invariants:

- Understanding rubric evaluates reconstructed paper comprehension.
- Quality rubric evaluates human-friendly, information-dense, retrieval-useful page quality.
- Structural rubric evaluates completeness and machine recoverability.
- No rubric should reward vague polished prose without source-grounded content.

### Risks

- Overly complex rubrics could become hard to maintain. Mitigation: shared contract plus role-specific dimensions.
- Deterministic quality checks can overfit surface patterns. Mitigation: scenario-based negative cases and rationale fields.
- Understanding agent still depends on an LLM when actually executed. Mitigation: packet/rubric schema tests plus calibration cases until live judge automation is added.
- Calibration papers are currently mostly quantization-related. Mitigation: include a non-quantization or structurally synthetic negative case in tests.

### Pending Approval

The plan is ready for implementation after user approval or correction.

## Brainstorm Update 1

### User Correction

The user rejected a staged plan that only completes rubric contracts plus deterministic checks. The corrected requirement is:

- The first implementation must complete the expected end-to-end flow.
- Rubric optimization only makes sense after the system is running in the correct flow shape.
- Therefore the three agents must not stop at packet/schema generation; the workflow must execute the checks and produce judged outputs automatically.

### Revised Requirement

F6 now includes an executable three-agent judging flow:

1. Understanding agent executes the Reader A/B rubric:
   - Reader A reads only `paper.md`.
   - Reader B reads source excerpts / extraction evidence.
   - The agent compares both interpretations, scores the rubric, and outputs structured mismatch attribution.
2. Quality agent executes the quality/retrieval rubric:
   - Evaluates human readability, information density, retrieval precision/coverage, actionability, and downstream research usefulness.
   - Uses complex retrieval/research scenarios rather than keyword-only checks.
3. Structural agent executes the structural rubric:
   - Deterministic checks remain appropriate here.
   - Produces critical/noncritical structural findings and hard-fail decisions.
4. Flow aggregation combines the three results:
   - Per-agent decisions and weighted scores.
   - Hard-fail propagation.
   - Repair buckets.
   - Overall ingest self-check decision.
   - Calibration summary for later iteration.

### Revised Acceptance Criteria

The earlier rubric-contract criteria still apply, plus:

1. `meridian wiki flow` or a dedicated follow-up command can run all three self-check agents and write final structured outputs, not only packets.
2. Understanding and quality agents have an LLM execution path for rubric judgment, with explicit input packet, output JSON schema, retry/validation behavior, and stored raw/validated results.
3. The flow has a clear model/provider boundary so judge execution is not hidden inside ad hoc prompts.
4. The flow can run in calibration mode across multiple papers and summarize per-agent pass/needs-refine/fail results.
5. Tests can validate the orchestration without requiring live model calls by using a fake judge backend, while the real backend remains available for actual calibration.

### Revised Non-Goals

- Do not postpone the executable judge path to a later feature.
- Do not require a production-grade hosted service or MCP server in this feature.
- Do not make deterministic tests depend on live model availability.

### Blocking Design Question

One implementation decision now materially affects architecture and tests:

Which LLM execution backend should be the first real backend for the understanding and quality agents?

Recommended default: implement a model-provider abstraction with a fake backend for tests and an OpenAI API backend for real runs, configured by environment variables. This keeps `meridian` independent of the Codex desktop runtime while still allowing full automatic flow when credentials are present.

### User Answer / Backend Constraint

The user does not have an OpenAI API key and wants to use the GPT-5.5 model available inside the Codex desktop window if possible.

Revised backend decision:

- First real execution mode should be `codex-window` / agent-executed, not OpenAI API.
- The local CLI cannot assume it can programmatically call the current Codex window model by itself.
- Meridian should therefore make the judge workflow explicit and resumable:
  - generate understanding/quality judge packets;
  - expose exact expected JSON output schemas;
  - let the active Codex agent execute the rubric in the current session;
  - validate and record the resulting JSON;
  - aggregate all three agent outputs into the ingest self-check decision.
- Tests still use a fake backend.
- A future OpenAI/API backend can be added later, but it is not the first required backend.

This preserves the user's requirement for a complete end-to-end flow while matching the available execution environment: the "LLM execution" happens through the active Codex agent rather than through a local API call hidden inside the CLI.

### Backend Architecture Update

The user clarified that the final product should support three execution modes:

1. Codex / Claude Code direct execution:
   - the active coding agent reads judge packets, runs the rubric reasoning, writes result JSON, and asks Meridian to validate/aggregate;
   - this is the first implementation target because it matches the current environment and does not require an API key.
2. API-backed CLI execution:
   - Meridian calls an external model provider through a normal API and runs the whole self-check flow from CLI;
   - this is a later backend, but the interface should be designed now so it can be added without changing rubric artifacts.
3. Local vLLM execution:
   - Meridian sends rubric packets to a locally served model endpoint;
   - this is also a later backend, but the backend contract should not assume proprietary API behavior.

Revised design constraint:

- F6 should introduce an execution-backend boundary even if only `agent-executed` and `fake` are implemented immediately.
- The backend abstraction must preserve the same input and output contract across Codex/Claude direct execution, API CLI execution, and local vLLM execution.
- Rubric packets and result JSON must be portable. A packet generated for the Codex window should be usable by Claude Code, an API backend, or a vLLM backend with minimal wrapper changes.

Recommended first delivery shape:

- `agent-executed`: generates explicit packets and schemas, then the active Codex/Claude agent runs the reasoning and writes validated result JSON.
- `fake`: deterministic backend for tests and CI.
- `api` and `vllm`: reserved backend names and config surfaces, not fully implemented unless the user explicitly expands the feature.

This lets the first version complete the expected end-to-end workflow without pretending local Python can directly call the current Codex window model.

## Developer Round 1

### Scope

Implemented F6 as a runnable three-agent self-check system for Paper Wiki ingest:

- explicit, versioned rubric definitions for understanding, quality, and structural agents;
- an `agent-executed` backend that prepares portable Codex/Claude packets and expected JSON result paths;
- a deterministic `fake` backend for orchestration tests;
- reserved `api` and `vllm` backend names that preserve the same packet/result contract;
- aggregation that validates agent result schemas, propagates hard failures, and produces a combined decision;
- calibration-set execution through `meridian wiki self-check-eval`.

### Changed Artifacts

| Path | Change |
| --- | --- |
| `src/meridian/wiki/rubrics.py` | Added shared rubric dataclasses and complete rubrics for understanding, quality, and structural agents. |
| `src/meridian/wiki/self_check.py` | Added self-check packet generation, fake/agent-executed backends, result validation, aggregation, and eval-manifest batch execution. |
| `src/meridian/wiki/commands.py` | Exposed self-check run, aggregate, and eval helpers. |
| `src/meridian/cli.py` | Added `self-check-run`, `self-check-aggregate`, and `self-check-eval` CLI commands. |
| `.codex/skills/paper-ingest/SKILL.md` | Documented the three-agent rubric contract, backend boundary, and self-check artifacts. |
| `tests/test_cli.py` | Added rubric completeness, self-check orchestration, batch calibration, missing-result, hard-fail, and malformed-result coverage. |

### Implementation Defaults

| Decision | Default |
| --- | --- |
| First real backend | `agent-executed`, because the user has Codex/Claude Code but not an API key. |
| Test backend | `fake`, deterministic and schema-valid, not a semantic judge. |
| API/vLLM | Reserved backend names only; they raise explicit not-implemented errors in this prototype. |
| Aggregation threshold | Hard failures or any agent `fail` force overall `fail`; otherwise weighted score below 4.2 or any `needs_refine` forces `needs_refine`. |
| Agent weights | understanding 0.45, quality 0.35, structural 0.20. |

### Developer Self-Tests

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Full unit suite: `PYTHONPATH=src python3 -m unittest discover -s tests` | All CLI and workflow tests pass. | 24 tests passed. | Pass |
| Compile check: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` | Source and tests compile. | Compile completed. | Pass |
| Single real-run fake smoke on `eval/runs/2026-05-19-quality-selfcheck/round4-final/2504-09629/run.json` | Writes manifest and summary. | Completed with `self-check-summary.json`. | Pass |
| Single real-run agent-executed smoke on the same run | Writes packets/instructions and awaits agent results. | `awaiting_agent_results` with understanding/quality packets and structural result. | Pass |
| Missing agent result aggregation | Aggregator fails with hard failure instead of passing partial evidence. | Overall decision `fail`. | Pass |
| Eval-manifest fake smoke on `eval/runs/2026-05-18-codequant-001/eval_manifest.json` | Batch summary completes case(s). | 1 completed case, 0 failed. | Pass |
| Eval-manifest agent-executed smoke on the same manifest | Batch summary prepares packets and awaits agent execution. | 1 awaiting case, 0 failed. | Pass |

### Developer Gaps

- Live semantic execution is intentionally not hidden inside the Python CLI for this round. The active Codex/Claude agent must read the generated packets and write the expected result JSON for `agent-executed`.
- API and vLLM backends are named and contracted but not implemented.

## Evaluator Round 1

### Findings

No blocking findings.

### Independent Evaluation

| Check | Attack Surface | Evidence | Result |
| --- | --- | --- | --- |
| Rubric contract inspection | Each agent must have role-specific dimensions, anchors, hard-fails, and evidence requirements. | `rubrics.py` defines 6 understanding dimensions, 7 quality dimensions, 8 structural dimensions, and at least 4 hard-fail rules per agent. | Pass |
| Role separation inspection | Structural checks must not replace semantic or quality judgment. | Understanding packet requires Reader A/B comparison; quality packet uses retrieval/research scenarios; structural check remains deterministic artifact/schema validation. | Pass |
| Schema validation probe | Agent output missing a required rationale field should not pass. | `test_self_check_aggregate_rejects_malformed_agent_dimension` forces aggregator decision `fail`. | Pass |
| Hard-fail override probe | A high average score with a hard failure should not pass. | `test_self_check_aggregate_hard_fail_overrides_high_score` produces weighted score above 4.0 but overall `fail`. | Pass |
| Batch calibration scenario | Calibration set execution must not require one-off manual wiring. | `self-check-eval` runs over an eval manifest with fake and agent-executed backends. | Pass |
| Existing workflow replay | New commands should not break previous ingest/flow/eval commands. | Full unit suite passed and includes existing flow, judge, convergence, structural, and quality checks. | Pass |

### Residual Risks

| Risk | Blocks F6 | Reason |
| --- | --- | --- |
| Actual semantic judge quality depends on the active Codex/Claude execution discipline. | No | This is the accepted first backend boundary; packets and result schemas make the step auditable. |
| API and vLLM backend implementations remain future work. | No | User asked for final product support; this feature preserves the contract but does not claim implementation. |
| Current deterministic fake backend does not judge content quality. | No | It is explicitly test-only and labeled as fake in artifacts. |

### Evaluator Verdict

Accepted. The implementation satisfies F6's rubric completeness, executable flow shape, backend boundary, aggregation, adversarial validation, and calibration-set entrypoint without drifting into API/vLLM implementation.

## Convergence Round 1

### Decision

Converged.

### Agreement Check

| Question | Developer Evidence | Evaluator Evidence | Decision |
| --- | --- | --- | --- |
| Are all three rubrics complete and role-specific? | Versioned rubric definitions plus tests. | Inspector check confirmed dimensions, hard-fails, anchors, and role separation. | Satisfied |
| Is the expected first flow executable with Codex/Claude direct execution? | `agent-executed` writes packets, expected result paths, instructions, structural result, and aggregate command. | Real-run smoke confirmed `awaiting_agent_results` packets and batch manifest output. | Satisfied |
| Can the flow be tested without live model calls? | `fake` backend and unit tests. | Unit and batch smoke checks passed. | Satisfied |
| Do hard failures and malformed outputs block false passes? | Aggregator validation and negative tests. | Hard-fail and malformed-dimension probes passed. | Satisfied |

### Remaining Issues

| Issue | Blocks Completion | Next Owner |
| --- | --- | --- |
| API and vLLM backends are reserved but not implemented. | No | Future backend feature. |
| Real semantic judge calibration still needs active Codex/Claude result writing on the user's paper set. | No | Next calibration usage round. |

### Feature Registry Signal

F6 can be marked `done` after the release checkpoint commit.

## Release Round 1

### Checkpoint

Created a local release checkpoint commit with the completed F6 implementation, tests, skill guidance, and review evidence.

### Final Verification

| Check | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | 24 tests passed |
| `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` | Passed |
| `meridian wiki self-check-eval ... --backend fake` on `eval/runs/2026-05-18-codequant-001/eval_manifest.json` | 1 completed case, 0 failed |
| `meridian wiki self-check-eval ... --backend agent-executed` on the same manifest | 1 awaiting agent case, 0 failed |

### Status

F6 is released locally. The next product step is to use `agent-executed` on the calibration paper set so Codex/Claude fills real understanding and quality result JSON, then aggregate scores to guide the next ingest-quality refinement.
