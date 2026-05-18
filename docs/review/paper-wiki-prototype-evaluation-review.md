# Paper Wiki Prototype And Evaluation Review

## Context/Test Plan

### Raw Request

The user clarified that development should start with the Paper Wiki. The desired sequence is: brainstorm and construct a prototype, perform human review, build many detailed evaluation cases without overspecifying the one valid path, then run evaluation, feed back results, and refine.

### Problem Summary

The project has a strong product boundary and architecture, but implementation should not begin with the Research Dev Agent. Paper Wiki must first prove that it can internalize papers, preserve user insight, evolve analysis, retrieve context, and produce reviewable wiki state. The test strategy must evaluate outcomes and research usefulness rather than exact tool paths.

### Goals

- Make Paper Wiki the first implementation priority.
- Define the prototype boundary before implementation.
- Require human review before scaling evaluation cases.
- Define test case structure with detailed problem descriptions and expected outcome properties.
- Avoid overspecifying exact paths, tool sequences, page counts, or titles unless the case is specifically testing them.
- Establish an evaluation/refinement loop that improves workflow, schema, retrieval, and MCP/tool interfaces.

### Non-Goals

- Do not implement the prototype in this brainstorm checkpoint.
- Do not start with the Research Dev Agent.
- Do not build a large benchmark before manual review validates the product loop.
- Do not require vector infrastructure, live Zotero sync, or batch ingest for the first prototype.
- Do not copy community implementation code.

### Acceptance Criteria

- The planning docs state that Paper Wiki comes before Research Dev Agent implementation.
- The prototype scope is small enough to build and manually review.
- The evaluation plan defines test case structure, categories, rubrics, and anti-overspecification rules.
- The refinement loop maps failures to workflow, schema, retrieval, or tool/interface fixes.
- Later `develop` work has clear done-when criteria for the prototype stage.

### Done-When Criteria

| Criterion | Minimum proof | Evidence owner |
| --- | --- | --- |
| Paper Wiki is first in the implementation order | MVP docs and prototype plan explicitly prioritize Paper Wiki before Research Dev Agent | brainstorm |
| Prototype boundary is defined | `docs/paper-wiki-prototype-evaluation-plan.md` names minimum prototype capabilities and non-goals | brainstorm |
| Human review gate is explicit | Plan defines what the user should inspect before scaling evaluation | brainstorm |
| Evaluation avoids path overfitting | Plan includes expected-result and acceptable-path guidance plus anti-overspecification rules | brainstorm |
| Refinement loop is actionable | Plan maps failures to workflow/schema/retrieval/tool-interface buckets | brainstorm |

### Test Plan For Later Develop/Evaluate

Structure checks:

- Confirm prototype docs exist and are linked from MVP plan/workflow docs.
- Confirm feature registry points to this review artifact.
- Confirm evaluation case schema is represented in the prototype plan.

Scenario checks:

- A one-paper ingest prototype creates a reviewable draft with provenance.
- Human feedback changes analysis emphasis without losing source/user/synthesis separation.
- A retrieval case returns a small context packet with selection reasons and gaps.
- A contradiction case surfaces judgment points instead of silently rewriting old claims.
- An ambiguous request case stops or asks for clarification.

Evaluation-harness checks:

- Test cases include detailed problem descriptions and expected result properties.
- Test cases include acceptable paths rather than one required route.
- Rubrics score artifact quality, provenance, retrieval quality, write-boundary correctness, and failure honesty.
- Evaluation failures produce refinement actions, not only pass/fail labels.

Negative checks:

- The prototype should not mutate canonical wiki pages on unclear write intent.
- Evaluation should not require exact tool sequence when multiple paths are valid.
- Evaluation should not reward large retrieval dumps without selection reasons.
- Human review should not be skipped before scaling a large test suite.

### Decision Trace Handoff

Key decisions:

- Build Paper Wiki first.
- Treat prototype as a product-loop test, not final infrastructure.
- Run human review before large-scale evaluation.
- Evaluation should define expected outcomes and acceptable paths, not one unique execution trace.
- Refinement should be bucketed into workflow, schema, retrieval, or tool/interface changes.

Rejected options:

- Start by building the Research Dev Agent.
- Build a large benchmark before manual review.
- Overspecify exact tool paths or page counts for every case.
- Treat test pass/fail as sufficient without failure analysis.

Allowed implementation discretion:

- Choose Markdown, YAML, JSONL, or a mixed fixture layout for evaluation cases if the schema remains clear.
- Use curated text fixtures before full PDF parsing if that gets the prototype evaluated sooner.
- Defer live Zotero integration if annotation exports cover the first review loop.

Decision invariants:

- Raw sources remain immutable.
- Paper Wiki canonical state remains Markdown-first.
- Broad writes remain reviewable.
- Evaluation judges research usefulness and auditability, not only syntactic output.

## Developer Round 1

### Implementation Summary

Implemented the v0 Paper Wiki CLI prototype:

- `meridian wiki ingest <pdf> --out <draft-dir>` creates draft-only ingest artifacts.
- `meridian wiki eval <cases.jsonl> --out-dir <dir>` iterates JSONL cases and records generated/error outcomes.
- `meridian wiki review <review.md> --decision ...` appends human-led review records.
- PDF extraction is implemented through PyMuPDF at runtime.
- The CLI writes page-level text JSONL, page images, run manifest, and a Markdown-only review packet.
- Canonical wiki mutation is intentionally not implemented in v0.

### Files Added

- `pyproject.toml`
- `README.md`
- `src/meridian/`
- `tests/test_cli.py`

### Evidence

Commands run:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPATH=src python3 -m meridian --help
PYTHONPATH=src python3 -m meridian wiki --help
```

Results:

- Unit tests: 3 passed.
- CLI help renders `meridian` top-level namespace.
- Wiki help renders `ingest`, `eval`, and `review`.

### Known Limits

- Tests use a fake `fitz` module so they do not require network dependency installation.
- Real PDF execution requires installing project dependencies with `python3 -m pip install -e .`.
- `review.md` is a structured packet scaffold based on extracted materials; full paper understanding is still agent-orchestrated and human-reviewed.
- Figures/tables directories are placeholders; v0 renders page images and records page-level image/drawing signals rather than extracting standalone figure/table objects.

## Developer Round 2

### Implementation Summary

Refactored the ingest output format toward LLM Wiki draft objects:

- `review.md` now includes YAML frontmatter for retrieval, review state, artifact links, source PDF, and write policy.
- `meridian wiki ingest` now also writes `paper.md`, `claims.jsonl`, `methods.jsonl`, and `evidence.jsonl`.
- `paper.md` is the retrieval-oriented draft paper page; `review.md` remains the human audit packet.
- `claims.jsonl`, `methods.jsonl`, and `evidence.jsonl` provide structured candidate records for later publish/retrieval workflows.
- `run.json` now records all draft artifacts under `draft_artifacts`.
- The existing CodeQuant ingest was migrated into the new format without canonical wiki mutation.

### Files Changed

- `src/meridian/wiki/packet.py`
- `src/meridian/wiki/ingest.py`
- `src/meridian/wiki/commands.py`
- `src/meridian/cli.py`
- `tests/test_cli.py`
- `wiki/.drafts/ingests/2604-10496v1/review.md`
- `wiki/.drafts/ingests/2604-10496v1/paper.md`
- `wiki/.drafts/ingests/2604-10496v1/claims.jsonl`
- `wiki/.drafts/ingests/2604-10496v1/methods.jsonl`
- `wiki/.drafts/ingests/2604-10496v1/evidence.jsonl`
- `wiki/.drafts/ingests/2604-10496v1/run.json`

### Evidence

Commands run:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache python3 -m compileall src tests
python3 -m json.tool wiki/.drafts/ingests/2604-10496v1/run.json
python3 -c 'import json, pathlib; paths=["claims.jsonl","methods.jsonl","evidence.jsonl"]; root=pathlib.Path("wiki/.drafts/ingests/2604-10496v1");
for name in paths:
    n=0
    for line in (root/name).read_text().splitlines():
        json.loads(line); n+=1
    print(f"{name}: {n} valid records")'
```

Results:

- Unit tests: 3 passed.
- Compile check passed.
- `run.json` is valid JSON.
- CodeQuant candidate files validate as JSONL:
  - `claims.jsonl`: 6 records.
  - `methods.jsonl`: 4 records.
  - `evidence.jsonl`: 12 records.

### Known Limits

- The CLI-generated candidate records are still placeholders unless an agent fills them from the extracted paper.
- The CodeQuant candidate records are manually migrated from the current review content and need human quality review.
- Frontmatter schema is intentionally simple and may need refinement after retrieval/evaluation cases expose the fields that actually matter.

## Developer Round 3

### Implementation Summary

Implemented the confidence-gated Paper Wiki prototype path and the first evaluation assets:

- `meridian wiki ingest` now accepts `--wiki-root` and `--publish-mode never|auto|always`.
- Default behavior remains draft-only.
- `--publish-mode auto` publishes a canonical draft paper page when the quality gate does not fail.
- Canonical draft publishing updates `wiki/papers/`, `wiki/index.md`, and `wiki/log.md`.
- `run.json` records the quality gate and any canonical artifacts.
- Quality gate records `decision`, `review_state`, `confidence`, `warnings`, and `errors`.
- Added `meridian wiki judge-pack` to package run artifacts with an LLM-as-Judge rubric.
- Added an evaluation-set strategy doc, a judge rubric, and example JSONL cases.

### Files Changed

- `src/meridian/cli.py`
- `src/meridian/wiki/commands.py`
- `src/meridian/wiki/eval.py`
- `src/meridian/wiki/ingest.py`
- `src/meridian/wiki/judge.py`
- `src/meridian/wiki/publish.py`
- `src/meridian/wiki/quality.py`
- `tests/test_cli.py`
- `README.md`
- `AGENTS.md`
- `docs/wiki-evaluation-set-and-judge-rubric.md`
- `eval/rubrics/paper_wiki_quality_v0.md`
- `eval/cases/paper_ingest_quality.example.jsonl`

### Evidence

Commands run:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache python3 -m compileall src tests
```

Results:

- Unit tests: 5 passed.
- Compile check passed.

### Known Limits

- The current CLI still generates placeholder claim/method records until agent orchestration fills them.
- Therefore extraction-only CLI runs usually publish with `review_state: needs_review`; a mature ingest skill should fill the paper model before the quality gate.
- LLM-as-Judge execution is not wired to a model API yet; `judge-pack` creates the bounded input packet for a later judge runner.

## Developer Round 4

### Implementation Summary

Implemented the high-quality generic Paper Wiki flow before scenario-specific evaluation:

- Added `meridian wiki flow` as the preferred prototype entrypoint.
- The flow runs ingest, confidence-gated canonical draft publish, judge-packet generation, and `flow.json` creation.
- Added `meridian wiki judge-record` to record an LLM-as-Judge JSON result against a run.
- Added `meridian wiki converge` to decide whether a run has converged from quality gate plus recorded judge result.
- Convergence writes `convergence.json`, updates `run.json`, appends wiki log evidence when canonical artifacts exist, and updates canonical paper frontmatter with convergence state.
- Updated the project `llm-wiki` skill using the Codex skill-creator constraints: the skill now records the default Meridian paper ingest flow without adding extra auxiliary skill files.

### Files Changed

- `src/meridian/cli.py`
- `src/meridian/wiki/commands.py`
- `src/meridian/wiki/converge.py`
- `src/meridian/wiki/flow.py`
- `tests/test_cli.py`
- `README.md`
- `.codex/skills/llm-wiki/SKILL.md`

### Evidence

Commands run:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache python3 -m compileall src tests
```

Results:

- Unit tests: 7 passed.
- Compile check passed.

### Known Limits

- The flow prepares and records LLM-as-Judge outputs but still does not call a model API directly.
- Automatic convergence currently trusts a valid judge JSON plus non-failing quality gate; deeper adversarial evaluation remains the next independent evaluation step.
- The content generator still needs a stronger agent-filled paper model before most real papers should auto-converge without review.

## Evaluator Round 1

### Evaluation Verdict

Accepted with residual risk. The generic prototype flow is coherent and replayable enough to use before scenario-specific evaluation.

### Findings First

No blocking findings.

Residual risks:

- The flow records and converges LLM-as-Judge output, but does not call a model API directly.
- Current content generation still leaves placeholder claim/method records in extraction-only runs, so most real papers will remain `needs_review` until agent orchestration fills the paper model.
- Automatic convergence trusts a valid judge JSON schema; adversarial judge-output quality is a later evaluation concern.

### How I Challenged The Work

| Check | Risk Tested | Result |
| --- | --- | --- |
| Replayed unit suite | New commands might break existing ingest/eval/review contracts | Passed: 7 tests |
| Compile check | New modules or CLI wiring might have syntax/import errors | Passed |
| CLI help checks | New user-facing flow commands might be inaccessible or unclear | Passed for `flow`, `judge-record`, and `converge` |
| Real PDF smoke flow | Fake `fitz` tests might hide real extraction/publish path issues | Passed on `/Users/shawn/Desktop/2604.10496v1.pdf` with output in `/private/tmp` |
| No-judge convergence probe | Convergence might falsely pass without judge evidence | Passed: returned `needs_judge` |
| Missing judge result probe | Judge recording might silently accept absent evidence | Passed: command failed with file-not-found error |
| Documentation/schema grep | Skill/README/review evidence might omit the new flow contract | Passed: flow and convergence commands are documented |

### Plan Coverage

| Planned Requirement | Evaluation Result |
| --- | --- |
| Use LLM Wiki architecture | Passed: flow preserves raw source, draft artifacts, canonical draft, index/log, provenance-oriented metadata |
| Avoid mandatory per-paper human review | Passed: quality gate plus LLM judge supports exception-based review |
| Use skill creator if skill changes are needed | Passed: project skill was updated concisely without auxiliary clutter; `agents/openai.yaml` remains consistent |
| Build high-quality prototype flow before scenario evaluation | Passed: generic flow now covers ingest, publish, judge packet, judge result recording, and convergence |

### What I Checked

Commands:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache python3 -m compileall src tests
PYTHONPATH=src python3 -m meridian wiki flow --help
PYTHONPATH=src python3 -m meridian wiki judge-record --help
PYTHONPATH=src python3 -m meridian wiki converge --help
PYTHONPATH=/private/tmp/meridian-deps:src python3 -m meridian wiki flow /Users/shawn/Desktop/2604.10496v1.pdf --out /private/tmp/meridian-flow-smoke-codequant --wiki-root /private/tmp/meridian-flow-smoke-wiki --rubric eval/rubrics/paper_wiki_quality_v0.md --title CodeQuant-Smoke
PYTHONPATH=src python3 -m meridian wiki converge /private/tmp/meridian-flow-smoke-codequant/run.json --out /private/tmp/meridian-flow-smoke-codequant/convergence-nojudge.json
PYTHONPATH=src python3 -m meridian wiki judge-record /private/tmp/meridian-flow-smoke-codequant/run.json /private/tmp/meridian-missing-judge-result.json
```

### Unit Tests

7 tests passed. The new tests cover full flow creation, judge packet creation, judge result recording, convergence, canonical frontmatter update, canonical index/log update, eval manifest, and legacy review recording.

### Scenario Tests

- Full flow with fake PDF: created `flow.json`, `run.json`, canonical draft paper page, and `judge-packet.md`.
- Real CodeQuant PDF smoke flow: extracted 19 pages, published a canonical draft in `/private/tmp`, wrote a judge packet, and stopped at `awaiting_judge`.
- No-judge convergence: produced `needs_judge`, preventing false convergence.

### Other Checks

- Arbor process state check passed.
- AGENTS drift hook passed.
- Example evaluation JSONL contains 5 valid case records.

## Convergence Round 1

### Convergence Decision

Converged for the generic prototype flow.

### Why This Decision

Developer and evaluator evidence agree that the prototype now has the requested end-to-end shape: ingest, confidence-gated canonical draft publish, bounded judge packet, judge result recording, and convergence decision. Remaining issues are content-model depth and later scenario-specific evaluation, not blockers for this flow scaffold.

### Agreement Check

| Question | Developer Side | Evaluator Side | Decision |
| --- | --- | --- | --- |
| Does the flow cover the requested prototype path? | Implemented `flow`, `judge-record`, and `converge` commands | Replayed tests and real PDF smoke flow | Agree |
| Does it avoid mandatory human review? | Uses quality gate plus LLM judge, with review states in metadata | Verified no-judge path blocks convergence and judge path can converge | Agree |
| Does it preserve LLM Wiki contracts? | Updated skill and artifacts around raw source, draft/canonical wiki, index/log, provenance metadata | Checked docs, skill, and generated run artifacts | Agree |

### Goal Alignment

The result satisfies the current goal: build a high-quality generic Paper Wiki prototype flow before designing scenario-specific evaluation. The next work should improve the agent-filled paper model and then build scenario-specific evaluation sets.

### Remaining Issues

| Issue | Source | Blocks Completion | Next Owner |
| --- | --- | --- | --- |
| No model API runner for LLM-as-Judge yet | Evaluator residual risk | No | Later development |
| Paper model content is still scaffolded in CLI-only runs | Developer and evaluator residual risk | No for flow scaffold; yes before scaling ingest quality | Next prototype refinement |
| Scenario-specific evaluation is intentionally deferred | User scope | No | Future brainstorm/evaluation work |

### Next Step

Move from flow scaffolding to improving the agent-filled ingest skill so real papers can pass quality and judge evaluation without per-paper human review.

## Release Round 1

### Release Scope

Local workflow finalization for F3: Paper Wiki prototype and evaluation plan.

### Release Decision

Finalized locally. No git commit, push, tag, package publish, or external release was performed.

### Evidence Checked

- Developer Round 4 exists for the generic flow implementation.
- Evaluator Round 1 accepts the flow with residual risks.
- Convergence Round 1 marks the generic prototype flow converged.
- `.arbor/workflow/features.json` marks F3 as `done`.
- `AGENTS.md` drift hook reports no Project Map drift.

### Residual Follow-Up

The next feature should focus on the agent-filled paper model and content-depth improvement. Scenario-specific evaluation should wait until that ingest skill is strong enough to produce non-placeholder claim/method/evidence objects.
