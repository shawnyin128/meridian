---
type: "method"
title: "Yin et al. - 2024 - A Survey on Multimodal Large Language Models"
status: "draft"
sources:
  - "[[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Yin et al. - 2024 - A Survey on Multimodal Large Language Models

- Source paper: [[papers/Yin-et-al-2024-A-Survey-on-Multimodal-Large-Language-Models|Yin et al. - 2024 - A Survey on Multimodal Large Language Models]]
- Summary: IEEE TRANSACTIONS ON PATTERN ANALYSIS AND MACHINE INTELLIGENCE 10 proposes a framework that supports inputs and outputs of mixed modalities, specifically, combinations of text, image, audio, and video, with the help of diffusion models [152], [153] attached to the MLLM. First of all, we present the basic formulation of MLLM and delineate its related concepts, including architecture, training strategy and data, as well as evaluation. Then, we introduce research topics about how MLLMs can be extended to support more granularity, modalities, languages, and scenarios.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, task state, agent policy or prompt, environment feedback, audio features, text prompts or labels, audio-language training data, noisy sample, diffusion timestep, conditioning signal
- Outputs: attention logits or values augmented with relative position information, planned actions, task outcomes, interaction trace, audio-language representations, speech/audio understanding predictions, denoised or generated sample conditioned on the input signal, low-bit quantized model representation
- Assumptions: relative distance information improves sequence modeling without breaking attention computation, the environment, tools, and evaluation protocol expose the planning behavior the paper claims to study, the page is useful as a synthesis map; individual claims still require checking cited primary evidence, the conditioning signal and noise schedule match the intended generation distribution
- Provenance: p. 10; p. 12; p. 1
