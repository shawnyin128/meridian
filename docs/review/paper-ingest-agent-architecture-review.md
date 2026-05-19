# Paper Ingest Agent Architecture Review

## Context/Test Plan

### User Request

The user wants Arbor to manage the paper ingest self-check architecture and clarify three distinct agents:

- Understanding agent: checks whether `paper.md` alone lets a reader reconstruct the paper, then compares that against a source-grounded reading and attributes mismatches to skill/generation fixes.
- Quality agent: checks generated `paper.md` quality for human readability, high information density, and retrieval coverage under complex downstream research scenarios.
- Structural agent: checks ingest result structural completeness and detects random structural failures caused by skill or code drift.

This feature implements the missing structural agent and connects all three agents into the Arbor-managed ingest architecture.

### Scope

- Add a scored structural self-check agent for ingest outputs.
- Expose the structural check through `meridian wiki structural-check`.
- Include structural check output in `meridian wiki flow` and `meridian wiki eval --mode flow` manifests.
- Preserve the existing reader/understanding packet and quality self-check behavior.
- Update project-local Paper Ingest skill guidance so future agents preserve the three-agent boundary.
- Record Arbor review evidence and convergence status in this document.

### Non-Goals

- Do not change the semantic depth rubric of the understanding agent in this feature.
- Do not rewrite the quality agent scoring model except as needed for integration.
- Do not add MCP delivery or canonical wiki promotion changes.
- Do not require live LLM calls for structural validation; this must be deterministic and replayable.

### Decision Trace Handoff

- Key decision: treat "agent" here as a managed ingest check role with deterministic artifact surfaces, not as mandatory runtime subagent spawning.
- Key decision: structural quality is separate from prose quality. It should fail missing schemas, broken artifact links, malformed frontmatter, incomplete JSONL records, extraction inconsistency, and provenance holes even if `paper.md` reads well.
- Rejected option: folding structural checks into the quality agent. That would blur readable/retrieval quality with schema completeness and make drift harder to diagnose.
- Allowed implementation discretion: choose exact dimension names, weights, and JSON schema as long as failures are attributable to structure buckets and flow/eval surfaces expose paths and scores.
- Invariant: the three checks must remain separately inspectable: reader/understanding packet, quality self-check JSON, structural self-check JSON.

### Acceptance Criteria

1. `meridian wiki structural-check <run.json>` writes a JSON artifact with schema version, decision, weighted score, dimension scores, and findings.
2. `meridian wiki flow` writes `structural-self-check.json` and includes its path, decision, and score in `flow.json`.
3. `meridian wiki eval --mode flow` includes the structural self-check path in each result record.
4. The structural agent fails adversarial incomplete ingest state such as missing artifacts or missing required frontmatter/sections.
5. The structural agent does not replace semantic quality checks; reader and quality outputs remain separate.
6. Paper ingest skill guidance documents the three-agent boundary for future development.

### Done-When Criteria

| Criterion | Minimum Proof | Owner |
| --- | --- | --- |
| Structural check is a replayable CLI and code path | Unit test invokes `meridian wiki structural-check` on an ingest run and inspects JSON schema/dimensions | develop |
| Flow/eval expose all three self-check roles | Unit tests inspect `flow.json` and eval manifest for reader, quality, and structural artifacts | develop |
| Structural drift can be detected | Adversarial evaluator check mutates/removes structural input and observes fail/low score | evaluate |
| Existing ingest behavior remains stable | Full unit test suite and compile check pass | develop/evaluate |
| Arbor state is auditable | This review doc contains developer, evaluator, and convergence rounds; feature registry reaches done only after evaluation acceptance | converge |

### Verification Scope

- Unit tests in `tests/test_cli.py`.
- Compile check over `src` and `tests`.
- Structural-check smoke on at least one real calibration run from `eval/runs/2026-05-19-quality-selfcheck/round4-final`.
- Static review that no Arbor/plugin files outside project state are modified accidentally.

## Developer Round 1

### Implementation Summary

Implemented the missing structural self-check agent and connected the three-agent ingest check surface:

- Added `src/meridian/wiki/structural_check.py`.
- Added `meridian wiki structural-check <run.json> [--out ...]`.
- Integrated structural self-check into `meridian wiki flow`.
- Added structural self-check path to `meridian wiki eval --mode flow` manifest results.
- Added `managed_self_check_agents` to `flow.json` so the understanding, quality, and structural roles are visible together.
- Updated `.codex/skills/paper-ingest/SKILL.md` with the three-agent boundary.

### Implementation-Time Decisions

- Structural check is deterministic and file/schema based; it does not call an LLM and does not judge prose depth.
- The check reports eight dimensions: run manifest, artifact existence, frontmatter schema, section schema, candidate JSONL schema, provenance linkage, extraction consistency, and source management.
- `meridian wiki flow` keeps status semantics unchanged (`awaiting_judge` unless a judge result is provided); structural pass/fail is surfaced as evidence, not as a replacement for judge convergence.
- Direct `meridian wiki ingest` does not automatically run structural check; direct users can call `meridian wiki structural-check`, while canonical `flow` runs all three self-check surfaces.

### Self-Test Evidence

| Check | Expected Result | Actual Result |
| --- | --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | Existing behavior plus new structural tests pass | Passed, 16 tests |
| `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` | All Python files compile | Passed |
| Unit: `test_structural_check_command_scores_ingest_structure` | CLI writes `paper_wiki_structural_self_check.v0` with structure dimensions | Passed |
| Unit: `test_structural_check_fails_missing_artifact` | Removing `methods.jsonl` lowers artifact/candidate scores and does not pass | Passed |
| Unit: flow manifest test | `flow.json` contains reader, quality, and structural check paths | Passed |
| Unit: eval flow test | Eval result records include structural self-check path | Passed |
| Real calibration smoke | Existing 14 final calibration runs structurally pass | Passed, 14/14 pass, scores 5.000 |

### Calibration Smoke Output

`eval/runs/2026-05-19-quality-selfcheck/round4-final/*/run.json` was replayed through `run_structural_self_check`.

All 14 papers passed structural checks:

- min score: 5.000
- mean score: 5.000
- max score: 5.000

This is expected because these calibration outputs were already generated by the current stable flow; the value of this agent is catching future structural drift and random incomplete artifacts.

### Risks / Gaps

- The structural agent intentionally does not catch shallow mechanisms, noisy topics, or weak prose. Those remain quality/understanding agent responsibilities.
- The evaluator should add an independent adversarial structure mutation beyond the unit missing-artifact case.

## Evaluator Round 1

### Verdict

Accepted after one correction during evaluation.

### Findings

| Finding | Severity | Evidence | Resolution |
| --- | --- | --- | --- |
| Missing required section was initially under-penalized | Blocking before correction | Independent mutation removed `## Mechanism` and `source_id`; first run still returned pass with score 4.846 | Corrected by making missing required sections and critical frontmatter fields blocking-level scores; added `test_structural_check_fails_missing_required_section` |

### Independent Checks

| Check | Risk Tested | Result |
| --- | --- | --- |
| Replayed full unit suite after correction | Integration drift across CLI, flow, eval, and existing ingest behavior | Passed, 17 tests |
| Compile check | Syntax/import errors in new structural module and touched CLI/flow files | Passed |
| Independent frontmatter/section mutation on a real calibration output | Structural agent should catch schema drift that still leaves files present | Passed after correction: decision `needs_refine`, frontmatter score 2.5, section score 2.5 |
| Real calibration replay across 14 previous paper runs | New structural check should not produce false structural failures on known complete artifacts | Passed, 14/14 pass, all scores 5.000 |
| CLI smoke on real run manifest | `meridian wiki structural-check` should be usable outside tests | Passed on `2501-13987/run.json`, score 5.000 |

### Decision Drift Check

- The implementation preserved the three-agent boundary: `reader-check.md`, `quality-self-check.json`, and `structural-self-check.json` are separate artifacts.
- The structural agent does not claim to evaluate semantic understanding or prose quality.
- Flow status semantics were not changed; structural results are surfaced as evidence.

### Residual Risk

- The structural checker is intentionally deterministic and schema-oriented. It can certify that the ingest state is complete and replayable, not that the paper was understood deeply.

## Convergence Round 1

### Decision

Converged.

### Agreement Check

| Question | Developer Side | Evaluator Side | Decision |
| --- | --- | --- | --- |
| Is the structural agent implemented and exposed? | Added module, CLI command, flow/eval integration | Replayed unit and CLI checks | Agree |
| Are all three self-check roles separately visible? | Flow manifest includes managed self-check agents | Evaluator verified flow test coverage and skill guidance | Agree |
| Can structural drift be caught? | Missing-artifact unit test added | Independent missing-section/frontmatter mutation initially found a gap; correction and regression test fixed it | Agree after correction |
| Does this stay inside scope? | No semantic rewrite or MCP work included | No scope drift found | Agree |

### Goal Alignment

The feature satisfies the user goal: Arbor now manages the ingest check architecture, and the missing structural agent is connected beside the existing understanding and quality checks.

### Remaining Issues

| Issue | Source | Blocks Completion | Next Owner |
| --- | --- | --- | --- |
| Structural pass does not imply deep understanding | Intended role separation | No | Understanding and quality agents |

### Next Step

Mark F5 as done in Arbor state and create a local checkpoint commit for the feature.

## Release Round 1

### Local Checkpoint Scope

The release checkpoint for F5 includes:

- structural self-check implementation and CLI/flow integration
- tests for direct structural checks, flow/eval surfacing, missing artifact failure, and missing required section failure
- Paper Ingest skill guidance documenting the three-agent self-check boundary
- this Arbor review record

### Release Gate Evidence

- Unit tests passed: `PYTHONPATH=src python3 -m unittest discover -s tests`
- Compile check passed: `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`
- Real calibration structural replay passed: 14/14 existing paper runs passed
- AGENTS project-map drift hook reported no missing top-level candidates or stale mapped paths
- Arbor process state check reports only release evidence expectations before this release round
