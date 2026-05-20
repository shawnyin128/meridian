# Knowledge Layer Optimization MVP Review

## Context/Test Plan

Goal: move Meridian Paper Wiki beyond a paper dump by making method, topic, claim, evidence, and synthesis pages first-class, auditable, repairable, and retrievable Markdown knowledge artifacts.

Accepted boundaries:

- Markdown remains the source of truth.
- No database, MCP server, UI, or Research Dev Agent work in this feature.
- Large rewrites, merges, contradiction declarations, claim-confidence changes, and source-fact changes stay proposal-only.
- Low-risk structural repairs may be lint-gated and published automatically with revision snapshots.

## Developer Round

Implemented:

- `meridian wiki knowledge-audit`
- `meridian wiki propose-knowledge-repair`
- `meridian wiki knowledge-repair-lint`
- `meridian wiki publish-knowledge-repair`
- knowledge catalogs for `methods`, `topics`, `claims`, and `evidence`
- retrieval v1 inclusion of knowledge-layer pages with `result_type` and `knowledge_role`
- compiled-method routing for method/probe/design queries
- claim/evidence routing for evidence/provenance queries
- source-quality and high-risk repair guards
- docs, skill updates, eval cases, and rubric

Main-wiki repair evidence:

- Before publish: 400 low-information pages, 400 required-section gaps, 400 frontmatter gaps, 0 source-quality misuse.
- Repair proposal: 400 deterministic low-risk repairs, 239 high-risk proposal-only repairs.
- Repair lint: pass.
- Repair publish: 400 applied actions, 0 skipped actions, with snapshots for changed canonical knowledge pages.
- After publish: 239 low-information pages, 239 required-section gaps, 0 frontmatter gaps, 0 source-quality misuse.

Remaining 239 warnings are paper-specific method candidate records. They remain proposal-only because consolidating them into method-family synthesis requires source-aware judgment rather than deterministic formatting.

## Evaluator Round

Adversarial checks added:

- knowledge repair lint rejects a deterministic `declare_contradiction` action.
- retrieval prioritizes compiled method pages over paper-specific method candidate records for implementation/probe queries.
- source-quality hold detection treats source-quality pages as cleanup/provenance artifacts, not scientific evidence.
- compact claim/evidence candidate records are accepted only when they preserve source paper, confidence/review state, candidate id, and provenance.

Smoke checks:

- Method query for post-training quantization implementation hooks returns compiled method pages.
- Evidence/provenance query for KV cache tradeoffs returns claim/evidence records with source paper context.

## Convergence Round

The feature converged on structural knowledge-layer improvement rather than one-off page edits:

- The main wiki now has measurable knowledge-layer health metrics.
- Repair actions are classified into deterministic low-risk versus proposal-only high-risk buckets.
- Publish path is lint-gated and revision-snapshot-backed.
- Retrieval can consume compiled method/topic/claim/evidence pages while suppressing low-quality candidate records for method queries.
- Remaining warnings are explicitly documented as future synthesis/evolution work, not hidden failures.

## Release Round

Release checks run:

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass, 82 tests.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki`: pass, one informational paper-without-wikilinks finding.
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki`: pass, 238 sources, 0 missing, 0 SHA mismatches, 0 duplicate SHA groups.
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki`: pass; paper, synthesis, method, topic, claim, and evidence catalogs written.
- `PYTHONPATH=src python3 -m meridian wiki knowledge-audit --wiki-root wiki`: command pass with expected `warn` status; 0 source-quality misuse, 0 orphan knowledge pages, 0 frontmatter gaps, 239 proposal-only low-information candidate method records.
- knowledge-layer retrieval smoke: pass for compiled method pages and claim/evidence provenance routing.
- Arbor process-state check: pass.
- AGENTS project-map drift hook: pass.

Commit is created after this release round.
