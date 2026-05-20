---
type: "method"
title: "Samarin et al. - 2026 - LK Losses Direct Acceptance Rate Optimization for Speculative Decoding"
status: "draft"
sources:
  - "[[papers/Samarin-et-al-2026-LK-Losses-Direct-Acceptance-Rate-Optimization-for-Speculative-Decoding|Samarin et al. - 2026 - LK Losses Direct Acceptance Rate Optimization for Speculative Decoding]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Samarin et al. - 2026 - LK Losses Direct Acceptance Rate Optimization for Speculative Decoding

- Source paper: [[papers/Samarin-et-al-2026-LK-Losses-Direct-Acceptance-Rate-Optimization-for-Speculative-Decoding|Samarin et al. - 2026 - LK Losses Direct Acceptance Rate Optimization for Speculative Decoding]]
- Summary: To address this issue, we propose LK losses, special training objectives that directly target acceptance rate. We evaluate our approach on general, coding and math do- mains and report gains of up to 8-10% in average acceptance length. LK losses are easy to imple- ment, introduce no computational overhead and can be directly integrated into any existing spec- ulator training framework, making them a com- pelling alternative to the existing draft training objectives.
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 3; p. 5; p. 9
