---
type: "method"
title: "instruction tuning"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions.md"
source_papers:
  - "papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions.md"
related_papers:
  - "papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions.md"
related_methods:
related_topics:
  - "benchmark evaluation"
  - "instruction tuning"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-74246752ec"
---
# instruction tuning

## What It Is

This is a compiled method-family page for `instruction tuning`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions|Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions]]: ### Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions - Purpose: We introduce SELF-INSTRUCT, a framework for improving the instruction-following capabilities of pre- trained language models by boot...

## Used By Papers

- [[papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions]]

## Implementation Hooks

- [[papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions|Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions]]: - Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions: Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance. - Equation-...

## Failure Modes

- [[papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions|Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions]]: - Preference-learning results depend on labeler consistency, comparison design, and whether the learned reward transfers beyond the sampled trajectories or responses. - Reward-model optimization can create reward hacking...

## Evidence

- [[papers/Wang-et-al-2023-Self-Instruct-Aligning-Language-Models-with-Self-Generated-Instructions|Wang et al. - 2023 - Self-Instruct Aligning Language Models with Self-Generated Instructions]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: As...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
