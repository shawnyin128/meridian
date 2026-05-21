# Meridian Release Packaging

This document defines what belongs in a Meridian Paper Wiki release package and
what must stay local.

## Release Shape

Meridian has two release surfaces:

1. Python package: installable CLI and MCP execution core.
2. Source/repo bundle: prompt skills, docs, representative evals, and a clean
   vault template.

The user's live `wiki/` is not a distributable product artifact. It is private
state.

## Included

Python execution core:

- `src/meridian/`
- `pyproject.toml`
- `README.md`
- `MANIFEST.in`

Product prompt entry:

- `.codex/skills/meridian-paper-wiki/SKILL.md`

Internal support skills:

- `.codex/skills/llm-wiki/SKILL.md`
- `.codex/skills/paper-ingest/SKILL.md`
- `.codex/skills/wiki-retrieve/SKILL.md`
- `.codex/skills/wiki-personalize/SKILL.md`
- `.codex/skills/wiki-evolve/SKILL.md`
- `.codex/skills/wiki-knowledge/SKILL.md`
- `.codex/skills/wiki-concept/SKILL.md`

Clean vault template:

- `src/meridian/templates/wiki-vault/`

Minimal product docs:

- `docs/daily-use-walkthrough.md`
- `docs/final-llm-wiki-product-spec.md`
- `docs/paper-wiki-release-readiness-checklist.md`
- `docs/wiki-entry-demo.md`
- `docs/wiki-mcp-entry-design.md`
- `docs/wiki-mcp-server-setup.md`
- `docs/wiki-product-dataflow-and-artifact-boundaries.md`
- `docs/wiki-product-entry-contract.md`

Representative evaluation assets:

- `eval/cases/*.jsonl`
- `eval/rubrics/*.md`

## Excluded

Private or generated state:

- `wiki/`
- `wiki/raw/sources/`
- `wiki/.drafts/`
- `wiki/.versions/`
- `wiki/.index/`
- `eval/runs/`
- `.arbor/`
- `.git/`
- Python caches

The release package must not contain the user's managed PDFs, personal paper
pages, reading insights, draft judge packets, extraction images, or historical
eval run artifacts.

## Install And Entry Points

Package install should expose:

```bash
meridian
meridian-mcp
```

Prompt/Skill users should start with:

```text
.codex/skills/meridian-paper-wiki/SKILL.md
```

MCP users should register:

```bash
python3 -m meridian.mcp serve --wiki-root /path/to/wiki
```

## Packaging Smoke

Before release:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests
git diff --check
PYTHONPATH=src python3 -m meridian wiki init --wiki-root /private/tmp/meridian-release-wiki
PYTHONPATH=src python3 -m meridian.mcp capabilities --detail full
```

Then inspect the file list produced by the release build or source archive:

- release includes `src/meridian/`
- release includes `.codex/skills/meridian-paper-wiki/SKILL.md`
- release includes `src/meridian/templates/wiki-vault/Map of Content.md`
- release excludes `wiki/raw/sources/`
- release excludes `wiki/.drafts/`
- release excludes `eval/runs/`

## Future Packaging Work

The current release boundary is source-bundle friendly. If Meridian is published
to PyPI, the wheel should remain the execution core, while prompt skills and
vault templates may be shipped as package data or as a companion source bundle.
