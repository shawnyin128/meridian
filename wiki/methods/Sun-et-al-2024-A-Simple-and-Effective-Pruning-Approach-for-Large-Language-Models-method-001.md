---
type: "method"
title: "Sun et al. - 2024 - A Simple and Effective Pruning Approach for Large Language Models"
status: "draft"
sources:
  - "[[papers/Sun-et-al-2024-A-Simple-and-Effective-Pruning-Approach-for-Large-Language-Models|Sun et al. - 2024 - A Simple and Effective Pruning Approach for Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Sun-et-al-2024-A-Simple-and-Effective-Pruning-Approach-for-Large-Language-Models.md"
related_papers:
  - "papers/Sun-et-al-2024-A-Simple-and-Effective-Pruning-Approach-for-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-8155ea64b6"
consolidation_target: "methods/calibration-aware-PTQ"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Sun et al. - 2024 - A Simple and Effective Pruning Approach for Large Language Models

- Source paper: [[papers/Sun-et-al-2024-A-Simple-and-Effective-Pruning-Approach-for-Large-Language-Models|Sun et al. - 2024 - A Simple and Effective Pruning Approach for Large Language Models]]
- Summary: In this paper, we introduce a novel, straightforward yet effective pruning method, termed Wanda (Pruning by Weights and activations), designed to induce sparsity in pretrained LLMs. Motivated by the recent observa- tion of emergent large magnitude features in LLMs, our approach prunes weights with the smallest magnitudes multiplied by the corresponding input activations, on a per-output basis. First, we propose a novel pruning metric that incorporates both weights and input activations into the computation of weight importance.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, calibration or runtime activations, model weights, calibration data
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, calibration data reflects the activation/weight behavior relevant to deployment
- Provenance: p. 12; p. 4; p. 2
