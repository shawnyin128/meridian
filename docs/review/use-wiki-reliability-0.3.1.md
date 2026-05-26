# Use Wiki Reliability 0.3.1

## Context

A real `wiki` use trace showed the agent spending effort on incidental
plumbing: finding the Meridian CLI, discovering the active wiki, working around
a bad `wiki/wiki/papers/...` catalog path, and falling back to broad Markdown
search. This release hardens the Use Wiki path without adding a new product
surface.

## Changes

- Added `meridian wiki status` to report active workspace, source root, core
  path, resolver order, PATH availability, and MCP availability.
- Added `meridian wiki context` as the default Use Wiki primitive. It uses the
  active workspace and writes `context.md` / `context.json` under
  `/private/tmp/meridian-context/<slug>/`.
- Retrieval now normalizes legacy `wiki/papers/...` and duplicate
  `wiki/wiki/papers/...` catalog paths.
- Bad or internal catalog records are skipped with warnings instead of failing
  the whole retrieval.
- Empty retrievals now produce an explicit failure report instead of a silent
  zero-result success.
- The `wiki` skill and plugin copies now describe resolver order and the
  context wrapper as the default Use Wiki entry.

## Boundary Decision

`retrieve` remains a lower-level execution primitive for explicit catalog and
path control. Product-facing prompt usage should prefer `context`, because it
binds active workspace discovery, canonical retrieval, temporary output paths,
and failure reporting into one predictable workflow.

## Release Evidence

- Targeted Use Wiki reliability tests: pass.
- Full unit suite: `PYTHONPATH=src python3 -m unittest discover -s tests`
  passed, 135 tests.
- Compile check:
  `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`
  passed.
- `git diff --check`: pass.
- Main wiki gates with repo-local resolver:
  - `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki`: pass with 2 existing findings.
  - `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki`: pass, 241 sources, 0 missing, 0 SHA mismatches, 0 duplicate SHA groups.
  - `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki`: pass, 237 catalog entries.
- Use Wiki smoke:
  `PYTHONPATH=src python3 -m meridian wiki context "what kind of long running agent goal specification makes multi turn execution stable" --wiki-root wiki --top-k 4`
  produced `/private/tmp/meridian-context/.../context.md` and
  `/private/tmp/meridian-context/.../context.json` with 4 canonical results.
- `PYTHONPATH=src python3 -m meridian wiki status --wiki-root wiki`: pass; reports
  repo-local core path, source root, wiki root, PATH availability, and MCP
  availability.
- Codex plugin validation: pass.
- Claude Code plugin validation: pass.
- Arbor process-state: pass, 35 feature rows, 0 findings.
- AGENTS project-map drift hook: pass, no missing or stale mapped paths.

`meridian` is not on PATH in this shell, so release gates used the documented
repo-local fallback `PYTHONPATH=src python3 -m meridian`. The new status command
surfaces that condition directly.
