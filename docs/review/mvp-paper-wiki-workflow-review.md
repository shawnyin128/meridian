# MVP Paper Wiki Workflow Review

## Context/Test Plan

### Raw Request

The user asked to initialize Arbor and brainstorm the overall plan. This checkpoint should refine the scheme rather than output concrete implementation features. The MVP must define clear functionality and boundaries for each workflow step, plus a feasible development plan and test plan.

### Problem Summary

Meridian needs to become a personally usable paper wiki workflow. The current project has a strong product direction and a simplified workflow diagram, but implementation should not start until the workflow boundaries, storage model, retrieval path, and verification strategy are explicit enough to guide later develop/evaluate rounds.

### Goals

- Define the MVP as a workflow, not an agents platform.
- Clarify each step's function, inputs, outputs, and boundaries.
- Preserve the user's specific needs: raw paper analysis, user/Zotero insight ingestion, evolutionary analysis, Obsidian-first storage, strong retrieval, and good request handling.
- Define a feasible development sequence that starts small and remains testable.
- Define a test plan that checks behavior, not only file existence.

### Non-Goals

- Do not implement the workflow in this brainstorm step.
- Do not split the product into detailed implementation features yet.
- Do not build paper writing, rebuttal, experiment automation, multi-user collaboration, or a general agents platform in the MVP.
- Do not require vector infrastructure or a database before Markdown, frontmatter, lexical search, and graph links prove insufficient.

### Constraints

- Follow the local `llm-wiki` skill and keep the canonical state Markdown-first.
- Treat raw sources as immutable.
- Keep broad canonical writes behind a draft/review gate.
- Keep source facts, user judgment, and wiki synthesis visibly separate.
- Make retrieval produce a small context packet with selection reasons and gaps.

### Hidden Decisions

- First paper ingestion should optimize for one high-quality paper, not batch ingestion.
- Zotero should likely start as export/annotation import rather than direct API integration unless the user prioritizes live sync.
- Retrieval should start with structured Markdown, frontmatter, lexical search, and graph expansion before adding vector search.
- Graph state can begin as simple JSONL edges if updates are deterministic and testable.
- Publish policy needs an explicit narrow-update exception; otherwise every tiny correction becomes too heavy.

### Recommended Approach

Use a five-step workflow kernel:

```text
Route Request
-> Build Paper Model
-> Retrieve Context
-> Review Draft
-> Publish and Feed Ideas
```

This matches the Anthropic workflow framing: LLM calls are composed through predefined paths with routing, chained stages, parallel extraction, evaluator/optimizer checks, and gated writes.

### Acceptance Criteria

- The MVP plan explains every workflow step in terms of purpose, inputs, outputs, and boundaries.
- The plan names non-goals clearly enough to prevent scope creep into an agents platform.
- The plan includes a development sequence that can be executed incrementally.
- The plan includes tests for structure, scenario behavior, and negative cases.
- The plan records open decisions that must be resolved before implementation starts.

### Done-When Criteria

| Criterion | Minimum proof | Evidence owner |
| --- | --- | --- |
| Arbor is initialized for the project | `AGENTS.md`, `.arbor/memory.md`, and `.codex/hooks.json` exist and startup context can be collected | brainstorm |
| The MVP workflow is defined | `docs/mvp-paper-wiki-plan.md` documents step boundaries, development plan, and test plan | brainstorm |
| The workflow checkpoint can be resumed | `.arbor/workflow/features.json` points to this review document and `.arbor/memory.md` records the in-flight state | brainstorm |
| Later implementation has a verification target | This Context/Test Plan lists structure, scenario, and negative tests | develop/evaluate |

## Test Plan

Structure checks:

- Confirm Arbor files exist.
- Confirm project guide maps to the current planning docs.
- Confirm the `llm-wiki` skill validates.
- Confirm workflow docs do not contain placeholder TODOs.

Scenario checks for later development:

- One-paper ingestion without annotations.
- One-paper ingestion with user/Zotero insight.
- Feedback-driven analysis revision.
- Retrieval from an idea into a context packet.
- Draft publish updates canonical wiki, index, log, and graph together.

Negative checks for later development:

- Missing source should stop at routing.
- Ambiguous write intent should not modify canonical wiki.
- Unproven claims should not publish as high-confidence claims.
- Weak retrieval should report gaps rather than hallucinating relevance.
- Broad rewrites should not bypass drafts.

### Risks

- The workflow can still become too broad if paper writing, experiment execution, or multi-user collaboration enters the MVP.
- Retrieval quality may be overestimated if the first version only uses title/keyword matches.
- Direct Zotero integration can distract from the core paper analysis loop.
- Too-strict review gates can make the workflow annoying for small corrections.

### Decision Trace Handoff

Key decisions:

- MVP is a personal paper wiki workflow.
- The workflow is not a general agents platform.
- Canonical state lives in an Obsidian-compatible Markdown wiki.
- First implementation should optimize for one-paper depth and feedback evolution.
- Retrieval must return an explicit context packet.

Rejected options:

- Start with autonomous agents.
- Start with database/vector-first infrastructure.
- Start with batch ingestion.
- Start with paper writing/rebuttal/experiment automation.

Allowed implementation discretion:

- Choose the first parser/search helper if it preserves the workflow contract.
- Adjust exact directory names if the same boundaries remain clear.
- Defer graph JSONL if the first milestone proves page-level links and logs are enough.

Decision invariants:

- Raw sources remain immutable.
- Source facts, user judgment, and synthesis stay separate.
- Broad writes go through draft/review.
- Retrieval must justify selected context.
