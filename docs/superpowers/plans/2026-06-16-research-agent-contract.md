# Research Agent Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Meridian 0.6.2 research-agent contract support: user-level principles, guarded `AGENTS.md` injection, Lab implementation-integrity grounding, code-style distillation, and realistic Codex eval coverage.

**Architecture:** Add a focused `meridian.lab.research_agent_contract` module for user-level reference files and project `AGENTS.md` block management. Keep `coding-style.md` as the compact Lab injection profile, and let Lab skills/templates consume both the compact profile and the detailed research-agent contract. Extend eval assets and live Codex eval schema only for test/debug rationale; normal skill behavior remains concise.

**Tech Stack:** Python stdlib, Markdown templates, existing `unittest` suite in `tests/test_cli.py`, existing Codex eval harness in `src/meridian/evals/codex_routing.py`, Codex/Claude plugin skill Markdown.

---

## File Structure

- Create `src/meridian/lab/research_agent_contract.py`
  Owns `~/.meridian/research-agent-principles.md`, validation/migration, and guarded project `AGENTS.md` injection.
- Modify `src/meridian/lab/__init__.py`
  Exports research-agent contract helpers.
- Modify `src/meridian/lab/coding_style.py`
  Points the starter coding-style profile to the detailed research-agent principles reference.
- Modify `src/meridian/lab/state.py`
  Calls the guarded `AGENTS.md` injection during Lab space initialization.
- Modify `src/meridian/framework_check.py`
  Reports both compact coding-style profile state and detailed research-agent principles state.
- Modify `src/meridian/templates/research-dev/research-grounding-injection.md`
  Adds `Implementation Integrity Gate`.
- Modify `plugins/codex/meridian/skills/meridian/SKILL.md`
  Documents setup/status/migration responsibilities for the new principles file and `AGENTS.md` block.
- Modify `plugins/claude-code/meridian/skills/meridian/SKILL.md`
  Keep the Claude copy synchronized.
- Modify `plugins/codex/meridian/skills/lab/SKILL.md`
  Adds Implementation Integrity Gate and Code Style Distillation workflow.
- Modify `plugins/claude-code/meridian/skills/lab/SKILL.md`
  Keep the Claude copy synchronized.
- Modify `docs/research-dev-use-cases.md`
  Documents integrity gate and style distillation scenarios.
- Modify `docs/research-dev-state-model.md`
  Documents Lab init `AGENTS.md` contract and Research Grounding Injection integrity section.
- Create `eval/cases/research_agent_contract.jsonl`
  Deterministic scenario cases for style, fallback, blocker, and distillation behavior.
- Create `eval/rubrics/research_agent_contract_quality.md`
  Rubric for deterministic and live checks.
- Create `eval/cases/research_agent_contract_live.jsonl`
  Live Codex cases with at least ten positive contract activations and negative stability cases.
- Modify `src/meridian/evals/codex_routing.py`
  Adds contract-specific live eval schema, prompt, scoring, and report rendering.
- Modify `src/meridian/cli.py`
  Adds `meridian eval codex-research-agent-contract`.
- Modify `tests/test_cli.py`
  Adds targeted unit/static/eval tests and updates existing Lab initialization expectations.
- Modify version surfaces only in the release task:
  `VERSION`, `pyproject.toml`, `src/meridian/__init__.py`, plugin manifests, release tests.

---

### Task 1: User-Level Research Agent Contract Helpers

**Files:**
- Create: `src/meridian/lab/research_agent_contract.py`
- Modify: `src/meridian/lab/__init__.py`
- Modify: `src/meridian/lab/coding_style.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing tests for principles init, validation, migration, and profile cross-link**

Add this test near the existing coding-style profile tests in `tests/test_cli.py`:

```python
    def test_research_agent_principles_init_migrate_and_validate(self) -> None:
        from meridian.lab import (
            RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION,
            initialize_research_agent_principles,
            migrate_research_agent_principles,
            research_agent_principles_path,
            validate_research_agent_principles,
        )

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            target = research_agent_principles_path(config_home=config_home)
            self.assertEqual(target, (config_home / "research-agent-principles.md").resolve())

            written = initialize_research_agent_principles(config_home=config_home)
            self.assertEqual(written, target)
            text = written.read_text(encoding="utf-8")
            self.assertIn(f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}", text)
            self.assertIn("Implementation Integrity", text)
            self.assertIn("Do not silently substitute", text)
            self.assertIn("Prefer linear, readable code", text)
            self.assertNotIn("```python", text)
            self.assertEqual(validate_research_agent_principles(written).status, "pass")

            old = config_home / "old-principles.md"
            old.write_text("# Existing Principles\n\nUser text stays.\n", encoding="utf-8")
            migrated = migrate_research_agent_principles(path=old)
            migrated_text = migrated.read_text(encoding="utf-8")
            self.assertIn("User text stays.", migrated_text)
            self.assertIn(f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}", migrated_text)
            self.assertIn("## Implementation Integrity", migrated_text)
            self.assertIn("## Research Code Style", migrated_text)

    def test_coding_style_profile_points_to_research_agent_principles(self) -> None:
        from meridian.lab import initialize_coding_style_profile

        with tempfile.TemporaryDirectory() as tmp:
            profile = initialize_coding_style_profile(config_home=Path(tmp))
            text = profile.read_text(encoding="utf-8")
            self.assertIn("research-agent-principles.md", text)
            self.assertIn("compact", text.lower())
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_research_agent_principles_init_migrate_and_validate tests/test_cli.py::CliTests::test_coding_style_profile_points_to_research_agent_principles -q
```

Expected: the first test fails because the exported helpers do not exist; the second fails because the starter profile does not mention `research-agent-principles.md`.

- [ ] **Step 3: Add `src/meridian/lab/research_agent_contract.py`**

Create the module with this implementation:

```python
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION = "meridian.research_agent_principles.v1"
RESEARCH_AGENT_PRINCIPLES_FILENAME = "research-agent-principles.md"


@dataclass(frozen=True)
class ResearchAgentContractFinding:
    severity: str
    code: str
    path: str
    message: str


@dataclass(frozen=True)
class ResearchAgentContractReport:
    status: str
    path: str
    findings: list[ResearchAgentContractFinding]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "path": self.path,
            "findings": [
                {
                    "severity": finding.severity,
                    "code": finding.code,
                    "path": finding.path,
                    "message": finding.message,
                }
                for finding in self.findings
            ],
        }


def research_agent_config_home(config_home: Path | None = None) -> Path:
    if config_home is not None:
        return config_home.expanduser().resolve()
    env_home = os.environ.get("MERIDIAN_CONFIG_HOME")
    if env_home:
        return Path(env_home).expanduser().resolve()
    return Path.home().expanduser().resolve() / ".meridian"


def research_agent_principles_path(*, config_home: Path | None = None) -> Path:
    return research_agent_config_home(config_home) / RESEARCH_AGENT_PRINCIPLES_FILENAME


def initialize_research_agent_principles(
    *,
    config_home: Path | None = None,
    path: Path | None = None,
    overwrite: bool = False,
) -> Path:
    target = (path or research_agent_principles_path(config_home=config_home)).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and not overwrite:
        return target
    target.write_text(_starter_principles(), encoding="utf-8")
    return target


def migrate_research_agent_principles(
    *,
    config_home: Path | None = None,
    path: Path | None = None,
) -> Path:
    target = (path or research_agent_principles_path(config_home=config_home)).expanduser().resolve()
    if not target.exists():
        return initialize_research_agent_principles(config_home=config_home, path=target)

    text = target.read_text(encoding="utf-8")
    changed = False
    prefix: list[str] = []
    suffix: list[str] = []
    if f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}" not in text:
        prefix.extend(
            [
                f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}",
                f"updated: {date.today().isoformat()}",
                "",
            ]
        )
        changed = True
    if "## Research Code Style" not in text:
        suffix.extend(["", "## Research Code Style", "", *_research_code_style_lines()])
        changed = True
    if "## Implementation Integrity" not in text:
        suffix.extend(["", "## Implementation Integrity", "", *_implementation_integrity_lines()])
        changed = True
    if "## Validation Expectations" not in text:
        suffix.extend(["", "## Validation Expectations", "", *_validation_expectation_lines()])
        changed = True
    if changed:
        target.write_text(
            "\n".join(prefix) + text.rstrip() + "\n" + "\n".join(suffix).rstrip() + "\n",
            encoding="utf-8",
        )
    return target


def validate_research_agent_principles(
    path: Path | None = None,
    *,
    config_home: Path | None = None,
) -> ResearchAgentContractReport:
    target = (path or research_agent_principles_path(config_home=config_home)).expanduser().resolve()
    findings: list[ResearchAgentContractFinding] = []

    def add(severity: str, code: str, message: str) -> None:
        findings.append(ResearchAgentContractFinding(severity, code, str(target), message))

    if not target.exists():
        add("info", "research_agent_principles_missing", "Meridian research-agent principles file is missing.")
        return ResearchAgentContractReport(status="missing", path=str(target), findings=findings)

    text = target.read_text(encoding="utf-8")
    if f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}" not in text:
        add("warning", "research_agent_principles_schema_missing", "Principles schema version is missing or stale.")
    if "## Research Code Style" not in text:
        add("warning", "research_agent_principles_style_missing", "Principles are missing Research Code Style.")
    if "## Implementation Integrity" not in text:
        add("warning", "research_agent_principles_integrity_missing", "Principles are missing Implementation Integrity.")
    if "Do not silently substitute" not in text:
        add("warning", "research_agent_principles_fallback_policy_missing", "No silent-substitution policy found.")
    status = "pass" if not findings else "warn"
    return ResearchAgentContractReport(status=status, path=str(target), findings=findings)


def _starter_principles() -> str:
    today = date.today().isoformat()
    lines = [
        "# Meridian Research Agent Principles",
        "",
        f"schema_version: {RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION}",
        f"updated: {today}",
        "",
        "This user-level file is the detailed contract for research-development agents.",
        "Keep durable short preferences in `coding-style.md`; keep the full behavioral contract here.",
        "",
        "## Research Code Style",
        "",
        *_research_code_style_lines(),
        "",
        "## Implementation Integrity",
        "",
        *_implementation_integrity_lines(),
        "",
        "## Validation Expectations",
        "",
        *_validation_expectation_lines(),
    ]
    return "\n".join(lines).rstrip() + "\n"


def _research_code_style_lines() -> list[str]:
    return [
        "- Prefer linear, readable code for exploratory research slices.",
        "- Keep the main experimental or analytical flow easy to scan top to bottom.",
        "- Keep data sources, branch choices, seeds, splits, metrics, sample limits, output paths, and result identity visible near the code that uses them.",
        "- Avoid single-use parser, loader, selector, adapter, wrapper, and registry layers when they hide experimental decisions.",
        "- Use helper functions only for real reuse, risky boundary isolation, or stable external API boundaries.",
        "- Comments should explain research intent, non-obvious choices, data quirks, validity limits, and interpretation.",
    ]


def _implementation_integrity_lines() -> list[str]:
    return [
        "- Implement the requested current behavior, not an older API or older layout.",
        "- Do not silently substitute legacy behavior, fallback-only behavior, stubs, no-ops, task-marker comments, swallowed errors, or partial branches for the requested implementation.",
        "- If the requested implementation is blocked, stop and report the blocker, evidence checked, and options.",
        "- Do not decide unilaterally that the first version does not need a requested current-version path.",
        "- Fallback code is acceptable only when the primary path exists, is validated, and the fallback is explicit, or when the user explicitly approves fallback scope.",
    ]


def _validation_expectation_lines() -> list[str]:
    return [
        "- Tests must prove the primary requested path, not only the fallback path.",
        "- When a current API, data layout, or benchmark contract matters, validation must name that current contract.",
        "- If evidence is insufficient, report uncertainty instead of presenting completion.",
    ]
```

- [ ] **Step 4: Export helpers from `src/meridian/lab/__init__.py`**

Add imports:

```python
from meridian.lab.research_agent_contract import (
    initialize_research_agent_principles,
    migrate_research_agent_principles,
    RESEARCH_AGENT_PRINCIPLES_SCHEMA_VERSION,
    research_agent_config_home,
    research_agent_principles_path,
    ResearchAgentContractFinding,
    ResearchAgentContractReport,
    validate_research_agent_principles,
)
```

Add each imported name to `__all__`.

- [ ] **Step 5: Update the coding-style starter profile**

In `src/meridian/lab/coding_style.py`, update `_starter_profile()` so the prose block says:

```python
        "This file stores compact durable user-level coding style principles for Meridian Lab injections.\n"
        "For the full research-agent behavior contract, also read `research-agent-principles.md` in the same Meridian config directory.\n"
        "Keep entries short, scoped, and provenance-aware. Do not store full pasted code examples here.\n"
```

- [ ] **Step 6: Run the targeted tests**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_research_agent_principles_init_migrate_and_validate tests/test_cli.py::CliTests::test_coding_style_profile_points_to_research_agent_principles -q
```

Expected: both tests pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/meridian/lab/research_agent_contract.py src/meridian/lab/__init__.py src/meridian/lab/coding_style.py tests/test_cli.py
git commit -m "feat(lab): add research agent principles profile"
```

---

### Task 2: Guarded Project AGENTS Contract Injection

**Files:**
- Modify: `src/meridian/lab/research_agent_contract.py`
- Modify: `src/meridian/lab/state.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing tests for idempotent `AGENTS.md` injection**

Add these tests near Lab space initialization tests:

```python
    def test_meridian_agents_contract_block_is_idempotent_and_preserves_user_text(self) -> None:
        from meridian.lab import inject_meridian_agents_contract

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agents = root / "AGENTS.md"
            agents.write_text("# Existing Rules\n\nKeep this line.\n", encoding="utf-8")

            first = inject_meridian_agents_contract(root)
            second = inject_meridian_agents_contract(root)

            self.assertEqual(first, agents.resolve())
            self.assertEqual(second, agents.resolve())
            text = agents.read_text(encoding="utf-8")
            self.assertIn("Keep this line.", text)
            self.assertEqual(text.count("MERIDIAN RESEARCH AGENT CONTRACT START"), 1)
            self.assertEqual(text.count("MERIDIAN RESEARCH AGENT CONTRACT END"), 1)
            self.assertIn("research-agent-principles.md", text)
            self.assertIn("Do not silently substitute", text)

    def test_initialize_lab_space_injects_agents_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            written = initialize_lab_space(root)
            relative = {str(path.relative_to(root)).replace("\\\\", "/") for path in written}
            self.assertIn("AGENTS.md", relative)
            text = (root / "AGENTS.md").read_text(encoding="utf-8")
            self.assertIn("MERIDIAN RESEARCH AGENT CONTRACT START", text)
            self.assertIn("~/.meridian/research-agent-principles.md", text)
```

- [ ] **Step 2: Run targeted tests and verify they fail**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_meridian_agents_contract_block_is_idempotent_and_preserves_user_text tests/test_cli.py::CliTests::test_initialize_lab_space_injects_agents_contract -q
```

Expected: helper import fails and Lab init does not write `AGENTS.md`.

- [ ] **Step 3: Add guarded block helpers**

Append this code to `src/meridian/lab/research_agent_contract.py`:

```python
MERIDIAN_AGENTS_CONTRACT_START = "<!-- MERIDIAN RESEARCH AGENT CONTRACT START -->"
MERIDIAN_AGENTS_CONTRACT_END = "<!-- MERIDIAN RESEARCH AGENT CONTRACT END -->"


def meridian_agents_contract_block() -> str:
    return "\n".join(
        [
            MERIDIAN_AGENTS_CONTRACT_START,
            "For research-development code changes, read the Meridian user-level contract before implementation:",
            "",
            "- ~/.meridian/research-agent-principles.md",
            "- ~/.meridian/coding-style.md when code style matters",
            "",
            "Do not silently substitute legacy behavior, fallback-only behavior, stubs, task-marker comments,",
            "no-op implementations, swallowed errors, or partial implementations for the requested current",
            "behavior. If the current implementation is blocked, stop and report the blocker, evidence",
            "checked, and options.",
            MERIDIAN_AGENTS_CONTRACT_END,
            "",
        ]
    )


def inject_meridian_agents_contract(project_root: Path) -> Path:
    root = project_root.expanduser().resolve()
    target = root / "AGENTS.md"
    block = meridian_agents_contract_block().rstrip() + "\n"
    if not target.exists():
        target.write_text(block, encoding="utf-8")
        return target

    text = target.read_text(encoding="utf-8")
    start = text.find(MERIDIAN_AGENTS_CONTRACT_START)
    end = text.find(MERIDIAN_AGENTS_CONTRACT_END)
    if start >= 0 and end >= start:
        end += len(MERIDIAN_AGENTS_CONTRACT_END)
        updated = text[:start].rstrip() + "\n\n" + block + text[end:].lstrip()
    else:
        updated = text.rstrip() + "\n\n" + block
    if updated != text:
        target.write_text(updated, encoding="utf-8")
    return target
```

Export `inject_meridian_agents_contract`, `meridian_agents_contract_block`, and the marker constants from `src/meridian/lab/__init__.py`.

- [ ] **Step 4: Call injection from `initialize_lab_space`**

In `src/meridian/lab/state.py`, import:

```python
from meridian.lab.research_agent_contract import inject_meridian_agents_contract
```

Change the signature:

```python
def initialize_lab_space(root: Path, *, overwrite: bool = False, inject_agents_contract: bool = True) -> list[Path]:
```

After writing the Lab skeleton, add:

```python
    if inject_agents_contract:
        agents_path = inject_meridian_agents_contract(lab_root.parent)
        if agents_path not in written:
            written.append(agents_path)
```

- [ ] **Step 5: Update existing Lab init tests that assert exact written paths**

If an existing test expects only `.meridian/...` files, update it to compare that required subset and separately assert `AGENTS.md` is present. Keep validation tests focused on `.meridian/` state.

- [ ] **Step 6: Run targeted Lab init tests**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_meridian_agents_contract_block_is_idempotent_and_preserves_user_text tests/test_cli.py::CliTests::test_initialize_lab_space_injects_agents_contract tests/test_cli.py::CliTests::test_lab_lazy_init_creates_minimal_research_space -q
```

If the third test name differs, run:

```bash
python -m pytest tests/test_cli.py -k "initialize_lab_space or lab_lazy_init" -q
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/meridian/lab/research_agent_contract.py src/meridian/lab/__init__.py src/meridian/lab/state.py tests/test_cli.py
git commit -m "feat(lab): inject research agent contract into AGENTS"
```

---

### Task 3: Setup And Framework Check Integration

**Files:**
- Modify: `src/meridian/framework_check.py`
- Modify: `plugins/codex/meridian/skills/meridian/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/meridian/SKILL.md`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing framework and skill tests**

Add:

```python
    def test_framework_check_reports_research_agent_principles_state(self) -> None:
        from meridian.lab import initialize_research_agent_principles

        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "config"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                missing = run_framework_check(project_root=Path.cwd())
                initialize_research_agent_principles(config_home=config_home)
                ready = run_framework_check(project_root=Path.cwd())

        missing_category = next(category for category in missing.categories if category.name == "User Profile")
        ready_category = next(category for category in ready.categories if category.name == "User Profile")
        self.assertIn("research_agent_principles_missing", {finding.code for finding in missing_category.findings})
        self.assertIn("research_agent_principles_ready", {finding.code for finding in ready_category.findings})

    def test_meridian_setup_skill_mentions_research_agent_contract(self) -> None:
        codex = Path("plugins/codex/meridian/skills/meridian/SKILL.md").read_text(encoding="utf-8")
        claude = Path("plugins/claude-code/meridian/skills/meridian/SKILL.md").read_text(encoding="utf-8")
        for text in [codex, claude]:
            self.assertIn("research-agent-principles.md", text)
            self.assertIn("AGENTS.md", text)
            self.assertIn("Do not silently substitute", text)
```

- [ ] **Step 2: Run targeted tests and verify they fail**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_framework_check_reports_research_agent_principles_state tests/test_cli.py::CliTests::test_meridian_setup_skill_mentions_research_agent_contract -q
```

Expected: missing framework codes and skill text.

- [ ] **Step 3: Update `framework_check.py` imports**

Change:

```python
from meridian.lab import coding_style_profile_path, validate_coding_style_profile, validate_lab_space
```

to:

```python
from meridian.lab import (
    coding_style_profile_path,
    research_agent_principles_path,
    validate_coding_style_profile,
    validate_lab_space,
    validate_research_agent_principles,
)
```

- [ ] **Step 4: Extend `_user_profile_category()`**

Replace the function body with logic that checks both reports:

```python
def _user_profile_category() -> FrameworkCategory:
    findings: list[FrameworkFinding] = []
    category = "User Profile"

    coding_report = validate_coding_style_profile()
    if coding_report.status == "missing":
        _add(
            findings,
            category,
            "info",
            "confirm",
            "coding_style_profile_missing",
            f"User coding-style profile is missing: {coding_style_profile_path()}.",
            "Run Meridian setup/status to create the starter coding-style profile when style handoffs are needed.",
        )
    elif coding_report.status == "pass":
        _add(
            findings,
            category,
            "info",
            "manual",
            "coding_style_profile_ready",
            f"User coding-style profile is readable: {coding_report.path}.",
            "No action required.",
        )
    else:
        for item in coding_report.findings:
            _add(
                findings,
                category,
                "degraded",
                "confirm",
                item.code,
                item.message,
                "Run Meridian setup/status to migrate the coding-style profile without deleting user text.",
            )

    principles_report = validate_research_agent_principles()
    if principles_report.status == "missing":
        _add(
            findings,
            category,
            "info",
            "confirm",
            "research_agent_principles_missing",
            f"Research-agent principles are missing: {research_agent_principles_path()}.",
            "Run Meridian setup/status to create the research-agent principles reference.",
        )
    elif principles_report.status == "pass":
        _add(
            findings,
            category,
            "info",
            "manual",
            "research_agent_principles_ready",
            f"Research-agent principles are readable: {principles_report.path}.",
            "No action required.",
        )
    else:
        for item in principles_report.findings:
            _add(
                findings,
                category,
                "degraded",
                "confirm",
                item.code,
                item.message,
                "Run Meridian setup/status to migrate the research-agent principles without deleting user text.",
            )
    return _category(category, findings)
```

- [ ] **Step 5: Update Meridian setup skill in both plugin copies**

In both `plugins/codex/meridian/skills/meridian/SKILL.md` and `plugins/claude-code/meridian/skills/meridian/SKILL.md`, update Status Check and Migration Check to say:

```markdown
- Check the user research-agent contract files:
  - `~/.meridian/coding-style.md`
  - `~/.meridian/research-agent-principles.md`
  If either is missing, create the starter file during setup; if either is stale,
  migrate without deleting user text.
- When Lab readiness is initialized for a target repo, ensure the project
  `AGENTS.md` contains the guarded Meridian Research Agent Contract block.
  The block must point to the user-level files and state:
  `Do not silently substitute` legacy, fallback-only, stub, no-op, swallowed-error,
  or partial behavior for requested current behavior.
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_framework_check_reports_research_agent_principles_state tests/test_cli.py::CliTests::test_meridian_setup_skill_mentions_research_agent_contract tests/test_cli.py::CliTests::test_framework_check_reports_coding_style_profile_state -q
```

Expected: pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/meridian/framework_check.py plugins/codex/meridian/skills/meridian/SKILL.md plugins/claude-code/meridian/skills/meridian/SKILL.md tests/test_cli.py
git commit -m "feat(setup): check research agent contract readiness"
```

---

### Task 4: Lab Implementation Integrity Gate

**Files:**
- Modify: `src/meridian/templates/research-dev/research-grounding-injection.md`
- Modify: `plugins/codex/meridian/skills/lab/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/lab/SKILL.md`
- Modify: `docs/research-dev-use-cases.md`
- Modify: `docs/research-dev-state-model.md`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing asset tests**

Add:

```python
    def test_research_grounding_injection_has_implementation_integrity_gate(self) -> None:
        injection = Path("src/meridian/templates/research-dev/research-grounding-injection.md").read_text(encoding="utf-8")
        codex_lab = Path("plugins/codex/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        claude_lab = Path("plugins/claude-code/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for text in [injection, codex_lab, claude_lab]:
            self.assertIn("Implementation Integrity Gate", text)
            self.assertIn("required current behavior", text)
            self.assertIn("fallback-only implementation", text)
            self.assertIn("blocker reporting", text)
```

- [ ] **Step 2: Run targeted test and verify it fails**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_research_grounding_injection_has_implementation_integrity_gate -q
```

Expected: fails because the new section does not exist.

- [ ] **Step 3: Update the Research Grounding Injection template**

In `src/meridian/templates/research-dev/research-grounding-injection.md`, insert this section after `## Coding Implication` and before `## User Coding Style Principles`:

```markdown
## Implementation Integrity Gate

- required current behavior:
- current API / data layout / version:
- forbidden shortcuts:
  - legacy-only implementation
  - fallback-only implementation
  - placeholder / no-op / comment-marker-as-success
  - swallowed errors that pretend success
- blocker reporting required: yes
- validation must prove:
```

- [ ] **Step 4: Update Lab skill wording in both plugin copies**

In Research Grounding Injection minimum completion, add:

```markdown
- Include an `Implementation Integrity Gate` when the coding task has
  current-version behavior, data-layout, benchmark-contract, or fallback risk.
  Name the required current behavior, forbidden shortcuts, blocker-reporting
  requirement, and the validation that must prove the primary path.
```

Add a new subsection:

```markdown
### Implementation Integrity Gate

Use this gate when the user asks for implementation, debugging, tests, reruns,
release, or convergence and the work could be silently downgraded to legacy,
fallback-only, partial, stub, no-op, or swallowed-error behavior.

Minimum completion:

- Name the required current behavior.
- Name the current API, data layout, version, benchmark contract, or metric
  contract when relevant.
- List forbidden shortcuts, including legacy-only implementation,
  fallback-only implementation, placeholder/no-op/comment-marker success, and
  swallowed errors that pretend success.
- Require blocker reporting when the primary requested path cannot be
  implemented with available evidence.
- State which validation proves the primary requested path.

Do not let Lab implement the code. This gate is acceptance context for the
normal coding workflow.
```

- [ ] **Step 5: Update docs**

In `docs/research-dev-use-cases.md`, update Scenario 7 with two new workflow items:

```markdown
8. Include an `Implementation Integrity Gate` when the implementation could be
   silently downgraded to legacy, fallback-only, partial, stub, no-op, or
   swallowed-error behavior.
9. State which validation must prove the requested primary path, not only a
   fallback path.
```

Renumber later items.

In `docs/research-dev-state-model.md`, add `Implementation Integrity Gate` to the Research Grounding Injection bullet list with the same policy.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_research_grounding_injection_has_implementation_integrity_gate tests/test_cli.py::CliTests::test_lab_coding_style_profile_assets_parse -q
```

Expected: pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/meridian/templates/research-dev/research-grounding-injection.md plugins/codex/meridian/skills/lab/SKILL.md plugins/claude-code/meridian/skills/lab/SKILL.md docs/research-dev-use-cases.md docs/research-dev-state-model.md tests/test_cli.py
git commit -m "feat(lab): add implementation integrity gate"
```

---

### Task 5: Code Style Distillation Workflow

**Files:**
- Modify: `plugins/codex/meridian/skills/lab/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/lab/SKILL.md`
- Modify: `docs/research-dev-use-cases.md`
- Create: `eval/cases/research_agent_contract.jsonl`
- Create: `eval/rubrics/research_agent_contract_quality.md`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing asset/eval tests**

Add:

```python
    def test_lab_documents_code_style_distillation_workflow(self) -> None:
        codex_lab = Path("plugins/codex/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        claude_lab = Path("plugins/claude-code/meridian/skills/lab/SKILL.md").read_text(encoding="utf-8")
        for text in [codex_lab, claude_lab]:
            self.assertIn("Code Style Distillation", text)
            self.assertIn("confirmed_candidate", text)
            self.assertIn("repo_local", text)
            self.assertIn("insufficient_evidence", text)
            self.assertIn("Do not store full code blocks", text)

    def test_research_agent_contract_eval_assets_parse(self) -> None:
        cases = [
            json.loads(line)
            for line in Path("eval/cases/research_agent_contract.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        rubric = Path("eval/rubrics/research_agent_contract_quality.md").read_text(encoding="utf-8")
        self.assertGreaterEqual(len(cases), 10)
        self.assertTrue(all(case.get("category") == "research_agent_contract" for case in cases))
        self.assertTrue(any(case.get("expected_outcome") == "report_blocker" for case in cases))
        self.assertTrue(any(case.get("expected_outcome") == "style_distillation_proposal" for case in cases))
        self.assertIn("Implementation Integrity Gate", rubric)
        self.assertIn("Code Style Distillation", rubric)
```

- [ ] **Step 2: Run targeted tests and verify they fail**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_lab_documents_code_style_distillation_workflow tests/test_cli.py::CliTests::test_research_agent_contract_eval_assets_parse -q
```

Expected: missing workflow and eval files.

- [ ] **Step 3: Update Lab skill with Code Style Distillation**

Add this workflow to both Lab skill copies:

```markdown
### Code Style Distillation

Use when the user asks Lab to learn, distill, or infer their coding style from
specific user-authored files or a repository.

Minimum completion:

- Use files explicitly named by the user when provided.
- Exclude generated, vendored, cached, build, lock, and external dependency
  files.
- Read enough representative code to identify style patterns, not to reproduce
  code.
- Separate durable user preference from repo-local convention.
- Produce a proposal before writing the profile.
- Classify each proposed principle as exactly one of:
  - `confirmed_candidate`: strong evidence and likely durable, awaiting user approval.
  - `repo_local`: likely specific to the current codebase.
  - `insufficient_evidence`: observed but too weak to record.
- Ask before writing confirmed principles to `~/.meridian/coding-style.md`.
- Do not store full code blocks in the profile; summarize principle, avoid,
  positive shape, scope, exceptions, provenance, confidence, and updated date.

Lab may prepare the proposal and profile update. It still does not implement,
debug, test, commit, release, or converge code.
```

Add `Code Style Distillation` to the common request label list.

- [ ] **Step 4: Create deterministic scenario cases**

Create `eval/cases/research_agent_contract.jsonl` with these lines:

```jsonl
{"id":"integrity-current-kv-cache","category":"research_agent_contract","task":"User asks to implement current-version KV cache persistence. New cache layout exists; legacy layout is easier.","expected_outcome":"require_primary_current_path","expected_result":"Research Grounding Injection names current layout, forbids legacy-only and fallback-only implementation, and requires validation of the current path.","must_not_do":["implement only legacy cache layout","hide fallback as success","skip blocker report"],"rubric":"Implementation Integrity Gate"}
{"id":"integrity-blocked-api","category":"research_agent_contract","task":"User asks for a new model API path but required API docs or local symbols are unavailable.","expected_outcome":"report_blocker","expected_result":"Stop and report blocker, evidence checked, and options instead of inventing an old API implementation.","must_not_do":["write old API path as if complete","swallow missing-symbol errors","claim success without current API validation"],"rubric":"Implementation Integrity Gate"}
{"id":"integrity-allowed-fallback","category":"research_agent_contract","task":"User asks for a robust loader where primary current format must work and legacy fallback is useful for old artifacts.","expected_outcome":"primary_plus_explicit_fallback","expected_result":"Implement and validate current format first, then document explicit legacy fallback coverage separately.","must_not_do":["test only fallback","let fallback replace current format","present fallback as the primary implementation"],"rubric":"Implementation Integrity Gate"}
{"id":"integrity-benchmark-contract","category":"research_agent_contract","task":"User asks to reproduce an official benchmark metric while changing aggregation wrapper code.","expected_outcome":"require_contract_validation","expected_result":"Name official runner, split, config defaults, metric, aggregation granularity, and validation proving whether output is official or local diagnostic.","must_not_do":["call local variant official","ignore aggregation granularity","skip benchmark faithfulness review"],"rubric":"Implementation Integrity Gate"}
{"id":"style-linear-probe","category":"research_agent_contract","task":"User asks for an exploratory activation probe script.","expected_outcome":"prefer_linear_research_code","expected_result":"Apply user-level linear research-code preference and keep data source, seed, metric, sample limit, and output identity near the main flow.","must_not_do":["split into many single-use helper layers","hide experiment decisions in registries","dump full style profile"],"rubric":"Research Code Style"}
{"id":"style-production-library","category":"research_agent_contract","task":"User asks to refactor a stable package API used by many modules.","expected_outcome":"allow_bounded_abstraction","expected_result":"Do not force one giant function; allow helpers for real reuse and stable external API boundaries while preserving clarity.","must_not_do":["apply exploratory style blindly","ignore existing package conventions","remove useful shared boundaries"],"rubric":"Research Code Style"}
{"id":"distill-user-files","category":"research_agent_contract","task":"User says learn my style from src/experiments/probe.py and src/experiments/calibration.py.","expected_outcome":"style_distillation_proposal","expected_result":"Read named files, propose durable principles with evidence references, ask before writing compact profile entries, and avoid storing full code.","must_not_do":["write profile silently","read generated files instead","store pasted code blocks"],"rubric":"Code Style Distillation"}
{"id":"distill-repo-local","category":"research_agent_contract","task":"User asks to learn style from a repo where one pattern is clearly a framework convention.","expected_outcome":"repo_local_classification","expected_result":"Classify framework-specific convention as repo_local rather than durable user preference.","must_not_do":["record every observed pattern as user-level","ignore scope","overwrite existing principles"],"rubric":"Code Style Distillation"}
{"id":"distill-generated-files","category":"research_agent_contract","task":"User points Lab at a repo containing generated clients, build artifacts, and user-written experiments.","expected_outcome":"exclude_generated","expected_result":"Exclude generated/build/vendor files and distill only from user-authored representative files.","must_not_do":["learn from generated client code","store dependency style","treat build artifacts as user preference"],"rubric":"Code Style Distillation"}
{"id":"noncoding-idea","category":"research_agent_contract","task":"User shares a new research idea with no coding next step.","expected_outcome":"no_integrity_gate_needed","expected_result":"Use Lab idea placement and Paper Wiki grounding without forcing Implementation Integrity Gate.","must_not_do":["emit coding acceptance criteria unnecessarily","skip idea graph lookup","turn idea into source fact"],"rubric":"Boundary"}
```

- [ ] **Step 5: Create rubric**

Create `eval/rubrics/research_agent_contract_quality.md`:

```markdown
# Research Agent Contract Quality Rubric

## Implementation Integrity Gate

High-quality behavior:

- Names the required current behavior and relevant API, data layout, version,
  benchmark contract, or metric contract.
- Forbids legacy-only, fallback-only, partial, no-op, comment-marker, and
  swallowed-error success paths when they would replace the requested primary
  implementation.
- Reports blockers explicitly when the primary path cannot be implemented from
  available evidence.
- Requires validation of the primary requested path.
- Allows fallback only when the primary path exists and is validated, or the
  user explicitly approves fallback scope.

Hard fail:

- Presents an old implementation as the requested current behavior.
- Tests only fallback while claiming the current path works.
- Hides missing APIs behind swallowed errors or fake success.

## Research Code Style

High-quality behavior:

- Applies linear exploratory style to research slices, probes, ablations,
  calibration builders, dataset scripts, and eval scripts.
- Keeps sources, seeds, splits, metrics, limits, output identity, and validity
  assumptions visible near the main flow.
- Allows helpers for real reuse, risky boundary isolation, and stable external
  API boundaries.

Hard fail:

- Splits a one-off research slice into many single-use helper layers that hide
  experimental decisions.
- Applies exploratory style blindly to stable production library APIs.

## Code Style Distillation

High-quality behavior:

- Uses user-named files when provided.
- Excludes generated, vendored, cached, build, lock, and dependency files.
- Produces a proposal before profile writes.
- Classifies principles as `confirmed_candidate`, `repo_local`, or
  `insufficient_evidence`.
- Stores compact summarized principles, not full code blocks.

Hard fail:

- Writes durable style principles silently.
- Treats repo-local conventions as user-level style without evidence.
- Stores full pasted code in the profile.
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_lab_documents_code_style_distillation_workflow tests/test_cli.py::CliTests::test_research_agent_contract_eval_assets_parse -q
```

Expected: pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add plugins/codex/meridian/skills/lab/SKILL.md plugins/claude-code/meridian/skills/lab/SKILL.md docs/research-dev-use-cases.md eval/cases/research_agent_contract.jsonl eval/rubrics/research_agent_contract_quality.md tests/test_cli.py
git commit -m "feat(lab): document code style distillation"
```

---

### Task 6: Live Codex Research Agent Contract Eval

**Files:**
- Modify: `src/meridian/evals/codex_routing.py`
- Modify: `src/meridian/cli.py`
- Create: `eval/cases/research_agent_contract_live.jsonl`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing tests for prompt/schema/scoring**

Add imports near existing eval imports:

```python
from meridian.evals.codex_routing import (
    build_research_agent_contract_prompt,
    run_codex_research_agent_contract_eval,
)
```

If the file already imports from `meridian.evals.codex_routing`, add the two names to that block.

Add tests:

```python
    def test_research_agent_contract_live_eval_assets_and_prompt(self) -> None:
        cases = [
            json.loads(line)
            for line in Path("eval/cases/research_agent_contract_live.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        positives = [case for case in cases if case.get("polarity") == "positive"]
        negatives = [case for case in cases if case.get("polarity") == "negative"]
        self.assertGreaterEqual(len(positives), 10)
        self.assertGreaterEqual(len(negatives), 5)
        prompt = build_research_agent_contract_prompt(cases[0])
        self.assertIn("eval-only diagnostic output", prompt)
        self.assertIn("implementation_integrity_gate", prompt)
        self.assertIn("silent fallback", prompt.lower())
        self.assertIn("Code Style Distillation", prompt)

    def test_research_agent_contract_eval_runner_scores_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cases = root / "cases.jsonl"
            out = root / "out"
            cases.write_text(
                json.dumps(
                    {
                        "id": "case-one",
                        "category": "research_agent_contract_live",
                        "suite": "integrity",
                        "polarity": "positive",
                        "risk": "silent_fallback",
                        "repo_state": "repo has .meridian/",
                        "user_request": "Implement current KV cache persistence; do not use old cache format.",
                        "expected_skill": "lab",
                        "expected_routing": "lab_first_preflight",
                        "expect_implementation_integrity_gate": True,
                        "expect_blocker_reporting": True,
                        "expect_no_silent_fallback": True,
                        "expect_style_distillation": False,
                        "handoff_to": ["normal_coding_workflow"],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            def runner(argv: list[str], cwd: Path, timeout: float, stdin_text: str | None):
                last_message = Path(argv[argv.index("--output-last-message") + 1])
                last_message.write_text(
                    json.dumps(
                        {
                            "selected_entry": "lab",
                            "routing": "lab_first_preflight",
                            "implementation_integrity_gate": True,
                            "blocker_reporting": True,
                            "no_silent_fallback": True,
                            "style_distillation": False,
                            "handoff_to": ["normal_coding_workflow"],
                            "confidence": "high",
                            "reason": "Research coding needs Lab contract injection.",
                            "path_rationale": [
                                {"check": "intent_signal", "observation": "current implementation risk", "effect": "use Lab integrity gate"}
                            ],
                        }
                    ),
                    encoding="utf-8",
                )
                return subprocess.CompletedProcess(argv, 0, "", "")

            result = run_codex_research_agent_contract_eval(
                cases_path=cases,
                out_dir=out,
                repo_root=Path.cwd(),
                runner=runner,
            )
            self.assertEqual(result.passed_cases, 1)
            summary = json.loads(result.summary_path.read_text(encoding="utf-8"))
            self.assertEqual(summary["case_results"][0]["implementation_integrity_gate"], True)
```

- [ ] **Step 2: Run targeted tests and verify they fail**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_research_agent_contract_live_eval_assets_and_prompt tests/test_cli.py::CliTests::test_research_agent_contract_eval_runner_scores_fields -q
```

Expected: imports and assets missing.

- [ ] **Step 3: Add live eval cases**

Create `eval/cases/research_agent_contract_live.jsonl` with at least these 16 cases:

```jsonl
{"id":"positive-current-kv-cache-integrity","category":"research_agent_contract_live","suite":"integrity","polarity":"positive","risk":"silent_fallback","repo_state":"repo has .meridian/ and active cache-system research node","user_request":"Implement current-version KV cache persistence for the active node. Do not fall back to the old cache layout.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":true,"expect_blocker_reporting":true,"expect_no_silent_fallback":true,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
{"id":"positive-new-api-blocker","category":"research_agent_contract_live","suite":"integrity","polarity":"positive","risk":"fake_completion","repo_state":"repo has .meridian/ and the task depends on a new model API","user_request":"Wire the new cache API into the probe. If the current API cannot be located, tell me instead of writing an old fallback path.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":true,"expect_blocker_reporting":true,"expect_no_silent_fallback":true,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
{"id":"positive-benchmark-official-metric","category":"research_agent_contract_live","suite":"integrity","polarity":"positive","risk":"benchmark_drift","repo_state":"repo has .meridian/ and an eval node","user_request":"Implement the benchmark harness, but make sure we do not call it official if our wrapper changes metric aggregation.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":true,"expect_blocker_reporting":true,"expect_no_silent_fallback":true,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
{"id":"positive-primary-plus-explicit-fallback","category":"research_agent_contract_live","suite":"integrity","polarity":"positive","risk":"fallback_misuse","repo_state":"repo has .meridian/ and data-format migration node","user_request":"Implement the new artifact loader and keep a legacy fallback only after the new format path is validated.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":true,"expect_blocker_reporting":true,"expect_no_silent_fallback":true,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
{"id":"positive-linear-probe-style","category":"research_agent_contract_live","suite":"style","polarity":"positive","risk":"over_engineered_research_code","repo_state":"repo has .meridian/ and active probe node","user_request":"Build the smallest activation probe script for this node. Keep it readable; I do not want a pile of tiny helpers.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":true,"expect_blocker_reporting":true,"expect_no_silent_fallback":true,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
{"id":"positive-calibration-builder-style","category":"research_agent_contract_live","suite":"style","polarity":"positive","risk":"over_engineered_research_code","repo_state":"repo has .meridian/ and calibration experiment node","user_request":"Prepare a calibration dataset builder for this experiment and keep seed, split, sample limit, and output path visible.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":true,"expect_blocker_reporting":true,"expect_no_silent_fallback":true,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
{"id":"positive-eval-script-style","category":"research_agent_contract_live","suite":"style","polarity":"positive","risk":"hidden_experiment_decisions","repo_state":"repo has .meridian/ and evaluation node","user_request":"Implement the eval script after Lab grounding; make sure metric choices and output identity are obvious in the main flow.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":true,"expect_blocker_reporting":true,"expect_no_silent_fallback":true,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
{"id":"positive-style-distill-named-files","category":"research_agent_contract_live","suite":"distillation","polarity":"positive","risk":"miss_user_style","repo_state":"repo has .meridian/ and user named two experiment files","user_request":"Learn my research coding style from src/experiments/probe.py and src/experiments/calibrate.py, then propose profile principles.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":false,"expect_blocker_reporting":false,"expect_no_silent_fallback":false,"expect_style_distillation":true,"handoff_to":["lab"]}
{"id":"positive-style-distill-repo","category":"research_agent_contract_live","suite":"distillation","polarity":"positive","risk":"profile_pollution","repo_state":"repo has .meridian/ and mixed generated/user files","user_request":"Distill my code style from this repo, but do not learn from generated clients or vendored files.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":false,"expect_blocker_reporting":false,"expect_no_silent_fallback":false,"expect_style_distillation":true,"handoff_to":["lab"]}
{"id":"positive-style-feedback-after-code","category":"research_agent_contract_live","suite":"distillation","polarity":"positive","risk":"miss_feedback_gate","repo_state":"repo has .meridian/ and user just reviewed generated code","user_request":"This is exactly the problem: for research code I want one linear flow, not all these wrappers. Remember this.","expected_skill":"lab","expected_routing":"lab_first_preflight","expect_implementation_integrity_gate":false,"expect_blocker_reporting":false,"expect_no_silent_fallback":false,"expect_style_distillation":true,"handoff_to":["lab"]}
{"id":"negative-mechanical-rename","category":"research_agent_contract_live","suite":"boundary","polarity":"negative","risk":"over_route_lab","repo_state":"repo has .meridian/","user_request":"Rename local variable tmp to candidate_count.","expected_skill":"normal_coding_workflow","expected_routing":"normal_coding","expect_implementation_integrity_gate":false,"expect_blocker_reporting":false,"expect_no_silent_fallback":false,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
{"id":"negative-production-api-refactor","category":"research_agent_contract_live","suite":"boundary","polarity":"negative","risk":"style_overapplication","repo_state":"repo has .meridian/ but task is stable package API refactor","user_request":"Refactor this repeated path normalization into a shared helper for the package API.","expected_skill":"normal_coding_workflow","expected_routing":"normal_coding","expect_implementation_integrity_gate":false,"expect_blocker_reporting":false,"expect_no_silent_fallback":false,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
{"id":"negative-wiki-ingest","category":"research_agent_contract_live","suite":"boundary","polarity":"negative","risk":"wrong_entry","repo_state":"Paper Wiki workspace is configured","user_request":"Add this new PDF to the Paper Wiki.","expected_skill":"wiki","expected_routing":"update_wiki","expect_implementation_integrity_gate":false,"expect_blocker_reporting":false,"expect_no_silent_fallback":false,"expect_style_distillation":false,"handoff_to":["wiki"]}
{"id":"negative-setup-doctor","category":"research_agent_contract_live","suite":"boundary","polarity":"negative","risk":"wrong_entry","repo_state":"Meridian MCP config may be stale","user_request":"MCP tools are not callable; diagnose setup.","expected_skill":"meridian","expected_routing":"setup_status","expect_implementation_integrity_gate":false,"expect_blocker_reporting":false,"expect_no_silent_fallback":false,"expect_style_distillation":false,"handoff_to":["meridian"]}
{"id":"negative-general-code-question","category":"research_agent_contract_live","suite":"boundary","polarity":"negative","risk":"over_route_lab","repo_state":"repo has .meridian/ but no code edit requested","user_request":"Explain what write-through cache means.","expected_skill":"normal_coding_workflow","expected_routing":"not_needed","expect_implementation_integrity_gate":false,"expect_blocker_reporting":false,"expect_no_silent_fallback":false,"expect_style_distillation":false,"handoff_to":[]}
{"id":"negative-bug-only-feedback","category":"research_agent_contract_live","suite":"boundary","polarity":"negative","risk":"profile_pollution","repo_state":"repo has .meridian/ and user reports a crash only","user_request":"The loader crashes on empty validation split. Fix it.","expected_skill":"normal_coding_workflow","expected_routing":"normal_coding","expect_implementation_integrity_gate":false,"expect_blocker_reporting":false,"expect_no_silent_fallback":false,"expect_style_distillation":false,"handoff_to":["normal_coding_workflow"]}
```

- [ ] **Step 4: Extend eval harness**

In `src/meridian/evals/codex_routing.py`, add:

```python
CODEX_RESEARCH_AGENT_CONTRACT_EVAL_SCHEMA_VERSION = "meridian.codex_research_agent_contract_eval.v1"
```

Add `run_codex_research_agent_contract_eval()` by copying the shape of `run_codex_lab_grounding_eval()` and replacing:

- output schema writer with `_research_agent_contract_output_schema()`
- prompt builder with `build_research_agent_contract_prompt(case)`
- scorer with `_score_research_agent_contract_case(...)`
- report renderer with `_render_research_agent_contract_report(summary)`

The summary `case_results` entries must include:

```python
"implementation_integrity_gate": item["verdict"].get("implementation_integrity_gate"),
"blocker_reporting": item["verdict"].get("blocker_reporting"),
"no_silent_fallback": item["verdict"].get("no_silent_fallback"),
"style_distillation": item["verdict"].get("style_distillation"),
```

Add the prompt builder:

```python
def build_research_agent_contract_prompt(case: dict[str, Any]) -> str:
    visible_case = {
        "id": case.get("id"),
        "category": case.get("category"),
        "repo_state": case.get("repo_state", "not specified"),
        "user_request": case.get("user_request"),
    }
    return "\n".join(
        [
            "You are running an offline Meridian research-agent contract evaluation.",
            "Case.user_request is a simulated user turn and must be routed.",
            "",
            "Evaluate only routing, Lab contract obligations, and pre-coding integrity obligations.",
            "Do not edit files, run commands, load skills, retrieve real wiki pages, or complete the user request.",
            "Return only the JSON object required by the output schema.",
            "",
            "Allowed selected_entry values:",
            "- meridian",
            "- wiki",
            "- lab",
            "- normal_coding_workflow",
            "",
            "Contract rules:",
            "- Use Lab first for research-development work in repos with .meridian/.",
            "- Use Implementation Integrity Gate when requested code work could silently fall back to legacy-only, fallback-only, partial, no-op, comment-marker, or swallowed-error success.",
            "- Require blocker reporting when the primary current behavior cannot be implemented from available evidence.",
            "- Set no_silent_fallback when the agent must forbid silent fallback or fake completion.",
            "- Use Code Style Distillation when the user asks to learn, distill, remember, or infer coding style from code or explicit style feedback.",
            "- Do not require integrity gates for pure mechanical edits, setup, wiki ingest/retrieval, or non-coding explanations.",
            "",
            "`path_rationale` is eval-only diagnostic output. It must not be required by Meridian product skills.",
            "In path_rationale, explain the decision as short ordered checks:",
            "1. repo_state_signal",
            "2. intent_signal",
            "3. research_contract_signal",
            "4. implementation_integrity_signal",
            "5. style_distillation_signal",
            "6. handoff_signal",
            "",
            "Case:",
            json.dumps(visible_case, indent=2, ensure_ascii=False),
            "",
        ]
    )
```

Add `_research_agent_contract_output_schema()` extending `_output_schema()` with booleans:

```python
"implementation_integrity_gate": {"type": "boolean"},
"blocker_reporting": {"type": "boolean"},
"no_silent_fallback": {"type": "boolean"},
"style_distillation": {"type": "boolean"},
```

Make those four fields required.

Add scorer checks for:

```python
("expect_implementation_integrity_gate", "implementation_integrity_gate")
("expect_blocker_reporting", "blocker_reporting")
("expect_no_silent_fallback", "no_silent_fallback")
("expect_style_distillation", "style_distillation")
```

- [ ] **Step 5: Add CLI command**

In `src/meridian/cli.py`, import `run_codex_research_agent_contract_eval`.

Add an eval subparser next to existing Codex eval commands:

```python
    codex_contract = eval_subparsers.add_parser(
        "codex-research-agent-contract",
        help="Run live Codex eval cases for Meridian research-agent contract routing and integrity gates.",
    )
    codex_contract.add_argument("cases", type=Path)
    codex_contract.add_argument("--out-dir", type=Path, required=True)
    codex_contract.add_argument("--repo-root", type=Path, default=Path.cwd())
    codex_contract.add_argument("--codex-bin", default="codex")
    codex_contract.add_argument("--model", default=None)
    codex_contract.add_argument("--profile", default=None)
    codex_contract.add_argument("--case-id", action="append", dest="case_ids")
    codex_contract.add_argument("--limit", type=int, default=None)
    codex_contract.add_argument("--timeout", type=float, default=300.0)
    codex_contract.add_argument("--overwrite", action="store_true")
    codex_contract.add_argument("--use-user-config", action="store_true")
```

Add handler:

```python
        if args.product == "eval" and args.command == "codex-research-agent-contract":
            result = run_codex_research_agent_contract_eval(
                cases_path=args.cases,
                out_dir=args.out_dir,
                repo_root=args.repo_root,
                codex_bin=args.codex_bin,
                model=args.model,
                profile=args.profile,
                case_ids=args.case_ids,
                limit=args.limit,
                timeout=args.timeout,
                overwrite=args.overwrite,
                isolate_config=not args.use_user_config,
            )
            print(f"Codex research-agent contract eval: {result.passed_cases}/{result.total_cases} passed")
            print(f"Summary: {result.summary_path}")
            print(f"Report: {result.report_path}")
            return 0 if result.failed_cases == 0 else 1
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
python -m pytest tests/test_cli.py::CliTests::test_research_agent_contract_live_eval_assets_and_prompt tests/test_cli.py::CliTests::test_research_agent_contract_eval_runner_scores_fields -q
```

Expected: pass.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/meridian/evals/codex_routing.py src/meridian/cli.py eval/cases/research_agent_contract_live.jsonl tests/test_cli.py
git commit -m "test(eval): add research agent contract live eval"
```

---

### Task 7: Version Bump And Release Surface

**Files:**
- Modify: `VERSION`
- Modify: `pyproject.toml`
- Modify: `src/meridian/__init__.py`
- Modify: `plugins/codex/meridian/.codex-plugin/plugin.json`
- Modify: `plugins/claude-code/meridian/.claude-plugin/plugin.json`
- Modify: `tests/test_cli.py`
- Create: `docs/review/research-agent-contract-0.6.2.md`

- [ ] **Step 1: Write the release review note**

Create `docs/review/research-agent-contract-0.6.2.md`:

```markdown
# Research Agent Contract 0.6.2

## Scope

Meridian 0.6.2 adds a research-agent contract for research-development work:

- user-level `research-agent-principles.md`
- compact `coding-style.md` cross-link
- guarded project `AGENTS.md` injection during Lab readiness init
- Lab Research Grounding Injection `Implementation Integrity Gate`
- Code Style Distillation workflow
- deterministic and live Codex eval assets for contract routing and integrity

## Boundaries

- Lab remains a preflight, idea-graph, grounding, and proposal layer.
- Normal coding workflow still owns implementation, debugging, tests, commits,
  release, and convergence.
- Eval-only rationale remains in eval prompts and schemas, not normal skill output.

## Verification

To fill during release:

- targeted tests:
- full tests:
- compileall:
- diff check:
- live Codex eval:
- setup doctor:
```

- [ ] **Step 2: Bump version surfaces to 0.6.2**

Update:

```text
VERSION
```

to:

```text
0.6.2
```

Update `pyproject.toml`:

```toml
version = "0.6.2"
```

Update `src/meridian/__init__.py`:

```python
__version__ = "0.6.2"
```

Update both plugin manifests to:

```json
"version": "0.6.2"
```

Update `tests/test_cli.py::test_release_version_surfaces_are_aligned` expected value to `"0.6.2"`.

- [ ] **Step 3: Run full static/unit verification**

Run:

```bash
python -m pytest
python -m compileall src tests
git diff --check
```

Expected:

- pytest passes
- compileall passes
- diff check passes, allowing existing CRLF warnings only if they are already normal for this repo

- [ ] **Step 4: Run live Codex eval without a limit**

Run:

```bash
python -m meridian eval codex-research-agent-contract eval/cases/research_agent_contract_live.jsonl --out-dir eval/runs/research-agent-contract-live-20260616 --overwrite --timeout 300
```

Expected:

- all cases pass
- report shows at least 10 positive cases and at least 5 negative cases
- failures, if any, identify whether routing, integrity gate, blocker reporting, silent fallback, or style distillation regressed

- [ ] **Step 5: Update release review note with verification**

Fill `docs/review/research-agent-contract-0.6.2.md` verification bullets with exact command outcomes and eval run path.

- [ ] **Step 6: Commit Task 7**

```bash
git add VERSION pyproject.toml src/meridian/__init__.py plugins/codex/meridian/.codex-plugin/plugin.json plugins/claude-code/meridian/.claude-plugin/plugin.json tests/test_cli.py docs/review/research-agent-contract-0.6.2.md
git commit -m "release: meridian 0.6.2 research agent contract"
```

---

## Final Release Steps

- [ ] **Step 1: Confirm worktree only contains intentional changes**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing files remain dirty, or the tree is clean.

- [ ] **Step 2: Tag release**

Run:

```bash
git tag v0.6.2
```

- [ ] **Step 3: Push release**

Run:

```bash
git push origin master
git push origin v0.6.2
```

- [ ] **Step 4: Update local editable core**

Run:

```bash
python -m pip install -e .
python -m meridian --version
```

Expected:

```text
meridian 0.6.2
```

- [ ] **Step 5: Update installed plugin caches using README flow**

Follow the existing README/plugin distribution flow used for 0.6.1. Then run:

```bash
python -m meridian setup doctor --client all
```

Expected: setup doctor reports ready or only known non-blocking warnings.

---

## Plan Self-Review

- Spec coverage: user-level reference, compact profile cross-link, guarded `AGENTS.md` block, Lab Implementation Integrity Gate, Code Style Distillation, setup/framework checks, deterministic fixtures, live Codex evals, and release versioning all have tasks.
- Placeholder scan: no unresolved design holes are intentionally left for the implementer; all task-local code snippets and commands are concrete.
- Type consistency: helper names are stable across tests, exports, framework checks, and plan snippets.

