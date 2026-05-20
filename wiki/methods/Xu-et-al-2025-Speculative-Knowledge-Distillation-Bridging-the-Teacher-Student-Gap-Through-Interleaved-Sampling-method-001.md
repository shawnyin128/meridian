---
type: "method"
title: "Xu et al. - 2025 - Speculative Knowledge Distillation Bridging the Teacher-Student Gap Through Interleaved Sampling"
status: "draft"
sources:
  - "[[papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling|Xu et al. - 2025 - Speculative Knowledge Distillation Bridging the Teacher-Student Gap Through Interleaved Sampling]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Xu et al. - 2025 - Speculative Knowledge Distillation Bridging the Teacher-Student Gap Through Interleaved Sampling

- Source paper: [[papers/Xu-et-al-2025-Speculative-Knowledge-Distillation-Bridging-the-Teacher-Student-Gap-Through-Interleaved-Sampling|Xu et al. - 2025 - Speculative Knowledge Distillation Bridging the Teacher-Student Gap Through Interleaved Sampling]]
- Summary: To address these limitations, we introduce Speculative Knowl- edge Distillation (SKD), a novel approach that leverages cooperation between stu- dent and teacher models to generate high-quality training data on-the-fly while aligning with the student’s inference-time distribution. While speculative decoding ensures that final sampled tokens adhere to the larger model’s distribution, our method directly assesses the feasibility of student-proposed tokens within the teacher’s top K tokens (See Sec 3.2). 7 CONCLUSION We propose Speculative Knowledge Distillation (SKD), a novel method that addresses the limita- tions of existing KD approaches.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3; p. 10; p. 1
