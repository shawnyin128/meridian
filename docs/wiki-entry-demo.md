# Paper Wiki Entry Demo

This demo shows the two product entries and two workflows.

## Prompt/Skill Entry

### Update Wiki

```text
Use Meridian Paper Wiki to update the wiki with this paper PDF.
```

Expected agent behavior:

1. Run the paper ingest flow.
2. Preserve source provenance.
3. Publish the canonical paper page when the flow converges.
4. Update index/log/catalog.
5. Report the managed source path and canonical wiki page.

Execution primitive:

```bash
meridian wiki flow /path/to/paper.pdf \
  --wiki-root wiki \
  --out wiki/.drafts/ingests/<paper-slug>/
```

### Use Wiki

```text
Use Meridian Paper Wiki before answering: I want to debug speculative decoding acceptance rate.
```

Expected agent behavior:

1. Retrieve context.
2. Read the highest-value canonical pages.
3. Answer with papers, methods, concepts, evidence, and uncertainty.

Execution primitive:

```bash
meridian wiki retrieve "debug speculative decoding acceptance rate" \
  --wiki-root wiki \
  --strategy v1 \
  --out wiki/.drafts/retrieval/speculative-acceptance/context.md \
  --json-out wiki/.drafts/retrieval/speculative-acceptance/context.json
```

## MCP Entry

### Use Wiki

```bash
PYTHONPATH=src python3 -m meridian.mcp context \
  --wiki-root wiki \
  --query "KV-cache compression debugging prerequisites"
```

Then read one page:

```bash
PYTHONPATH=src python3 -m meridian.mcp read \
  --wiki-root wiki \
  --page concepts/KV-cache-memory-bandwidth.md
```

### Update Wiki Proposal

Use `meridian.propose` through the adapter/API to turn retrieved context into a proposal:

```python
from pathlib import Path
from meridian.mcp import propose

proposal = propose(
    wiki_root=Path("wiki"),
    query="compare activation outlier smoothing evidence",
    title="Activation Outlier Smoothing Evidence Map",
    proposal_type="synthesis",
)
print(proposal["proposal_manifest"])
```

Publish only after lint passes:

```python
from pathlib import Path
from meridian.mcp import apply

result = apply(
    wiki_root=Path("wiki"),
    proposal_manifest=Path(proposal["proposal_manifest"]),
)
print(result["status"])
```

The same Markdown vault remains the source of truth in both entries.
