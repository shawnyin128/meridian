# Meridian Runtime Readiness Doctor

## Context/Test Plan

### Context

This planned follow-up is intentionally behind the skill and bundle text passes.
It should make setup/status checks detect runtime drift across Python core,
installed plugin caches, active Paper Wiki workspace, and MCP startup.

### Plan

- Inspect core version and import path.
- Inspect visible Codex/Claude plugin cache versions when readable.
- Inspect active workspace layout and schema.
- Smoke MCP startup or capabilities.
- Report ready, needs init, needs update, or needs migration with exact next
  actions.

### Acceptance Criteria

- Visible version drift is not reported as ready.
- Missing workspace becomes an init action.
- MCP readiness uses the packaged server entry.
- Setup remains separate from normal `wiki` and `lab` work.

### Test Plan

- Version/cache drift fixtures.
- Missing/configured workspace scenarios.
- MCP capabilities/help smoke.
- Setup skill wording checks.
