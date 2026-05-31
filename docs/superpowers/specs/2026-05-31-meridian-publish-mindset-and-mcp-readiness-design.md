# Meridian Publish Mindset And MCP Readiness Design

Date: 2026-05-31
Status: proposed

## Purpose

Meridian 0.4.1 has the right product direction: Paper Wiki is the durable
compiled-knowledge product, Lab is the idea graph manager, and normal coding
work belongs to external development workflows. The remaining risk is that
published text and setup guidance still contain older Research Dev / coding
agent language, and installation or MCP update instructions are not fully
consistent across docs.

This pass should tighten the release surface without adding a new product
module, MCP surface, daemon, or broad framework checker.

## Scope

Do two things, in order:

1. Clean the published product mindset.
2. Tighten install, update, and MCP readiness guidance.

Do not implement a new automatic auditor in this pass. Future framework checks
should stay small, Arbor-like, and focused on core invariants.

## Product Boundary

The user-facing product model is:

- `meridian`: setup, status, migration, and drift repair.
- `wiki`: Paper Wiki update/use workflows.
- `lab`: research idea graph management with Paper Wiki grounding.

Lab is not a coding agent, Research Dev Agent, release workflow, or Arbor
replacement. Lab may produce development handoff packets, but code
implementation, debugging, tests, commits, release, and convergence belong to
the user's normal development workflow.

Paper Wiki remains the knowledge substrate. It can answer coding/research
questions and support Lab feasibility review, but the wiki itself is not the
published "LLM Wiki product" for users to manage as a separate product surface.

## Approach A: Publish Mindset Cleanup

Update only active user-facing or agent-facing release surfaces:

- `README.md`
- `.claude-plugin/marketplace.json`
- `plugins/*/meridian/.mcp.json` only if documentation needs to reference its
  behavior; do not change the server surface unless needed.
- `plugins/*/meridian/skills/{meridian,wiki,lab}/SKILL.md` if any wording still
  implies Lab owns code work.
- Active architecture docs such as `docs/full-system-architecture.md` and the
  HTML architecture page if it is still presented as current.
- Active eval/rubric intros when they use Research Dev terms as current product
  names.

Preserve historical review docs. It is acceptable for old review documents to
mention Research Dev if they describe past design history.

Expected wording:

- Use "Lab idea graph" for the product surface.
- Use "normal coding workflow" for implementation/debug/test/commit/release.
- Use "legacy/background" for old Research Dev framework material.
- Avoid "research coding copilot" as a plugin tagline.

## Approach B: Install And MCP Readiness Cleanup

Make README and `docs/plugin-distribution.md` consistent:

- Codex install command should use the same marketplace add and plugin add form
  in both places.
- Codex reinstall/update commands should use one exact plugin identifier form.
- Claude Code install/update commands should use one exact plugin identifier
  form.
- Explain that plugin updates and core updates are separate layers.

Clarify MCP readiness:

- The plugin MCP config starts `python3 -m meridian.mcp serve`.
- That server uses whichever `meridian` Python core is importable in the client
  environment.
- If behavior looks stale after a plugin update, the user should update the
  core checkout and rerun editable install from that checkout.
- The `meridian` setup skill should tell the user how to check core version,
  plugin version, active workspace, and MCP availability.

Do not add a separate Lab MCP. Do not make users manually start MCP during
normal use when their client can register the plugin MCP server.

## Testing

Run focused checks first:

- product skill copy parity
- release version surface alignment if version changes
- plugin release assets exist
- skill behavior eval assets parse

Then run release gates if files changed beyond docs:

- `PYTHONPATH=src python3 -m unittest discover -s tests`
- `PYTHONPYCACHEPREFIX=/private/tmp/meridian-publish-mindset-pycache PYTHONPATH=src python3 -m compileall src tests`
- `git diff --check`
- `PYTHONPATH=src python3 -m meridian framework-check --project-root . --library-root /Users/shawn/Desktop/paper-wiki`

If Paper Wiki content is not changed, do not rerun expensive wiki content gates
unless product setup or MCP behavior changed.

## Release Shape

If the implementation changes only text, manifests, and tests, release as a
patch version after full verification.

The expected commit should be small and conventional, for example:

```text
fix: align meridian product surface docs
```

## Residuals

After this pass, later work can add a smaller Arbor-like framework check for:

- product skill count and names
- plugin/core version alignment
- MCP importability and tool surface
- active workspace presence when required
- Lab `.meridian/` skeleton only when a Lab target repo is requested

That checker should not become a subjective copy-quality judge.
