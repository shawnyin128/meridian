# High-Leverage Entry Validation Brief

Created: 2026-05-21

## Goal

This pass checked whether Prompt/Skill and MCP can act as the two final product entries without leaking internal artifacts or diverging from the same Meridian core.

## Entry Model

| Entry | Update Wiki | Use Wiki |
| --- | --- | --- |
| Prompt/Skill | ingest, insight, proposal, publish, refine, audit | retrieve, read, trace, answer |
| MCP | `meridian.update`, `meridian.propose`, `meridian.apply`, `meridian.audit` | `meridian.context`, `meridian.read`, `meridian.trace` |

CLI commands remain execution primitives. The Markdown vault remains the source of truth.

## MCP Validation

Client-style harness output:

- Report: `wiki/.index/mcp-high-leverage-harness.json`
- Status: pass
- Server name: `meridian-paper-wiki`
- Tool count: 8
- Context result count: 6
- Read page: `concepts/Cache-retention-policy.md`
- Trace page: `concepts/Cache-retention-policy.md`
- Internal read blocked: true
- Fixture apply status: published

The harness verifies:

- MCP server exposes the intended small tool surface.
- `context/read/trace` can operate on canonical wiki pages.
- `.drafts`/internal reads are blocked.
- `propose/apply` works on a fixture-safe wiki through the lint-gated path.

## Prompt/Skill Validation

The product-facing skill remains `.codex/skills/meridian-paper-wiki/SKILL.md`. It exposes exactly two workflows:

- Update Wiki
- Use Wiki

Supporting skills remain internal modules for ingest, retrieve, personalize, evolve, knowledge, and concept operations.

## Residuals

- The repo has a deterministic MCP harness and setup docs. A live Claude Desktop UI registration still requires a user-side config step.
- MCP update/apply should continue to use fixture or explicitly safe canonical proposals during automated tests.
- Prompt entry behavior depends on the calling agent following the product skill, so eval coverage should keep checking artifact-boundary behavior.

