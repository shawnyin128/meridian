---
type: "method"
title: "LLM-as-judge reward modeling"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge.md"
  - "papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena.md"
  - "papers/Yuan-et-al-2025-Self-Rewarding-Language-Models.md"
source_papers:
  - "papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge.md"
  - "papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena.md"
  - "papers/Yuan-et-al-2025-Self-Rewarding-Language-Models.md"
related_papers:
  - "papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge.md"
  - "papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena.md"
  - "papers/Yuan-et-al-2025-Self-Rewarding-Language-Models.md"
related_methods:
related_topics:
  - "human preference feedback"
  - "reward modeling"
  - "self-rewarding models"
  - "policy optimization"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-18fdf2c871"
---
# LLM-as-judge reward modeling

## What It Is

This is a compiled method-family page for `LLM-as-judge reward modeling`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge|Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge]]: ### Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge - Purpose: Turns preference pairs and a reference-policy constraint into a direct policy objective, avoiding a separate online reward-mo...
- [[papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena|Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena]]: ### Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena - Purpose: Schedule attention tiles, memory movement, and precision on the target GPU so attention is faster without changing the intended output. - Operates o...
- [[papers/Yuan-et-al-2025-Self-Rewarding-Language-Models|Yuan et al. - 2025 - Self-Rewarding Language Models]]: ### Yuan et al. - 2025 - Self-Rewarding Language Models - Purpose: 1 Introduction Aligning Large Language Models (LLMs) using human preference data can vastly improve the instruction following performance of pretrained models [Ouyang et al....

## Used By Papers

- [[papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge]]
- [[papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena]]
- [[papers/Yuan-et-al-2025-Self-Rewarding-Language-Models]]

## Implementation Hooks

- [[papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge|Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge]]: - Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge: Log preference-pair construction, labeler agreement, reward-model accuracy, policy reward, and held-out human evaluat...
- [[papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena|Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena]]: - Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena: Profile matmul, softmax, memory movement, and synchronization separately before trusting end-to-end throughput. - Zheng et al. - 2023 - Judg...
- [[papers/Yuan-et-al-2025-Self-Rewarding-Language-Models|Yuan et al. - 2025 - Self-Rewarding Language Models]]: - Yuan et al. - 2025 - Self-Rewarding Language Models: Log preference-pair construction, labeler agreement, reward-model accuracy, policy reward, and held-out human evaluation separately. - Equation-bearing sections exis...

## Failure Modes

- [[papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge|Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge]]: - Preference-learning results depend on labeler consistency, comparison design, and whether the learned reward transfers beyond the sampled trajectories or responses. - Reward-model optimization can create reward hacking...
- [[papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena|Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena]]: - Preference-learning results depend on labeler consistency, comparison design, and whether the learned reward transfers beyond the sampled trajectories or responses. - Reward-model optimization can create reward hacking...
- [[papers/Yuan-et-al-2025-Self-Rewarding-Language-Models|Yuan et al. - 2025 - Self-Rewarding Language Models]]: - Preference-learning results depend on labeler consistency, comparison design, and whether the learned reward transfers beyond the sampled trajectories or responses. - Reward-model optimization can create reward hacking...

## Evidence

- [[papers/Wu-et-al-2024-Meta-Rewarding-Language-Models-Self-Improving-Alignment-with-LLM-as-a-Meta-Judge|Wu et al. - 2024 - Meta-Rewarding Language Models Self-Improving Alignment with LLM-as-a-Meta-Judge]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: At...
- [[papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena|Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Yuan-et-al-2025-Self-Rewarding-Language-Models|Yuan et al. - 2025 - Self-Rewarding Language Models]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: Fin...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
