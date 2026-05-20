---
type: "method"
title: "Ma et al. - 2024 - The Era of 1-bit LLMs All Large Language Models are in 1.58 Bits"
status: "draft"
sources:
  - "[[papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits|Ma et al. - 2024 - The Era of 1-bit LLMs All Large Language Models are in 1.58 Bits]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Ma et al. - 2024 - The Era of 1-bit LLMs All Large Language Models are in 1.58 Bits

- Source paper: [[papers/Ma-et-al-2024-The-Era-of-1-bit-LLMs-All-Large-Language-Models-are-in-1-58-Bits|Ma et al. - 2024 - The Era of 1-bit LLMs All Large Language Models are in 1.58 Bits]]
- Summary: This technique reduces the precision of weights and activations, significantly reducing the memory and computational requirements of LLMs. It is trained from scratch, with 1.58-bit weights and 8-bit activations. To constrain the weights to -1, 0, or +1, we adopt an absmean quantization function.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, task state, agent policy or prompt, environment feedback, calibration or runtime activations, model weights
- Outputs: contextual token representations, sequence-model predictions, planned actions, task outcomes, interaction trace, low-bit quantized model representation, rotation-transformed equivalent model, latency or memory-efficiency measurements
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, the environment, tools, and evaluation protocol expose the planning behavior the paper claims to study
- Provenance: p. 2; p. 1; p. 7
