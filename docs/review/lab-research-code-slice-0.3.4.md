# Lab Research Code Slice 0.3.4

## Context

Lab was too passive for implementation and debugging tasks: it preserved Research
Dev state and wiki grounding, but did not clearly require the agent to complete
a bounded coding/debug/probe slice or checkpoint useful research states.

## Change

- Added a `Research Code Slice` loop to the Lab skill.
- Kept the behavior lightweight: no new CLI, MCP, daemon, or routing engine.
- Required smallest-slice planning, repo inspection, code/config edits when
  feasible, runnable checks, result comparison, evidence recording, and focused
  git checkpoints when scope is clean or user-authorized.
- Synced the Codex and Claude Code plugin Lab skill copies.
- Updated Research Dev docs and eval assets to cover coding execution and
  checkpoint discipline.

## Explicit Non-goals

- No compatibility layer for external workflow plugins or frameworks.
- No product coupling to another plugin name.
- No automatic push, publish, or external mutation without explicit user
  authorization.

## Release Evidence

- Research Dev eval JSONL parses.
- `git diff --check` passes.
- Full unit and compile gates were run before release finalization.
