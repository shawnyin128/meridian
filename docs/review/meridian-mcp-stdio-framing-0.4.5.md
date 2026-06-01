# Meridian MCP Stdio Framing 0.4.5

## Context/Test Plan

The user reported MCP client startup failure:

```text
MCP client for `meridian-paper-wiki` failed to start:
handshaking with MCP server failed: connection closed: initialize response
```

Root-cause target:

- The published MCP server was present and could handle direct in-process
  JSON-RPC messages.
- Real MCP stdio clients send JSON-RPC messages using `Content-Length` framing.
- The server only accepted newline-delimited JSON, so it could not complete a
  real client `initialize` handshake.

Acceptance criteria:

- `python3 -m meridian.mcp serve` accepts standard `Content-Length` framed
  initialize requests.
- Responses to framed requests are also framed.
- Existing newline JSON debug behavior remains available.
- Existing adapter and direct server tests keep passing.

## Developer Round

Changes made:

- Updated `src/meridian/mcp/server.py` to parse MCP stdio
  `Content-Length` frames and write framed responses when the request is framed.
- Preserved newline-delimited JSON handling for local/debug compatibility.
- Added `test_mcp_stdio_server_speaks_content_length_framing` so future MCP
  server changes must pass a real framed initialize exchange.
- Bumped Meridian to `0.4.5`.

Developer evidence:

```text
PYTHONPATH=src python3 -m unittest \
  tests.test_cli.CliTests.test_mcp_stdio_server_speaks_content_length_framing \
  tests.test_cli.CliTests.test_mcp_stdio_server_registry_and_tool_calls_share_adapter \
  tests.test_cli.CliTests.test_mcp_stdio_server_context_reports_needs_init_without_workspace

Ran 3 tests
OK
```

Manual framed subprocess replay:

```text
python3 -m meridian.mcp serve
input: Content-Length framed initialize + tools/list requests
returncode: 0
stdout-prefix: Content-Length: 320
frames: 2
stderr: empty
```

## Evaluator Round

The fix addresses the transport layer that real MCP clients use. The prior
test harness exercised `handle_message` directly, so it did not detect the
missing stdio frame parser.

Evaluator evidence:

```text
PYTHONPATH=src python3 -m unittest discover -s tests
pass
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
not point to the MCP stdio framing change.

Residual risk:

- The user's currently running Codex/Claude process may need plugin update and
  restart so its MCP client starts the `0.4.5` package.

## Convergence Round

Converged for implementation: the MCP server now speaks framed stdio for real
client handshakes while retaining the existing adapter/tool surface and
newline-debug compatibility.
