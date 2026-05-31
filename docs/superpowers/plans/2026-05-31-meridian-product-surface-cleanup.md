# Meridian Product Surface Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Meridian's published product surface around `meridian`, `wiki`, and `lab`, then make install/update/MCP readiness guidance consistent.

**Architecture:** This is a release-surface cleanup, not a new feature. Keep edits to active docs, plugin manifests, product skills, eval/rubric text, and tests that guard the user-facing boundary.

**Tech Stack:** Markdown docs, Codex and Claude Code plugin manifests, Meridian skill Markdown, Python `unittest` release-surface tests.

---

## File Structure

- Modify `README.md`: keep public product wording and install/update commands concise and consistent.
- Modify `.claude-plugin/marketplace.json`: remove "research-coding copilot" phrasing.
- Modify `docs/plugin-distribution.md`: match README install/update commands and clarify core/plugin/MCP update layers.
- Modify `docs/full-system-architecture.md`: ensure current architecture names Lab idea graph and external coding workflows.
- Modify `docs/full-system-architecture.html`: remove current-facing Research Dev Agent labels from the visual page.
- Modify `docs/research-coding-framework.md`: mark old development-agent content as legacy background and avoid current-product wording.
- Modify `eval/rubrics/research_dev_*.md` and any active `eval/cases/research_dev_*.jsonl` intro fields only where they present Research Dev as the current product name.
- Modify `plugins/codex/meridian/skills/meridian/SKILL.md` and `plugins/claude-code/meridian/skills/meridian/SKILL.md`: clarify setup checks report core/plugin/MCP version and path drift.
- Modify `tests/test_cli.py`: add release-surface assertions for marketplace tagline, docs command consistency, and current Lab boundary wording.
- Create `docs/review/meridian-product-surface-cleanup-0.4.2.md`: record context, changes, verification, and residuals.
- Modify version surfaces if releasing as patch: `VERSION`, `pyproject.toml`, `src/meridian/__init__.py`, both plugin manifests, and `tests/test_cli.py`.

## Task 1: Add Release-Surface Regression Tests

**Files:**
- Modify: `tests/test_cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Add assertions to existing release-surface tests**

Add checks near the existing product skill or plugin release tests:

```python
def test_plugin_marketplace_taglines_match_lab_boundary(self) -> None:
    codex_marketplace = json.loads(Path(".agents/plugins/marketplace.json").read_text(encoding="utf-8"))
    claude_marketplace = json.loads(Path(".claude-plugin/marketplace.json").read_text(encoding="utf-8"))
    claude_description = claude_marketplace["plugins"][0]["description"]

    self.assertEqual(codex_marketplace["name"], "meridian")
    self.assertIn("Paper Wiki", claude_description)
    self.assertIn("Lab", claude_description)
    self.assertNotIn("research-coding copilot", claude_description)
    self.assertNotIn("Research Dev Agent", claude_description)


def test_install_update_docs_use_consistent_plugin_commands(self) -> None:
    readme = Path("README.md").read_text(encoding="utf-8")
    distribution = Path("docs/plugin-distribution.md").read_text(encoding="utf-8")

    expected_codex_remove = "codex plugin remove meridian@meridian"
    expected_claude_update = "claude plugin update meridian@meridian"
    self.assertIn(expected_codex_remove, readme)
    self.assertIn(expected_codex_remove, distribution)
    self.assertIn(expected_claude_update, readme)
    self.assertIn(expected_claude_update, distribution)
    self.assertNotIn("codex plugin remove meridian\n", distribution)
    self.assertNotIn("claude plugin update meridian\n", distribution)
```

- [ ] **Step 2: Run targeted tests and verify failure before edits**

Run:

```bash
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_plugin_marketplace_taglines_match_lab_boundary \
  tests.test_cli.CliTests.test_install_update_docs_use_consistent_plugin_commands
```

Expected: fail before implementation because the Claude marketplace and distribution doc still use stale wording or command forms.

## Task 2: Clean Published Product Mindset

**Files:**
- Modify: `README.md`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `docs/full-system-architecture.md`
- Modify: `docs/full-system-architecture.html`
- Modify: `docs/research-coding-framework.md`
- Modify: active `eval/rubrics/research_dev_*.md` and `eval/cases/research_dev_*.jsonl` wording only where needed

- [ ] **Step 1: Update user-facing descriptions**

Use these exact product terms:

```text
Paper Wiki: durable compiled paper knowledge.
Lab: research idea graph management with Paper Wiki grounding.
Normal coding workflow: implementation, debugging, tests, commits, release, and convergence.
```

Remove current-facing phrases:

```text
research-coding copilot
Research Dev Agent
agentic development plugin
```

Keep historical review docs unchanged.

- [ ] **Step 2: Update HTML architecture current labels**

In `docs/full-system-architecture.html`, replace current-facing visible labels:

```text
Research Dev Agent -> Lab Idea Graph
agentic product -> idea graph product
Research Dev Boundary -> Lab Boundary
```

If a section describes adaptive code execution, label it as external normal coding workflow rather than Lab-owned behavior.

- [ ] **Step 3: Re-run the tagline test**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_plugin_marketplace_taglines_match_lab_boundary
```

Expected: pass.

## Task 3: Align Install, Update, And MCP Readiness Guidance

**Files:**
- Modify: `README.md`
- Modify: `docs/plugin-distribution.md`
- Modify: `plugins/codex/meridian/skills/meridian/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/meridian/SKILL.md`

- [ ] **Step 1: Make command forms identical**

Use these command forms in both README and distribution docs:

```bash
codex plugin marketplace add shawnyin128/meridian --sparse .agents/plugins --sparse plugins/codex/meridian
codex plugin add meridian@meridian
codex plugin marketplace upgrade meridian
codex plugin remove meridian@meridian
codex plugin add meridian@meridian
claude plugin marketplace add shawnyin128/meridian --sparse .claude-plugin plugins/claude-code/meridian
claude plugin install meridian@meridian
claude plugin update meridian@meridian
```

- [ ] **Step 2: Clarify MCP import path behavior**

Add wording to README and `docs/plugin-distribution.md`:

```text
The plugin MCP config starts `python3 -m meridian.mcp serve`. That process uses the `meridian` Python package importable in the client environment. If MCP behavior looks stale after a plugin update, update the core checkout with `git pull`, then rerun `python3 -m pip install -e .` from that checkout.
```

- [ ] **Step 3: Clarify setup skill status output**

In both product copies of `skills/meridian/SKILL.md`, ensure Status Check asks for:

```text
- Check the Python core version and path with `python3 -m meridian --version` and `python3 -m meridian wiki status`.
- Check MCP readiness with `python3 -m meridian.mcp --help` or a capabilities smoke, and report stale behavior as possible core/plugin drift.
```

- [ ] **Step 4: Re-run command consistency test**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_install_update_docs_use_consistent_plugin_commands
```

Expected: pass.

## Task 4: Patch Version And Review Evidence

**Files:**
- Modify: `VERSION`
- Modify: `pyproject.toml`
- Modify: `src/meridian/__init__.py`
- Modify: `plugins/codex/meridian/.codex-plugin/plugin.json`
- Modify: `plugins/claude-code/meridian/.claude-plugin/plugin.json`
- Modify: `tests/test_cli.py`
- Create: `docs/review/meridian-product-surface-cleanup-0.4.2.md`

- [ ] **Step 1: Bump release version**

Set all version surfaces to:

```text
0.4.2
```

Update `test_release_version_surfaces_are_aligned` expected version to `0.4.2`.

- [ ] **Step 2: Write review doc**

Create `docs/review/meridian-product-surface-cleanup-0.4.2.md` with sections:

```markdown
# Meridian Product Surface Cleanup 0.4.2

Feature: Product surface cleanup after Lab idea-graph refocus
Status: implemented
Date: 2026-05-31

## Context / Test Plan

## Developer Evidence

## Evaluator Evidence

## Convergence Decision
```

Record that framework-check automation was intentionally not expanded.

## Task 5: Full Verification And Release

**Files:**
- No planned source edits unless verification finds a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_release_version_surfaces_are_aligned \
  tests.test_cli.CliTests.test_plugin_marketplace_taglines_match_lab_boundary \
  tests.test_cli.CliTests.test_install_update_docs_use_consistent_plugin_commands \
  tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills \
  tests.test_cli.CliTests.test_meridian_product_skill_behavior_boundaries
```

Expected: pass.

- [ ] **Step 2: Run full release checks**

Run:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-product-surface-pycache PYTHONPATH=src python3 -m compileall src tests
git diff --check
PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki
```

Expected: all pass. If the full unit suite refreshes generated doc artifacts, restore unrelated generated artifacts before committing.

- [ ] **Step 3: Commit and tag**

Run:

```bash
git status --short --untracked-files=all
git add <changed-files>
git commit -m "fix: align meridian product surface docs"
git tag v0.4.2
git push origin master --tags
```

Expected: commit and tag pushed; worktree clean.

- [ ] **Step 4: Update local plugin caches**

Run:

```bash
codex plugin marketplace upgrade meridian
codex plugin remove meridian@meridian
codex plugin add meridian@meridian
claude plugin update meridian@meridian
```

Expected: both local clients show Meridian `0.4.2`; Claude may require reload or restart.

## Self-Review

- Spec coverage: the plan covers publish mindset cleanup, install/update/MCP readiness guidance, no Lab MCP, no broad auditor, tests, and patch release.
- Placeholder scan: no TBD/TODO placeholders remain.
- Scope check: the plan is one patch-sized release-surface cleanup and does not attempt framework-check expansion.
