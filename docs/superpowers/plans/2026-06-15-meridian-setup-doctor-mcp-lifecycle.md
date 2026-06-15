# Meridian Setup Doctor MCP Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic Meridian setup doctor that detects and repairs skill-visible but MCP-unavailable client states for Codex and Claude Code.

**Architecture:** Add a focused `meridian.setup` package for runtime resolution, client cache inspection, doctor report assembly, and MCP cache repair. Keep repository plugin `.mcp.json` portable while writing machine-specific launcher paths only to installed user cache. Integrate the doctor into CLI and optional `framework-check --include-mcp-runtime`, then update product skills so Lab/Wiki stop on setup blockers instead of silently replacing Paper Wiki grounding with web fallback.

**Tech Stack:** Python stdlib dataclasses, pathlib, subprocess, json, argparse; existing Meridian CLI, MCP server, framework check, and unittest-based `tests/test_cli.py`.

---

## Scope Check

The spec covers one cohesive setup lifecycle subsystem with four bounded parts: runtime resolution, client inspection, repair, and readiness routing. Implement it as one plan because each part is small and independently testable, and the public CLI only becomes useful when the parts work together.

## File Structure

- Create `src/meridian/setup/__init__.py`: public exports for setup helper functions.
- Create `src/meridian/setup/runtime.py`: runtime candidate dataclasses, command runner, smoke tests, and candidate selection.
- Create `src/meridian/setup/clients.py`: Codex/Claude source/cache path discovery and `.mcp.json` parsing.
- Create `src/meridian/setup/doctor.py`: report assembly, finding creation, status calculation, human/JSON formatting.
- Create `src/meridian/setup/repair.py`: dry-run and apply repair actions with backup and post-repair MCP smoke.
- Modify `src/meridian/cli.py`: add `setup doctor`, `setup repair-mcp`, and `framework-check --include-mcp-runtime`.
- Modify `src/meridian/framework_check.py`: optionally include setup doctor MCP runtime findings.
- Modify `plugins/codex/meridian/skills/{meridian,lab,wiki}/SKILL.md` and matching Claude Code copies: update setup and grounding behavior.
- Modify `README.md` and `docs/plugin-distribution.md`: document doctor/repair workflow.
- Modify `tests/test_cli.py`: add targeted unit/integration tests for resolver, inspector, repair, CLI, framework-check, and skill text.

---

### Task 1: Runtime Resolver

**Files:**
- Create: `src/meridian/setup/__init__.py`
- Create: `src/meridian/setup/runtime.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing resolver tests**

Add imports near the top of `tests/test_cli.py`:

```python
from meridian.setup.runtime import (
    CommandResult,
    RuntimeCandidate,
    default_runtime_candidates,
    resolve_meridian_runtime,
)
```

Add these tests near the framework/setup tests:

```python
    def test_setup_runtime_resolver_selects_sys_executable(self) -> None:
        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            joined = " ".join(argv)
            if "import sys, meridian" in joined:
                return CommandResult(0, "C:/Python/python.exe\n0.5.3\n", "")
            if "-m meridian.mcp --help" in joined:
                return CommandResult(0, "usage: python -m meridian.mcp", "")
            if "-m meridian.mcp capabilities --detail summary" in joined:
                return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
            return CommandResult(1, "", f"unexpected argv: {argv}")

        candidates = [
            RuntimeCandidate(
                label="current Python",
                command="C:/Python/python.exe",
                args_prefix=[],
                source="sys_executable",
            )
        ]

        report = resolve_meridian_runtime(candidates=candidates, runner=runner)

        self.assertIsNotNone(report.selected)
        self.assertEqual(report.selected.command, "C:/Python/python.exe")
        self.assertTrue(report.selected.import_ok)
        self.assertTrue(report.selected.mcp_help_ok)
        self.assertTrue(report.selected.capabilities_ok)
        self.assertEqual(report.selected.version, "0.5.3")

    def test_setup_runtime_resolver_rejects_missing_python3(self) -> None:
        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            return CommandResult(127, "", "python3: command not found")

        candidates = [
            RuntimeCandidate(label="python3", command="python3", args_prefix=[], source="path")
        ]

        report = resolve_meridian_runtime(candidates=candidates, runner=runner)

        self.assertIsNone(report.selected)
        self.assertEqual(report.candidates[0].error_code, "mcp_launcher_command_not_found")
        self.assertFalse(report.candidates[0].exists)

    def test_setup_runtime_resolver_prefers_valid_meridian_python_env(self) -> None:
        calls: list[list[str]] = []

        def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
            calls.append(argv)
            if argv[0] == "C:/bad/python.exe":
                return CommandResult(0, "C:/bad/python.exe\n", "No module named meridian")
            if argv[0] == "C:/good/python.exe" and "-c" in argv:
                return CommandResult(0, "C:/good/python.exe\n0.5.3\n", "")
            if argv[0] == "C:/good/python.exe" and "--help" in argv:
                return CommandResult(0, "usage: python -m meridian.mcp", "")
            if argv[0] == "C:/good/python.exe" and "capabilities" in argv:
                return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
            return CommandResult(1, "", f"unexpected argv: {argv}")

        candidates = [
            RuntimeCandidate(label="current Python", command="C:/bad/python.exe", args_prefix=[], source="sys_executable"),
            RuntimeCandidate(label="MERIDIAN_PYTHON", command="C:/good/python.exe", args_prefix=[], source="env"),
        ]

        report = resolve_meridian_runtime(candidates=candidates, runner=runner)

        self.assertEqual(report.selected.command, "C:/good/python.exe")
        self.assertEqual(report.candidates[0].error_code, "mcp_launcher_import_failed")
        self.assertGreaterEqual(len(calls), 4)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_runtime_resolver" -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'meridian.setup'`.

- [ ] **Step 3: Add setup package exports**

Create `src/meridian/setup/__init__.py`:

```python
from __future__ import annotations

from meridian.setup.runtime import (
    CommandResult,
    RuntimeCandidate,
    RuntimeResolution,
    default_runtime_candidates,
    resolve_meridian_runtime,
)

__all__ = [
    "CommandResult",
    "RuntimeCandidate",
    "RuntimeResolution",
    "default_runtime_candidates",
    "resolve_meridian_runtime",
]
```

- [ ] **Step 4: Implement runtime resolver**

Create `src/meridian/setup/runtime.py`:

```python
from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Callable

from meridian import __version__


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str


CommandRunner = Callable[[list[str], float], CommandResult]


@dataclass(frozen=True)
class RuntimeCandidate:
    label: str
    command: str
    args_prefix: list[str]
    source: str
    exists: bool = False
    import_ok: bool = False
    mcp_help_ok: bool = False
    capabilities_ok: bool = False
    version: str | None = None
    executable: str | None = None
    error: str | None = None
    error_code: str | None = None

    def argv(self, extra: list[str]) -> list[str]:
        return [self.command, *self.args_prefix, *extra]

    def mcp_server_command(self) -> tuple[str, list[str]]:
        return self.command, [*self.args_prefix, "-m", "meridian.mcp", "serve"]

    def to_dict(self) -> dict[str, object]:
        return {
            "label": self.label,
            "command": self.command,
            "args_prefix": self.args_prefix,
            "source": self.source,
            "exists": self.exists,
            "import_ok": self.import_ok,
            "mcp_help_ok": self.mcp_help_ok,
            "capabilities_ok": self.capabilities_ok,
            "version": self.version,
            "executable": self.executable,
            "error": self.error,
            "error_code": self.error_code,
        }


@dataclass(frozen=True)
class RuntimeResolution:
    candidates: list[RuntimeCandidate]
    selected: RuntimeCandidate | None

    def to_dict(self) -> dict[str, object]:
        return {
            "selected": self.selected.to_dict() if self.selected else None,
            "candidates": [candidate.to_dict() for candidate in self.candidates],
        }


def default_command_runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
    try:
        completed = subprocess.run(
            argv,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        return CommandResult(127, "", str(exc))
    except subprocess.TimeoutExpired as exc:
        return CommandResult(124, exc.stdout or "", exc.stderr or "command timed out")
    return CommandResult(completed.returncode, completed.stdout, completed.stderr)


def default_runtime_candidates(*, env: dict[str, str] | None = None) -> list[RuntimeCandidate]:
    values = env or os.environ
    candidates = [
        RuntimeCandidate("current Python", sys.executable, [], "sys_executable"),
    ]
    configured = values.get("MERIDIAN_PYTHON")
    if configured:
        candidates.append(RuntimeCandidate("MERIDIAN_PYTHON", configured, [], "env"))
    candidates.extend(
        [
            RuntimeCandidate("python", "python", [], "path"),
            RuntimeCandidate("python3", "python3", [], "path"),
        ]
    )
    if os.name == "nt":
        candidates.append(RuntimeCandidate("py -3", "py", ["-3"], "windows_py"))
    return _dedupe_candidates(candidates)


def resolve_meridian_runtime(
    *,
    candidates: list[RuntimeCandidate] | None = None,
    runner: CommandRunner = default_command_runner,
    timeout: float = 10.0,
) -> RuntimeResolution:
    checked: list[RuntimeCandidate] = []
    for candidate in candidates or default_runtime_candidates():
        checked_candidate = _check_candidate(candidate, runner=runner, timeout=timeout)
        checked.append(checked_candidate)
        if (
            checked_candidate.exists
            and checked_candidate.import_ok
            and checked_candidate.mcp_help_ok
            and checked_candidate.capabilities_ok
        ):
            return RuntimeResolution(candidates=checked, selected=checked_candidate)
    return RuntimeResolution(candidates=checked, selected=None)


def _check_candidate(
    candidate: RuntimeCandidate,
    *,
    runner: CommandRunner,
    timeout: float,
) -> RuntimeCandidate:
    import_result = runner(
        candidate.argv(
            [
                "-c",
                "import sys, meridian; print(sys.executable); print(meridian.__version__)",
            ]
        ),
        timeout,
    )
    if import_result.returncode == 127:
        return replace(
            candidate,
            exists=False,
            error=import_result.stderr.strip() or import_result.stdout.strip(),
            error_code="mcp_launcher_command_not_found",
        )
    if import_result.returncode != 0:
        return replace(
            candidate,
            exists=True,
            import_ok=False,
            error=import_result.stderr.strip() or import_result.stdout.strip(),
            error_code="mcp_launcher_import_failed",
        )
    lines = [line.strip() for line in import_result.stdout.splitlines() if line.strip()]
    executable = lines[0] if lines else None
    version = lines[1] if len(lines) > 1 else None
    if version != __version__:
        return replace(
            candidate,
            exists=True,
            import_ok=True,
            executable=executable,
            version=version,
            error=f"Meridian version {version} does not match core {__version__}.",
            error_code="core_plugin_version_drift",
        )

    help_result = runner(candidate.argv(["-m", "meridian.mcp", "--help"]), timeout)
    if help_result.returncode != 0:
        return replace(
            candidate,
            exists=True,
            import_ok=True,
            executable=executable,
            version=version,
            error=help_result.stderr.strip() or help_result.stdout.strip(),
            error_code="mcp_server_start_failed",
        )

    capabilities_result = runner(
        candidate.argv(["-m", "meridian.mcp", "capabilities", "--detail", "summary"]),
        timeout,
    )
    if capabilities_result.returncode != 0:
        return replace(
            candidate,
            exists=True,
            import_ok=True,
            mcp_help_ok=True,
            executable=executable,
            version=version,
            error=capabilities_result.stderr.strip() or capabilities_result.stdout.strip(),
            error_code="mcp_tools_list_failed",
        )

    return replace(
        candidate,
        exists=True,
        import_ok=True,
        mcp_help_ok=True,
        capabilities_ok=True,
        executable=executable,
        version=version,
        error=None,
        error_code=None,
    )


def _dedupe_candidates(candidates: list[RuntimeCandidate]) -> list[RuntimeCandidate]:
    seen: set[tuple[str, tuple[str, ...]]] = set()
    result: list[RuntimeCandidate] = []
    for candidate in candidates:
        key = (str(Path(candidate.command)) if candidate.source in {"sys_executable", "env"} else candidate.command, tuple(candidate.args_prefix))
        if key in seen:
            continue
        seen.add(key)
        result.append(candidate)
    return result
```

- [ ] **Step 5: Run resolver tests**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_runtime_resolver" -v
```

Expected: PASS for 3 selected tests.

- [ ] **Step 6: Commit runtime resolver**

Run:

```bash
git add src/meridian/setup/__init__.py src/meridian/setup/runtime.py tests/test_cli.py
git commit -m "feat(setup): resolve Meridian MCP runtime"
```

---

### Task 2: Client Cache Inspector

**Files:**
- Create: `src/meridian/setup/clients.py`
- Modify: `src/meridian/setup/__init__.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing client inspector tests**

Add import:

```python
from meridian.setup.clients import inspect_client_installs
```

Add tests:

```python
    def test_setup_client_inspector_finds_codex_and_claude_caches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            for package, manifest_dir in [
                ("plugins/codex/meridian", ".codex-plugin"),
                ("plugins/claude-code/meridian", ".claude-plugin"),
            ]:
                package_root = root / package
                (package_root / manifest_dir).mkdir(parents=True)
                (package_root / manifest_dir / "plugin.json").write_text(
                    json.dumps({"name": "meridian", "version": __version__}),
                    encoding="utf-8",
                )
            for cache_root in [
                home / ".codex/plugins/cache/meridian/meridian" / __version__,
                home / ".claude/plugins/cache/meridian/meridian" / __version__,
            ]:
                (cache_root / "skills/meridian").mkdir(parents=True)
                (cache_root / "skills/wiki").mkdir(parents=True)
                (cache_root / "skills/lab").mkdir(parents=True)
                for skill in ["meridian", "wiki", "lab"]:
                    (cache_root / "skills" / skill / "SKILL.md").write_text(f"# {skill}\n", encoding="utf-8")
                (cache_root / ".mcp.json").write_text(
                    json.dumps(
                        {
                            "mcpServers": {
                                "meridian-paper-wiki": {
                                    "command": "python3",
                                    "args": ["-m", "meridian.mcp", "serve"],
                                }
                            }
                        }
                    ),
                    encoding="utf-8",
                )

            installs = {item.client: item for item in inspect_client_installs(project_root=root, home=home, clients=["codex", "claude"])}

        self.assertEqual(installs["codex"].cache_state, "installed")
        self.assertEqual(installs["claude"].cache_state, "installed")
        self.assertEqual(installs["codex"].skills["lab"], "readable")
        self.assertEqual(installs["codex"].configured_server["command"], "python3")

    def test_setup_client_inspector_reports_missing_plugin_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            installs = inspect_client_installs(
                project_root=Path(tmp) / "project",
                home=Path(tmp) / "home",
                clients=["codex"],
            )

        self.assertEqual(installs[0].client, "codex")
        self.assertEqual(installs[0].cache_state, "missing")
        self.assertIsNone(installs[0].mcp_config_path)
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_client_inspector" -v
```

Expected: FAIL with import error for `meridian.setup.clients`.

- [ ] **Step 3: Implement client inspector**

Create `src/meridian/setup/clients.py`:

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from meridian import __version__

MCP_SERVER_NAME = "meridian-paper-wiki"
PRODUCT_SKILLS = ["meridian", "wiki", "lab"]


@dataclass(frozen=True)
class ClientInstall:
    client: str
    source_root: Path | None
    cache_root: Path | None
    cache_state: str
    version: str | None
    manifest_path: Path | None
    mcp_config_path: Path | None
    skills: dict[str, str]
    configured_server: dict[str, Any] | None
    error: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "client": self.client,
            "source_root": str(self.source_root) if self.source_root else None,
            "cache_root": str(self.cache_root) if self.cache_root else None,
            "cache_state": self.cache_state,
            "version": self.version,
            "manifest_path": str(self.manifest_path) if self.manifest_path else None,
            "mcp_config_path": str(self.mcp_config_path) if self.mcp_config_path else None,
            "skills": self.skills,
            "configured_server": self.configured_server,
            "error": self.error,
        }


def inspect_client_installs(
    *,
    project_root: Path,
    home: Path | None = None,
    clients: list[str] | None = None,
) -> list[ClientInstall]:
    selected = clients or ["codex", "claude"]
    user_home = (home or Path.home()).expanduser()
    root = project_root.expanduser()
    return [_inspect_client(client, project_root=root, home=user_home) for client in selected]


def _inspect_client(client: str, *, project_root: Path, home: Path) -> ClientInstall:
    source_root = _source_root(project_root, client)
    cache_base = _cache_base(home, client)
    cache_root = cache_base / __version__
    manifest_path = _manifest_path(source_root, client)
    if not cache_root.exists():
        return ClientInstall(
            client=client,
            source_root=source_root if source_root.exists() else None,
            cache_root=cache_root,
            cache_state="missing",
            version=None,
            manifest_path=manifest_path if manifest_path.exists() else None,
            mcp_config_path=None,
            skills={skill: "missing" for skill in PRODUCT_SKILLS},
            configured_server=None,
        )
    skills = {skill: _skill_state(cache_root / "skills" / skill / "SKILL.md") for skill in PRODUCT_SKILLS}
    mcp_config_path = cache_root / ".mcp.json"
    configured_server: dict[str, Any] | None = None
    error: str | None = None
    if mcp_config_path.exists():
        try:
            payload = json.loads(mcp_config_path.read_text(encoding="utf-8"))
            configured_server = dict(payload["mcpServers"][MCP_SERVER_NAME])
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            error = str(exc)
    return ClientInstall(
        client=client,
        source_root=source_root if source_root.exists() else None,
        cache_root=cache_root,
        cache_state="installed",
        version=__version__,
        manifest_path=manifest_path if manifest_path.exists() else None,
        mcp_config_path=mcp_config_path if mcp_config_path.exists() else None,
        skills=skills,
        configured_server=configured_server,
        error=error,
    )


def _source_root(project_root: Path, client: str) -> Path:
    if client == "codex":
        return project_root / "plugins/codex/meridian"
    if client == "claude":
        return project_root / "plugins/claude-code/meridian"
    raise ValueError(f"unknown Meridian client: {client}")


def _cache_base(home: Path, client: str) -> Path:
    if client == "codex":
        return home / ".codex/plugins/cache/meridian/meridian"
    if client == "claude":
        return home / ".claude/plugins/cache/meridian/meridian"
    raise ValueError(f"unknown Meridian client: {client}")


def _manifest_path(source_root: Path, client: str) -> Path:
    if client == "codex":
        return source_root / ".codex-plugin/plugin.json"
    if client == "claude":
        return source_root / ".claude-plugin/plugin.json"
    raise ValueError(f"unknown Meridian client: {client}")


def _skill_state(path: Path) -> str:
    if not path.exists():
        return "missing"
    try:
        path.read_text(encoding="utf-8")
    except OSError:
        return "unreadable"
    if path.is_dir():
        return "unreadable"
    return "readable"
```

Update `src/meridian/setup/__init__.py`:

```python
from meridian.setup.clients import ClientInstall, inspect_client_installs
```

Add `ClientInstall` and `inspect_client_installs` to `__all__`.

- [ ] **Step 4: Run client inspector tests**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_client_inspector" -v
```

Expected: PASS for 2 selected tests.

- [ ] **Step 5: Commit client inspector**

Run:

```bash
git add src/meridian/setup/__init__.py src/meridian/setup/clients.py tests/test_cli.py
git commit -m "feat(setup): inspect plugin client caches"
```

---

### Task 3: Doctor Report

**Files:**
- Create: `src/meridian/setup/doctor.py`
- Modify: `src/meridian/setup/__init__.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing doctor tests**

Add import:

```python
from meridian.setup.doctor import build_setup_doctor_report, format_setup_doctor
```

Add test:

```python
    def test_setup_doctor_reports_repair_available_for_skill_visible_mcp_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            home = Path(tmp) / "home"
            cache_root = home / ".codex/plugins/cache/meridian/meridian" / __version__
            for skill in ["meridian", "wiki", "lab"]:
                skill_path = cache_root / "skills" / skill / "SKILL.md"
                skill_path.parent.mkdir(parents=True, exist_ok=True)
                skill_path.write_text(f"# {skill}\n", encoding="utf-8")
            (cache_root / ".mcp.json").write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "command": "python3",
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            def runner(argv: list[str], timeout: float = 10.0) -> CommandResult:
                if argv[0] == sys.executable and "-c" in argv:
                    return CommandResult(0, f"{sys.executable}\n{__version__}\n", "")
                if argv[0] == sys.executable and "--help" in argv:
                    return CommandResult(0, "usage: python -m meridian.mcp", "")
                if argv[0] == sys.executable and "capabilities" in argv:
                    return CommandResult(0, '{"schema_version": "meridian.mcp_adapter.v0"}', "")
                if argv[0] == "python3":
                    return CommandResult(127, "", "python3: command not found")
                return CommandResult(1, "", f"unexpected argv: {argv}")

            report = build_setup_doctor_report(project_root=root, home=home, clients=["codex"], runner=runner)

        self.assertEqual(report.status, "repair_available")
        self.assertIn("skill_visible_but_mcp_unavailable", {finding["code"] for finding in report.findings})
        self.assertIn("mcp_repair_available", {finding["code"] for finding in report.findings})
        self.assertIn("repair_available", format_setup_doctor(report))
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_doctor_reports" -v
```

Expected: FAIL with import error for `meridian.setup.doctor`.

- [ ] **Step 3: Implement doctor report**

Create `src/meridian/setup/doctor.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from meridian.setup.clients import ClientInstall, inspect_client_installs
from meridian.setup.runtime import CommandRunner, RuntimeResolution, default_command_runner, resolve_meridian_runtime


@dataclass(frozen=True)
class RepairAction:
    client: str
    target: Path
    command: str
    args: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "client": self.client,
            "target": str(self.target),
            "command": self.command,
            "args": self.args,
        }


@dataclass(frozen=True)
class SetupDoctorReport:
    status: str
    runtime: RuntimeResolution
    clients: list[ClientInstall]
    findings: list[dict[str, str]]
    repair_plan: list[RepairAction]

    def to_dict(self) -> dict[str, object]:
        return {
            "status": self.status,
            "runtime": self.runtime.to_dict(),
            "clients": [client.to_dict() for client in self.clients],
            "findings": self.findings,
            "repair_plan": [action.to_dict() for action in self.repair_plan],
        }


def build_setup_doctor_report(
    *,
    project_root: Path,
    home: Path | None = None,
    clients: list[str] | None = None,
    runner: CommandRunner = default_command_runner,
) -> SetupDoctorReport:
    runtime = resolve_meridian_runtime(runner=runner)
    installs = inspect_client_installs(project_root=project_root, home=home, clients=clients)
    findings: list[dict[str, str]] = []
    repair_plan: list[RepairAction] = []
    for install in installs:
        _add_client_findings(install, runtime=runtime, findings=findings, repair_plan=repair_plan, runner=runner)
    if runtime.selected is None:
        findings.append(
            {
                "severity": "critical",
                "code": "no_valid_meridian_runtime",
                "message": "No Python runtime candidate can import Meridian and run MCP capabilities.",
                "next_action": "Install the Meridian core in a Python environment or set MERIDIAN_PYTHON.",
            }
        )
    status = _status(findings)
    return SetupDoctorReport(status=status, runtime=runtime, clients=installs, findings=findings, repair_plan=repair_plan)


def format_setup_doctor(report: SetupDoctorReport) -> str:
    selected = report.runtime.selected
    lines = [f"Meridian setup doctor: {report.status}", ""]
    lines.append("Runtime:")
    if selected is None:
        lines.append("- selected: none")
    else:
        lines.append(f"- selected: {selected.command}")
        lines.append(f"- meridian: {selected.version}")
        lines.append(f"- mcp module: {'pass' if selected.mcp_help_ok else 'fail'}")
        lines.append(f"- tools/list: {'pass' if selected.capabilities_ok else 'fail'}")
    for client in report.clients:
        lines.extend(
            [
                "",
                f"{client.client.title()}:",
                f"- skill cache: {_skill_summary(client)}",
                f"- mcp config: {'found' if client.mcp_config_path else 'missing'}",
                f"- current launcher: {_launcher_summary(client)}",
            ]
        )
    if report.findings:
        lines.extend(["", "Findings:"])
        for finding in report.findings:
            lines.append(f"- {finding['severity']}: {finding['code']} - {finding['message']}")
    if report.repair_plan:
        lines.extend(["", "Next action:"])
        first = report.repair_plan[0]
        lines.append(f"python -m meridian setup repair-mcp --client {first.client} --apply")
    return "\n".join(lines).rstrip() + "\n"


def _add_client_findings(
    install: ClientInstall,
    *,
    runtime: RuntimeResolution,
    findings: list[dict[str, str]],
    repair_plan: list[RepairAction],
    runner: CommandRunner,
) -> None:
    if install.cache_state == "missing":
        findings.append(
            {
                "severity": "degraded",
                "code": "needs_plugin_install",
                "message": f"{install.client} Meridian plugin cache is missing.",
                "next_action": f"Install or reinstall the Meridian plugin for {install.client}.",
            }
        )
        return
    if install.mcp_config_path is None or install.configured_server is None:
        findings.append(
            {
                "severity": "critical",
                "code": "mcp_required_tool_missing",
                "message": f"{install.client} MCP config is missing or invalid.",
                "next_action": f"Repair the Meridian MCP cache for {install.client}.",
            }
        )
        return
    command = str(install.configured_server.get("command") or "")
    args = [str(item) for item in install.configured_server.get("args") or []]
    smoke = runner([command, *args[:-1], "--help"] if args[-1:] == ["serve"] else [command, *args], 10.0)
    if smoke.returncode != 0:
        findings.append(
            {
                "severity": "critical",
                "code": "skill_visible_but_mcp_unavailable",
                "message": f"{install.client} skill cache is readable, but configured MCP launcher failed.",
                "next_action": f"Run python -m meridian setup repair-mcp --client {install.client} --apply.",
            }
        )
        if runtime.selected is not None and install.mcp_config_path is not None:
            command, repair_args = runtime.selected.mcp_server_command()
            repair_plan.append(RepairAction(install.client, install.mcp_config_path, command, repair_args))
            findings.append(
                {
                    "severity": "degraded",
                    "code": "mcp_repair_available",
                    "message": f"{install.client} MCP cache can be repaired with {command}.",
                    "next_action": f"Run python -m meridian setup repair-mcp --client {install.client} --apply.",
                }
            )


def _status(findings: list[dict[str, str]]) -> str:
    codes = {finding["code"] for finding in findings}
    if "no_valid_meridian_runtime" in codes:
        return "blocked"
    if "mcp_repair_available" in codes:
        return "repair_available"
    if any(finding["severity"] == "critical" for finding in findings):
        return "blocked"
    if findings:
        return "degraded"
    return "ready"


def _skill_summary(client: ClientInstall) -> str:
    if all(state == "readable" for state in client.skills.values()):
        return "readable"
    return ",".join(f"{name}:{state}" for name, state in sorted(client.skills.items()))


def _launcher_summary(client: ClientInstall) -> str:
    if not client.configured_server:
        return "missing"
    args = " ".join(str(item) for item in client.configured_server.get("args") or [])
    return f"{client.configured_server.get('command')} {args}".strip()
```

Update `src/meridian/setup/__init__.py` exports for `RepairAction`, `SetupDoctorReport`, `build_setup_doctor_report`, and `format_setup_doctor`.

- [ ] **Step 4: Run doctor tests**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_doctor_reports" -v
```

Expected: PASS for the doctor report test.

- [ ] **Step 5: Commit doctor report**

Run:

```bash
git add src/meridian/setup/__init__.py src/meridian/setup/doctor.py tests/test_cli.py
git commit -m "feat(setup): report MCP readiness"
```

---

### Task 4: Repair Flow

**Files:**
- Create: `src/meridian/setup/repair.py`
- Modify: `src/meridian/setup/__init__.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing repair tests**

Add import:

```python
from meridian.setup.repair import apply_mcp_repair, plan_mcp_repair
```

Add tests:

```python
    def test_setup_repair_mcp_dry_run_writes_no_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mcp_path = Path(tmp) / ".mcp.json"
            original = {
                "mcpServers": {
                    "meridian-paper-wiki": {
                        "command": "python3",
                        "args": ["-m", "meridian.mcp", "serve"],
                    }
                }
            }
            mcp_path.write_text(json.dumps(original), encoding="utf-8")
            action = plan_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
            )

        self.assertEqual(json.loads(mcp_path.read_text(encoding="utf-8")), original)
        self.assertEqual(action.client, "codex")
        self.assertEqual(action.target, mcp_path)

    def test_setup_repair_mcp_apply_writes_backup_and_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mcp_path = root / ".mcp.json"
            mcp_path.write_text(
                json.dumps(
                    {
                        "mcpServers": {
                            "meridian-paper-wiki": {
                                "command": "python3",
                                "args": ["-m", "meridian.mcp", "serve"],
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            result = apply_mcp_repair(
                client="codex",
                mcp_config_path=mcp_path,
                command="C:/Python/python.exe",
                args=["-m", "meridian.mcp", "serve"],
                timestamp="20260615-153012",
            )

            updated = json.loads(mcp_path.read_text(encoding="utf-8"))

        self.assertTrue(result.applied)
        self.assertTrue(result.backup_path.exists())
        self.assertEqual(updated["mcpServers"]["meridian-paper-wiki"]["command"], "C:/Python/python.exe")
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_repair_mcp" -v
```

Expected: FAIL with import error for `meridian.setup.repair`.

- [ ] **Step 3: Implement repair helpers**

Create `src/meridian/setup/repair.py`:

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from meridian.setup.clients import MCP_SERVER_NAME
from meridian.setup.doctor import RepairAction


@dataclass(frozen=True)
class RepairResult:
    client: str
    target: Path
    backup_path: Path
    command: str
    args: list[str]
    applied: bool
    restart_required: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "client": self.client,
            "target": str(self.target),
            "backup_path": str(self.backup_path),
            "command": self.command,
            "args": self.args,
            "applied": self.applied,
            "restart_required": self.restart_required,
        }


def plan_mcp_repair(*, client: str, mcp_config_path: Path, command: str, args: list[str]) -> RepairAction:
    return RepairAction(client=client, target=mcp_config_path, command=command, args=args)


def apply_mcp_repair(
    *,
    client: str,
    mcp_config_path: Path,
    command: str,
    args: list[str],
    timestamp: str | None = None,
) -> RepairResult:
    stamp = timestamp or datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = mcp_config_path.with_name(f"{mcp_config_path.name}.bak-{stamp}")
    original = mcp_config_path.read_text(encoding="utf-8")
    backup_path.write_text(original, encoding="utf-8")
    payload = json.loads(original)
    payload.setdefault("mcpServers", {})
    payload["mcpServers"][MCP_SERVER_NAME] = {"command": command, "args": args}
    mcp_config_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return RepairResult(
        client=client,
        target=mcp_config_path,
        backup_path=backup_path,
        command=command,
        args=args,
        applied=True,
        restart_required=True,
    )
```

Update `src/meridian/setup/__init__.py` exports for `RepairResult`, `apply_mcp_repair`, and `plan_mcp_repair`.

- [ ] **Step 4: Run repair tests**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_repair_mcp" -v
```

Expected: PASS for 2 selected tests.

- [ ] **Step 5: Commit repair helpers**

Run:

```bash
git add src/meridian/setup/__init__.py src/meridian/setup/repair.py tests/test_cli.py
git commit -m "feat(setup): repair MCP cache config"
```

---

### Task 5: CLI Commands

**Files:**
- Modify: `src/meridian/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing CLI tests**

Add tests:

```python
    def test_setup_doctor_cli_writes_json_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            json_out = root / "setup.json"
            exit_code, stdout, stderr = _run_cli_capture(
                [
                    "setup",
                    "doctor",
                    "--client",
                    "codex",
                    "--project-root",
                    str(Path.cwd()),
                    "--json-out",
                    str(json_out),
                ]
            )

        self.assertIn(exit_code, {0, 1})
        self.assertEqual(stderr, "")
        self.assertIn("Meridian setup doctor:", stdout)
        self.assertTrue(json_out.exists())
        self.assertIn("status", json.loads(json_out.read_text(encoding="utf-8")))

    def test_setup_repair_mcp_cli_dry_run_does_not_apply(self) -> None:
        exit_code, stdout, stderr = _run_cli_capture(
            ["setup", "repair-mcp", "--client", "codex", "--project-root", str(Path.cwd())]
        )

        self.assertIn(exit_code, {0, 1})
        self.assertEqual(stderr, "")
        self.assertIn("No files changed", stdout)
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_doctor_cli or setup_repair_mcp_cli" -v
```

Expected: FAIL because `setup` is not a recognized top-level command.

- [ ] **Step 3: Add parser entries**

In `src/meridian/cli.py`, import setup helpers:

```python
from meridian.setup.doctor import build_setup_doctor_report, format_setup_doctor
from meridian.setup.repair import apply_mcp_repair
```

In `build_parser()`, after `framework_check` arguments and before `wiki = ...`, add:

```python
    setup = subparsers.add_parser("setup", help="Meridian setup diagnostics and repair")
    setup_subparsers = setup.add_subparsers(dest="command", required=True)

    setup_doctor = setup_subparsers.add_parser("doctor", help="Diagnose Meridian runtime, plugin, and MCP readiness.")
    setup_doctor.add_argument("--client", choices=["codex", "claude", "all"], default="all")
    setup_doctor.add_argument("--project-root", type=Path, default=Path.cwd())
    setup_doctor.add_argument("--json-out", type=Path, default=None)

    setup_repair = setup_subparsers.add_parser("repair-mcp", help="Repair installed Meridian MCP client cache config.")
    setup_repair.add_argument("--client", choices=["codex", "claude"], required=True)
    setup_repair.add_argument("--project-root", type=Path, default=Path.cwd())
    setup_repair.add_argument("--apply", action="store_true")
    setup_repair.add_argument("--json-out", type=Path, default=None)
```

- [ ] **Step 4: Add CLI handlers**

In `main()`, after the `framework-check` block and before the first `wiki` block, add:

```python
        if args.product == "setup" and args.command == "doctor":
            clients = None if args.client == "all" else [args.client]
            report = build_setup_doctor_report(project_root=args.project_root, clients=clients)
            if args.json_out:
                args.json_out.parent.mkdir(parents=True, exist_ok=True)
                args.json_out.write_text(json.dumps(report.to_dict(), indent=2) + "\n", encoding="utf-8")
                print(f"Wrote setup doctor JSON: {args.json_out}")
            print(format_setup_doctor(report), end="")
            return 0 if report.status in {"ready", "degraded", "repair_available"} else 1

        if args.product == "setup" and args.command == "repair-mcp":
            report = build_setup_doctor_report(project_root=args.project_root, clients=[args.client])
            if not report.repair_plan:
                print("No MCP repair is available.")
                print(format_setup_doctor(report), end="")
                return 1
            action = report.repair_plan[0]
            if not args.apply:
                print("Planned repair:")
                print(f"- write: {action.target}")
                print(f"- command: {action.command}")
                print(f"- args: {' '.join(action.args)}")
                print("")
                print("No files changed. Re-run with --apply.")
                return 0
            result = apply_mcp_repair(
                client=action.client,
                mcp_config_path=action.target,
                command=action.command,
                args=action.args,
            )
            if args.json_out:
                args.json_out.parent.mkdir(parents=True, exist_ok=True)
                args.json_out.write_text(json.dumps(result.to_dict(), indent=2) + "\n", encoding="utf-8")
                print(f"Wrote setup repair JSON: {args.json_out}")
            print("Applied repair:")
            print(f"- backup written: {result.backup_path}")
            print("- MCP config updated")
            print("- restart required: yes")
            return 0
```

- [ ] **Step 5: Run CLI tests**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_doctor_cli or setup_repair_mcp_cli" -v
```

Expected: PASS for 2 selected tests.

- [ ] **Step 6: Commit CLI commands**

Run:

```bash
git add src/meridian/cli.py tests/test_cli.py
git commit -m "feat(setup): expose doctor and MCP repair CLI"
```

---

### Task 6: Framework Check Integration

**Files:**
- Modify: `src/meridian/framework_check.py`
- Modify: `src/meridian/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing framework tests**

Add test:

```python
    def test_framework_check_include_mcp_runtime_reports_setup_findings(self) -> None:
        report = run_framework_check(project_root=Path.cwd(), include_mcp_runtime=True)

        names = [category.name for category in report.categories]
        self.assertIn("MCP Runtime", names)
        runtime_category = next(category for category in report.categories if category.name == "MCP Runtime")
        self.assertTrue(runtime_category.findings)
```

Update the CLI JSON/report test command to include `--include-mcp-runtime` in one assertion path:

```python
"--include-mcp-runtime",
```

- [ ] **Step 2: Run framework test to verify failure**

Run:

```bash
python -m pytest tests/test_cli.py -k "framework_check_include_mcp_runtime" -v
```

Expected: FAIL because `run_framework_check()` does not accept `include_mcp_runtime`.

- [ ] **Step 3: Add framework parameter and category**

In `src/meridian/framework_check.py`, add `"MCP Runtime"` to a separate optional list without changing default `FRAMEWORK_CHECK_CATEGORIES`:

```python
MCP_RUNTIME_CATEGORY = "MCP Runtime"
```

Update `run_framework_check` signature:

```python
def run_framework_check(
    *,
    project_root: Path,
    library_root: Path | None = None,
    wiki_root: Path | None = None,
    lab_root: Path | None = None,
    require_workspace: bool = False,
    include_mcp_runtime: bool = False,
) -> FrameworkCheckReport:
```

After the base category list is built, append:

```python
    if include_mcp_runtime:
        categories.append(_mcp_runtime_category(root))
```

Add helper:

```python
def _mcp_runtime_category(root: Path) -> FrameworkCategory:
    from meridian.setup.doctor import build_setup_doctor_report

    findings: list[FrameworkFinding] = []
    category = MCP_RUNTIME_CATEGORY
    report = build_setup_doctor_report(project_root=root)
    for finding in report.findings:
        severity = "critical" if finding["severity"] == "critical" else "degraded"
        _add(
            findings,
            category,
            severity,
            "manual",
            finding["code"],
            finding["message"],
            finding["next_action"],
        )
    if not findings:
        _add(
            findings,
            category,
            "info",
            "manual",
            "mcp_runtime_ready",
            "Meridian MCP runtime and installed client caches are ready.",
            "No action required.",
        )
    return _category(category, findings)
```

- [ ] **Step 4: Add CLI flag**

In `src/meridian/cli.py`, add parser argument to `framework_check`:

```python
    framework_check.add_argument(
        "--include-mcp-runtime",
        action="store_true",
        help="Run runtime-backed MCP launcher and client cache readiness checks.",
    )
```

Pass it into `run_framework_check`:

```python
include_mcp_runtime=args.include_mcp_runtime,
```

- [ ] **Step 5: Run framework tests**

Run:

```bash
python -m pytest tests/test_cli.py -k "framework_check_include_mcp_runtime or framework_check_reports_stable_categories" -v
```

Expected: PASS. The stable default categories test must still pass without the new flag.

- [ ] **Step 6: Commit framework integration**

Run:

```bash
git add src/meridian/framework_check.py src/meridian/cli.py tests/test_cli.py
git commit -m "feat(setup): include MCP runtime framework check"
```

---

### Task 7: Product Skill And Documentation Policy

**Files:**
- Modify: `plugins/codex/meridian/skills/meridian/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/meridian/SKILL.md`
- Modify: `plugins/codex/meridian/skills/lab/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/lab/SKILL.md`
- Modify: `plugins/codex/meridian/skills/wiki/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/wiki/SKILL.md`
- Modify: `README.md`
- Modify: `docs/plugin-distribution.md`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Write failing skill/docs tests**

Add assertions to existing skill tests:

```python
    def test_setup_doctor_skill_and_docs_policy_is_documented(self) -> None:
        meridian = (CODEX_PLUGIN_SKILL_ROOT / "meridian/SKILL.md").read_text(encoding="utf-8")
        lab = (CODEX_PLUGIN_SKILL_ROOT / "lab/SKILL.md").read_text(encoding="utf-8")
        wiki = (CODEX_PLUGIN_SKILL_ROOT / "wiki/SKILL.md").read_text(encoding="utf-8")
        readme = Path("README.md").read_text(encoding="utf-8")
        distribution = Path("docs/plugin-distribution.md").read_text(encoding="utf-8")

        self.assertIn("python -m meridian setup doctor", meridian)
        self.assertIn("python -m meridian setup repair-mcp", meridian)
        self.assertIn("paper_wiki_grounding", lab)
        self.assertIn("fallback_grounding", lab)
        self.assertIn("Use Wiki blocked", wiki)
        self.assertIn("setup doctor", readme)
        self.assertIn("repair-mcp", distribution)
```

- [ ] **Step 2: Run skill/docs test to verify failure**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_doctor_skill_and_docs_policy" -v
```

Expected: FAIL because the new setup doctor policy is not yet documented in skills/docs.

- [ ] **Step 3: Update Meridian setup skill in both clients**

In both Meridian setup skill files, add a `Setup Doctor` section after `Status Check`:

```markdown
### Setup Doctor

Use when skills are visible but MCP tools are unavailable, when Lab/Wiki
grounding reports missing Paper Wiki prior state, or after plugin/core updates.

Minimum completion:

- Run:

```bash
python -m meridian setup doctor --client all
```

- If the report says `repair_available`, ask before applying and then run:

```bash
python -m meridian setup repair-mcp --client <codex|claude> --apply
```

- Tell the user to restart the Codex or Claude session after MCP cache repair.
- Do not continue to normal Wiki or Lab work while `skill_visible_but_mcp_unavailable`
  or `no_valid_meridian_runtime` is unresolved.
```

- [ ] **Step 4: Update Lab skills in both clients**

Add this policy near Lab Wiki grounding instructions:

```markdown
### Paper Wiki Grounding Readiness

When a Lab task depends on prior papers, related work, risk, or implementation
hooks, check Paper Wiki grounding before answering. Prefer MCP tools
`meridian.context`, `meridian.read`, and `meridian.trace`.

If those tools are unavailable, run or request:

```bash
python -m meridian setup doctor --client all
```

If the doctor reports `repair_available`, stop and present the repair command.
Use external primary-source fallback only after the user explicitly chooses to
continue without Paper Wiki grounding. Any fallback answer must include:

```text
paper_wiki_grounding: unavailable | skipped_by_user
fallback_grounding: external_primary_sources
setup_next_action: <repair command or empty>
```
```

- [ ] **Step 5: Update Wiki skills in both clients**

Add this policy under Use Wiki workflow:

```markdown
### Use Wiki Setup Blocker

If MCP tools are unavailable, try local CLI retrieval only when the local Python
environment can import `meridian`. If both MCP and CLI are unavailable, return a
setup blocker instead of answering from web search:

```text
Use Wiki blocked:
- MCP tools unavailable
- local core import failed
- repair: python -m meridian setup doctor --client all
```
```

- [ ] **Step 6: Update README and plugin distribution docs**

Add to `README.md` install section:

```markdown
After installing or updating the plugin, run:

```bash
python -m meridian setup doctor --client all
```

If MCP tools are unavailable but a repair is available:

```bash
python -m meridian setup repair-mcp --client codex --apply
python -m meridian setup repair-mcp --client claude --apply
```

Restart the client session after repair so MCP tools are re-registered.
```

Add equivalent text to `docs/plugin-distribution.md`.

- [ ] **Step 7: Run skill/docs tests**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_doctor_skill_and_docs_policy or meridian_plugin_skill_copies_match_repo_skills" -v
```

Expected: PASS and Codex/Claude copies remain synchronized.

- [ ] **Step 8: Commit skill/docs updates**

Run:

```bash
git add README.md docs/plugin-distribution.md plugins/codex/meridian/skills/meridian/SKILL.md plugins/claude-code/meridian/skills/meridian/SKILL.md plugins/codex/meridian/skills/lab/SKILL.md plugins/claude-code/meridian/skills/lab/SKILL.md plugins/codex/meridian/skills/wiki/SKILL.md plugins/claude-code/meridian/skills/wiki/SKILL.md tests/test_cli.py
git commit -m "docs(setup): route MCP blockers through setup doctor"
```

---

### Task 8: End-To-End Verification And Local Cache Smoke

**Files:**
- No new source files unless a previous task reveals a test-only fix.

- [ ] **Step 1: Run targeted setup and MCP tests**

Run:

```bash
python -m pytest tests/test_cli.py -k "setup_ or mcp_entrypoint or framework_check" -v
```

Expected: PASS for all selected tests.

- [ ] **Step 2: Run framework check with runtime**

Run:

```bash
python -m meridian framework-check --include-mcp-runtime --project-root D:\develop\meridian\.worktrees\strict-ingest-gate
```

Expected: exits 0 or exits 1 only if it reports a real local setup blocker with a concrete `setup repair-mcp` or install next action. Do not ignore a critical blocker.

- [ ] **Step 3: Run setup doctor dry-run**

Run:

```bash
python -m meridian setup doctor --client all --project-root D:\develop\meridian\.worktrees\strict-ingest-gate
```

Expected: prints `Meridian setup doctor:` and reports either `ready`, `degraded`, or `repair_available`. If `blocked`, inspect findings and fix the resolver/inspector before continuing.

- [ ] **Step 4: Run repair dry-run**

Run:

```bash
python -m meridian setup repair-mcp --client codex --project-root D:\develop\meridian\.worktrees\strict-ingest-gate
```

Expected: prints either `Planned repair` plus `No files changed` or `No MCP repair is available.` No files should be modified in dry-run.

- [ ] **Step 5: Run direct MCP tools/list smoke**

Run:

```bash
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | python -m meridian.mcp serve
```

Expected: JSON response includes `meridian.context`, `meridian.read`, `meridian.trace`, `meridian.update`, `meridian.propose`, `meridian.apply`, and `meridian.audit`.

- [ ] **Step 6: Run full test suite and record known residuals**

Run:

```bash
python -m pytest
```

Expected: PASS. If Windows-only existing failures around `/private/tmp/meridian-context` or strict ingest gate expectations remain, record the exact failing tests and confirm none are caused by setup doctor changes.

- [ ] **Step 7: Final commit**

Run:

```bash
git status --short
git add src/meridian/setup src/meridian/cli.py src/meridian/framework_check.py tests/test_cli.py README.md docs/plugin-distribution.md plugins/codex/meridian/skills plugins/claude-code/meridian/skills
git commit -m "feat(setup): add Meridian MCP lifecycle doctor"
```

Expected: commit succeeds with only setup doctor related files staged. Do not stage unrelated `docs/knowledge-layer-quality-audit.md` or other pre-existing workspace changes.

---

## Self-Review

- Spec coverage: Runtime resolver is covered by Task 1; client cache inspection by Task 2; doctor report by Task 3; repair flow by Task 4; CLI by Task 5; framework integration by Task 6; Lab/Wiki behavior and docs by Task 7; verification and local smoke by Task 8.
- Placeholder scan: This plan contains no incomplete sections or deferred work markers.
- Type consistency: `RuntimeCandidate`, `RuntimeResolution`, `ClientInstall`, `RepairAction`, `SetupDoctorReport`, and `RepairResult` names are introduced before later tasks use them. CLI commands match the spec: `setup doctor`, `setup repair-mcp`, and `framework-check --include-mcp-runtime`.
