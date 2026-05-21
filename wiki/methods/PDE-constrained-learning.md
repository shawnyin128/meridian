---
type: "method"
title: "PDE-constrained learning"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives.md"
  - "papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems.md"
  - "papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next.md"
source_papers:
  - "papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives.md"
  - "papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems.md"
  - "papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next.md"
related_papers:
  - "papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives.md"
  - "papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems.md"
  - "papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next.md"
related_methods:
related_topics:
  - "transformer architecture"
  - "partial differential equations"
  - "survey synthesis"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-f181d26033"
---
# PDE-constrained learning

## What It Is

This is a compiled method-family page for `PDE-constrained learning`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives|Zhao et al. - 2024 - Artificial intelligence for geoscience Progress, challenges, and perspectives]]: ### Zhao et al. - 2024 - Artificial intelligence for geoscience Progress, challenges, and perspectives - Purpose: Constrain a neural approximator with PDE residual and boundary/initial-condition losses. - Operates on: boundary/initial condi...
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems|Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems]]: ### Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems - Purpose: Constrain a neural approximator with PDE residual and boundary/initial-condition losses. - Operates on...
- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next|Cuomo et al. - 2022 - Scientific Machine Learning Through Physics–Informed Neural Networks Where we are and What’s Next]]: ### Cuomo et al. - 2022 - Scientific Machine Learning Through Physics–Informed Neural Networks Where we are and What’s Next - Purpose: Constrain a neural approximator with PDE residual and boundary/initial-condition losses. - Operates on: b...

## Used By Papers

- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives]]
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems]]
- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next]]

## Implementation Hooks

- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives|Zhao et al. - 2024 - Artificial intelligence for geoscience Progress, challenges, and perspectives]]: - Zhao et al. - 2024 - Artificial intelligence for geoscience Progress, challenges, and perspectives: Unit test PDE residual computation, boundary/initial-condition losses, collocation sampling, and gradient/autodiff sha...
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems|Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems]]: - Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems: Unit test PDE residual computation, boundary/initial-condition losses, collocation sampling, a...
- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next|Cuomo et al. - 2022 - Scientific Machine Learning Through Physics–Informed Neural Networks Where we are and What’s Next]]: - Cuomo et al. - 2022 - Scientific Machine Learning Through Physics–Informed Neural Networks Where we are and What’s Next: Unit test PDE residual computation, boundary/initial-condition losses, collocation sampling, and...

## Failure Modes

- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives|Zhao et al. - 2024 - Artificial intelligence for geoscience Progress, challenges, and perspectives]]: - PINN quality depends on how data loss and physics residual loss are balanced; aggregate accuracy can hide residual or boundary-condition failure. - Forward and inverse PDE settings should be evaluated separately becaus...
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems|Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems]]: - PINN quality depends on how data loss and physics residual loss are balanced; aggregate accuracy can hide residual or boundary-condition failure. - Forward and inverse PDE settings should be evaluated separately becaus...
- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next|Cuomo et al. - 2022 - Scientific Machine Learning Through Physics–Informed Neural Networks Where we are and What’s Next]]: - PINN quality depends on how data loss and physics residual loss are balanced; aggregate accuracy can hide residual or boundary-condition failure. - Forward and inverse PDE settings should be evaluated separately becaus...

## Evidence

- [[papers/Zhao-et-al-2024-Artificial-intelligence-for-geoscience-Progress-challenges-and-perspectives|Zhao et al. - 2024 - Artificial intelligence for geoscience Progress, challenges, and perspectives]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Raissi-et-al-2019-Physics-informed-neural-networks-A-deep-learning-framework-for-solving-forward-and-inverse-problems|Raissi et al. - 2019 - Physics-informed neural networks A deep learning framework for solving forward and inverse problems]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Cuomo-et-al-2022-Scientific-Machine-Learning-Through-Physics-Informed-Neural-Networks-Where-we-are-and-What-s-Next|Cuomo et al. - 2022 - Scientific Machine Learning Through Physics–Informed Neural Networks Where we are and What’s Next]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Boundary-conditions|Boundary conditions]]
- [[concepts/Collocation-points|Collocation points]]
