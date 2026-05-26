# Skill Health Routing 0.3.2

## Context

`meridian wiki health --wiki-root wiki --repair-plan` reported:

- Health: `usable_with_warnings`
- Score: `87`
- Hard failures: `0`
- Top repair buckets: `knowledge_graph`, `concept_coverage`, `claim_evidence_traceability`, `canonical_linking`

This release treats those findings as product-entry routing issues, not as a
main-wiki content repair pass.

## Changes

- Added health repair triage to the product-facing `wiki` skill.
- Made `wiki-retrieve` prefer `meridian wiki context` over raw retrieve output.
- Added bucket-to-command routing in `wiki-knowledge`.
- Added health-driven concept coverage guidance in `wiki-concept`.
- Added Lab handling for weak wiki context as a repair signal.
- Synced the Codex and Claude Code plugin skill copies.
- Bumped package/plugin version to `0.3.2`.

## Release Boundary

This pass does not modify canonical wiki content. Health reports can identify
repair work, but repairs remain proposal-first and lint-gated.

## Validation Plan

- Unit suite.
- Compileall.
- `git diff --check`.
- Wiki lint/source-audit/catalog.
- Plugin skill copy parity.
- Version surface alignment.

## Validation Evidence

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki`: pass, 2 findings.
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki`: pass, 241 sources, 0 missing, 0 SHA mismatch.
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki`: pass, 237 entries.
- Skill copy parity between `.codex/skills` and both plugin packages: pass.
- Arbor process-state: pass, 35 feature rows, 0 findings.
- AGENTS project-map drift hook: pass, no missing or stale mapped paths.
