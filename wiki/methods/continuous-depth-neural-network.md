---
type: "method"
title: "continuous-depth neural network"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations.md"
source_papers:
  - "papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations.md"
related_papers:
  - "papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations.md"
related_methods:
related_topics:
  - "continuous-depth models"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-d582ef89c1"
---
# continuous-depth neural network

## What It Is

This is a compiled method-family page for `continuous-depth neural network`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations|Chen et al. - 2019 - Neural Ordinary Differential Equations]]: ### Chen et al. - 2019 - Neural Ordinary Differential Equations - Purpose: We demonstrate these properties in continuous-depth residual networks and continuous-time latent variable models. Models such as residual networks, recurrent neural...

## Used By Papers

- [[papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations]]

## Implementation Hooks

- [[papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations|Chen et al. - 2019 - Neural Ordinary Differential Equations]]: - Chen et al. - 2019 - Neural Ordinary Differential Equations: Log solver tolerance, number of function evaluations, adjoint gradients, and stability on controlled toy dynamics. - Equation-bearing sections exist; turn ea...

## Failure Modes

- [[papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations|Chen et al. - 2019 - Neural Ordinary Differential Equations]]: - Continuous-depth model behavior depends on solver tolerance, number of function evaluations, and gradient/adjoint assumptions. - Memory savings or accuracy gains should be separated from solver instability and runtime...

## Evidence

- [[papers/Chen-et-al-2019-Neural-Ordinary-Differential-Equations|Chen et al. - 2019 - Neural Ordinary Differential Equations]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/State-reuse-dynamics|State reuse dynamics]]
- [[concepts/PDE-residual|PDE residual]]
