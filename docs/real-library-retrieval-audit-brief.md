---
type: evaluation_brief
title: "Real Library Retrieval Audit Brief"
status: draft
created: 2026-05-20
updated: 2026-05-20
tags:
  - paper-wiki
  - retrieval
  - evaluation
confidence: medium
---

# Real Library Retrieval Audit Brief

## Scope

This audit tests the current real canonical Paper Wiki, not synthetic unit fixtures.

- Raw Zotero export/library checked: `/Users/shawn/Desktop/我的文库`
- Raw PDFs present: 244
- Canonical wiki audited: `eval/runs/2026-05-19-quality-selfcheck/round4-final/wiki`
- Canonical paper pages audited: 14
- Audit output: `eval/runs/2026-05-20-real-retrieval-audit/`

The raw library is larger than the current canonical wiki. This run answers: for each paper already compiled into the wiki, can plausible research-intent queries retrieve it, and do the retrieved neighbors look reasonable?

## Command

```bash
PYTHONPATH=src python3 -m meridian wiki retrieval-audit \
  --wiki-root eval/runs/2026-05-19-quality-selfcheck/round4-final/wiki \
  --out-dir eval/runs/2026-05-20-real-retrieval-audit \
  --top-k 5 \
  --queries-per-paper 3 \
  --overwrite
```

For each paper, the audit generated three query types:

- `method_design`: retrieve the paper from method/topic/setting intent.
- `implementation_probe`: retrieve the paper from implementation/probe/ablation intent.
- `evidence_scope`: retrieve the paper from dataset/metric/evidence/scope intent.

Each query wrote `context.md` and `context.json` so failures can be inspected as normal retrieval packets.

## Result

- Papers audited: 14
- Queries run: 42
- Query recall at top-5: 1.000
- Query recall at top-1: 0.929
- Paper full-recall rate: 1.000
- Average target rank: 1.143
- Metadata-sparse papers: 0
- Paper decisions: 13 pass, 1 needs_review

No paper failed deterministic retrieval. Every canonical paper was recoverable from all generated query types.

## Finding

FlatQuant needs review for one generated `evidence_scope` query:

- Target: `papers/FlatQuant-Flatness-Matters-for-LLM-Quantization.md`
- Query: evidence and scope limits for `quantization`, `speedup`, `WikiText2`, `C4`, `accuracy`, and `perplexity`.
- Target rank: 4
- Top results before FlatQuant: SpinQuant, SqueezeLLM, OSTQuant.

This is not a hard retrieval failure. The generated query is broad and many quantization papers share the same datasets and metrics. The result indicates that evidence/scope queries built only from common datasets and metrics can become under-specific. Future query generation or case design should include the paper's mechanism term when evaluating per-paper self-retrievability under evidence/scope intent.

## Interpretation

Current retrieval is usable for the audited canonical quantization wiki:

- Method and implementation queries are strong.
- Neighbor results are mostly reasonable after retrieval results include full routing metadata.
- Evidence/scope queries are more collision-prone because many papers share benchmark datasets and metrics.

The current result does not prove full Zotero-library retrieval quality. The next real-library step is to publish a broader canonical wiki from more of the 244 raw PDFs, then rerun the same audit across non-quantization domains.

## Follow-Up

- Improve generated `evidence_scope` audit queries so they combine common datasets/metrics with at least one mechanism/topic discriminator.
- Use the audit output to create targeted retrieval-eval cases for recurring misses.
- Run `retrieval-audit` after each broad ingest/publish round as a release gate.
