# Wiki Entry Contract Quality Rubric

Use this rubric to judge whether Meridian exposes a clean product entry instead of command sprawl.

## Dimensions

1. Entry simplicity
   - Score 5: The user sees Prompt/Skill and MCP as the two entries, each with Update Wiki and Use Wiki.
   - Score 3: The entry model exists but raw CLI commands still dominate first-level usage.
   - Score 1: The entry is a list of unrelated commands.

2. Workflow routing
   - Score 5: Requests naturally route to Update Wiki or Use Wiki and call only needed execution primitives.
   - Score 3: Routing is mostly correct but some tasks require knowing internal commands.
   - Score 1: The user must choose low-level implementation steps.

3. Artifact boundary
   - Score 5: Source, canonical, draft, debug, retrieval, and proposal artifacts are clearly separated.
   - Score 3: Boundaries are documented but examples leak debug artifacts.
   - Score 1: Internal files are presented as product outputs.

4. Knowledge boundary
   - Score 5: Source facts, wiki synthesis, user insight, and uncertainty remain visibly distinct.
   - Score 3: Boundaries exist but are not consistently surfaced in outputs.
   - Score 1: User notes or synthesis are treated as paper evidence.

5. MCP progressive disclosure
   - Score 5: MCP surface is small, scenario-facing, compact by default, and discoverable through capabilities.
   - Score 3: MCP tools work but mirror too much CLI detail.
   - Score 1: MCP is only a design note or an oversized command wrapper.

6. Core handoff
   - Score 5: Prompt and MCP entries use the same Meridian core and canonical vault.
   - Score 3: Some behavior is duplicated but compatible.
   - Score 1: Entry behavior diverges from CLI/core semantics.

## Hard Fail Conditions

- Retrieval reads `.drafts` or `.versions` as normal product pages.
- Update flow writes user insight into source facts.
- MCP surface exposes debug artifacts as default user-facing results.
- Prompt entry has no canonical examples for Update Wiki and Use Wiki.
