# External Paper Wiki Workspace Migration

## Context

The active Paper Wiki workspace had a stale user config pointing at
`/Users/shawn/Desktop/meridian/meridian-wiki.json`. That file was ignored by
git and missing, so product-facing wiki commands could not resolve the active
workspace reliably.

The development repo should contain Meridian code, plugin assets, tests,
templates, and docs. User-generated Paper Wiki sources and canonical vault
artifacts now live outside the repo.

## Migration

- Created external library root:
  `/Users/shawn/Desktop/paper-wiki`
- Copied the local wiki vault to:
  `/Users/shawn/Desktop/paper-wiki/wiki`
- Copied managed sources to:
  `/Users/shawn/Desktop/paper-wiki/sources`
- Registered the external library as the active workspace with:
  `meridian wiki init --library-root /Users/shawn/Desktop/paper-wiki --wiki-root /Users/shawn/Desktop/paper-wiki/wiki --source-root /Users/shawn/Desktop/paper-wiki/sources --overwrite-workspace-config`
- Rewrote migrated source references from repo-local `wiki/raw/sources` paths to
  `/Users/shawn/Desktop/paper-wiki/sources`.
- Removed tracked and ignored `wiki/` artifacts from the Meridian development
  repo.

## Validation Evidence

- `PYTHONPATH=src python3 -m meridian wiki status`: configured, active wiki root
  `/Users/shawn/Desktop/paper-wiki/wiki`.
- `PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: 241 sources, 0 missing, 0 SHA mismatch.
- `PYTHONPATH=src python3 -m meridian wiki lint --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: pass, 0 findings.
- `PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root /Users/shawn/Desktop/paper-wiki/wiki`: 237 entries.
- `PYTHONPATH=src python3 -m meridian wiki context "long-running agent goal task specification stability"`: retrieved 6 canonical wiki pages from the external workspace.

## Release Boundary

The external `/Users/shawn/Desktop/paper-wiki` library is local user data and
should not be committed to the Meridian repo. The repo now ignores `wiki/` to
avoid reintroducing local generated vault artifacts.
