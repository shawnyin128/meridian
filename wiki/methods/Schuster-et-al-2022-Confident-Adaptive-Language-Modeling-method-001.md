---
type: "method"
title: "Schuster et al. - 2022 - Confident Adaptive Language Modeling"
status: "draft"
sources:
  - "[[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling|Schuster et al. - 2022 - Confident Adaptive Language Modeling]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
related_papers:
  - "papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-08aba3a56d"
---
# Schuster et al. - 2022 - Confident Adaptive Language Modeling

- Source paper: [[papers/Schuster-et-al-2022-Confident-Adaptive-Language-Modeling|Schuster et al. - 2022 - Confident Adaptive Language Modeling]]
- Summary: In this work, we introduce Conﬁdent Adaptive Language Modeling (CALM), a framework for dynamically allocating different amounts of compute per input and generation timestep. At a high level, both encoder and decoder networks contain L stacked layers, where each layer is composed of a multi-head self-attention sub-layer, followed by a feedforward sub-layer, each with residual connections and layer normalization. Autoregressive language modeling provides a ﬂexible framework for solving complex tasks with a uniﬁed natural language input and output format, while also relaxing the need for large-scale task-speciﬁc data collection and training [67; 15; 17; 58; 80].
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, KV-cache tensors, calibration data
- Outputs: contextual token representations, sequence-model predictions, low-bit quantized model representation
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, calibration data reflects the activation/weight behavior relevant to deployment
- Provenance: p. 5; p. 3; p. 4
