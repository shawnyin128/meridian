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
    values = os.environ if env is None else env
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
    for candidate in (default_runtime_candidates() if candidates is None else candidates):
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
    if len(lines) < 2:
        return replace(
            candidate,
            exists=True,
            import_ok=False,
            error=import_result.stderr.strip() or import_result.stdout.strip() or "Meridian import output was incomplete.",
            error_code="mcp_launcher_import_failed",
        )
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
