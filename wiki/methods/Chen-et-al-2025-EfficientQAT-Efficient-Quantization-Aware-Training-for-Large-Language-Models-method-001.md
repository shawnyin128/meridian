---
type: "method"
title: "Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models"
status: "draft"
sources:
  - "[[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
related_papers:
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-1376cb7d73"
consolidation_target: "methods/calibration-aware-PTQ"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models

- Source paper: [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al. - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]
- Summary: To address these challenges, we introduce a novel quantization-aware training framework called EfficientQAT. Con- versely, weight-activation quantization compresses both weights and activations, thus further decreas- ing the overhead associated with matrix multipli- cations (Lin et al., 2024). 3 EfficientQAT 3.1 Method Overview In this section, we introduce EfficientQAT, a novel quantization-aware training framework for LLMs that enhances memory efficiency.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, task state, agent policy or prompt, environment feedback, calibration or runtime activations, model weights, calibration data
- Outputs: contextual token representations, sequence-model predictions, planned actions, task outcomes, interaction trace, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, the environment, tools, and evaluation protocol expose the planning behavior the paper claims to study, calibration data reflects the activation/weight behavior relevant to deployment
- Provenance: p. 3; p. 1; p. 2
