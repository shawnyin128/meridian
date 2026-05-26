# User Insight Internalization 0.3.0

## Context

The previous personalization path preserved user notes safely, but published
them mostly as `## User Insights` append-only annotations. That was auditable
but weak for retrieval, idea generation, and experiment planning because the
canonical paper interpretation did not change.

0.3.0 changes the default publish semantics: raw user notes remain preserved,
but linted insights are internalized into non-source-fact canonical sections.

## Implementation

- Extended `insight.json` with `internalization_targets`.
- Added target fields: `target_section`, `update_type`, `source_boundary`,
  `requires_source_recheck`, and `provenance_note_id`.
- Updated `add-insight` drafts to render Raw User Note, Internalization Targets,
  Proposed Canonical Updates, Source Fact Boundary, Retrieval Impact, and Source
  Re-check Needed.
- Updated `insight-lint` to require internalization targets, explicit source
  boundaries, valid update types, provenance IDs, and source re-check for source
  fact correction requests.
- Updated `publish-insight` to write non-source-fact canonical interpretation
  sections while preserving raw note provenance and legacy User Insights audit
  entries.
- Updated retrieval metadata so internalized personalized content is marked
  `user_interpretation`, `not_paper_source_fact`, and linked to matched insight
  IDs when available.
- Bumped package and plugin versions to `0.3.0`.

## Boundary Decision

Source-grounded sections are not rewritten from user input alone. If the user
says a source-grounded claim is wrong or missing, Meridian publishes a
source-fact correction request under non-source-fact interpretation/uncertainty
sections and requires source re-check before any fact rewrite.

## Release Evidence

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass, 129 tests.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki`: pass with 2 existing findings.
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki`: pass, 241 sources, 0 missing, 0 SHA mismatches, 0 duplicate SHA groups.
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki`: pass, 237 catalog entries.
- Codex plugin validation: pass.
- Claude Code plugin validation: pass.
- `PYTHONPATH=src python3 -m meridian --version`: `meridian 0.3.0`.
- Arbor process-state: pass, 35 feature rows, 0 findings.
- AGENTS project-map drift hook: pass, no missing or stale mapped paths.

Targeted insight tests cover internalization target creation, lint failure for
source-fact contamination, source re-check requirements, publish behavior, raw
note provenance preservation, and retrieval metadata for internalized
personalized content.
