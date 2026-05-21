---
type: "method-family"
title: "Rotation-Based Quantization Method Family Synthesis"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Rotation-Based-Quantization-Method-Family-Synthesis"
query: "I need a cross-paper method-family synthesis for rotation-based quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
source_papers:
  - "papers/2511-10645v1.md"
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et....md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Langua....md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/Zhang-et-al-20....md"
source_sections:
  - "concepts/Quantization-error-propagation#What It Is"
  - "concepts/Quantization-error-propagation#Evidence / Provenance"
  - "concepts/Quantization-error-propagation#Implementation Implications"
  - "concepts/Quantization-error-propagation#Common Failure Modes"
  - "concepts/Quantization-error-propagation#Minimal Checks / Probes"
  - "concepts/Quantization-error-propagation#Why It Matters"
  - "concepts/Quantization-error-propagation#Where It Appears"
  - "concepts/Quantization-error-propagation#Open Questions"
  - "methods/rotation-based-quantization#What It Is"
  - "methods/rotation-based-quantization#Implementation Hooks"
  - "methods/rotation-based-quantization#Mechanism"
  - "methods/rotation-based-quantization#Used By Papers"
  - "methods/rotation-based-quantization#Failure Modes"
  - "methods/rotation-based-quantization#Open Questions"
  - "concepts/Per-channel-scaling#Evidence / Provenance"
  - "concepts/Per-channel-scaling#What It Is"
  - "concepts/Per-channel-scaling#Where It Appears"
  - "concepts/Per-channel-scaling#Implementation Implications"
  - "concepts/Per-channel-scaling#Common Failure Modes"
  - "concepts/Per-channel-scaling#Retrieval Hooks"
  - "concepts/Per-channel-scaling#Related Concepts"
  - "concepts/Per-channel-scaling#Open Questions"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Retrieval Hooks"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Wiki Synthesis"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Evidence Map"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#What This Page Is For"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Source Facts"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Open Questions"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#User Ideas / Decisions"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis#Publish / Review Notes"
  - "topics/rotation-based-quantization#Scope"
  - "topics/rotation-based-quantization#Retrieval Hooks"
  - "topics/rotation-based-quantization#Method Families"
  - "topics/rotation-based-quantization#Claims"
  - "topics/rotation-based-quantization#Key Papers"
source_context: ".drafts/proposals/product-maturity-synthesis-r2/Rotation-Based-Quantization-Method-Family-Synthesis/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/method-family"
aliases:
  - "Rotation-Based Quantization Method Family Synthesis"
  - "I need a cross-paper method-family synthesis for rotation-based quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
topics:
methods:
related:
  - "concepts/Quantization-error-propagation"
  - "methods/rotation-based-quantization"
  - "concepts/Per-channel-scaling"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis"
  - "topics/rotation-based-quantization"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
related_papers:
  - "papers/2511-10645v1.md"
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et....md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Langua....md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/Zhang-et-al-20....md"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Rotation-Based-Quantization-Method-Family-Synthesis"
sources:
  - "papers/2511-10645v1.md"
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et....md"
  - "papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Langua....md"
  - "papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models.md"
  - "papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for.md"
  - "papers/Zhang-et-al-20....md"
  - "concepts/Quantization-error-propagation.md"
  - "methods/rotation-based-quantization.md"
  - "concepts/Per-channel-scaling.md"
  - "syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis.md"
  - "topics/rotation-based-quantization.md"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003.md"
  - "concepts/Activation-outliers.md"
  - "methods/hardware-aware-quantization.md"
  - "methods/KV-cache-compression.md"
  - "methods/post-training-quantization.md"
  - "methods/outlier-aware-quantization.md"
  - "methods/calibration-aware-PTQ.md"
supports:
contradicts:
supersedes:
superseded_by:
---
# Rotation-Based Quantization Method Family Synthesis

## What This Page Is For

- Proposal type: `method-family`.
- Original research query: I need a cross-paper method-family synthesis for rotation-based quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Publish target after review: `syntheses/Rotation-Based-Quantization-Method-Family-Synthesis.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[concepts/Quantization-error-propagation|Quantization error propagation]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: `Quantization error propagation` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Evidence / Provenance`: - [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey syn...
  - `Implementation Implications`: - Measure local reconstruction error and downstream metric change separately. - When a layer looks harmless locally, probe whether later layers amplify the perturbation.
  - `Common Failure Modes`: - Optimizing one layer independently masks accumulated error. - Metrics degrade only after a later nonlinear or routing operation.
  - `Minimal Checks / Probes`: - Run layer-drop or layer-only quantization sweeps.
  - `Why It Matters`: - Quantization error is not only a local reconstruction problem; upstream activation or weight error can change downstream inputs, routing, and evaluation behavior.
  - `Where It Appears`: - [[papers/1808-05779v3]] - [[papers/1909-13144v2]] - [[papers/2511-10645v1]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]] - [[papers/Ashkboos-et...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[methods/rotation-based-quantization|rotation-based quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `rotation-based quantization`.
  - `Implementation Hooks`: - 2025 - ParoQuant Pairwise Rotation Quantization for Efficient Reasoning LLM Inference: Use the page as a routing map: extract taxonomy, representative methods, evidence gaps, and primary-paper followups....
  - `Mechanism`: - [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference|Liang et al.
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]] - [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Langua...
  - `Failure Modes`: - [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference|Liang et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Per-channel-scaling|Per-channel scaling]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence / Provenance`: - [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey syn...
  - `What It Is`: `Per-channel scaling` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Where It Appears`: - [[papers/2511-10645v1]] - [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference]] - [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]]
  - `Implementation Implications`: - Treat scale granularity as part of the kernel/data-layout contract, not just a math detail. - Check whether scale tensors broadcast over the intended axis.
  - `Common Failure Modes`: - A tensor axis mismatch silently applies the wrong scale. - Fine-grained scales recover accuracy but erase the intended memory or speed benefit.
  - `Retrieval Hooks`: - Use for quantizer implementation, axis bugs, and scale-granularity ablations.
  - `Related Concepts`: - [[concepts/Activation-outliers|Activation outliers]] - [[concepts/Quantization-error-propagation|Quantization error propagation]]
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis|Hardware-Aware Quantization Method Family Synthesis]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Hardware-Aware Quantization Met...
  - `Wiki Synthesis`: - Intended use: I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Evidence Map`: - [[methods/hardware-aware-quantization|hardware-aware quantization]]: candidate evidence sections: What It Is, Implementation Hooks, Mechanism, Used By Papers, Failure Modes, Open Questions.
  - `What This Page Is For`: - Original research query: I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Source Facts`: - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Post-Traini...
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis?
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.
  - `Publish / Review Notes`: - Keep source facts, wiki synthesis, and user ideas separated during review.
- [[topics/rotation-based-quantization|rotation-based quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `rotation-based quantization`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `rotation-based quantization`.
  - `Method Families`: - [[methods/KV-cache-compression|KV-cache compression]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/outlier-aware-quantization|outlier-aware quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[method...
  - `Claims`: - [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference|Liang et al.
  - `Key Papers`: - [[papers/Wang-et-al-2025-BitNet-v2-Native-4-bit-Activations-with-Hadamard-Transformation-for-1-bit-LLMs]] - [[papers/Hu-et-al-2025-OstQuant-Refining-Large-Language-Model-Quantization-with-Orthogonal-and-Scaling-Transformations-for]] - [[papers/Zhang-et-al-20...
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: retrieved source page; extract only directly supported facts with page/section provenance.

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a cross-paper method-family synthesis for rotation-based quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.

## Evidence Map

- [[concepts/Quantization-error-propagation|Quantization error propagation]]: candidate evidence sections: What It Is, Evidence / Provenance, Implementation Implications, Common Failure Modes, Minimal Checks / Probes, Why It Matters, Where It Appears, Open Questions.
- [[methods/rotation-based-quantization|rotation-based quantization]]: candidate evidence sections: What It Is, Implementation Hooks, Mechanism, Used By Papers, Failure Modes, Open Questions.
- [[concepts/Per-channel-scaling|Per-channel scaling]]: candidate evidence sections: Evidence / Provenance, What It Is, Where It Appears, Implementation Implications, Common Failure Modes, Retrieval Hooks, Related Concepts, Open Questions.
- [[syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis|Hardware-Aware Quantization Method Family Synthesis]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, Evidence Map, What This Page Is For, Source Facts, Open Questions, User Ideas / Decisions, Publish / Review Notes.
- [[topics/rotation-based-quantization|rotation-based quantization]]: candidate evidence sections: Scope, Retrieval Hooks, Method Families, Claims, Key Papers.
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: candidate evidence sections: needs manual section selection.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a cross-paper method-family synthesis for rotation-based quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
  Use because: It is the original research intent that produced `Rotation-Based Quantization Method Family Synthesis`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[methods/rotation-based-quantization|rotation-based quantization]]
- [[concepts/Per-channel-scaling|Per-channel scaling]]
- [[syntheses/Hardware-Aware-Quantization-Method-Family-Synthesis|Hardware-Aware Quantization Method Family Synthesis]]
- [[topics/rotation-based-quantization|rotation-based quantization]]
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]
