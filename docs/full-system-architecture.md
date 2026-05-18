---
type: architecture
title: "Meridian Full System Architecture"
status: draft
created: 2026-05-18
updated: 2026-05-18
tags:
  - llm-wiki
  - research-dev-agent
  - full-architecture
confidence: medium
---

# Meridian Full System Architecture

## Boundary

Meridian is two cooperating products:

1. **Paper Wiki Workflow**
   - Control model: predefined workflow.
   - Primary job: internalize papers, annotations, claims, methods, ideas, and research memory.
   - Can be used without any code repo.

2. **Research Dev Agent**
   - Control model: bounded agentic loop.
   - Primary job: help build research-friendly code, perform sanity checks, design experiments, interpret results, diagnose reproductions, and preserve experiment memory.
   - Can be used without a mature paper wiki.

They integrate through a shared research memory contract: context packets from wiki to dev, and experiment/result write-backs from dev to wiki.

## Paper Wiki MCP Delivery

For decoupling and extensibility, the Paper Wiki should be deliverable as an MCP server.

This does not change the internal wiki model. The canonical state is still raw sources, generated Markdown pages, schema, index, and log. MCP is the delivery boundary that exposes the wiki to development agents and other clients without coupling them to the vault layout.

Paper Wiki MCP should expose a stable interface for:

- retrieving context packets for research questions, code tasks, method comparisons, metrics, and prior failed paths
- searching papers, claims, methods, ideas, experiments, and results with provenance
- reading selected wiki pages and source summaries
- proposing write-back packets from development or experiment work
- ingesting papers, Zotero annotations, and user insights through controlled workflow entrypoints
- reporting uncertainty, conflicts, stale claims, and missing sources

The MCP layer should start conservative:

- read/query/context tools first
- explicit propose/apply separation for writes
- Markdown remains the durable source of truth
- no client should need to know where a paper page or claim page physically lives
- the dev agent consumes the wiki through MCP whenever possible

This makes the Paper Wiki a standalone product, while also making it a reusable research-memory backend for the Research Dev Agent.

## Source-Grounded Design Principles

The architecture should follow the source-grounded principles in `docs/source-grounded-development-principles.md`.

Key implications:

- keep the wiki workflow simple and auditable before adding infrastructure
- use progressive disclosure instead of loading all wiki/tool context up front
- design Paper Wiki MCP tools for agents, not as raw filesystem wrappers
- prefer concise context packets with selection reasons, provenance, uncertainty, and gaps
- keep write-back as a reviewable proposal before canonical wiki mutation
- let the Research Dev Agent choose its own path, but require evidence identity and wiki-aware reasoning
- evaluate with realistic research tasks, including ambiguous method definitions, failed reproductions, and result-to-claim updates

## Implementation Order

Build the Paper Wiki first.

The first development loop should be:

```text
brainstorm prototype boundary
-> build minimal Paper Wiki prototype
-> human review
-> build many evaluation cases
-> run evaluation
-> analyze failures
-> refine workflow/schema/tools
-> repeat
```

This order is intentional. The Research Dev Agent depends on a usable wiki memory backend; otherwise it will only be a coding agent with occasional document lookup. The Paper Wiki prototype must prove ingest, user insight, evolutionary analysis, context packets, reviewable writes, and wiki maintenance before dev-agent integration becomes meaningful.

Evaluation cases should describe detailed problems and expected outcome properties, but should not overfit to one exact path, tool sequence, page title, or page count unless that is the specific behavior under test.

## Why Two Products

The paper wiki and development plugin have different control needs.

The wiki should stay workflow-like because the user needs stable, predictable maintenance of canonical research state. Ingesting a paper, adding a Zotero note, retrieving context, and updating claims should be auditable and structured.

The development plugin should be agentic because research coding requires adaptive decisions: inspect code, choose tools, run commands, diagnose failure, adjust the plan, compare results, and decide whether the next action is a sanity check, ablation, probe, wiki lookup, or wiki update.

## Research Dev Agent Boundary

The dev agent is not a general "make the codebase clean" agent. Its product boundary is helping the researcher create and maintain code that supports research exploration.

Two baseline capabilities define whether the dev product is doing its job:

1. **Research-grade coding**: write clear, readable, maintainable, and extensible research code.
2. **Wiki gateway**: act as the main development-side entrance to the paper/wiki memory, using wiki context to improve research coding and research understanding.
3. **Git checkpointing**: use staged commits and branches as a research timeline so uncertain work can be compared, recovered, or rolled back by impact.

If either capability is missing, the dev product collapses into either a normal coding assistant or a passive documentation browser. The useful product is the combination: code work that is shaped by research memory, and research memory that is continuously refined by code and experiment evidence.

Research-friendly code means:

- readable enough for the researcher to inspect and modify during an idea loop
- modular enough to add ablations, probes, metrics, and variants without surgery
- explicit about configs, commands, outputs, and assumptions
- tolerant of experimental redundancy when redundancy makes observation easier
- organized so temporary probes, exploratory scripts, and canonical paths are distinguishable
- instrumented enough to answer "why did this happen?" rather than only "did it run?"
- checkpointed at meaningful research stages so useful intermediate states are not lost

This is different from normal production-code pressure. The dev agent should not optimize primarily for minimalism, elegance, or removing every duplicate. In research code, some duplication is useful when it preserves experimental comparability, isolates variants, or makes a probe easier to read.

The dev agent should have high operational freedom inside this boundary:

- proactively inspect the repo, configs, logs, and outputs
- decide which commands or tests are needed to localize uncertainty
- propose or add probes, ablations, assertions, and intermediate logging
- compare current implementation against paper/wiki claims when relevant
- treat the wiki as a first-class tool, not an optional reference
- ask the wiki for context when a task depends on prior work, method definitions, metrics, hidden implementation details, or the user's existing ideas
- suggest git checkpoints before risky direction changes, broad rewrites, or experiment-impacting edits
- write back experiment evidence and implementation discoveries after the coding loop

The constraint should be on artifact quality and research evidence, not on the agent's internal path. Avoid Arbor-style over-routing for ordinary exploratory work. Use lightweight checkpoints only when the change affects durable research memory, costly experiments, or broad repo behavior.

Non-goals for the dev agent:

- enforce production-style simplification as the main objective
- turn every exploration into a release-managed feature
- hide uncertainty behind polished code
- make broad canonical wiki rewrites without the wiki workflow
- flatten exploratory history into one opaque final diff when staged checkpoints would preserve useful research evidence
- run expensive experiments without a clear learning target and evidence plan

## Standalone Modes

### Wiki-Only

Use when the user wants to:

- read and internalize papers
- add reading insights or Zotero annotations
- evolve paper analysis
- retrieve related claims, methods, and ideas
- develop research ideas without running code

### Dev-Agent-Only

Use when the user wants to:

- design an experiment from an idea
- sanity check a training or evaluation loop
- diagnose reproduction gaps
- interpret logs and metrics
- record experiment memory in a repo even before a full wiki exists

### Integrated

Use when the user wants the best version:

- retrieve paper/wiki context before coding
- design experiment slices grounded in prior work
- compare results against papers and past runs
- write experiment notes and refined understanding back to the wiki

## Shared Contract

### Context Packet

The context packet is the boundary from wiki to dev agent:

- request intent
- selected wiki pages
- selected repo files or run artifacts
- why each item was selected
- relevant evidence and source links
- conflicts, uncertainty, and gaps
- recommended workflow path
- allowed write policy

### Write-Back Packet

The write-back packet is the boundary from dev agent to wiki:

- experiment purpose
- hypothesis or idea being tested
- code/config/command identity
- result summary
- interpretation
- claim or method implications
- failed path memory
- next decision

## Architecture Flow

```text
User
-> Product Router
   -> Paper Wiki Workflow
      -> raw paper / annotation ingest
      -> paper model / claim / method / idea pages
      -> context packet
   -> Research Dev Agent
      -> inspect repo / run tools / plan slice
      -> sanity check / design experiment / diagnose reproduction / interpret result
      -> write-back packet
-> Shared Research Memory
   -> wiki pages, experiment notes, result pages, failed paths, next ideas
```

## MVP Priority

Paper Wiki Workflow:

- paper ingest
- user insight/Zotero note ingestion
- evolutionary analysis
- context packet retrieval

Research Dev Agent:

- experiment design
- sanity check
- result interpretation
- experiment memory
- reproduction diagnosis

Integration:

- context packet API
- write-back packet API
- shared page schemas for ideas, hypotheses, experiments, and results
