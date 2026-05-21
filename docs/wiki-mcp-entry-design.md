# Paper Wiki MCP Entry Design

Meridian's MCP entry exposes the Paper Wiki as a small set of workflow tools. The Markdown vault remains the source of truth.

## Design Principles

- Two workflows: `Use Wiki` and `Update Wiki`.
- Few tools with scenario-facing names.
- Compact results by default.
- Large context packets are written to files and returned as paths plus summaries.
- Detailed schemas are discoverable through `meridian.capabilities`.
- Tools call existing Meridian core functions rather than duplicating CLI logic.

This follows the MCP model of connecting AI applications to external systems, and the code-execution pattern where agents load only the tool definitions and result detail needed for the current task.

## Tool Surface

### `meridian.capabilities`

Returns available workflows, tools, short examples, and schema pointers.

### Use Wiki

#### `meridian.context`

Input:

```json
{
  "query": "research or coding intent",
  "wiki_root": "wiki",
  "top_k": 6
}
```

Output:

```json
{
  "context_path": "wiki/.drafts/retrieval/<slug>/context.md",
  "context_json_path": "wiki/.drafts/retrieval/<slug>/context.json",
  "results_summary": [
    {
      "title": "...",
      "canonical_path": "concepts/Activation-outliers.md",
      "result_type": "concept",
      "knowledge_role": "compiled_knowledge",
      "why": ["knowledge-layer concept route"]
    }
  ]
}
```

#### `meridian.read`

Reads selected sections from one canonical page.

Input:

```json
{
  "page": "concepts/Activation-outliers.md",
  "sections": ["Implementation Implications", "Minimal Checks / Probes"]
}
```

#### `meridian.trace`

Returns provenance fields, links, and evidence/source sections for a canonical page.

### Update Wiki

#### `meridian.update`

Adds a paper source or user insight through the appropriate flow.

Examples:

```json
{
  "source_path": "/path/to/paper.pdf",
  "wiki_root": "wiki"
}
```

```json
{
  "paper": "CodeQuant",
  "note": "Use this paper when designing expert-routing quantization probes.",
  "insight_type": "implementation-note"
}
```

#### `meridian.propose`

Creates a proposal from query context or a note.

```json
{
  "query": "compare activation outlier smoothing evidence",
  "title": "Activation Outlier Smoothing Evidence Map",
  "proposal_type": "synthesis"
}
```

#### `meridian.apply`

Lints and publishes an existing proposal.

#### `meridian.audit`

Returns health summary commands and report paths for maintenance.

## Current Prototype

The current repo implements a dependency-light adapter at:

```text
src/meridian/mcp/
```

It can be exercised as Python functions or through a JSON bridge:

```bash
PYTHONPATH=src python3 -m meridian.mcp capabilities --detail full
PYTHONPATH=src python3 -m meridian.mcp context --wiki-root wiki --query "KV-cache compression debugging prerequisites"
PYTHONPATH=src python3 -m meridian.mcp read --wiki-root wiki --page concepts/KV-cache-memory-bandwidth.md
PYTHONPATH=src python3 -m meridian.mcp trace --wiki-root wiki --page papers/<paper>.md
```

Future packaging can wrap these functions in a concrete MCP SDK server without changing the vault or core workflow.
