# Ingest Auto-Commit 0.1.2

## Context

After an ingest, canonical wiki files could remain as unstaged worktree changes.
That made a successful `wiki` update look unfinished and required the user or
agent to manually decide what to commit.

## Design

0.1.2 adds a scoped runtime auto-commit for successful ingest workflows:

- `meridian wiki ingest`
- `meridian wiki ingest-folder`
- `meridian wiki flow`

The commit is created only when the target wiki is inside a git repository.
The commit includes the current ingest's generated artifact paths: canonical
page, index/log, catalog JSONL files, vault templates, managed source artifacts
when not ignored, and the ingest run directory when not ignored.

The helper intentionally skips:

- paths outside the git repository
- ignored paths
- paths that were already dirty before the ingest started

This avoids mixing unrelated user edits into an auto-generated ingest commit.
Advanced users can pass `--no-auto-commit`.

## Evidence Plan

- Unit test that a published ingest in a fresh git repo creates a commit and
  leaves the repo clean.
- Existing ingest product-output tests continue to pass.
- Version surfaces align at `0.1.2`.
- Full unit suite, compileall, diff check, plugin validation, and wiki gates.

## Release Evidence

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass, 125 tests.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- Codex plugin validation: pass.
- Claude Code plugin validation: pass.
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki`: pass, 2 info findings.
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki`: pass, 241 sources, 0 missing, 0 SHA mismatch.
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki`: pass, 237 paper catalog entries.
- Arbor process-state check: pass.
- AGENTS project-map drift hook: pass.
