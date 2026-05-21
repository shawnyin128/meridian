---
type: "concept"
title: "PDE residual"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "physics residual"
  - "differential equation residual"
  - "residual loss"
sources:
  - "papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next.md"
  - "papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems.md"
  - "papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives.md"
source_papers:
  - "papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next.md"
  - "papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems.md"
  - "papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives.md"
related_methods:
  - "physics-informed neural networks"
  - "scientific ML"
  - "inverse PDE"
related_topics:
  - "scientific ML"
  - "PINN"
related_claims:
related_evidence:
prerequisite_for:
  - "physics-informed neural networks"
  - "scientific ML"
  - "inverse PDE"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-eb8e164e5f"
---
# PDE residual

## What It Is

`PDE residual` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- PINN-style methods use the differential equation residual as a training or diagnostic signal, so incorrect residual construction can dominate results.

## Where It Appears

- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next]]
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems]]
- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives]]

## Used By Methods

- [[methods/physics-informed-neural-networks|physics-informed neural networks]]
- [[methods/scientific-ML|scientific ML]]
- [[methods/inverse-PDE|inverse PDE]]

## Implementation Implications

- Verify units, derivative order, autodiff graph retention, and boundary/interior sampling separately.
- Do not mix residual terms with incompatible normalization without explicit weights.

## Common Failure Modes

- Boundary loss hides poor interior residuals.
- Autodiff computes a derivative of the wrong normalized variable.

## Minimal Checks / Probes

- Evaluate residual on analytic or manufactured-solution cases.
- Track boundary, initial-condition, and interior residual terms separately.

## Evidence / Provenance

- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next|Cuomo et al. - 2022 - Scientific Machine Learning Through Physics–Informed Neural Networks Where we are and What’s Next]]: cuomo et al 2022 scientific machine learning through physics informed neural networks where we are and what s next cuomo et al 2022 scientific machine learning through physics informed neural networks where we are and what s next physics informed neural networ...
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems|Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems]]: raissi et al 2019 physics informed neural networks a deep learning framework for solving forward and inverse problems raissi et al 2019 physics informed neural networks a deep learning framework for solving forward and inverse problems physics informed neural...
- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives|Zhao et al. - 2024 - Artificial intelligence for geoscience Progress, challenges, and perspectives]]: zhao et al 2024 artificial intelligence for geoscience progress challenges and perspectives zhao et al 2024 artificial intelligence for geoscience progress challenges and perspectives transformer architecture partial differential equations survey synthesis phy...

## Related Concepts

- [[concepts/Boundary-conditions|Boundary conditions]]
- [[concepts/Collocation-points|Collocation points]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for scientific ML/PINN implementation, PDE loss debugging, and boundary-condition ablations.
