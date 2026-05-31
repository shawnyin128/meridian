---
type: architecture
title: "Meridian Full System Architecture"
status: draft
created: 2026-05-18
updated: 2026-05-18
tags:
  - llm-wiki
  - lab
  - idea-graph
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

2. **Lab Idea Graph**
   - Control model: lightweight skill-guided idea graph.
   - Primary job: place ideas, ground them with Paper Wiki, maintain approach trees, preserve experiment evidence, prepare development handoffs, and mature reusable findings.
   - Can be used without a mature paper wiki.

They integrate through a shared research memory contract: context packets from wiki to Lab, development handoffs from Lab to coding workflows, and experiment/result write-backs from Lab to wiki.

## Paper Wiki MCP Delivery

For decoupling and extensibility, the Paper Wiki should be deliverable as an MCP server.

This does not change the internal wiki model. The canonical state is still raw sources, generated Markdown pages, schema, index, and log. MCP is the delivery boundary that exposes the wiki to Lab and external normal coding workflows without coupling them to the vault layout.

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
- Lab and external coding workflows consume the wiki through MCP whenever
  possible

This makes the Paper Wiki a standalone product, while also making it a reusable research-memory backend for Lab and external coding workflows.

## Source-Grounded Design Principles

The architecture should follow the source-grounded principles in `docs/source-grounded-development-principles.md`.

Key implications:

- keep the wiki workflow simple and auditable before adding infrastructure
- use progressive disclosure instead of loading all wiki/tool context up front
- design Paper Wiki MCP tools for agents, not as raw filesystem wrappers
- prefer concise context packets with selection reasons, provenance, uncertainty, and gaps
- keep write-back as a reviewable proposal before canonical wiki mutation
- let coding workflows choose their own path, but require Lab handoffs to preserve evidence identity and wiki-aware reasoning
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

This order is intentional. Lab depends on a usable wiki memory backend; otherwise it becomes an idea notebook with occasional document lookup. The Paper Wiki prototype must prove ingest, user insight, evolutionary analysis, context packets, reviewable writes, and wiki maintenance before Lab integration becomes meaningful.

Evaluation cases should describe detailed problems and expected outcome properties, but should not overfit to one exact path, tool sequence, page title, or page count unless that is the specific behavior under test.

## Why Two Products

The Paper Wiki, Lab idea graph, and external normal coding workflows have different control needs.

The wiki should stay workflow-like because the user needs stable, predictable maintenance of canonical research state. Ingesting a paper, adding a Zotero note, retrieving context, and updating claims should be auditable and structured.

Lab should stay light because idea graph management requires quick placement,
feasibility checks, and evidence continuity. Adaptive code execution belongs to
external normal coding workflows because implementation requires adaptive
decisions: inspect code, choose tools, run commands, diagnose failure, adjust
the plan, and compare results.

## Lab Boundary

Lab is not a general "make the codebase clean" agent and not a coding agent. Its
product boundary is helping the researcher maintain an idea graph that supports
research exploration.

Three baseline capabilities define whether Lab is doing its job:

1. **Idea graph continuity**: maintain research threads, approach nodes, experiment evidence, and local finding proposals.
2. **Wiki gateway**: act as the idea-side entrance to the Paper Wiki, using wiki context to improve feasibility judgments and research understanding.
3. **Development handoff**: pass implementation/debug/test work to the normal coding workflow with clear evidence identity and return criteria.

If these are missing, Lab collapses into either a passive notebook or a second
development framework. The useful product is the combination: ideas shaped by
research memory, and research memory refined by experiment evidence.

Development handoffs should preserve:

- explicit about configs, commands, outputs, and assumptions
- expected metrics and validity criteria
- what result would update the active node or proposal
- source fact, wiki synthesis, user insight, local evidence, and uncertainty boundaries

Lab should have high operational freedom inside this boundary:

- treat the wiki as a first-class tool, not an optional reference
- ask the wiki for context when a task depends on prior work, method definitions, metrics, hidden implementation details, or the user's existing ideas
- create and update approach nodes, experiments, and finding proposals
- prepare a development handoff when code work is the next step
- write back experiment evidence and findings through proposal-first wiki flow

The constraint should be on artifact quality and research evidence, not on the
agent's internal path. Avoid turning Lab into a feature workflow or coding
orchestrator.

Non-goals for Lab:

- implement code, run tests, commit, push, release, or converge development
- turn every exploration into a release-managed feature
- hide uncertainty behind polished code
- make broad canonical wiki rewrites without the wiki workflow
- run expensive experiments without a clear learning target and evidence plan

## Standalone Modes

### Wiki-Only

Use when the user wants to:

- read and internalize papers
- add reading insights or Zotero annotations
- evolve paper analysis
- retrieve related claims, methods, and ideas
- develop research ideas without running code

### Lab-Only

Use when the user wants to:

- design an experiment from an idea
- place or compare research ideas
- preserve experiment evidence
- interpret logs and metrics
- record experiment memory in a repo even before a full wiki exists

### Integrated

Use when the user wants the best version:

- retrieve paper/wiki context before coding
- ground experiment slices in prior work
- compare results against papers and past runs
- write experiment notes and refined understanding back to the wiki

## Shared Contract

### Context Packet

The context packet is the boundary from wiki to Lab:

- request intent
- selected wiki pages
- selected thread/node/experiment/proposal artifacts
- why each item was selected
- relevant evidence and source links
- conflicts, uncertainty, and gaps
- recommended research move or development handoff
- allowed write policy

### Development Handoff Packet

The development handoff packet is the boundary from Lab to coding workflow:

- active thread/node
- selected wiki context
- development question
- expected command/config/output identity
- validity criteria
- evidence to return to Lab

### Write-Back Packet

The write-back packet is the boundary from Lab to wiki:

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
   -> Lab Idea Graph
      -> place idea / ground with wiki / update approach tree
      -> record experiment evidence / create finding proposal
      -> development handoff when code work is needed
-> Shared Research Memory
   -> wiki pages, experiment notes, result pages, failed paths, next ideas
```

## MVP Priority

Paper Wiki Workflow:

- paper ingest
- user insight/Zotero note ingestion
- evolutionary analysis
- context packet retrieval

Lab Idea Graph:

- experiment design
- Wiki-grounded feasibility review
- result interpretation
- experiment memory
- development handoff

Integration:

- context packet API
- development handoff packet
- write-back packet API
- shared page schemas for ideas, hypotheses, experiments, and results
