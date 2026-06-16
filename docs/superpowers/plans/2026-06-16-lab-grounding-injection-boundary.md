# Lab Grounding Injection Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Lab's overlapping memory state and replace development handoff artifacts with research grounding injection semantics.

**Architecture:** Lab remains an idea-graph workflow, not a project context manager. Paper Wiki provides research grounding, Arbor or the normal coding workflow owns execution context, and Lab injects implementation-relevant paper/wiki grounding into coding work without writing a parallel handoff state file.

**Tech Stack:** Python stdlib, Markdown templates, Codex/Claude plugin skill text, pytest/unittest.

---

### Task 1: Lock Boundary Tests

**Files:**
- Modify: `tests/test_cli.py`

- [ ] Add tests asserting Lab init no longer creates `.meridian/memory.md`, validation does not require it, product skills do not require memory, and the old development handoff packet is absent.
- [ ] Add tests asserting the replacement template and skill text use `Research Grounding Injection` and include implementation prior, code/repo link, source boundary, coding implication, and return signal semantics.
- [ ] Run the focused tests and verify they fail against the current implementation.

### Task 2: Remove Lab Memory State

**Files:**
- Modify: `src/meridian/lab/state.py`
- Delete: `src/meridian/templates/research-dev/memory.md`
- Modify: `docs/research-dev-state-model.md`
- Modify: `docs/research-dev-mvp-plan.md`
- Modify: `docs/release-packaging.md`
- Modify: plugin skill files under `plugins/codex/meridian/skills/` and `plugins/claude-code/meridian/skills/`

- [ ] Remove `memory.md` from lazy init and validation required files.
- [ ] Update docs and skills so unplaced ideas are handled by immediate placement questions, not scratch memory.
- [ ] Preserve backward compatibility by allowing existing `memory.md` to remain ignored rather than failing validation.

### Task 3: Replace Handoff Packet With Grounding Injection

**Files:**
- Delete: `src/meridian/templates/research-dev/development-handoff-packet.md`
- Add: `src/meridian/templates/research-dev/research-grounding-injection.md`
- Modify: `src/meridian/templates/research-dev/dev-writeback-packet.md`
- Modify: `src/meridian/templates/research-dev/research-dev-context-packet.md`
- Modify: Lab skills and related docs.

- [ ] Replace durable handoff packet language with response/block-oriented grounding injection.
- [ ] Keep evidence-return semantics, but frame them as what coding should return to Lab after implementation.
- [ ] Preserve user coding-style profile as a source of compact coding constraints inside the injection, not as a Lab-owned execution plan.

### Task 4: Verify

**Files:**
- Test: `tests/test_cli.py`

- [ ] Run focused Lab boundary tests.
- [ ] Run `python -m pytest`.
- [ ] Run `git diff --check`.
- [ ] Confirm unrelated dirty audit docs remain unstaged and untouched.
