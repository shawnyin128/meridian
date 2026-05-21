---
type: "concept"
title: "KL regularization"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "KL penalty"
  - "KL divergence regularization"
  - "policy KL"
sources:
  - "papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post.md"
source_papers:
  - "papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post.md"
related_methods:
  - "preference optimization"
  - "RLHF"
  - "DPO"
  - "test-time RL"
related_topics:
  - "preference optimization"
  - "RLHF"
related_claims:
related_evidence:
prerequisite_for:
  - "preference optimization"
  - "RLHF"
  - "DPO"
  - "test-time RL"
supports:
contradicts:
confidence: "low"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-8ad2fe887d"
---
# KL regularization

## What It Is

`KL regularization` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- KL regularization controls how far an optimized policy moves from a reference distribution, affecting reward hacking, stability, and comparability across preference methods.

## Where It Appears

- [[papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post]]

## Used By Methods

- [[methods/preference-optimization|preference optimization]]
- [[methods/RLHF|RLHF]]
- [[methods/DPO|DPO]]
- [[methods/test-time-RL|test-time RL]]

## Implementation Implications

- Log KL against the intended reference model with the same tokenizer and masking as the loss.
- Treat beta/temperature as core experimental controls.

## Common Failure Modes

- KL is computed on padded tokens or a mismatched reference.
- A method appears better because it accepts much larger policy drift.

## Minimal Checks / Probes

- Run beta sweeps with fixed data and seeds.
- Assert label/token masks before KL aggregation.

## Evidence / Provenance

- [[papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post|Wei et al. - 2025 - First SFT, Second RL, Third UPT Continual Improving Multi-Modal LLM Reasoning via Unsupervised Post]]: wei et al 2025 first sft second rl third upt continual improving multi modal llm reasoning via unsupervised post sft rl upt multi modal wei et al 2025 first sft second rl third upt continual improving multi modal llm reasoning via unsupervised post human prefe...

## Related Concepts

- [[concepts/Preference-data-underspecification|Preference data underspecification]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for RLHF/DPO/TTRL comparisons, preference optimization stability, and policy drift diagnostics.
