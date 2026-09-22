# High-Leverage System Optimization Rubric

Use this rubric to judge whether a Meridian Paper Wiki change improves the system-level loops that matter after MVP completion.

## Scoring

Score each dimension from 1 to 5.

- 5: materially improves a reusable workflow and leaves durable, source-provenanced wiki state
- 4: useful improvement with documented residuals
- 3: mechanism exists but still needs careful operator judgment
- 2: narrow or brittle improvement
- 1: missing, unsafe, or mostly cosmetic

## Dimensions

### Synthesis Density

Published syntheses should do more than collect links. They should separate source facts from wiki synthesis, contain a concrete evidence map, expose uncertainty/open questions, and provide retrieval hooks that match realistic research/coding queries.

### Evolution Usefulness

Refinement should improve durable canonical pages or produce a clear proposal. It should not silently rewrite source-grounded facts without provenance or source re-check.

### Method-Family Consolidation

Paper-specific method records should route toward compiled method-family pages when a safe target is available. Retrieval should suppress low-value candidate records unless the query explicitly asks for that paper-specific identity.

### Concept Linkage

Method/probe/debug queries should surface prerequisite concept pages with implementation implications, common failure modes, minimal checks/probes, and source provenance.

### Claim/Evidence Traceability

Evidence-support queries should return claim/evidence pages and source papers with visible provenance. Claims without evidence should remain candidates or repair targets.

### Entry Contract

Prompt/Skill and MCP usage should expose the same product model: `Update Wiki` and `Use Wiki`. CLI/debug artifacts should not appear as normal product outputs.

### MCP Readiness

MCP validation should cover initialize, tools/list, context, read, trace, propose, apply on a fixture-safe wiki, and audit. Errors should be structured tool errors rather than server crashes.

### Artifact Boundary

Normal retrieval and MCP reads must not return `.drafts`, `.versions`, `review.md`, or draft paper candidates as user-facing wiki pages.

### Source-Quality Guard

Source-quality holds may support cleanup/provenance work, but not scientific evidence.

### Generalized Improvement

The optimization should improve a class of failures: retrieval ranking, context packing, method consolidation, concept linkage, synthesis density, claim/evidence traceability, entry output, or MCP behavior. It should not merely patch one eval case.

## Hard Fail Conditions

- Debug artifacts are returned as canonical wiki context.
- Source-quality hold content is promoted as scientific evidence.
- User insight is represented as a paper source fact.
- A candidate method record outranks a compiled method family for a generic method/probe query after a consolidation target exists.
- A synthesis page contains only a paper list or generic placeholder text and no source-fact/synthesis/evidence/open-question boundary.
- MCP update/apply mutates the main wiki without proposal/lint gating.
