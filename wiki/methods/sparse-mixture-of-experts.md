---
type: "method"
title: "sparse mixture-of-experts"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
source_papers:
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
related_papers:
  - "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
related_methods:
related_topics:
  - "expert routing"
  - "sparse mixture-of-experts"
  - "router preservation"
  - "context extrapolation"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-bf042cc676"
---
# sparse mixture-of-experts

## What It Is

This is a compiled method-family page for `sparse mixture-of-experts`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Jiang-et-al-2024-Mixtral-of-Experts|Jiang et al. - 2024 - Mixtral of Experts]]: ### Sparse mixture-of-experts decoder - Purpose: Uses sparse top-k expert routing in each feed-forward block so inference activates only a subset of experts per token while keeping a larger total parameter budget. - Operates on: token hidde...

## Used By Papers

- [[papers/Jiang-et-al-2024-Mixtral-of-Experts]]

## Implementation Hooks

- [[papers/Jiang-et-al-2024-Mixtral-of-Experts|Jiang et al. - 2024 - Mixtral of Experts]]: - Sparse mixture-of-experts decoder: Log expert utilization, routing entropy, and per-token top-k assignments. - Sparse mixture-of-experts decoder: Separate model-quality comparisons from serving throughput and memory pl...

## Failure Modes

- [[papers/Jiang-et-al-2024-Mixtral-of-Experts|Jiang et al. - 2024 - Mixtral of Experts]]: - MoE quality and throughput depend on router load balance, expert specialization, and serving infrastructure. - Parameter count comparisons are misleading unless active parameters and routing cost are separated. Open qu...

## Evidence

- [[papers/Jiang-et-al-2024-Mixtral-of-Experts|Jiang et al. - 2024 - Mixtral of Experts]]: Evidence takeaways: - Mixtral evidence should separate sparse MoE model quality from expert routing/utilization and serving throughput constraints. Claim candidates: - `claim-001`: Results in Figure 4 (Left) show that Mi...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
