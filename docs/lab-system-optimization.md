---
type: product-design
title: "Lab System Optimization"
status: implemented
created: 2026-05-25
updated: 2026-05-25
tags:
  - lab
  - research-dev
  - system-optimization
confidence: medium
---

# Lab System Optimization

This pass addresses the main system-level gaps after the Research Dev state
model refactor while keeping Lab lightweight and skill-only.

## Optimized Defects

### 1. State Drift

Risk: `.meridian/` state could drift because templates were enforced only by
skill convention.

Optimization: add `meridian.lab.validate_lab_space` as an internal release/debug
helper. It checks required files, active thread/node pointers, allowed node
modes, experiment validity, proposal states, and ready-proposal evidence gates.
It is not a product CLI, MCP server, daemon, database, or workflow engine.

### 2. Local Finding To Wiki Bridge

Risk: local findings could be written back to Paper Wiki without a crisp
boundary between local experiment evidence, source facts, wiki synthesis, user
insight, and uncertainty.

Optimization: add a `wiki-transfer-packet.md` template and a `Wiki Transfer Gate`
section in local finding proposals. Ready proposals must have linked source
experiments, target wiki pages, Paper Wiki grounding, boundary mapping, and user
confirmation before canonical publish.

### 3. Longitudinal Research Replay

Risk: evaluation covered single-step scenarios better than real research arcs
where ideas fail, become repairable, spawn children, invalidate evidence, and
eventually produce reusable findings.

Optimization: add longitudinal replay cases and rubric for multi-step Lab
behavior. These judge whether the same lightweight state model survives realistic
research loops without becoming a heavy workflow engine.

## Current Boundary

Lab remains the agent-facing dev layer. Paper Wiki remains the long-term
compiled knowledge layer and MCP surface. Lab consumes Paper Wiki context and
creates proposal-first write-back packets, but it does not publish canonical
wiki pages directly.

## Release Evidence To Check

- `validate_lab_space` passes on a well-formed `.meridian/` fixture.
- `validate_lab_space` fails invalid active pointers, node modes, and ready
  proposals without source experiments.
- Templates include `memory.md` and `wiki-transfer-packet.md`.
- Longitudinal replay eval cases and rubric parse.
