---
type: "concept"
title: "Reward model overoptimization"
status: "active"
created: "2026-05-21"
updated: "2026-05-21"
aliases:
  - "reward modeling"
  - "reward overoptimization"
  - "reward hacking"
  - "LLM-as-judge reward"
sources:
  - "papers/2603-19835v3.md"
  - "papers/Azar-et-al-2023-A-General-Theoretical-Paradigm-to-Understand-Learning-from-Human-Preferences.md"
  - "papers/Blattmann-et-al-2023-Stable-Video-Diffusion-Scaling-Latent-Video-Diffusion-Models-to-Large-Datasets.md"
  - "papers/Brown-et-al-2020-Language-Models-are-Few-Shot-Learners.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/Christiano-et-al-2023-Deep-reinforcement-learning-from-human-preferences.md"
  - "papers/Chu-et-al-2024-Qwen2-Audio-Technical-Report.md"
  - "papers/D-Oosterlinck-et-al-2024-Anchored-Preference-Optimization-and-Contrastive-Revisions-Addressing-Underspecification-in-Alignme.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-R1-Incentivizing-Reasoning-Capability-in-LLMs-via-Reinforcement-Learning.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
  - "papers/Ding-and-Zhang-2025-Sherlock-Self-Correcting-Reasoning-in-Vision-Language-Models.md"
  - "papers/Dong-et-al-2024-Self-Boosting-Large-Language-Models-with-Synthetic-Preference-Data.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Huang-et-al-2026-On-the-Direction-of-RLVR-Updates-for-LLM-Reasoning-Identification-and-Exploitation.md"
  - "papers/Kraabel-et-al-2025-StefaLand-An-Efficient-Geoscience-Foundation-Model-That-Improves-Dynamic-Land-Surface-Predictions.md"
source_papers:
  - "papers/2603-19835v3.md"
  - "papers/Azar-et-al-2023-A-General-Theoretical-Paradigm-to-Understand-Learning-from-Human-Preferences.md"
  - "papers/Blattmann-et-al-2023-Stable-Video-Diffusion-Scaling-Latent-Video-Diffusion-Models-to-Large-Datasets.md"
  - "papers/Brown-et-al-2020-Language-Models-are-Few-Shot-Learners.md"
  - "papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads.md"
  - "papers/Christiano-et-al-2023-Deep-reinforcement-learning-from-human-preferences.md"
  - "papers/Chu-et-al-2024-Qwen2-Audio-Technical-Report.md"
  - "papers/D-Oosterlinck-et-al-2024-Anchored-Preference-Optimization-and-Contrastive-Revisions-Addressing-Underspecification-in-Alignme.md"
  - "papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-R1-Incentivizing-Reasoning-Capability-in-LLMs-via-Reinforcement-Learning.md"
  - "papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report.md"
  - "papers/DeepSeek-V4.md"
  - "papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs.md"
  - "papers/Ding-and-Zhang-2025-Sherlock-Self-Correcting-Reasoning-in-Vision-Language-Models.md"
  - "papers/Dong-et-al-2024-Self-Boosting-Large-Language-Models-with-Synthetic-Preference-Data.md"
  - "papers/ERNIE-Technical-Report.md"
  - "papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering.md"
  - "papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo.md"
  - "papers/Huang-et-al-2026-On-the-Direction-of-RLVR-Updates-for-LLM-Reasoning-Identification-and-Exploitation.md"
  - "papers/Kraabel-et-al-2025-StefaLand-An-Efficient-Geoscience-Foundation-Model-That-Improves-Dynamic-Land-Surface-Predictions.md"
related_methods:
  - "reward modeling"
  - "LLM-as-judge reward modeling"
  - "preference-based reinforcement learning"
related_topics:
  - "reward modeling"
  - "human preference feedback"
  - "policy optimization"
related_claims:
related_evidence:
prerequisite_for:
  - "reward modeling"
  - "LLM-as-judge reward modeling"
  - "preference-based reinforcement learning"
supports:
contradicts:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "concept-c23d734a87"
---
# Reward model overoptimization

## What It Is

`Reward model overoptimization` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.

## Why It Matters

- A model can optimize the learned or judged reward faster than it improves the intended behavior, making evaluation and stopping criteria central to preference-based methods.

## Where It Appears

- [[papers/2603-19835v3]]
- [[papers/Azar-et-al-2023-A-General-Theoretical-Paradigm-to-Understand-Learning-from-Human-Preferences]]
- [[papers/Blattmann-et-al-2023-Stable-Video-Diffusion-Scaling-Latent-Video-Diffusion-Models-to-Large-Datasets]]
- [[papers/Brown-et-al-2020-Language-Models-are-Few-Shot-Learners]]
- [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads]]
- [[papers/Christiano-et-al-2023-Deep-reinforcement-learning-from-human-preferences]]
- [[papers/Chu-et-al-2024-Qwen2-Audio-Technical-Report]]
- [[papers/D-Oosterlinck-et-al-2024-Anchored-Preference-Optimization-and-Contrastive-Revisions-Addressing-Underspecification-in-Alignme]]
- [[papers/DeepSeek-AI-2024-DeepSeek-V2-A-Strong-Economical-and-Efficient-Mixture-of-Experts-Language-Model]]
- [[papers/DeepSeek-AI-2025-DeepSeek-R1-Incentivizing-Reasoning-Capability-in-LLMs-via-Reinforcement-Learning]]
- [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report]]
- [[papers/DeepSeek-V4]]
- [[papers/Dettmers-et-al-2023-QLoRA-Efficient-Finetuning-of-Quantized-LLMs]]
- [[papers/Ding-and-Zhang-2025-Sherlock-Self-Correcting-Reasoning-in-Vision-Language-Models]]
- [[papers/Dong-et-al-2024-Self-Boosting-Large-Language-Models-with-Synthetic-Preference-Data]]
- [[papers/ERNIE-Technical-Report]]
- [[papers/GLM-5-Team-2026-GLM-5-from-Vibe-Coding-to-Agentic-Engineering]]
- [[papers/Hu-et-al-2025-DREAM-Drafting-with-Refined-Target-Features-and-Entropy-Adaptive-Cross-Attention-Fusion-for-Multimo]]
- [[papers/Huang-et-al-2026-On-the-Direction-of-RLVR-Updates-for-LLM-Reasoning-Identification-and-Exploitation]]
- [[papers/Kraabel-et-al-2025-StefaLand-An-Efficient-Geoscience-Foundation-Model-That-Improves-Dynamic-Land-Surface-Predictions]]

## Used By Methods

- [[methods/reward-modeling|reward modeling]]
- [[methods/LLM-as-judge-reward-modeling|LLM-as-judge reward modeling]]
- [[methods/preference-based-reinforcement-learning|preference-based reinforcement learning]]

## Implementation Implications

- Log reward, external evaluation, KL, and qualitative failure examples together.
- Keep judge/reward model identity and prompt template versioned.

## Common Failure Modes

- Reward keeps rising while human or benchmark quality saturates or regresses.
- A judge prompt or reward model leaks style preferences into the measured method gain.

## Minimal Checks / Probes

- Plot reward versus independent eval across training time.
- Run a small adversarial sample review for high-reward outputs.

## Evidence / Provenance

- [[papers/2603-19835v3|2603.19835v3]]: 2603 19835v3 2603 19835v3 policy optimization chain of thought reasoning paper specific research method preference learning setting reinforcement learning setting 2603 19835v3 4 fipo in this section we introduce the core framework of futurekl induced policy op...
- [[papers/Azar-et-al-2023-A-General-Theoretical-Paradigm-to-Understand-Learning-from-Human-Preferences|Azar et al. - 2023 - A General Theoretical Paradigm to Understand Learning from Human Preferences]]: azar et al 2023 a general theoretical paradigm to understand learning from human preferences azar et al 2023 a general theoretical paradigm to understand learning from human preferences human preference feedback reward modeling rlhf preference optimization pol...
- [[papers/Blattmann-et-al-2023-Stable-Video-Diffusion-Scaling-Latent-Video-Diffusion-Models-to-Large-Datasets|Blattmann et al. - 2023 - Stable Video Diffusion Scaling Latent Video Diffusion Models to Large Datasets]]: blattmann et al 2023 stable video diffusion scaling latent video diffusion models to large datasets blattmann et al 2023 stable video diffusion scaling latent video diffusion models to large datasets conditional diffusion human preference feedback reward model...
- [[papers/Brown-et-al-2020-Language-Models-are-Few-Shot-Learners|Brown et al. - 2020 - Language Models are Few-Shot Learners]]: brown et al 2020 language models are few shot learners few shot brown et al 2020 language models are few shot learners benchmark evaluation transformer architecture transformer architecture 3d geometry setting transformer sequence modeling setting brown et al...
- [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads|Cai et al. - 2024 - Medusa Simple LLM Inference Acceleration Framework with Multiple Decoding Heads]]: cai et al 2024 medusa simple llm inference acceleration framework with multiple decoding heads cai et al 2024 medusa simple llm inference acceleration framework with multiple decoding heads speculative decoding dynamic draft tree human preference feedback rewa...
- [[papers/Christiano-et-al-2023-Deep-reinforcement-learning-from-human-preferences|Christiano et al. - 2023 - Deep reinforcement learning from human preferences]]: christiano et al 2023 deep reinforcement learning from human preferences christiano et al 2023 deep reinforcement learning from human preferences human preference feedback reward modeling policy optimization preference based reinforcement learning reward model...
- [[papers/Chu-et-al-2024-Qwen2-Audio-Technical-Report|Chu et al. - 2024 - Qwen2-Audio Technical Report]]: chu et al 2024 qwen2 audio technical report qwen2 audio chu et al 2024 qwen2 audio technical report audio language modeling audio encoder alignment survey synthesis parameter efficient adaptation audio language modeling multimodal instruction tuning audio lang...
- [[papers/D-Oosterlinck-et-al-2024-Anchored-Preference-Optimization-and-Contrastive-Revisions-Addressing-Underspecification-in-Alignme|D'Oosterlinck et al. - 2024 - Anchored Preference Optimization and Contrastive Revisions Addressing Underspecification in Alignme]]: d oosterlinck et al 2024 anchored preference optimization and contrastive revisions addressing underspecification in alignme d d oosterlinck et al 2024 anchored preference optimization and contrastive revisions addressing underspecification in alignme human pr...

## Related Concepts

- [[concepts/KL-regularization|KL regularization]]
- [[concepts/Preference-data-underspecification|Preference data underspecification]]

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this concept?
- Which methods fail when this concept is ignored?

## Retrieval Hooks

- Use for reward-model diagnostics, RLHF/TTRL stopping decisions, and judge-based evaluation sanity checks.
