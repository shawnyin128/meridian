---
name: wiki-personalize
description: Use when the user wants to add, review, publish, retrieve, or reason over their own paper-reading insights, notes, corrections, implementation ideas, retrieval hints, or future questions in Meridian Paper Wiki.
---

# Wiki Personalize

Use this skill when the user provides personal reading notes or asks to remember an insight about a paper.

For product-facing usage, start from the `wiki` skill and choose `Update Wiki`. This skill is the user-insight support module.

## Core Boundary

User insights are valuable wiki state, but they are not paper source facts.

Preserve this separation:

- `source fact`: what the paper says, with source provenance.
- `wiki synthesis`: Meridian's cross-source interpretation.
- `user insight`: the user's note, hypothesis, correction, implementation idea, or retrieval hint.

Never write a user insight into `Source Facts`, `Evidence Map`, or source-grounded mechanism text unless a separate source re-check verifies it.

## Commands

Create a draft insight:

```bash
meridian wiki add-insight \
  --wiki-root wiki \
  --paper "<paper path, title, alias, source id, or natural-language query>" \
  --note "<user note>" \
  --insight-type paper-note
```

Use a note file:

```bash
meridian wiki add-insight \
  --wiki-root wiki \
  --paper "<paper identifier>" \
  --note-file notes.md
```

Validate and publish:

```bash
meridian wiki insight-lint wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
meridian wiki publish-insight wiki/.drafts/insights/<slug>/insight.json --wiki-root wiki
```

## Matching Discipline

If the paper match is ambiguous or missing, do not attach the note. Use the generated disambiguation artifact and ask for a more specific title/path/alias.

Good paper identifiers:

- `papers/<page>.md`
- exact title
- alias/acronym
- source id
- a precise natural-language query when exact identifiers are unavailable

## Publish Discipline

Publishing appends to the target paper page's `## User Insights` section and updates `user_insights`, `personalized`, and `updated` frontmatter.

It does not rewrite source-grounded sections in the MVP path. If the user says a page is wrong, record the note and require source re-check before changing source-grounded claims.

If a published insight should change the canonical page's broader interpretation or retrieval behavior, route it through evolution instead of editing directly:

```bash
meridian wiki propose-refine \
  --wiki-root wiki \
  --target "<canonical paper page>" \
  --from-insight "<insight_id>" \
  --reason "<why the page should evolve>" \
  --change-class user_insight_integration
```

In the final LLM Wiki product loop, user insight is an evolution signal. After publishing an insight, check whether it should also create:

- a refinement proposal for the target paper;
- a synthesis/update proposal if the insight changes a cross-paper idea;
- a retrieval hint if it should affect future research-intent routing.

Do not promote it into `Source Facts` without source re-check.

## Retrieval

Published insights become retrievable through the canonical paper page. When retrieval matches `User Insights`, treat it as personalized context and preserve the boundary warning. It can guide implementation or idea work, but it is not scientific evidence.

## Zotero

Future Zotero annotation import should emit the same user insight schema. Preserve Zotero item key, highlight/comment, page, and attachment provenance, but do not bypass `insight-lint` or direct-publish into source fact sections.
