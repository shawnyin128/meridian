# System Evaluation Guided Optimization Brief

Generated: `2026-05-21`

## Baseline

Command:

```bash
PYTHONPATH=src python3 -m meridian wiki system-optimize-eval \
  --wiki-root wiki \
  --cases eval/cases/system_evaluation_optimization_loop.jsonl \
  --out-dir eval/runs/system-evaluation-loop-r1-baseline \
  --rubric eval/rubrics/system_evaluation_agent_quality.md \
  --top-k 8 \
  --strategy v1 \
  --overwrite
```

Baseline result:

- Cases: 7
- Pass / needs_refine / fail: 7 / 0 / 0
- Average score: 4.912
- Minimum score: 4.700
- Repair buckets:
  - `provenance_schema`: 5
  - `concept_layer`: 3
  - `claim_evidence_traceability`: 1

## Selected Lever

The loop identified context trace visibility as the highest leverage mechanism. The canonical wiki pages already had most of the needed information, but retrieval results did not expose enough `sources`, `section_headings`, and forced trace sections for evaluator and downstream agent use.

This affected:

- provenance checks for compiled knowledge pages
- concept usefulness for coding/debug/probe tasks
- claim/evidence traceability in context packets

## Mechanism Fix

The retrieval result payload now:

- carries `sources`, `source_pdf`, and `section_headings`
- carries forced context sections for concept pages when implementation/debug/probe intent is detected
- carries forced trace sections for claim/evidence results
- keeps compact Markdown output while making JSON context more traceable

This is a generalized context-packing fix. It does not hand-edit canonical wiki pages and does not change raw sources.

## Candidate

Command:

```bash
PYTHONPATH=src python3 -m meridian wiki system-optimize-eval \
  --wiki-root wiki \
  --cases eval/cases/system_evaluation_optimization_loop.jsonl \
  --out-dir eval/runs/system-evaluation-loop-r2-context-trace \
  --rubric eval/rubrics/system_evaluation_agent_quality.md \
  --top-k 8 \
  --strategy v1 \
  --baseline-run eval/runs/system-evaluation-loop-r1-baseline \
  --overwrite
```

Candidate result:

- Cases: 7
- Pass / needs_refine / fail: 7 / 0 / 0
- Average score: 5.000
- Minimum score: 5.000
- Repair buckets: none

Before/after:

- Score delta: +0.088
- `provenance_schema`: 5 -> 0
- `concept_layer`: 3 -> 0
- `claim_evidence_traceability`: 1 -> 0
- Improved cases:
  - `sysopt_coding_probe`
  - `sysopt_concept_prerequisite`

## Residual

No repair buckets remain in this evaluation set after the context trace fix. The next useful loop should add harder evaluator cases rather than keep optimizing this closed set.
