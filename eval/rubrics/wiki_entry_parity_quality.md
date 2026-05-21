# Wiki Entry Parity Quality Rubric

Use this rubric to judge whether Prompt/Skill and MCP behave as two product entries over the same Meridian Paper Wiki core.

## Dimensions

1. Entry model clarity
   - Score 5: The first-level product model is Prompt/Skill and MCP, each with Update Wiki and Use Wiki.
   - Score 3: The model exists but users still need to understand many raw CLI commands.
   - Score 1: Entries are command lists without workflow meaning.

2. Prompt/Skill readiness
   - Score 5: The product skill is concise, positive, example-driven, and delegates only when needed.
   - Score 3: The skill works but over-explains internals.
   - Score 1: The skill is not a usable product entry.

3. MCP readiness
   - Score 5: A stdio MCP server starts, lists scenario-facing tools, and calls the existing Meridian adapter.
   - Score 3: Only a JSON bridge exists or server registration is unclear.
   - Score 1: MCP is only a design note.

4. Use Wiki parity
   - Score 5: Prompt and MCP retrieval both use canonical corpus, compact context, page reads, and provenance trace.
   - Score 3: Both can retrieve but one entry lacks provenance or artifact boundaries.
   - Score 1: One entry bypasses the canonical wiki.

5. Update Wiki parity
   - Score 5: Prompt and MCP both support proposal-first updates, insight/source handling, lint, and safe apply.
   - Score 3: Updates exist but are incomplete or too CLI-shaped.
   - Score 1: Updates directly mutate canonical pages without lint.

6. Boundary preservation
   - Score 5: Source facts, wiki synthesis, user insights, uncertainty, and debug artifacts remain clearly separated.
   - Score 3: Boundaries are documented but not fully surfaced in outputs.
   - Score 1: User insight or synthesis can masquerade as paper source fact.

## Hard Fail Conditions

- MCP cannot start or cannot list tools.
- `meridian.read` accepts `.drafts` or `.versions` as normal pages.
- Prompt skill exposes more than the two product workflows as the main entry.
- MCP update/apply bypasses proposal lint.
- Docs tell users that debug artifacts are product pages.
