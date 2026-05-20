---
type: "method"
title: "Wei et al. - 2025 - First SFT, Second RL, Third UPT Continual Improving Multi-Modal LLM Reasoning via Unsupervised Post"
status: "draft"
sources:
  - "[[papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post|Wei et al. - 2025 - First SFT, Second RL, Third UPT Continual Improving Multi-Modal LLM Reasoning via Unsupervised Post]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Wei et al. - 2025 - First SFT, Second RL, Third UPT Continual Improving Multi-Modal LLM Reasoning via Unsupervised Post

- Source paper: [[papers/Wei-et-al-2025-First-SFT-Second-RL-Third-UPT-Continual-Improving-Multi-Modal-LLM-Reasoning-via-Unsupervised-Post|Wei et al. - 2025 - First SFT, Second RL, Third UPT Continual Improving Multi-Modal LLM Reasoning via Unsupervised Post]]
- Summary: To address this, we propose MM-UPT, a simple yet effective framework for unsupervised post-training of MLLMs, enabling continual self-improvement without any external supervision. Motivated by these insights, we propose MM-UPT (Multi-Modal Unsupervised Post-Training), an easy-to-implement framework for unsupervised post-training in MLLMs. To further explore scalability, we extend our framework to a data self-generation setting, designing two strategies that prompt the MLLM to synthesize new training samples on its own.
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 4; p. 1; p. 5
