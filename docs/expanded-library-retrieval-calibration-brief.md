# Expanded Library Retrieval Calibration Brief

Date: 2026-05-20

## Scope

This calibration expanded Meridian Paper Wiki from representative samples to the user's real Zotero-derived library at `/Users/shawn/Desktop/我的文库`.

- Input PDFs discovered in case set: 244
- Generated eval cases: 244
- Generated ingest/flow outputs: 244
- Unique managed sources after SHA/source-id deduplication: 237
- Canonical paper pages in the r6 test wiki: 237
- Final run directory: `eval/runs/2026-05-20-expanded-library-r6/`

The 7-count difference between input PDFs and canonical pages is expected deduplication: repeated PDFs resolve to the same managed source identity and canonical page target rather than creating duplicate wiki state.

## Final Verification

Commands executed against the r6 wiki:

```bash
PYTHONPATH=src python3 -m meridian wiki eval eval/runs/2026-05-20-expanded-library/cases.jsonl \
  --out-dir eval/runs/2026-05-20-expanded-library-r6 \
  --mode flow \
  --publish-mode always \
  --rubric eval/rubrics/paper_wiki_quality_v0.md \
  --no-page-images \
  --overwrite

PYTHONPATH=src python3 -m meridian wiki eval-summary eval/runs/2026-05-20-expanded-library-r6/eval_manifest.json
PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root eval/runs/2026-05-20-expanded-library-r6/wiki
PYTHONPATH=src python3 -m meridian wiki lint --wiki-root eval/runs/2026-05-20-expanded-library-r6/wiki
PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root eval/runs/2026-05-20-expanded-library-r6/wiki
PYTHONPATH=src python3 -m meridian wiki retrieval-audit \
  --wiki-root eval/runs/2026-05-20-expanded-library-r6/wiki \
  --out-dir eval/runs/2026-05-20-expanded-library-r6/retrieval-audit-final \
  --top-k 5 \
  --queries-per-paper 3 \
  --overwrite
```

Final source/wiki state:

- Source audit: 237 sources, 0 missing managed files, 0 SHA mismatches, 0 duplicate SHA groups.
- Wiki lint: pass, 237 info findings. The info findings are expected `paper_has_no_wikilinks` style signals because cross-paper concept/entity pages are not part of this calibration target.
- Catalog: 237 paper entries.
- Eval summary: 244 generated, 0 errors, 0 blocking issues. All quality gates remain `warn` because this calibration did not run LLM-as-Judge over all 244 papers.

Final retrieval audit:

- Papers audited: 237
- Queries run: 711
- Query recall@5: 1.000
- Query recall@1: 0.928
- Paper full-recall rate: 1.000
- Average target rank: 1.096
- Metadata-sparse papers: 0
- Decisions: 233 pass, 4 needs_review, 0 fail

The remaining `needs_review` papers all had target recall 1.0. Three warnings are target rank below top 3 for one query, and one warning is a source-quality page whose neighbors intentionally have little routing overlap.

## Problems Found And Fixed

1. Full-library batch extraction needed to avoid mandatory page image rendering.
   - Added `--no-page-images` through `ingest`, `flow`, and `eval`.
   - `extract_pdf` now records extraction options and structural checks accept text-only page extraction when configured.

2. Published test wikis were missing scaffold directories.
   - `publish-run` now initializes the vault scaffold before writing canonical pages.

3. Retrieval audit under-tested method identity in crowded domains.
   - Audit queries now include standalone paper identity in method, implementation, and evidence/scope intents.
   - Evidence queries include a method discriminator so common datasets/metrics do not dominate.

4. Retrieval scoring overweighted shared metadata in dense quantization clusters.
   - Added an exact identity boost for discriminative aliases and title-derived method names.
   - Generic aliases such as `Post-Training`, `Quantization-Aware`, `Outlier-Free`, `Training-Free`, `LLM`, `PTQ`, `QAT`, and `LUT` are not treated as identity anchors.

5. Primary paper detection could select a baseline mention before the actual paper method.
   - Reordered primary detection so exact target methods such as `DuQuant`, `FlatQuant`, `CodeQuant`, and `MoEQuant` win before nearby baselines such as `SmoothQuant`.
   - This fixed DuQuant-style pages where SmoothQuant appeared as related work but was not the paper identity.

6. Paper positioning could inherit unrelated broad-domain evidence cues.
   - Added primary-specific positioning for major quantization methods.
   - Quantization papers now keep evidence routing to bit-width, benchmark, quality, systems/runtime, and mechanism-ablation evidence instead of leaking long-context, agent, or policy-rollout language.

7. Non-LLM clustering papers were contaminated by quantization/LUT topics.
   - Added a non-LLM clustering boundary so concrete k-means/deep clustering pages route to `clustering algorithm`, `clustering theory`, and `clustering theory setting` instead of hardware-aware quantization.

## Retrieval Readiness

The wiki layer is ready for Paper Wiki MVP retrieval over this library in the narrow sense tested here: given realistic paper-specific method/design, implementation/probe, and evidence/scope queries generated from every canonical page, the target page is always recovered within top 5 and usually in top 1.

This does not mean every `paper.md` is semantically deep enough for final research use. The calibration primarily validates source management, canonical page structure, retrieval metadata, routing separation, and lexical/context-packet retrieval. Dense paper understanding still depends on the ingest model quality and future LLM-as-Judge/human calibration rounds.

## Residual Risks

- The large run used `--no-page-images`; visual reasoning over figures/tables was not recalibrated in this loop.
- All 244 generated cases have `quality_gate: warn` because full LLM-as-Judge was intentionally not run.
- `paper_has_no_wikilinks` remains expected until concept/entity/claim pages and cross-links are promoted beyond paper pages.
- Exact duplicate PDFs are deduped by source hash; Zotero-level duplicate semantics or per-attachment annotations are not represented yet.
- Retrieval is still lexical/frontmatter/section based. It is strong for exact method and metadata-rich research queries, but future idea-level retrieval should add semantic/vector or reranking evaluation before claiming broad recall.

## Convergence Decision

Converged for the current F12 goal.

The final full-library run is structurally clean, source-managed, and retrieval-complete at top 5. The changes also fix concrete quality regressions observed during calibration rather than patching one output page by hand.
