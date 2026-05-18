# Paper Wiki Evaluation Plan v1

## Goal

Evaluate whether Meridian turns a raw PDF paper into useful, auditable, retrieval-ready Paper Wiki state.

The evaluation target is not summary quality alone. A passing ingest should create a draft wiki object that can support future retrieval, comparison, implementation planning, hypothesis refinement, and eventual canonical wiki evolution.

## Current Product Boundary

Evaluate only the Paper Wiki ingest/eval workflow:

- `meridian wiki ingest`
- `meridian wiki flow`
- `meridian wiki eval --mode flow`
- LLM-as-Judge packet creation
- judge result recording and convergence

Do not evaluate Research Dev Agent behavior, MCP delivery, Zotero sync, batch library management, or final canonical promotion yet.

## Core Question

For a given paper and optional existing wiki context, can Meridian produce a packet where:

- source facts are faithful to the paper
- claims, methods, evidence, and uncertainty are separated
- provenance is inspectable
- frontmatter and JSONL support retrieval
- visual/table/formula uncertainty is explicit
- human review is reserved for meaningful uncertainty, not required for every routine paper
- the output helps the user decide what to understand, implement, compare, or investigate next

## Evaluation Flow

```text
case JSONL
  -> meridian wiki eval --mode flow
  -> per-case flow artifacts
  -> LLM-as-Judge result JSON
  -> meridian wiki judge-record
  -> meridian wiki converge
  -> human calibration on judge findings
  -> refine ingest / schema / rubric / retrieval packet
```

The first rounds should not auto-promote standalone claim or method pages. Canonical mutation is limited to draft paper pages when quality gates allow it.

## Phases

### Phase 0: Harness Sanity

Purpose: prove the harness creates replayable evidence.

Cases:

- 1 real PDF, currently CodeQuant.

Required checks:

- `eval_manifest.json` exists.
- Every case has `flow.json`, `run.json`, `judge-packet.md`, and `*.case.json`.
- `run.json` records `quality_gate`, `paper_model`, draft artifacts, and canonical artifacts when published.
- Candidate JSONL files parse.
- Judge packet includes case, rubric, run manifest, paper page, claims, methods, evidence, and canonical draft when available.

Exit criteria:

- Harness produces complete replayable packets with no manual file assembly.

### Phase 1: Calibration Set

Purpose: calibrate ingest output and judge behavior with a small but diverse set.

Size:

- 3-5 real papers.

Recommended case mix:

| Slot | Paper type | Why |
| --- | --- | --- |
| A | Method paper close to the user's research | Tests method decomposition and implementation usefulness |
| B | Benchmark-heavy paper | Tests metric/dataset/baseline provenance |
| C | Figure/table/formula-critical paper | Tests uncertainty and multimodal limits |
| D | Related prior work or competitor | Tests comparison and retrieval metadata |
| E | Paper with user notes or known user insight | Tests source/user/synthesis separation |

Human role:

- The human reviews the judge findings and a small set of high-value artifacts, not the whole paper from scratch.
- For each case, record whether the judge was too harsh, too lenient, or missed the research value.

Exit criteria:

- At least 3 cases have human-calibrated judge decisions.
- Failure buckets are clear enough to drive code/schema/rubric changes.
- The judge catches obvious provenance/schema/source-boundary failures.
- Human review workload is lower than reviewing every paper packet from scratch.

### Phase 2: Focused Regression Set

Purpose: make sure known failure modes stay fixed.

Size:

- 8-12 papers or fixtures after the first calibration loop.

Add cases for:

- weak PDF extraction
- tables with dense metrics
- equations needed for implementation
- figure-dependent method explanation
- ambiguous claims
- papers that should not pollute existing wiki concepts
- papers that should trigger human review
- papers that should pass without human review

Exit criteria:

- Known failure modes have explicit cases.
- New ingest changes do not regress source fidelity, provenance, or schema validity.
- Judge pass/fail behavior is stable enough to compare across runs.

### Phase 3: Scenario Evaluation

Purpose: evaluate whether the wiki helps future research tasks.

This starts only after one-paper ingest is acceptable.

Scenario classes:

- "I want to implement this method."
- "Compare this paper to prior work."
- "What claims are actually supported?"
- "What should I try next?"
- "What parts require human review?"
- "Which papers in the wiki are relevant to my idea?"

The output target becomes a context packet or synthesis note, not only ingest artifacts.

## Case Design

Each case should specify outcome constraints, not a unique path.

Required fields:

```json
{
  "id": "",
  "category": "paper_ingest_quality",
  "paper_path": "",
  "problem_description": "",
  "expected_result": "",
  "acceptable_paths": [],
  "must_not_do": [],
  "evaluation_rubric": [],
  "judge_prompt_variant": "paper_wiki_quality_v0",
  "notes": ""
}
```

Optional fields:

```json
{
  "title": "",
  "wiki_context_path": "",
  "user_notes_path": "",
  "known_focus": [],
  "known_risks": [],
  "human_calibration_questions": []
}
```

Good case writing:

- Describe what a useful result should enable.
- Name important stressors, such as formulas, tables, figures, or prior claims.
- Allow multiple valid artifact paths.
- State dangerous mistakes in `must_not_do`.

Bad case writing:

- Requiring exact headings, exact page counts, or exact wording unless testing schema.
- Rewarding long summaries over useful decomposition.
- Assuming every paper must become many standalone pages.
- Treating judge pass as equivalent to human-reviewed truth.

## Artifacts To Judge

Minimum judge packet:

- case snapshot
- rubric
- `run.json`
- `paper.md`
- `claims.jsonl`
- `methods.jsonl`
- `evidence.jsonl`
- `review.md`
- canonical draft page when created
- index/log when created

Later judge packet additions:

- selected page images
- figure/table crops
- source text snippets selected by retrieval
- existing wiki context packet
- user notes or Zotero annotation export

The judge should not receive the entire wiki by default. Evaluation should reward good bounded context construction.

## Scoring Policy

Use the existing rubric in `eval/rubrics/paper_wiki_quality_v0.md`.

Primary dimensions:

- source fidelity
- provenance quality
- paper model depth
- object decomposition
- retrieval readiness
- wiki integration
- uncertainty handling
- human-gate discipline
- research usefulness
- format/schema validity

Blocking failures:

- fabricated paper fact
- major claim without provenance
- invalid JSONL/YAML
- source fact and user/synthesis voice collapsed
- quality gate passes despite obvious extraction/provenance failure
- canonical draft presents unreviewed synthesis as confirmed knowledge

Decision thresholds:

- `pass`: weighted score >= 4.0 and no blocking issue
- `needs_refine`: weighted score 3.0-3.9 or one serious local issue
- `fail`: weighted score < 3.0 or any blocking issue

## Human Calibration

Human review should calibrate the judge, not redo every ingest.

For each calibration case, the human records:

- judge decision agreement: agree / too harsh / too lenient / missed key issue
- most important missed artifact issue
- most important missed research-usefulness issue
- whether human review was actually necessary
- one concrete refinement action

Suggested calibration record:

```json
{
  "case_id": "",
  "judge_result_path": "",
  "human_decision": "agree | too_harsh | too_lenient | missed_key_issue",
  "human_notes": "",
  "required_refine_bucket": "workflow | schema | extraction | multimodal_understanding | retrieval | judge_rubric | other",
  "should_require_human_review_next_time": false
}
```

## Refinement Buckets

Every failed or weak case should map to one main bucket:

| Bucket | Meaning | Example fix |
| --- | --- | --- |
| workflow | wrong flow boundary or publish gate | change flow/convergence policy |
| schema | missing or unclear fields | add frontmatter/JSONL field |
| extraction | PDF text/page extraction weak | improve PyMuPDF extraction or preprocessing |
| multimodal_understanding | figure/table/formula not understood | add page image/crop pass or better visual packet |
| paper_model | claims/methods/evidence too shallow | improve model generation or prompts |
| retrieval | future queries would not find it | improve topics/aliases/context packet |
| judge_rubric | judge misses or misweights issue | revise rubric or judge output schema |
| human_gate | escalates too much or too little | tune quality gate/review state |

## Metrics To Track

Per run:

- case count
- generated packet count
- structural failure count
- quality gate decisions
- judge decisions
- weighted score distribution
- blocking issue count
- refinement bucket counts
- human calibration agreement rate
- average manual review time per case, when available

Do not optimize only for pass rate. Early evaluation should maximize useful failure discovery.

## Initial Run Protocol

1. Create a real case file for 3-5 papers.
2. Run:

```bash
PYTHONPATH=src meridian wiki eval <cases.jsonl> \
  --out-dir eval/runs/<date>-calibration-01 \
  --mode flow \
  --rubric eval/rubrics/paper_wiki_quality_v0.md \
  --overwrite
```

3. Run the LLM judge on each `judge-packet.md`.
4. Record judge JSON next to the case output.
5. Run `eval-converge` to record judge JSON and converge each case.
6. Human reviews judge findings for 3-5 cases.
7. Summarize failure buckets.
8. Pick one refinement target before adding more cases.

Batch convergence command:

```bash
meridian wiki eval-converge eval/runs/<date>-calibration-01/eval_manifest.json
```

Human calibration command:

```bash
meridian wiki eval-calibrate eval/runs/<date>-calibration-01/eval_manifest.json \
  --case-id <case-id> \
  --human-decision agree \
  --bucket paper_model \
  --notes "Judge caught the important issue."
```

Run-level summary command:

```bash
meridian wiki eval-summary eval/runs/<date>-calibration-01/eval_manifest.json
```

## Stop Criteria Before Scaling

Do not scale beyond 3-5 real papers until:

- judge packet creation is automatic
- candidate JSONL and frontmatter remain valid
- source/user/synthesis boundaries are visible
- provenance exists for core claims and methods
- the judge can identify at least obvious packet failures
- human calibration confirms the judge is directionally useful
- failure buckets are actionable

## First Expected Refinements

Based on the current prototype, likely early findings are:

- method extraction is too heuristic for implementation-level use
- dense tables need better evidence structure
- figures and formulas need selected visual crops or page-image references in judge context
- quality gate may be too structural and not semantic enough
- claim candidates may include background statements
- canonical draft publish state needs clearer distinction between `auto_ingested`, `needs_review`, and `auto_converged`

These should be treated as expected discovery, not product failure.
