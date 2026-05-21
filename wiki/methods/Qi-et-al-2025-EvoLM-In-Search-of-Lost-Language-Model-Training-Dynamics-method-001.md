---
type: "method"
title: "Qi et al. - 2025 - EvoLM In Search of Lost Language Model Training Dynamics"
status: "draft"
sources:
  - "[[papers/Qi-et-al-2025-EvoLM-In-Search-of-Lost-Language-Model-Training-Dynamics|Qi et al. - 2025 - EvoLM In Search of Lost Language Model Training Dynamics]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Qi-et-al-2025-EvoLM-In-Search-of-Lost-Language-Model-Training-Dynamics.md"
related_papers:
  - "papers/Qi-et-al-2025-EvoLM-In-Search-of-Lost-Language-Model-Training-Dynamics.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e1c7a094a9"
consolidation_target: "methods/policy-optimization"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Qi et al. - 2025 - EvoLM In Search of Lost Language Model Training Dynamics

- Source paper: [[papers/Qi-et-al-2025-EvoLM-In-Search-of-Lost-Language-Model-Training-Dynamics|Qi et al. - 2025 - EvoLM In Search of Lost Language Model Training Dynamics]]
- Summary: We present EvoLM, a model suite that enables systematic and transparent analysis of LMs’ training dynamics across pre-training, continued pre-training, supervised fine-tuning, and reinforcement learning. The framework evaluates both upstream (language modeling) and downstream (problem-solving) performance across in-domain (e.g., math) and out-of-domain (e.g., code, logic) settings, enabling systematic analysis of design trade-offs and scaling behaviors. We introduce EvoLM, a model suite comprising 100+ decoder-only autoregressive LMs with 1B and 4B parameters, each trained from scratch with complete learning rate decay across various configurations of model size and dataset scale.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 1; p. 10; p. 11
