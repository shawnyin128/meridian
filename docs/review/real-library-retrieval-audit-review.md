---
type: review
title: "Real Library Retrieval Audit Review"
status: done
created: 2026-05-20
updated: 2026-05-20
tags:
  - arbor
  - paper-wiki
  - retrieval
  - evaluation
---

# Real Library Retrieval Audit Review

## Context/Test Plan

Goal: run retrieval evaluation on real canonical wiki pages rather than synthetic examples only.

Acceptance criteria:

- Add a reusable command that audits every canonical paper with generated research-intent queries.
- Preserve per-query context packets for manual inspection.
- Report self-recall, target rank, metadata sparsity, and neighbor reasonableness.
- Run the audit on the current real canonical wiki and write a durable quality brief.
- Keep the boundary clear between the 244-PDF raw library and the currently published canonical subset.

## Developer Round 1

Implemented:

- Added `meridian wiki retrieval-audit`.
- Added `src/meridian/wiki/retrieval_audit.py`.
- The audit generates method/design, implementation/probe, evidence/scope, and limitation-boundary query candidates from each catalog record.
- The audit writes per-query `context.md` and `context.json`, plus `retrieval_audit_manifest.json`, `retrieval_audit_summary.json`, and `retrieval_audit_summary.md`.
- Retrieval result JSON now includes `routing` metadata so audit can judge neighbor overlap instead of only ranking target recall.
- Added unit coverage for the generated-query audit flow.
- Ran the audit on `eval/runs/2026-05-19-quality-selfcheck/round4-final/wiki`.
- Added `docs/real-library-retrieval-audit-brief.md`.

Real run result:

- Papers: 14
- Queries: 42
- Query recall at top-5: 1.000
- Query recall at top-1: 0.929
- Paper full-recall rate: 1.000
- Needs review: FlatQuant evidence/scope query, target rank 4.

## Evaluator Round 1

Independent replay completed:

| Check | Expected | Result |
| --- | --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | Existing behavior and new retrieval-audit command remain stable | Passed, 42 tests |
| `PYTHONPATH=src python3 -m meridian wiki retrieval-audit --help` | CLI surface is inspectable | Passed |
| `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests` | Source and tests compile | Passed |
| `git diff --check` | No whitespace errors | Passed |
| Arbor AGENTS drift hook | Project map covers new durable brief | Passed |

Real audit replay:

```bash
PYTHONPATH=src python3 -m meridian wiki retrieval-audit \
  --wiki-root eval/runs/2026-05-19-quality-selfcheck/round4-final/wiki \
  --out-dir eval/runs/2026-05-20-real-retrieval-audit \
  --top-k 5 \
  --queries-per-paper 3 \
  --overwrite
```

Result:

- Audited papers: 14
- Queries run: 42
- Query recall at top-5: 1.000
- Query recall at top-1: 0.929
- Paper full-recall rate: 1.000
- Needs review: FlatQuant evidence/scope query, target rank 4.

Evaluator notes:

- The audit is real over the current canonical wiki, but that wiki currently covers 14 papers, not the full 244-PDF raw Zotero library.
- The FlatQuant warning is a query-generation weakness: common datasets/metrics made the evidence/scope query under-specific.
- Adding full `routing` to retrieval result JSON was necessary so neighbor reasonableness can be evaluated from actual metadata instead of treating every neighbor as unknown.

## Convergence Round 1

Converged.

Rationale:

- The requested real per-paper retrieval audit now exists as a reusable command.
- The current canonical wiki was audited end to end with preserved context packets.
- The result is documented with a clear boundary between raw library size and canonical wiki coverage.
- The only deterministic issue is scoped as a future query-generation improvement rather than a retrieval hard failure.

## Release Round 1

Ready for checkpoint commit after final Arbor process-state replay and git staging.
