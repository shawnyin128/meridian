# Meridian Lab Skill Discovery 0.4.4

## Context/Test Plan

The user reported that the Meridian plugin picker showed `Meridian` and `Wiki`
but did not show `Lab`.

Loaded evidence:

- The source plugin package contains `plugins/codex/meridian/skills/lab/SKILL.md`.
- The installed Codex cache for `0.4.3` also contains `skills/lab/SKILL.md`.
- `meridian` and `wiki` frontmatter parse as YAML, but `lab` frontmatter fails
  with `mapping values are not allowed in this context`.

Acceptance criteria:

- `lab` skill frontmatter parses with the same YAML loader behavior as
  `meridian` and `wiki`.
- Codex and Claude Code plugin skill copies remain identical.
- A regression test catches future plugin skill frontmatter that can be skipped
  by strict YAML loaders.
- Patch version is bumped so plugin users can update to the fixed package.

## Developer Round

Root cause:

- `lab` used an unquoted YAML description containing `idea graph: place`.
- The `: ` sequence inside an unquoted plain scalar is interpreted as a mapping
  separator by strict YAML loaders, so the skill metadata parse fails.
- Because the metadata parse fails, the plugin loader can skip the `lab` skill
  even though the file exists in both the source package and installed cache.

Changes made:

- Quoted the `lab` skill `description` in both Codex and Claude Code plugin
  packages.
- Added `test_meridian_plugin_skill_frontmatter_is_loader_safe`, which checks
  all product plugin skill frontmatter and requires descriptions containing
  `: ` to be quoted.
- Bumped Meridian from `0.4.3` to `0.4.4`.

Developer evidence:

```text
ruby YAML parse:
meridian: OK meridian
wiki: OK wiki
lab: OK lab
```

```text
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills \
  tests.test_cli.CliTests.test_meridian_plugin_skill_frontmatter_is_loader_safe \
  tests.test_cli.CliTests.test_meridian_product_skill_behavior_boundaries

Ran 3 tests in 0.006s
OK
```

## Evaluator Round

The fix addresses the actual read-chain defect rather than a cache or package
presence issue:

- Source package: `lab/SKILL.md` exists and has parseable frontmatter.
- Published plugin copies: Codex and Claude Code skill files match.
- Regression coverage now checks the class of bug that made `lab` disappear.

Residual risk:

- The current Codex or Claude Code UI may need plugin update/restart to reload
  the newly parseable `0.4.4` package.

Evaluator evidence:

```text
PYTHONPATH=src python3 -m unittest discover -s tests
Ran 153 tests
OK
```

```text
PYTHONPYCACHEPREFIX=/private/tmp/meridian-pycache PYTHONPATH=src python3 -m compileall src tests
pass
```

```text
git diff --check
pass
```

```text
PYTHONPATH=src python3 -m meridian wiki lint --wiki-root /Users/shawn/Desktop/paper-wiki/wiki
Wiki lint status: pass
Findings: 6
```

```text
PYTHONPATH=src python3 -m meridian wiki source-audit --wiki-root /Users/shawn/Desktop/paper-wiki/wiki
Missing managed files: 0
SHA mismatches: 0
Duplicate SHA groups: 0
```

```text
PYTHONPATH=src python3 -m meridian wiki catalog --wiki-root /Users/shawn/Desktop/paper-wiki/wiki
Catalog entries: 243
```

```text
PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki
Framework status: pass
Categories: 7 pass, 0 warn, 0 fail
```

AGENTS project-map drift hook passed. Arbor process-state still reports older
workflow metadata residuals for F1/F37; those findings predate this fix and do
not point to the Lab skill discovery change.

## Convergence Round

The bug is converged for implementation. The `lab` skill discovery failure was
caused by invalid YAML frontmatter, not a missing file, not an absent manifest
entry, and not the older namespace-prefix issue.
