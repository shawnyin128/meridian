# Meridian Wiki Use Call-Chain Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Meridian Wiki Use and MCP discovery/retrieval calls recover cleanly from missing workspace and index-write failures.

**Architecture:** Add a small shared call-chain error model in `src/meridian/mcp/adapter.py`, then use it from the JSON bridge and stdio server. Keep retrieval and workspace layout unchanged; this pass only changes when workspace resolution happens and how recoverable errors are shaped for CLI, MCP, and skill users.

**Tech Stack:** Python 3.9 stdlib, `unittest`, existing Meridian CLI/MCP modules, Markdown skill files.

---

## File Map

- Modify `src/meridian/mcp/adapter.py`: delay workspace resolution for `capabilities`, add structured error payload helpers, shape missing-workspace and index-write failures.
- Modify `src/meridian/mcp/server.py`: remove `Path("wiki")` fallback and return structured MCP tool errors from shared adapter payloads.
- Modify `plugins/codex/meridian/skills/wiki/SKILL.md`: teach Use Wiki to handle `needs_init` and `workspace_index_write_failed` before manual search fallback.
- Modify `plugins/claude-code/meridian/skills/wiki/SKILL.md`: keep Claude skill copy identical to Codex skill copy.
- Modify `tests/test_cli.py`: add regression tests for no-workspace capabilities, no-workspace MCP tool errors, JSON bridge no-workspace context, and error-shaping helper behavior.
- Create `docs/review/meridian-wiki-use-call-chain-resilience.md`: record developer/evaluator/release evidence.

## Task 1: Add Failing Regression Tests

**Files:**
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Add imports if needed**

Check the top of `tests/test_cli.py`. It already imports `json`, `os`, `tempfile`, `Path`, and `patch`. Do not add duplicate imports.

- [ ] **Step 2: Add JSON bridge capabilities no-workspace test**

Add this test near the existing MCP adapter tests:

```python
    def test_mcp_json_bridge_capabilities_does_not_require_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "empty-config"
            exit_code, stdout, stderr = _run_cli_capture(
                ["mcp", "capabilities", "--detail", "summary"],
                env={"MERIDIAN_CONFIG_HOME": str(config_home)},
            )

        self.assertEqual(exit_code, 0, stderr)
        payload = json.loads(stdout)
        self.assertEqual(payload["schema_version"], "meridian.mcp_adapter.v0")
        self.assertIn("entry_model", payload)
        self.assertIn("tools", payload)
```

- [ ] **Step 3: Add JSON bridge no-workspace context test**

Add this test near `test_wiki_context_requires_workspace_instead_of_guessing_local_wiki`:

```python
    def test_mcp_json_bridge_context_reports_needs_init_without_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "empty-config"
            exit_code, stdout, stderr = _run_cli_capture(
                ["mcp", "context", "--query", "agent workflow goals"],
                env={"MERIDIAN_CONFIG_HOME": str(config_home)},
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("needs_init", stderr)
        self.assertIn("meridian wiki init --library-root", stderr)
```

- [ ] **Step 4: Add MCP stdio no-workspace tool error test**

Add this test after `test_mcp_stdio_server_registry_and_tool_calls_share_adapter`:

```python
    def test_mcp_stdio_server_context_reports_needs_init_without_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_home = Path(tmp) / "empty-config"
            with patch.dict(os.environ, {"MERIDIAN_CONFIG_HOME": str(config_home)}):
                server = mcp_server.MeridianMCPServer()
                tools_response = server.handle_message({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
                tool_names = {tool["name"] for tool in tools_response["result"]["tools"]}
                self.assertIn("meridian.context", tool_names)

                context_response = server.handle_message(
                    {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {
                            "name": "meridian.context",
                            "arguments": {"query": "agent workflow goals"},
                        },
                    }
                )

        self.assertIn("result", context_response)
        result = context_response["result"]
        self.assertTrue(result["isError"])
        payload = json.loads(result["content"][0]["text"])
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["error_code"], "needs_init")
        self.assertIn("meridian wiki init --library-root", payload["next_action"])
```

- [ ] **Step 5: Add index write error shaping test**

Add this unit test near the MCP adapter tests:

```python
    def test_mcp_adapter_shapes_index_write_failure(self) -> None:
        error = PermissionError(1, "Operation not permitted", "/tmp/wiki/.index/papers.jsonl")
        payload = mcp_adapter.call_chain_error_payload(error)

        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["error_code"], "workspace_index_write_failed")
        self.assertEqual(payload["path"], "/tmp/wiki/.index/papers.jsonl")
        self.assertIn("could not refresh", payload["message"])
        self.assertIn("write access", payload["next_action"])
```

- [ ] **Step 6: Run focused tests and confirm failure**

Run:

```bash
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_mcp_json_bridge_capabilities_does_not_require_workspace \
  tests.test_cli.CliTests.test_mcp_json_bridge_context_reports_needs_init_without_workspace \
  tests.test_cli.CliTests.test_mcp_stdio_server_context_reports_needs_init_without_workspace \
  tests.test_cli.CliTests.test_mcp_adapter_shapes_index_write_failure
```

Expected: at least one failure because `capabilities` still resolves workspace too early, stdio server still falls back to `wiki`, and `call_chain_error_payload` does not exist yet.

- [ ] **Step 7: Commit failing tests**

Do not commit failing tests alone unless the local workflow requires a red checkpoint. Prefer continuing to Task 2 and commit once tests pass.

## Task 2: Add Shared Call-Chain Error Model

**Files:**
- Modify: `src/meridian/mcp/adapter.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Add constants and helper functions**

In `src/meridian/mcp/adapter.py`, near `TOOL_SCHEMA_VERSION`, add:

```python
NEEDS_INIT_MESSAGE = "No Paper Wiki workspace is configured."
NEEDS_INIT_NEXT_ACTION = (
    "Run meridian wiki init --library-root <paper-wiki-library-root> "
    "or initialize through the meridian setup skill."
)
INDEX_WRITE_NEXT_ACTION = (
    "Grant write access to the Paper Wiki library or run the same request in "
    "an environment that can write the wiki .index directory."
)
```

Then add these functions near `_default_wiki_root`:

```python
def missing_workspace_error_payload() -> dict[str, Any]:
    return {
        "status": "error",
        "error_code": "needs_init",
        "message": NEEDS_INIT_MESSAGE,
        "next_action": NEEDS_INIT_NEXT_ACTION,
    }


def call_chain_error_payload(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, FileNotFoundError) and "No Paper Wiki workspace is configured" in str(exc):
        return missing_workspace_error_payload()
    if isinstance(exc, PermissionError):
        filename = getattr(exc, "filename", None)
        return {
            "status": "error",
            "error_code": "workspace_index_write_failed",
            "message": "Meridian could not refresh the Paper Wiki index.",
            "path": str(filename) if filename else "",
            "next_action": INDEX_WRITE_NEXT_ACTION,
        }
    return {
        "status": "error",
        "error_code": "call_chain_error",
        "message": str(exc),
        "next_action": "Inspect the Meridian setup, workspace path, and command arguments, then retry.",
    }


def format_call_chain_error(exc: Exception) -> str:
    payload = call_chain_error_payload(exc)
    parts = [payload["error_code"], payload["message"], f"Next action: {payload['next_action']}"]
    if payload.get("path"):
        parts.insert(2, f"Path: {payload['path']}")
    return "\n".join(parts)
```

- [ ] **Step 2: Run helper test**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_mcp_adapter_shapes_index_write_failure
```

Expected: pass.

## Task 3: Delay JSON Bridge Workspace Resolution

**Files:**
- Modify: `src/meridian/mcp/adapter.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Replace eager workspace resolution in `main`**

In `adapter.main`, replace:

```python
    wiki_root = Path(args.wiki_root) if args.wiki_root else _default_wiki_root()
    if args.tool == "capabilities":
        payload = capabilities(detail=args.detail)
```

with:

```python
    wiki_root: Path | None = None
    if args.tool != "capabilities":
        try:
            wiki_root = Path(args.wiki_root) if args.wiki_root else _default_wiki_root()
        except Exception as exc:
            print(format_call_chain_error(exc), file=sys.stderr)
            return 1
    if args.tool == "capabilities":
        payload = capabilities(detail=args.detail)
```

Then update all later adapter calls to satisfy the type checker/runtime by using `wiki_root=wiki_root` only after the `capabilities` branch. No behavior change is needed for the existing branches because `wiki_root` is assigned for every non-capabilities tool.

- [ ] **Step 2: Catch shaped call-chain failures around tool execution**

Wrap the non-capabilities tool dispatch in `try/except Exception as exc` inside `main` so recoverable failures print `format_call_chain_error(exc)` and return `1`. Keep argument validation with `parser.error` as-is.

Use this exact shape:

```python
    try:
        if args.tool == "capabilities":
            payload = capabilities(detail=args.detail)
        elif args.tool == "context":
            ...
    except Exception as exc:
        print(format_call_chain_error(exc), file=sys.stderr)
        return 1
```

Do not catch `SystemExit` from `parser.error`.

- [ ] **Step 3: Run JSON bridge focused tests**

Run:

```bash
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_mcp_json_bridge_capabilities_does_not_require_workspace \
  tests.test_cli.CliTests.test_mcp_json_bridge_context_reports_needs_init_without_workspace
```

Expected: pass.

## Task 4: Fix MCP Stdio Workspace Fallback And Tool Errors

**Files:**
- Modify: `src/meridian/mcp/server.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Change default wiki root to nullable**

Change `MeridianMCPServer.__init__` from storing `default_wiki_root or _default_wiki_root()` to storing the provided root without resolving the workspace:

```python
    def __init__(self, *, default_wiki_root: Path | None = None) -> None:
        self.default_wiki_root = default_wiki_root
```

- [ ] **Step 2: Resolve workspace only inside `wiki_root`**

Replace `wiki_root` with:

```python
    def wiki_root(self, arguments: JsonDict) -> Path:
        explicit = arguments.get("wiki_root")
        if explicit:
            return Path(str(explicit))
        if self.default_wiki_root is not None:
            return self.default_wiki_root
        workspace = resolve_workspace()
        if workspace is not None:
            return workspace.wiki_root
        raise FileNotFoundError(adapter.NEEDS_INIT_MESSAGE)
```

- [ ] **Step 3: Remove `Path("wiki")` fallback**

Delete `_default_wiki_root` from `server.py` if it is no longer used. If `main`
passes `--wiki-root`, keep that path as `default_wiki_root`.

- [ ] **Step 4: Use structured tool error payloads**

Change `_tool_error` from accepting only a string to accepting either a string
or payload:

```python
def _tool_error(error: str | JsonDict) -> JsonDict:
    if isinstance(error, dict):
        payload = error
    else:
        payload = {"status": "error", "error_code": "tool_error", "message": error, "next_action": "Inspect the tool arguments and retry."}
    return {
        "content": [{"type": "text", "text": json.dumps(payload, indent=2, ensure_ascii=False)}],
        "isError": True,
    }
```

Then in `_call_tool`, replace:

```python
        except Exception as exc:
            return _tool_error(str(exc))
```

with:

```python
        except Exception as exc:
            return _tool_error(adapter.call_chain_error_payload(exc))
```

- [ ] **Step 5: Run MCP stdio focused test**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_mcp_stdio_server_context_reports_needs_init_without_workspace
```

Expected: pass.

## Task 5: Update Wiki Skill Recovery Guidance

**Files:**
- Modify: `plugins/codex/meridian/skills/wiki/SKILL.md`
- Modify: `plugins/claude-code/meridian/skills/wiki/SKILL.md`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Add recovery bullets to Codex wiki skill**

In `plugins/codex/meridian/skills/wiki/SKILL.md`, under `Agent execution resolver`, append:

```markdown
Failure recovery:

- If a Meridian call returns `needs_init`, ask for the Paper Wiki library root
  and initialize through `meridian`; do not guess a repo-local `wiki/`.
- If a Meridian call returns `workspace_index_write_failed`, report the blocked
  path and ask for the smallest permission or environment fix before retrying.
- Only use direct markdown search after Meridian retrieval succeeds or returns a
  non-recoverable product error.
```

- [ ] **Step 2: Copy the same change to Claude wiki skill**

Apply the identical text to
`plugins/claude-code/meridian/skills/wiki/SKILL.md`.

- [ ] **Step 3: Add or update skill copy parity test if needed**

Run existing parity test:

```bash
PYTHONPATH=src python3 -m unittest tests.test_cli.CliTests.test_meridian_plugin_skill_copies_match_repo_skills
```

Expected: pass. If it fails because plugin copies differ from expected local
fixtures, update the intended source and packaged copies together.

## Task 6: Add Review Evidence And Verify

**Files:**
- Create: `docs/review/meridian-wiki-use-call-chain-resilience.md`

- [ ] **Step 1: Create review doc**

Create `docs/review/meridian-wiki-use-call-chain-resilience.md`:

```markdown
# Meridian Wiki Use Call-Chain Resilience

Date: 2026-05-31
Status: implemented

## Context / Test Plan

This pass improves the Wiki Use and MCP call chains when workspace state is
missing or index refresh fails. It follows the approved Superpowers spec in
`docs/superpowers/specs/2026-05-31-meridian-wiki-use-call-chain-resilience-design.md`.

## Developer Evidence

- JSON bridge `capabilities` no longer requires workspace resolution.
- MCP stdio server no longer falls back to repo-local `wiki/` when no active
  workspace exists.
- Missing workspace returns `needs_init` with a setup next action.
- Permission/index write failures are shaped as
  `workspace_index_write_failed`.
- Packaged `wiki` skills explain recovery behavior.

## Evaluator Evidence

Record the actual command results after running verification.

## Convergence Decision

The call-chain resilience pass is complete when focused tests, full unit tests,
compileall, diff check, framework-check, and empty-config MCP capabilities smoke
all pass.
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_mcp_json_bridge_capabilities_does_not_require_workspace \
  tests.test_cli.CliTests.test_mcp_json_bridge_context_reports_needs_init_without_workspace \
  tests.test_cli.CliTests.test_mcp_stdio_server_context_reports_needs_init_without_workspace \
  tests.test_cli.CliTests.test_mcp_adapter_shapes_index_write_failure \
  tests.test_cli.CliTests.test_mcp_stdio_server_registry_and_tool_calls_share_adapter \
  tests.test_cli.CliTests.test_mcp_adapter_tool_surface_and_canonical_boundaries
```

Expected: pass.

- [ ] **Step 3: Run release gates**

Run:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/private/tmp/meridian-call-chain-pycache PYTHONPATH=src python3 -m compileall src tests
git diff --check
PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki
MERIDIAN_CONFIG_HOME=/private/tmp/meridian-empty-config PYTHONPATH=src python3 -m meridian.mcp capabilities --detail summary
```

Expected: all pass. The framework-check may require sandbox escalation if it
needs to inspect the external Paper Wiki library.

- [ ] **Step 4: Update review doc with actual evidence**

Replace the initial evaluator sentence with the actual command results.
Include any known historical non-blocking Arbor warnings only if those checks
are run during implementation.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git status --short --untracked-files=all
git add src/meridian/mcp/adapter.py src/meridian/mcp/server.py tests/test_cli.py plugins/codex/meridian/skills/wiki/SKILL.md plugins/claude-code/meridian/skills/wiki/SKILL.md docs/review/meridian-wiki-use-call-chain-resilience.md
git commit -m "fix: harden meridian wiki use call chain"
```

Expected: commit succeeds with only the planned files.
