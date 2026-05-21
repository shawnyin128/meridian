---
type: "concept"
title: "Boundary conditions"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "boundary conditions"
  - "boundary condition"
  - "initial condition"
  - "boundary loss"
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
  - "root system analysis"
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
revision_id: "concept-033c0baab5"
---
# Boundary conditions

## What It Is

`Boundary conditions` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- Boundary and initial conditions constrain which PDE solution is being learned, so weak or misweighted boundary losses can make a model satisfy the residual while solving the wrong problem.

## Where It Appears

- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next]]
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems]]
- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives]]

## Used By Methods

- [[methods/physics-informed-neural-networks|physics-informed neural networks]]
- [[methods/PDE-constrained-learning|PDE-constrained learning]]
- [[methods/scientific-ML|scientific ML]]

## Implementation Implications

- Keep boundary, initial-condition, and interior residual sampling explicit and separately logged.
- Check coordinate normalization before applying boundary values.

## Common Failure Modes

- Interior residual improves while boundary error dominates physical invalidity.
- Boundary labels are applied after a normalization transform with wrong units.

## Minimal Checks / Probes

- Evaluate boundary and interior errors on separate held-out grids.
- Run a manufactured-solution test where the true boundary values are known.

## Evidence / Provenance

- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next|Cuomo et al. - 2022 - Scientific Machine Learning Through Physics–Informed Neural Networks Where we are and What’s Next]]: cuomo et al 2022 scientific machine learning through physics informed neural networks where we are and what s next cuomo et al 2022 scientific machine learning through physics informed neural networks where we are and what s next physics informed neural networ...
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems|Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems]]: raissi et al 2019 physics informed neural networks a deep learning framework for solving forward and inverse problems raissi et al 2019 physics informed neural networks a deep learning framework for solving forward and inverse problems physics informed neural...
- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives|Zhao et al. - 2024 - Artificial intelligence for geoscience Progress, challenges, and perspectives]]: zhao et al 2024 artificial intelligence for geoscience progress challenges and perspectives zhao et al 2024 artificial intelligence for geoscience progress challenges and perspectives transformer architecture partial differential equations survey synthesis phy...

## Related Concepts

- [[concepts/PDE-residual|PDE residual]]
- [[concepts/Collocation-points|Collocation points]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for PINN/PDE debugging, boundary-loss ablations, and scientific ML sanity checks.
