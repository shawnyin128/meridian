---
type: "method"
title: "policy optimization"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms.md"
  - "papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation.md"
source_papers:
  - "papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms.md"
  - "papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation.md"
related_papers:
  - "papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms.md"
  - "papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation.md"
related_methods:
related_topics:
  - "calibration data selection"
  - "policy optimization"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-9bcb7ed023"
---
# policy optimization

## What It Is

This is a compiled method-family page for `policy optimization`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms|Schulman et al. - 2017 - Proximal Policy Optimization Algorithms]]: ### Schulman et al. - 2017 - Proximal Policy Optimization Algorithms - Purpose: Whereas standard policy gra- dient methods perform one gradient update per data sample, we propose a novel objective function that enables multiple epochs of mi...
- [[papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation|Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation]]: ### Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation - Purpose: We present experimental results on a number of highly challenging 3D locomotion tasks, where we show that our approach can le...

## Used By Papers

- [[papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms]]
- [[papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation]]

## Implementation Hooks

- [[papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms|Schulman et al. - 2017 - Proximal Policy Optimization Algorithms]]: - Schulman et al. - 2017 - Proximal Policy Optimization Algorithms: Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance. - Equation-bearing sections exist; turn...
- [[papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation|Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation]]: - Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation: Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance. - Eq...

## Failure Modes

- [[papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms|Schulman et al. - 2017 - Proximal Policy Optimization Algorithms]]: - Policy-optimization behavior is sensitive to reward normalization, clipping/KL settings, rollout length, and seed variance. - Reported gains should be separated from environment-specific exploration and baseline tuning...
- [[papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation|Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation]]: - Some hardware evidence depends on simulation or specific CPU/kernel settings. Open questions: - Do key figures, tables, or equations change the interpretation of the text extraction?

## Evidence

- [[papers/Schulman-et-al-2017-Proximal-Policy-Optimization-Algorithms|Schulman et al. - 2017 - Proximal Policy Optimization Algorithms]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: We...
- [[papers/Schulman-et-al-2018-High-Dimensional-Continuous-Control-Using-Generalized-Advantage-Estimation|Schulman et al. - 2018 - High-Dimensional Continuous Control Using Generalized Advantage Estimation]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: We...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
