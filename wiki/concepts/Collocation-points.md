---
type: "concept"
title: "Collocation points"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "collocation points"
  - "collocation sampling"
  - "interior points"
  - "residual sampling"
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
  - "PDE-constrained learning"
  - "scientific ML"
related_topics:
  - "scientific ML"
  - "PINN"
related_claims:
related_evidence:
prerequisite_for:
  - "physics-informed neural networks"
  - "PDE-constrained learning"
  - "scientific ML"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-cab29e02fa"
---
# Collocation points

## What It Is

`Collocation points` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Collocation sampling determines where residual constraints are enforced, so sampling density and distribution can change whether a PDE model learns the right regime.

## Where It Appears

- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next]]
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems]]
- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives]]

## Used By Methods

- [[methods/physics-informed-neural-networks|physics-informed neural networks]]
- [[methods/PDE-constrained-learning|PDE-constrained learning]]
- [[methods/scientific-ML|scientific ML]]

## Implementation Implications

- Version the collocation sampler, domain bounds, and adaptive sampling policy.
- Separate collocation count from optimizer steps when comparing methods.

## Common Failure Modes

- Residual is low on sampled points but high in unsampled regions.
- Adaptive sampling changes the task difficulty across ablations.

## Minimal Checks / Probes

- Evaluate residual on a dense held-out grid.
- Compare uniform, boundary-heavy, and residual-adaptive sampling at fixed compute.

## Evidence / Provenance

- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next|Cuomo et al. - 2022 - Scientific Machine Learning Through Physics–Informed Neural Networks Where we are and What’s Next]]: cuomo et al 2022 scientific machine learning through physics informed neural networks where we are and what s next cuomo et al 2022 scientific machine learning through physics informed neural networks where we are and what s next physics informed neural networ...
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems|Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems]]: raissi et al 2019 physics informed neural networks a deep learning framework for solving forward and inverse problems raissi et al 2019 physics informed neural networks a deep learning framework for solving forward and inverse problems physics informed neural...
- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives|Zhao et al. - 2024 - Artificial intelligence for geoscience Progress, challenges, and perspectives]]: zhao et al 2024 artificial intelligence for geoscience progress challenges and perspectives zhao et al 2024 artificial intelligence for geoscience progress challenges and perspectives transformer architecture partial differential equations survey synthesis phy...

## Related Concepts

- [[concepts/PDE-residual|PDE residual]]
- [[concepts/Boundary-conditions|Boundary conditions]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for PDE residual debugging, PINN ablations, and scientific ML data-generation checks.
