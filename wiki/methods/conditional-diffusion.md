---
type: "method"
title: "conditional diffusion"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction.md"
  - "papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance.md"
  - "papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion.md"
  - "papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem.md"
  - "papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models.md"
  - "papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis.md"
source_papers:
  - "papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction.md"
  - "papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance.md"
  - "papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion.md"
  - "papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem.md"
  - "papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models.md"
  - "papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis.md"
related_papers:
  - "papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction.md"
  - "papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance.md"
  - "papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion.md"
  - "papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem.md"
  - "papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models.md"
  - "papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis.md"
related_methods:
related_topics:
  - "conditional diffusion"
  - "transformer architecture"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-e51f480c65"
---
# conditional diffusion

## What It Is

This is a compiled method-family page for `conditional diffusion`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction|Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction]]: ### Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction - Purpose: We train an auto-regressive conditional diffusion transformer on Nymeria, a large-scale dataset of real-world egocentric video and body pose capture. Our...
- [[papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance|Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance]]: ### Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance - Purpose: 1 INTRODUCTION Diffusion models have recently emerged as an expressive and ﬂexible family of generative models, delivering competitive sample quality and likelihood...
- [[papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion|Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion]]: ### Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion - Purpose: It deterministically downscales a low- resolution precipitation sequence using spatio-temporal factorized attention and models residuals with c...
- [[papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem|Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem]]: ### Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem - Purpose: 2.2 DIFFUSION PROBABILISTIC MODELS Our approach to the motif-scaffolding problem builds on denoising diffusi...
- [[papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models|Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models]]: ### Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models - Purpose: In this study, we propose DiffSBDD, an SE(3)-equivariant 3D-conditional diffusion model for SBDD that respects translation, rotation, and...
- [[papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis|Dorjsembe et al. - 2024 - Conditional Diffusion Models for Semantic 3D Brain MRI Synthesis]]: ### Segmentation-conditioned 3D DDPM - Purpose: Conditions a 3D denoising diffusion model on semantic brain segmentation masks so synthetic MRI volumes follow specified anatomy rather than only matching a marginal image distribution. - Oper...

## Used By Papers

- [[papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction]]
- [[papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance]]
- [[papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion]]
- [[papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem]]
- [[papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models]]
- [[papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis]]

## Implementation Hooks

- [[papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction|Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction]]: - Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction: Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance. - Long context: Sweep sequence le...
- [[papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance|Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance]]: - Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance: Unit test timestep/noise schedule, conditioning-channel shapes, and sample evaluation metrics. - Diffusion: Test noise schedule, timestep embedding, and cond...
- [[papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion|Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion]]: - Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion: Unit test timestep/noise schedule, conditioning-channel shapes, and sample evaluation metrics. - Vision-language: Evaluate text-only, i...
- [[papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem|Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem]]: - Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem: Unit test timestep/noise schedule, conditioning-channel shapes, and sample evaluation metrics. - 3D...
- [[papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models|Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models]]: - Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models: Unit test timestep/noise schedule, conditioning-channel shapes, and sample evaluation metrics. - 3D geometry: Test controlled syn...
- [[papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis|Dorjsembe et al. - 2024 - Conditional Diffusion Models for Semantic 3D Brain MRI Synthesis]]: - Segmentation-conditioned 3D DDPM: Unit test channel concatenation and spatial alignment between noisy volume and segmentation mask. - Segmentation-conditioned 3D DDPM: Evaluate generated images with both visual/statist...

## Failure Modes

- [[papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction|Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance|Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance]]: - Diffusion sample quality depends on the training distribution, conditioning signal quality, and evaluation metric. - Generated examples should be separated from downstream task evidence. Open questions: - Do key figure...
- [[papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion|Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute. - Quality improvements should be checked against ablations that isolate architecture from data sc...
- [[papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem|Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem]]: - Diffusion sample quality depends on the training distribution, conditioning signal quality, and evaluation metric. - Generated examples should be separated from downstream task evidence. Open questions: - Do key figure...
- [[papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models|Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models]]: - Diffusion sample quality depends on the training distribution, conditioning signal quality, and evaluation metric. - Generated examples should be separated from downstream task evidence. Open questions: - Do key figure...
- [[papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis|Dorjsembe et al. - 2024 - Conditional Diffusion Models for Semantic 3D Brain MRI Synthesis]]: - Semantic 3D MRI synthesis depends on mask quality and dataset distribution; downstream utility does not automatically prove clinical realism. - Privacy/anonymization claims require separate evidence beyond good-looking...

## Evidence

- [[papers/Bai-et-al-2025-Whole-Body-Conditioned-Egocentric-Video-Prediction|Bai et al. - 2025 - Whole-Body Conditioned Egocentric Video Prediction]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: To...
- [[papers/Ho-and-Salimans-2022-Classifier-Free-Diffusion-Guidance|Ho and Salimans - 2022 - Classifier-Free Diffusion Guidance]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `claim-001`: The...
- [[papers/Srivastava-et-al-Precipitation-Downscaling-with-Spatiotemporal-Video-Diffusion|Srivastava et al. - Precipitation Downscaling with Spatiotemporal Video Diffusion]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Trippe-et-al-2023-Diffusion-probabilistic-modeling-of-protein-backbones-in-3D-for-the-motif-scaffolding-problem|Trippe et al. - 2023 - Diffusion probabilistic modeling of protein backbones in 3D for the motif-scaffolding problem]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Schneuing-et-al-2024-Structure-based-Drug-Design-with-Equivariant-Diffusion-Models|Schneuing et al. - 2024 - Structure-based Drug Design with Equivariant Diffusion Models]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Dorjsembe-et-al-2024-Conditional-Diffusion-Models-for-Semantic-3D-Brain-MRI-Synthesis|Dorjsembe et al. - 2024 - Conditional Diffusion Models for Semantic 3D Brain MRI Synthesis]]: Evidence takeaways: - Med-DDPM evidence should connect generated MRI realism to semantic-control and downstream segmentation metrics; visual examples alone are not sufficient. Claim candidates: - `claim-001`: In terms of...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
