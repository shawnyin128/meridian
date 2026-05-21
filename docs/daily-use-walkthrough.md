# Daily Use Walkthrough

Meridian has two product entries:

- Prompt/Skill: `.codex/skills/meridian-paper-wiki/SKILL.md`
- MCP: `python3 -m meridian.mcp serve --wiki-root wiki`

The CLI commands are execution primitives. The user-facing wiki lives in `wiki/`.

## 1. Add A New Paper PDF

Prompt/Skill entry:

```text
Add this PDF to Meridian Paper Wiki. Publish the canonical paper page when the flow converges, preserve source provenance, update index/log/catalog, and report the managed source path plus canonical wiki page.
```

Execution primitive:

```bash
meridian wiki flow /path/to/paper.pdf \
  --out wiki/.drafts/ingests/<paper-slug>/ \
  --wiki-root wiki \
  --rubric eval/rubrics/paper_wiki_quality_v0.md
```

MCP entry:

- Call `meridian.update` with `source_path`.
- The tool returns a ready-for-ingest summary and suggested flow path.

Read in Obsidian:

- managed source: `wiki/raw/sources/papers/`
- canonical paper page: `wiki/papers/<paper>.md`

Internal artifacts:

- `wiki/.drafts/ingests/<paper-slug>/`
- review, judge, and self-check files

## 2. Ask A Research Or Coding Question

Prompt/Skill entry:

```text
Use Meridian Paper Wiki to answer this research/coding question. Retrieve context first, read the highest-value canonical pages, and separate source facts, synthesis, concepts, evidence, and uncertainty.
```

Execution primitive:

```bash
meridian wiki retrieve "<research intent>" \
  --wiki-root wiki \
  --strategy v1 \
  --out wiki/.drafts/retrieval/<slug>/context.md \
  --json-out wiki/.drafts/retrieval/<slug>/context.json
```

MCP entry:

- Call `meridian.context`.
- Call `meridian.read` for selected canonical pages.
- Call `meridian.trace` when provenance matters.

Read in Obsidian:

- papers: `wiki/papers/`
- syntheses: `wiki/syntheses/`
- concepts: `wiki/concepts/`
- methods/topics/claims/evidence as needed

## 3. Add A User Reading Insight

Prompt/Skill entry:

```text
I read this paper and want to add a note. Match the note to the canonical paper, preserve my raw wording, normalize it as user insight, lint it, publish it if safe, and make it retrievable as user-supplied context.
```

Execution primitive:

```bash
meridian wiki add-insight \
  --wiki-root wiki \
  --paper "<paper title, alias, arxiv id, or path>" \
  --note "<reading note>"

meridian wiki insight-lint wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
meridian wiki publish-insight wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
```

MCP entry:

- Call `meridian.update` with `paper`, `note`, and `insight_type`.

Canonical output:

- The target paper page gets a `User Insights` section.
- Retrieval can use it but labels it as user-supplied, not source fact.

## 4. Preserve A Useful Answer As Synthesis

Prompt/Skill entry:

```text
Preserve this useful comparison as Meridian synthesis. Use the retrieval context, keep source facts and wiki synthesis separate, lint the proposal, and publish if safe.
```

Execution primitive:

```bash
meridian wiki propose-writeback \
  --wiki-root wiki \
  --query "<research intent>" \
  --context wiki/.drafts/retrieval/<slug>/context.json \
  --title "<synthesis title>" \
  --proposal-type synthesis

meridian wiki proposal-lint wiki/.drafts/proposals/<slug>/proposal.json --wiki-root wiki
meridian wiki publish-proposal wiki/.drafts/proposals/<slug>/proposal.json --wiki-root wiki
```

MCP entry:

- Call `meridian.propose`.
- Call `meridian.apply` after lint passes.

Canonical output:

- `wiki/syntheses/<synthesis>.md`
- updated index/log/catalog

Internal artifact:

- `wiki/.drafts/proposals/<slug>/`
