---
type: "method"
title: "Garg et al. - 2023 - What Can Transformers Learn In-Context A Case Study of Simple Function Classes"
status: "draft"
sources:
  - "[[papers/Garg-et-al-2023-What-Can-Transformers-Learn-In-Context-A-Case-Study-of-Simple-Function-Classes|Garg et al. - 2023 - What Can Transformers Learn In-Context A Case Study of Simple Function Classes]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Garg et al. - 2023 - What Can Transformers Learn In-Context A Case Study of Simple Function Classes

- Source paper: [[papers/Garg-et-al-2023-What-Can-Transformers-Learn-In-Context-A-Case-Study-of-Simple-Function-Classes|Garg et al. - 2023 - What Can Transformers Learn In-Context A Case Study of Simple Function Classes]]
- Summary: Within this framework, we can now concretely ask: Can we train a model to in-context learn a certain function class? Our model consists of 12 layers, 8 attention heads, and a 256-dimensional embedding space (9.5M parameters). Here, we focus on a simple function class—namely linear functions—and study how well models trained using our methodology can in-context learn this class.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights
- Outputs: contextual token representations, sequence-model predictions
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task
- Provenance: p. 2; p. 3; p. 4
