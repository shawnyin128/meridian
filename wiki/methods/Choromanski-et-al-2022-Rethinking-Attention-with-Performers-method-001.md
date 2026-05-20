---
type: "method"
title: "Choromanski et al. - 2022 - Rethinking Attention with Performers"
status: "draft"
sources:
  - "[[papers/Choromanski-et-al-2022-Rethinking-Attention-with-Performers|Choromanski et al. - 2022 - Rethinking Attention with Performers]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Choromanski-et-al-2022-Rethinking-Attention-with-Performers.md"
related_papers:
  - "papers/Choromanski-et-al-2022-Rethinking-Attention-with-Performers.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-abba8d7203"
---
# Choromanski et al. - 2022 - Rethinking Attention with Performers

- Source paper: [[papers/Choromanski-et-al-2022-Rethinking-Attention-with-Performers|Choromanski et al. - 2022 - Rethinking Attention with Performers]]
- Summary: Other techniques which aim to reduce Transformers’ space complexity include reversible residual layers allowing one-time activation storage in training (Kitaev et al., 2020) and shared attention weights (Xiao et al., 2019). Most approaches restrict the attention mechanism to attend to local neighborhoods (Parmar et al., 2018) or incorporate structural priors on attention such as sparsity (Child et al., 2019), pooling-based compression (Rae et al., 2020) clustering/binning/convolution techniques (e.g. (Roy et al., 2020) which applies k-means clustering to learn dynamic sparse attention regions, or (Kitaev et al., 2020), where locality sensitive hashing is used to group together tokens of similar embeddings), sliding windows (Beltagy et al., 2020), or truncated targeting (Chelba et al., 2020).
- Inputs: policy parameters, reward signal, rollout trajectories
- Outputs: updated policy, measured return or task success
- Assumptions: rollout reward and evaluation environment match the behavior being optimized
- Provenance: p. 2; p. 5; p. 9
