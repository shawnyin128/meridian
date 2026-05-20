---
type: "method"
title: "Quantization Space Utilization Rate"
status: "draft"
sources:
  - "[[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-002"
---
# Quantization Space Utilization Rate

- Source paper: [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for|Hu et al. - 2025 - OstQuant Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for]]
- Summary: Measures how well transformed values occupy the available quantization levels, giving OSTQuant an explicit optimization signal instead of relying only on outlier magnitude.
- Inputs: transformed tensor values, quantization levels, value distribution
- Outputs: quantization-space utilization diagnostic, optimization signal for transform search
- Assumptions: higher space utilization corresponds to lower quantization error, the metric is computed on calibration tensors representative of deployment inputs
- Provenance: p. 1; p. 2; p. 3; p. 4
