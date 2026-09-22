# Paper Wiki Product Maturity Quality Rubric

Use this rubric to judge whether Meridian is ready for stable daily use.

## Scoring

Score each dimension from 1 to 5.

- 5: product-ready; failures are minor and documented
- 4: usable with small residuals
- 3: workflow exists but needs careful operator judgment
- 2: brittle or incomplete for normal use
- 1: missing or unsafe

## Dimensions

### Entry Simplicity

The user can enter through Prompt/Skill or MCP and choose only `Update Wiki` or `Use Wiki` mentally.

### Canonical Artifact Boundary

User-facing outputs are canonical pages, context packets, proposals, and managed sources. Debug artifacts do not leak into product retrieval or MCP reads.

### Source And Provenance Integrity

Raw sources are immutable, managed paths are recorded, and source facts are traceable from paper/synthesis/claim/evidence pages.

### Retrieval Usefulness

Retrieval returns the right mix of synthesis, concept, method, topic, claim, evidence, and paper pages for the research intent.

### Synthesis Layer Usefulness

Published syntheses preserve source facts, wiki synthesis, evidence map, uncertainty, and retrieval hooks. They are useful enough to read before individual papers.

### Concept Layer Usefulness

Concept pages provide preliminary knowledge for coding/debug/probe work, including implementation implications, failure modes, minimal checks, and provenance.

### Personalization Boundary

User insights are preserved and retrievable as user-supplied context without being promoted to paper source facts.

### Evolution Readiness

Canonical pages can be refined through proposal/lint/publish with revision metadata and snapshots.

### MCP Client Readiness

The stdio server can be registered by a client, supports initialize/tools/list/tools/call, returns structured tool errors, and keeps update operations proposal/lint-gated.

### Daily Use Repeatability

A release checklist and daily-use walkthrough exist, and the commands can be rerun without relying on agent memory.

## Hard Fail Conditions

- `.drafts` or `.versions` appears as a normal retrieval result.
- Source-quality hold content is used as scientific evidence.
- User insight is rewritten as source fact without source re-check.
- MCP tool error crashes the server process instead of returning a structured error.
- Canonical publish silently overwrites without lint or explicit overwrite.
