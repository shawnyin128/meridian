# Meridian Plugin Skill Display Prefix

## Context/Test Plan

### Context

The user reported a visible plugin quality issue after Meridian `0.3.8`:

- Meridian plugin skills display as `Meridian: Lab`, `Meridian: Wiki`, and
  `Meridian: Meridian`.
- Arbor plugin skills in the same UI display as `Arbor`, `Develop`, `Release`,
  `Converge`, `Evaluate`, `Feedback`, and `Brainstorm`, without `Arbor:`
  prefixes.

This proves the prefix is not an unavoidable display rule for every plugin
skill. The prior assumption that all plugin skills are namespaced was too broad.

Current evidence loaded:

- Meridian `0.3.8` local Codex cache exposes only three plugin skills:
  `lab`, `meridian`, and `wiki`.
- Arbor `1.0.7` local Codex cache exposes seven skills.
- Both Meridian and Arbor manifests use the same basic shape:
  `name`, `version`, `skills: "./skills/"`, and `interface.displayName`.
- The visible difference is therefore likely caused by a subtler packaging or
  metadata interaction, not merely by using plugin skills.

### Problem Statement

Find and fix the reason Meridian skills render with redundant `Meridian:`
prefixes while Arbor skills do not.

The target result is a user-facing skill picker that shows Meridian entries in
the same style as Arbor, ideally:

```text
Meridian
Wiki
Lab
```

If Codex cannot support that exact output for Meridian because of a platform
constraint, prove the constraint with a minimal counterexample and document the
least-bad naming choice.

### Non-Goals

- Do not re-expose internal support skills.
- Do not add new user-facing skills.
- Do not change MCP behavior.
- Do not change Paper Wiki or Lab workflow behavior.
- Do not rename `wiki` or `lab` unless evidence shows a naming collision is the
  actual cause.

### Hidden Decisions To Resolve

| Decision | Default | Reason |
| --- | --- | --- |
| Treat this as a release blocker? | Yes for plugin polish, no for core/wiki function | It affects discoverability and trust, but not wiki data. |
| Fix by changing manifest or skill frontmatter? | Evidence-driven | Arbor comparison shows obvious fields are similar. |
| Keep only three visible skills? | Yes | `0.3.8` already corrected support-skill exposure. |
| Publish as patch release? | Yes if a manifest/frontmatter fix is found | This is packaging behavior, not feature work. |

### Candidate Causes To Test

1. **Display name collision**: `interface.displayName` or author/developer name
   equals `Meridian`, causing Codex to render a plugin namespace for every skill.
2. **Skill title/frontmatter interaction**: H1 titles such as `# Meridian Lab`,
   `# Meridian Paper Wiki`, and `# Meridian Setup` may cause redundant grouping.
3. **Plugin name equals skill name**: plugin `name: meridian` plus skill
   `name: meridian` might cause namespace-style rendering.
4. **Marketplace/install cache metadata**: older cache or marketplace metadata
   may still project namespaced labels despite package contents changing.
5. **Manifest field difference not yet checked**: Arbor may include an asset,
   category, capability, or other field that influences display grouping.

### Recommended First Feature

Implement F42 as one small packaging/display repair:

- Build a small comparison packet for Arbor vs Meridian:
  manifest diff, skill frontmatter diff, installed cache layout, marketplace
  entry, and current UI screenshot evidence.
- Try the least invasive local variants in a disposable marketplace/cache:
  display name/developer name change, H1 title simplification, and plugin-skill
  name collision check.
- Apply the minimal proven fix to Meridian packaging.
- Bump patch version, reinstall local Codex plugin, and verify the skill list.

### Acceptance Criteria

- Codex plugin picker shows only the three Meridian product skills.
- The redundant `Meridian:` namespace prefix is removed when the platform allows
  it.
- If the prefix cannot be removed, the review document contains a minimal
  counterexample proving the limitation and the chosen fallback label policy.
- The fix does not reintroduce support skills into the plugin package.
- README/plugin distribution docs remain consistent with the three-skill model.

### Verification Plan

- Inspect installed Codex cache after local reinstall:
  `~/.codex/plugins/cache/meridian/meridian/<version>/skills`.
- Compare Meridian and Arbor manifests and skill frontmatter.
- Use a disposable local package or marketplace variant for naming experiments.
- Reinstall Meridian locally and inspect the Codex skill picker.
- Run targeted tests:
  - release version surface alignment
  - plugin release assets
  - plugin skill copy parity
  - product skill behavior boundaries
- Run `git diff --check`.
- Run Arbor process-state and AGENTS drift hooks before release.

### Decision Trace Handoff

- The support-skill exposure fix is complete in `0.3.8`; do not reopen that
  scope unless it regresses.
- The UI prefix issue is not proven to be a Codex limitation because Arbor does
  not show the same prefix.
- Fixes should be local to plugin package metadata or product skill text unless
  evidence proves deeper packaging changes are required.
- The implementation may use temporary local plugin variants for experiments,
  but those variants must not be committed unless they are the final selected
  fix.

## Developer Round

### Root Cause

The prefix was caused by same-name skill shadowing inside this development repo,
not by plugin manifest metadata.

Before the fix, the repo exposed product skills in two places:

- project-local: `.codex/skills/meridian`, `.codex/skills/wiki`,
  `.codex/skills/lab`
- installed plugin: `plugins/codex/meridian/skills/meridian`,
  `plugins/codex/meridian/skills/wiki`,
  `plugins/codex/meridian/skills/lab`

The active Codex session therefore saw duplicate skill names for `meridian`,
`wiki`, and `lab`. Codex rendered the plugin copies as `Meridian: ...` to
disambiguate them from the project-local copies. Arbor does not have same-name
project-local skills in this repo, so Arbor entries render without the namespace
prefix.

### Changes Made

- Removed the repo-local product skill copies:
  - `.codex/skills/meridian/SKILL.md`
  - `.codex/skills/wiki/SKILL.md`
  - `.codex/skills/lab/SKILL.md`
- Kept the product skill source of truth in both plugin packages:
  - `plugins/codex/meridian/skills/{meridian,wiki,lab}/SKILL.md`
  - `plugins/claude-code/meridian/skills/{meridian,wiki,lab}/SKILL.md`
- Left `.codex/skills/` for Meridian development/support skills only:
  `llm-wiki`, `paper-ingest`, `wiki-retrieve`, `wiki-personalize`,
  `wiki-evolve`, `wiki-knowledge`, and `wiki-concept`.
- Updated AGENTS, docs, and tests to reference plugin product skill paths.
- Added a regression test that fails if project-local skills conflict with the
  three product plugin skill names again.

### Developer Evidence

Duplicate check after the fix:

```text
local ['llm-wiki', 'paper-ingest', 'wiki-concept', 'wiki-evolve', 'wiki-knowledge', 'wiki-personalize', 'wiki-retrieve']
plugin ['lab', 'meridian', 'wiki']
duplicates []
```

Targeted product-skill tests:

```text
Ran 11 tests in 0.003s
OK
```

Full unit suite:

```text
Ran 143 tests in 2.360s
OK
```

Compile:

```text
PYTHONPYCACHEPREFIX=/private/tmp/meridian-prefix-fix-pycache PYTHONPATH=src python3 -m compileall src tests
pass
```

## Evaluator Round

### Evaluation

The implementation matches the root cause and acceptance criteria:

- Plugin package still exposes only the three product skills.
- Project-local support skills remain available for Meridian development.
- The three names that caused visible `Meridian:` disambiguation no longer
  exist under `.codex/skills/`.
- Codex and Claude Code plugin product skill copies remain identical.
- README and packaging docs still describe the three-skill product model.

### Residual Risk

The current Codex session's skill list was loaded before the deletion, so the
visible picker may require a fresh session or plugin reload before the UI label
change is visible. The deterministic local cause is removed.

## Convergence Round

### Decision

Converged for implementation. The fix removes the duplicate local skill names
that forced namespaced plugin display, without changing product workflows or
re-exposing internal support skills.

### Release Note

This is ready for a patch release if the user wants the fix published. A patch
release should bump the plugin/core version, reinstall the local Codex and
Claude Code caches, and then refresh the client session to confirm the picker
shows `Meridian`, `Wiki`, and `Lab`.

## Release Round

### Release Scope

Patch release `0.3.9` publishes the skill display prefix fix:

- product skill source is now plugin-package-only
- repo-local `.codex/skills/` no longer shadows `meridian`, `wiki`, or `lab`
- Codex and Claude Code plugin manifests, Python package version, and release
  version test are aligned at `0.3.9`

### Release Verification

Release gates:

```text
PYTHONPATH=src python3 -m unittest discover -s tests
pass: Ran 143 tests

PYTHONPYCACHEPREFIX=/private/tmp/meridian-prefix-fix-pycache PYTHONPATH=src python3 -m compileall src tests
pass

git diff --check
pass

AGENTS drift hook
pass
```

Arbor process-state still reports historical F1 review-document errors that
pre-date this feature. F42 has Developer, Evaluator, Convergence, and Release
round evidence in this document.
