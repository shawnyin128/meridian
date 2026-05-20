---
type: "method"
title: "DeepSeek-AI 等 - 2025 - DeepSeek-V3 Technical Report"
status: "draft"
sources:
  - "[[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report|DeepSeek-AI 等 - 2025 - DeepSeek-V3 Technical Report]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
related_papers:
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-d1d108de1a"
---
# DeepSeek-AI 等 - 2025 - DeepSeek-V3 Technical Report

- Source paper: [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report|DeepSeek-AI 等 - 2025 - DeepSeek-V3 Technical Report]]
- Summary: In this work, we introduce an FP8 mixed precision training framework and, for the first time, validate its effectiveness on an extremely large-scale model. 6 2.1.1 Multi-Head Latent Attention . As for the training framework, we design the DualPipe algorithm for efficient pipeline parallelism, which has fewer pipeline bubbles and hides most of the communication during training through computation-communication overlap.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 2; p. 4; p. 5
