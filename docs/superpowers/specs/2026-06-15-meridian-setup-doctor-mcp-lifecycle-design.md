# Meridian Setup Doctor MCP Lifecycle Design

## Context

Meridian currently has a gap between plugin visibility and real workflow
readiness. A client can load `meridian:lab` or `meridian:wiki` skill text while
the MCP server fails to start, and the agent may then fall back to local CLI or
web grounding without a clear setup blocker. The observed failure chain was:

1. The Meridian Lab skill was readable from the Codex plugin cache.
2. `meridian.context`, `meridian.read`, and `meridian.trace` MCP tools were not
   callable in the client.
3. A local fallback Python environment could not import the `meridian` package.
4. Lab continued with external primary-source grounding while Paper Wiki prior
   state was missing.

This is not just a `python` versus `python3` bug. It is an installation and
runtime lifecycle bug: skill cache, Python core, MCP launcher, MCP tool
registration, and workflow grounding readiness are separate states and must be
diagnosed separately.

## Goals

- Provide a deterministic setup doctor that reports whether Meridian is ready
  for Codex and Claude Code plugin use.
- Resolve a local Python runtime by smoke testing real candidates rather than
  guessing command names.
- Repair installed client MCP cache configuration when a working runtime exists.
- Extend framework health checks so they can identify skill-visible but
  MCP-unavailable states.
- Make Lab and Wiki skills stop on setup blockers instead of silently replacing
  Paper Wiki grounding with external research.
- Keep repository plugin source portable while allowing machine-specific MCP
  configuration in installed user cache.

## Non-Goals

- Do not build a general marketplace manager for arbitrary MCP clients.
- Do not mutate the user's global Python installation.
- Do not write machine-specific absolute paths into repository plugin source.
- Do not silently fall back from Paper Wiki grounding to web grounding.
- Do not change Paper Wiki source, canonical page, or ingest artifact schemas.

## Proposed CLI Surface

Add a setup command group:

```bash
python -m meridian setup doctor
python -m meridian setup doctor --client codex
python -m meridian setup doctor --client claude
python -m meridian setup doctor --client all --json-out setup.json

python -m meridian setup repair-mcp --client codex
python -m meridian setup repair-mcp --client codex --apply
python -m meridian setup repair-mcp --client claude --apply
```

Extend framework check with runtime-aware MCP checks:

```bash
python -m meridian framework-check --include-mcp-runtime
```

`repair-mcp` defaults to dry-run. File writes require `--apply`.

## Runtime Resolver

The resolver builds a list of launcher candidates and runs the same smoke tests
for each one. The first candidate that passes all required checks becomes the
selected runtime for MCP repair.

Candidate order:

1. Current `sys.executable`.
2. `MERIDIAN_PYTHON`, when set.
3. `python`.
4. `python3`.
5. Windows launcher form `py -3`.
6. Installed console scripts such as `meridian` or `meridian-mcp`, if present.

Required smoke tests for Python-style candidates:

```bash
<candidate> -c "import sys, meridian; print(sys.executable); print(meridian.__version__)"
<candidate> -m meridian.mcp --help
<candidate> -m meridian.mcp capabilities --detail summary
```

The resolver records command-not-found, import failure, version mismatch, MCP
module failure, and capabilities failure separately. A runtime that can start
Python but cannot import Meridian is not usable for MCP repair.

Console-script candidates are diagnostic-only for the first version unless they
can produce an equivalent `command` and `args` pair for `.mcp.json`. The primary
repair target remains a Python executable plus `-m meridian.mcp serve`.

## Client Cache Inspector

The inspector checks client-specific plugin locations independently.

Codex paths:

```text
source package: plugins/codex/meridian/
installed cache: ~/.codex/plugins/cache/meridian/meridian/<version>/
marketplace cache: ~/.codex/.tmp/marketplaces/meridian/
```

Claude Code paths:

```text
source package: plugins/claude-code/meridian/
installed cache: ~/.claude/plugins/cache/meridian/meridian/<version>/
marketplace cache: ~/.claude/plugins/marketplaces/meridian/
```

For each visible client install, inspect:

- plugin manifest existence and version
- `skills/meridian/SKILL.md`, `skills/wiki/SKILL.md`, and
  `skills/lab/SKILL.md` readability
- `.mcp.json` existence and JSON validity
- `mcpServers.meridian-paper-wiki` presence
- configured launcher smoke result
- `tools/list` result and required Meridian MCP tool names

The inspector treats unreadable paths as setup drift, not as missing features.

## Repair Strategy

Repository plugin source keeps a portable default:

```json
{
  "mcpServers": {
    "meridian-paper-wiki": {
      "command": "python",
      "args": ["-m", "meridian.mcp", "serve"]
    }
  }
}
```

Installed user cache may be repaired to a machine-specific command:

```json
{
  "mcpServers": {
    "meridian-paper-wiki": {
      "command": "C:\\ProgramData\\miniconda3\\python.exe",
      "args": ["-m", "meridian.mcp", "serve"]
    }
  }
}
```

Dry-run output reports the planned backup path, target path, selected runtime,
and post-repair smoke command. `--apply` writes a timestamped backup such as
`.mcp.json.bak-20260615-153012`, writes the repaired `.mcp.json`, then runs an
immediate MCP `initialize` and `tools/list` smoke.

After a successful repair, the command must report that the client session needs
to be restarted so the MCP tool registry can be reloaded.

## Data Model

Introduce a small setup package:

```text
src/meridian/setup/
  __init__.py
  runtime.py
  clients.py
  doctor.py
  repair.py
```

Core records:

```python
RuntimeCandidate:
    label: str
    command: str
    args_prefix: list[str]
    source: str
    exists: bool
    import_ok: bool
    mcp_help_ok: bool
    capabilities_ok: bool
    version: str | None
    executable: str | None
    error: str | None

ClientInstall:
    client: str
    source_root: Path | None
    cache_root: Path | None
    version: str | None
    manifest_path: Path | None
    mcp_config_path: Path | None
    skills: dict[str, str]
    configured_server: dict | None

SetupDoctorReport:
    status: str
    runtime_candidates: list[RuntimeCandidate]
    selected_runtime: RuntimeCandidate | None
    clients: list[ClientInstall]
    findings: list[FrameworkFinding]
    repair_plan: list[RepairAction]
```

The initial implementation can use plain dataclasses and JSON serialization
helpers rather than introducing a new dependency.

## Finding Codes

Add runtime-aware setup and framework findings:

```text
mcp_launcher_command_not_found
mcp_launcher_import_failed
mcp_server_start_failed
mcp_tools_list_failed
mcp_required_tool_missing
skill_visible_but_mcp_unavailable
core_plugin_version_drift
mcp_cache_source_drift
mcp_repair_available
needs_plugin_install
no_valid_meridian_runtime
```

The screenshot failure should classify as
`skill_visible_but_mcp_unavailable` with `mcp_repair_available` when a working
runtime is found, or `no_valid_meridian_runtime` when no candidate can import
Meridian.

## Output Contract

Human-readable doctor output:

```text
Meridian setup doctor: repair_available

Runtime:
- selected: C:\ProgramData\miniconda3\python.exe
- meridian: 0.5.3
- mcp module: pass
- tools/list: pass

Codex:
- skill cache: readable
- mcp config: found
- current launcher: python3
- current launcher smoke: fail
- repair: available

Next action:
python -m meridian setup repair-mcp --client codex --apply
```

JSON output mirrors `SetupDoctorReport` and includes every candidate, every
client install record, findings, and repair actions.

Dry-run repair output:

```text
Planned repair:
- backup: .mcp.json.bak-20260615-153012
- write: .mcp.json
- command: C:\ProgramData\miniconda3\python.exe
- args: -m meridian.mcp serve

No files changed. Re-run with --apply.
```

Applied repair output:

```text
Applied repair:
- backup written
- MCP config updated
- post-repair smoke: tools/list pass
- restart required: yes
```

## Framework Check Integration

`framework-check --include-mcp-runtime` includes a runtime-backed MCP category
or augments `Plugin Bundle` with runtime findings. The default check may retain
lightweight file checks for speed, but when runtime checks are requested it must
verify:

- the configured launcher exists
- the launcher can import Meridian
- the MCP module starts
- `initialize` succeeds
- `tools/list` includes all required Meridian tools

The report should distinguish source package drift from installed cache drift.
It should never report overall `ready` when a product skill is visible but its
corresponding MCP tools are unavailable.

## Lab And Wiki Skill Policy

Lab and Wiki skills must treat Paper Wiki grounding as an explicit readiness
state.

Lab policy:

1. For tasks needing Paper Wiki grounding, perform a grounding check first.
2. Prefer MCP tools: `meridian.context`, `meridian.read`, `meridian.trace`.
3. If tools are unavailable, run or request setup doctor.
4. If doctor reports `repair_available`, stop and present the repair command.
5. Use external primary-source fallback only after the user explicitly chooses
   to continue without Paper Wiki grounding.

Lab outputs that proceed without wiki grounding must include:

```text
paper_wiki_grounding: unavailable | skipped_by_user
fallback_grounding: external_primary_sources
setup_next_action: <repair command or empty>
```

Wiki policy:

- `Use Wiki` can fall back from MCP to local CLI retrieval only when the local
  core import succeeds.
- If both MCP and CLI are unavailable, return a setup blocker and a doctor or
  repair command.
- Do not present external web research as a successful Use Wiki answer.

## Testing Plan

Unit tests:

- resolver accepts `sys.executable`
- resolver rejects missing `python3`
- resolver rejects Python that cannot import `meridian`
- resolver prefers valid `MERIDIAN_PYTHON`
- client inspector finds Codex and Claude cache roots
- repair dry-run writes no files
- repair apply writes backup and patched `.mcp.json`
- post-repair smoke verifies required MCP tool names

Integration-style tests with temporary directories:

- bad `.mcp.json` plus good runtime yields `repair_available`
- readable skill cache plus MCP launcher failure yields
  `skill_visible_but_mcp_unavailable`
- no valid Python candidate yields `blocked`
- missing plugin cache yields `needs_plugin_install`
- repaired cache uses absolute runtime while source package remains portable

Skill behavior tests:

- Meridian setup skill references setup doctor and repair commands
- Lab skill requires grounding check before fallback
- Wiki skill blocks Use Wiki when MCP and CLI are both unavailable

Regression smoke:

```bash
python -m pytest tests/test_cli.py -k "setup_doctor or mcp_entrypoint or framework_check"
python -m meridian setup doctor --client codex
python -m meridian setup repair-mcp --client codex
python -m meridian framework-check --include-mcp-runtime --project-root .
```

## Rollout Plan

1. Add runtime resolver and client inspector with dry-run doctor output.
2. Add repair command with backup and post-repair smoke.
3. Integrate runtime-aware findings into `framework-check`.
4. Update Meridian setup, Lab, and Wiki skill text.
5. Update README and plugin distribution docs.
6. Run targeted tests, framework check, and a local Codex cache repair smoke.

The first implementation should support Codex and Claude Code only. Additional
MCP clients can be added later behind the same client-inspector interface.
