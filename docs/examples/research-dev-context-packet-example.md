---
type: research-dev-context-packet
status: example
created: 2026-05-21
updated: 2026-05-21
scenario: "Broken Run To Sanity Check / Debug"
wiki_context:
  - concepts/Cache-retention-policy.md
  - methods/KV-cache-compression.md
  - syntheses/KV-Cache-Compression-Failure-Boundary-Summary.md
  - claims/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation-claim-002.md
repo_context: []
confidence: medium
---

# Research Dev Context Packet Example

## User Intent

I am designing probes for KV-cache compression debugging. What prerequisite
concepts, method hooks, evidence, and sanity checks should guide the smallest
research-code slice?

## Scenario

Broken Run To Sanity Check / Debug, with a likely follow-up into Idea To
Experiment Design.

The task is not ready for code edits yet. It first needs a probe plan shaped by
Paper Wiki method/concept/evidence context.

## Wiki Context

| Page | Role | Why It Matters | Boundary |
| --- | --- | --- | --- |
| `concepts/Cache-retention-policy.md` | prerequisite concept | Defines cache compression as a retention-policy problem, not only a size-reduction problem. It gives concrete probes: compare recency-only, attention-score, and oracle retention baselines; inspect dependency distance and retained-token category. | Compiled concept page; use as wiki synthesis with source provenance, not as one paper's source fact. |
| `methods/KV-cache-compression.md` | method-family page | Names prerequisite concepts and implementation hooks: verify K/V tensor shapes, position indices, retention ratio, decode latency, memory footprint, and quality at the same sequence lengths. | Compiled method-family page; read linked paper/evidence before claiming paper support. |
| `syntheses/KV-Cache-Compression-Failure-Boundary-Summary.md` | synthesis | Connects retention policy, attention sinks, bandwidth limits, and misleading speedups. It is useful for failure-boundary framing before writing probes. | Published synthesis with `confidence: low`; useful for planning, not settled evidence. |
| `claims/Li-et-al-2024-SnapKV-LLM-Knows-What-You-are-Looking-for-Before-Generation-claim-002.md` | candidate claim | Gives a concrete compression claim: 5-10x at KV cache size 4096 with supporting evidence on page 10. This can anchor a baseline comparison. | Candidate claim record; trace supporting evidence before using as target number. |

Retrieval command:

```bash
PYTHONPATH=src python3 -m meridian.mcp context \
  --wiki-root wiki \
  --query "I am designing probes for KV-cache compression debugging. What prerequisite concepts, method hooks, evidence, and sanity checks should guide the smallest research-code slice?" \
  --top-k 6
```

Follow-up reads:

```bash
PYTHONPATH=src python3 -m meridian.mcp read --wiki-root wiki --page concepts/Cache-retention-policy.md
PYTHONPATH=src python3 -m meridian.mcp read --wiki-root wiki --page methods/KV-cache-compression.md
PYTHONPATH=src python3 -m meridian.mcp trace --wiki-root wiki --page syntheses/KV-Cache-Compression-Failure-Boundary-Summary.md
```

## Repo Context

Not inspected in this smoke. A real Research Dev pass should next inspect:

- where K/V tensors are constructed and cached
- where retention or eviction policy is applied
- whether token positions and attention masks are preserved after compression
- where decode latency, memory footprint, and quality metrics are logged
- whether there is already a recency-only or attention-score baseline

## Evidence Identity

- Commands: retrieval and read/trace commands above.
- Configs: not yet selected.
- Metrics to preserve: retention ratio, decode latency, memory footprint, long-context quality, dependency-distance failure rate.
- Outputs: future probe logs should include retained-token identity and attention mass, not only retained count.
- Commit / diff: no code change in this smoke.

## Source Facts

- The `Cache retention policy` concept says retention policy decides which tokens
  or heads to keep and affects whether task-relevant context survives.
- The same concept recommends recency-only, attention-score, and oracle retention
  baselines on the same prompts.
- The `KV-cache compression` method page lists prerequisite concepts:
  `Cache retention policy`, `Attention sink`, and `KV-cache memory bandwidth`.
- The SnapKV claim record reports 5-10x compression at KV cache size 4096, with
  provenance pointing to page 10.

## Wiki Synthesis

The smallest research-code slice should separate policy quality from systems
implementation. Before changing kernels or storage format, add probes that
answer:

1. Which tokens are retained?
2. Which retained tokens carry high attention mass?
3. Which failures involve long-range dependencies?
4. Does recency-only retention explain most of the apparent gain?
5. Does the method preserve attention sink or high-leverage early tokens?

This makes the first experiment diagnostic rather than only performance-seeking.

## User Insight

None supplied in this smoke.

## Uncertainty / Gaps

- The synthesis page has low confidence, so use it as planning context.
- Candidate claim/evidence records should be traced before treating them as
  benchmark targets.
- Repo-specific cache format, batch shape, and metric implementation remain
  unknown until code inspection.

## Recommended Research-Code Slice

Add a probe layer around the current KV-cache retention point:

- log retained token indices by layer/head
- log retained-token category: recent, attention sink / early token, high-attention token, oracle-relevant token if labels are available
- compare recency-only, attention-score, and existing policy on the same prompts
- report retention ratio, memory footprint, decode latency, and quality for the same sequence lengths
- stratify failures by dependency distance

Stop after this probe can distinguish policy failure from implementation or
measurement failure.

## Git Checkpoint Recommendation

Checkpoint before replacing the retention policy implementation. The first
commit should preserve the probe scaffold separately from any new policy logic,
so later ablations can compare instrumentation effects against method effects.

