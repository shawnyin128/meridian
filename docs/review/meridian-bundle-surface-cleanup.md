# Meridian Bundle Surface Cleanup

## Context/Test Plan

### Context

This planned follow-up reviews README, marketplace manifests, MCP config, and
distribution docs after the product skill behavior pass. The goal is to keep
the published bundle aligned with the three-skill model: `meridian` for setup,
`wiki` for Paper Wiki, and `lab` for research coding.

### Plan

- Check README first-level narrative for three-skill clarity.
- Check Codex and Claude Code manifest descriptions and prompts.
- Check `.mcp.json` wording and docs so MCP is an integration surface, not a
  required manual user command.
- Keep support skills present but delegated internally.

### Acceptance Criteria

- Bundle text presents one product story.
- CLI remains an execution primitive.
- MCP remains a managed integration surface.
- Support skills are not marketed as primary user entries.

### Test Plan

- README content checks.
- Manifest content checks.
- Plugin package file checks.
- Negative checks for command-list sprawl or plugin-only install claims.
