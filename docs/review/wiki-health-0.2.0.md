# Wiki Health 0.2.0

## Context

The Paper Wiki had many specialized checks, but no single product answer to:

- Is this wiki usable now?
- Can I trust the source boundaries?
- What should I fix next?

0.2.0 adds deterministic wiki health scoring and an insight-first report.

## Implementation

- Added `meridian wiki health`.
- Added JSON, Markdown, and HTML health reports.
- Added five summary dimensions with expandable subdimension scores:
  `Trust`, `Surface`, `Context`, `Graph`, `Growth`.
- Added deterministic hard failures and repair queue.
- Updated MCP `meridian.audit` to return compact health instead of only command
  pointers.
- Bumped release version to `0.2.0`.

## Release Evidence

- `PYTHONPATH=src python3 -m unittest discover -s tests`: pass, 127 tests.
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests`: pass.
- `git diff --check`: pass.
- Codex plugin validation: pass.
- Claude Code plugin validation: pass.
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root wiki`: pass, 2 findings.
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root wiki`: pass, 241 sources, 0 missing, 0 SHA mismatches, 0 duplicate SHA groups.
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root wiki`: pass, 237 entries.
- `PYTHONPATH=src python3 -m meridian wiki health --wiki-root wiki --repair-plan`: pass, `usable_with_warnings`, score 87, 0 hard failures.
- Arbor process-state check: pass.
- AGENTS project-map drift hook: pass.
