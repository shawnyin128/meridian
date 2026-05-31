# Meridian Release Packaging

This document defines what belongs in a Meridian Paper Wiki release package and
what must stay local.

## Release Shape

Meridian has two user-facing release surfaces:

1. Codex plugin package: `plugins/codex/meridian/`.
2. Claude Code plugin package: `plugins/claude-code/meridian/`.

The Python package is the shared execution core for CLI primitives and the MCP
stdio server. It is not the product packaging shape by itself.

The user's live `wiki/` is not a distributable product artifact. It is private
state.

## Included

Plugin package roots:

- `plugins/codex/meridian/.codex-plugin/plugin.json`
- `plugins/codex/meridian/.mcp.json`
- `plugins/codex/meridian/skills/meridian/`
- `plugins/codex/meridian/skills/wiki/`
- `plugins/codex/meridian/skills/lab/`
- `plugins/claude-code/meridian/.claude-plugin/plugin.json`
- `plugins/claude-code/meridian/.mcp.json`
- `plugins/claude-code/meridian/skills/meridian/`
- `plugins/claude-code/meridian/skills/wiki/`
- `plugins/claude-code/meridian/skills/lab/`

Marketplace manifests:

- `.agents/plugins/marketplace.json`
- `.claude-plugin/marketplace.json`

Python execution core:

- `src/meridian/`
- `pyproject.toml`
- `VERSION`
- `README.md`
- `MANIFEST.in`

Repository development support skills:

- `.codex/skills/paper-ingest/SKILL.md`
- `.codex/skills/wiki-retrieve/SKILL.md`
- `.codex/skills/wiki-personalize/SKILL.md`
- `.codex/skills/wiki-evolve/SKILL.md`
- `.codex/skills/wiki-knowledge/SKILL.md`
- `.codex/skills/wiki-concept/SKILL.md`

Product skills live only in plugin packages during development too:

- `plugins/codex/meridian/skills/meridian/SKILL.md`
- `plugins/codex/meridian/skills/wiki/SKILL.md`
- `plugins/codex/meridian/skills/lab/SKILL.md`
- `plugins/claude-code/meridian/skills/meridian/SKILL.md`
- `plugins/claude-code/meridian/skills/wiki/SKILL.md`
- `plugins/claude-code/meridian/skills/lab/SKILL.md`

Clean vault template:

- `src/meridian/templates/wiki-vault/`

Research Dev templates:

- `src/meridian/templates/research-dev/`

Minimal product docs:

- `docs/daily-use-walkthrough.md`
- `docs/final-llm-wiki-product-spec.md`
- `docs/lab-system-optimization.md`
- `docs/paper-wiki-release-readiness-checklist.md`
- `docs/research-coding-framework.md`
- `docs/research-dev-state-model.md`
- `docs/research-dev-mvp-plan.md`
- `docs/research-dev-use-cases.md`
- `docs/wiki-entry-demo.md`
- `docs/wiki-mcp-entry-design.md`
- `docs/wiki-mcp-server-setup.md`
- `docs/wiki-product-dataflow-and-artifact-boundaries.md`
- `docs/wiki-product-entry-contract.md`
- `docs/wiki-workspace-config.md`
- `docs/examples/research-dev-idea-card-example.md`
- `docs/examples/research-dev-context-packet-example.md`

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

Install the execution core with an existing Python environment:

```bash
python3 -m pip install -e .
```

That exposes:

```bash
meridian
meridian-mcp
```

Agent users should install the matching plugin package, then start from:

```text
skills/meridian/SKILL.md
skills/wiki/SKILL.md
skills/lab/SKILL.md
```

MCP users should register:

```bash
python3 -m meridian.mcp serve --wiki-root /path/to/wiki
```

For product installs, first initialize a user workspace:

```bash
meridian wiki init --library-root /path/to/paper-wiki-library
python3 -m meridian.mcp serve
```

See `docs/plugin-distribution.md` for Codex and Claude Code registration notes.

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
- release includes `plugins/codex/meridian/.codex-plugin/plugin.json`
- release includes `plugins/claude-code/meridian/.claude-plugin/plugin.json`
- release includes plugin `skills/meridian/SKILL.md`
- release includes plugin `skills/wiki/SKILL.md`
- release includes plugin `skills/lab/SKILL.md`
- release includes `src/meridian/templates/wiki-vault/Map of Content.md`
- release includes `src/meridian/templates/research-dev/thread.md`
- release includes `src/meridian/templates/research-dev/memory.md`
- release includes `src/meridian/templates/research-dev/experiment.md`
- release includes `src/meridian/templates/research-dev/proposal.md`
- release includes `src/meridian/templates/research-dev/wiki-transfer-packet.md`
- release includes `src/meridian/templates/research-dev/research-dev-context-packet.md`
- release excludes `wiki/raw/sources/`
- release excludes `wiki/.drafts/`
- release excludes `eval/runs/`

## Future Packaging Work

If Meridian is published to PyPI, the wheel should remain the execution core.
Codex and Claude Code plugin packages remain the product entrypoints.
