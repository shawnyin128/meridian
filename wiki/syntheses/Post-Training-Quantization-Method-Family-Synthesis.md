---
type: "method-family"
title: "Post-Training Quantization Method Family Synthesis"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Post-Training-Quantization-Method-Family-Synthesis"
query: "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
source_papers:
  - "papers/2511-10645v1.md"
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et....md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP....md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers....md"
source_sections:
  - "concepts/Quantization-error-propagation#What It Is"
  - "concepts/Quantization-error-propagation#Evidence / Provenance"
  - "concepts/Quantization-error-propagation#Where It Appears"
  - "concepts/Quantization-error-propagation#Implementation Implications"
  - "concepts/Quantization-error-propagation#Common Failure Modes"
  - "concepts/Quantization-error-propagation#Minimal Checks / Probes"
  - "concepts/Quantization-error-propagation#Why It Matters"
  - "concepts/Quantization-error-propagation#Open Questions"
  - "methods/vision-language-model-quantization#Mechanism"
  - "methods/vision-language-model-quantization#Implementation Hooks"
  - "methods/vision-language-model-quantization#Used By Papers"
  - "methods/vision-language-model-quantization#What It Is"
  - "methods/vision-language-model-quantization#Failure Modes"
  - "methods/vision-language-model-quantization#Open Questions"
  - "concepts/Lookup-table-inference#Evidence / Provenance"
  - "concepts/Lookup-table-inference#What It Is"
  - "concepts/Lookup-table-inference#Common Failure Modes"
  - "concepts/Lookup-table-inference#Retrieval Hooks"
  - "concepts/Lookup-table-inference#Implementation Implications"
  - "concepts/Lookup-table-inference#Where It Appears"
  - "concepts/Lookup-table-inference#Minimal Checks / Probes"
  - "concepts/Lookup-table-inference#Related Concepts"
  - "concepts/Lookup-table-inference#Why It Matters"
  - "concepts/Lookup-table-inference#Open Questions"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Retrieval Hooks"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Wiki Synthesis"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Evidence Map"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#What This Page Is For"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Source Facts"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Open Questions"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#User Ideas / Decisions"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis#Publish / Review Notes"
  - "topics/post-training-quantization#Scope"
  - "topics/post-training-quantization#Retrieval Hooks"
  - "topics/post-training-quantization#Claims"
  - "topics/post-training-quantization#Method Families"
  - "topics/post-training-quantization#Key Papers"
source_context: ".drafts/proposals/high-leverage-synthesis-r1/Post-Training-Quantization-Method-Family-Synthesis/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/method-family"
aliases:
  - "Post-Training Quantization Method Family Synthesis"
  - "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
topics:
methods:
related:
  - "concepts/Quantization-error-propagation"
  - "methods/vision-language-model-quantization"
  - "concepts/Lookup-table-inference"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis"
  - "topics/post-training-quantization"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
related_papers:
  - "papers/2511-10645v1.md"
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et....md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP....md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers....md"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Post-Training-Quantization-Method-Family-Synthesis"
sources:
  - "papers/2511-10645v1.md"
  - "papers/1808-05779v3.md"
  - "papers/1909-13144v2.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization.md"
  - "papers/Ashkboos-et....md"
  - "papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP....md"
  - "papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers....md"
  - "concepts/Quantization-error-propagation.md"
  - "methods/vision-language-model-quantization.md"
  - "concepts/Lookup-table-inference.md"
  - "syntheses/Post-Training-Quantization-Method-Family-Synthesis.md"
  - "topics/post-training-quantization.md"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003.md"
  - "concepts/Per-channel-scaling.md"
  - "methods/post-training-quantization.md"
  - "methods/transformer-architecture.md"
  - "methods/calibration-aware-PTQ.md"
  - "methods/hardware-aware-quantization.md"
supports:
contradicts:
supersedes:
superseded_by:
---
# Post-Training Quantization Method Family Synthesis

## What This Page Is For

- Proposal type: `method-family`.
- Original research query: I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Publish target after review: `syntheses/Post-Training-Quantization-Method-Family-Synthesis.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[concepts/Quantization-error-propagation|Quantization error propagation]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: `Quantization error propagation` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Evidence / Provenance`: - [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey syn...
  - `Where It Appears`: - [[papers/1808-05779v3]] - [[papers/1909-13144v2]] - [[papers/2511-10645v1]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]] - [[papers/Ashkboos-et...
  - `Implementation Implications`: - Measure local reconstruction error and downstream metric change separately. - When a layer looks harmless locally, probe whether later layers amplify the perturbation.
  - `Common Failure Modes`: - Optimizing one layer independently masks accumulated error. - Metrics degrade only after a later nonlinear or routing operation.
  - `Minimal Checks / Probes`: - Run layer-drop or layer-only quantization sweeps.
  - `Why It Matters`: - Quantization error is not only a local reconstruction problem; upstream activation or weight error can change downstream inputs, routing, and evaluation behavior.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[methods/vision-language-model-quantization|vision-language model quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Mechanism`: - [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al.
  - `Implementation Hooks`: - [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al.
  - `Used By Papers`: - [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models]]
  - `What It Is`: This is a compiled method-family page for `vision-language model quantization`.
  - `Failure Modes`: - [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Lookup-table-inference|Lookup-table inference]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence / Provenance`: - [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey syn...
  - `What It Is`: `Lookup-table inference` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Common Failure Modes`: - Offline quantization accuracy is measured on a representation that the kernel cannot serve efficiently.
  - `Retrieval Hooks`: - Use for hardware-aware quantization, LUT kernels, and non-uniform quantizer implementation checks.
  - `Implementation Implications`: - Count table reads, metadata movement, and packing layout alongside arithmetic savings. - Keep the quantizer code path and inference kernel assumptions in the same experiment config.
  - `Where It Appears`: - [[papers/1909-13144v2]] - [[papers/2511-10645v1]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati]] - [[papers/Chee-et-al-2024-QuIP...
  - `Minimal Checks / Probes`: - Compare kernel-level latency and memory traffic against a uniform quantization baseline.
  - `Related Concepts`: - [[concepts/Per-channel-scaling|Per-channel scaling]] - [[concepts/Quantization-error-propagation|Quantization error propagation]]
  - `Why It Matters`: - A quantization method that depends on lookup tables must align quantizer design with memory layout, table access cost, and kernel support; otherwise accuracy gains can disappear at deployment.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[syntheses/Post-Training-Quantization-Method-Family-Synthesis|Post-Training Quantization Method Family Synthesis]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Post-Training Quantization Metho...
  - `Wiki Synthesis`: - Intended use: I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Evidence Map`: - [[methods/post-training-quantization|post-training quantization]]: candidate evidence sections: What It Is, Implementation Hooks, Used By Papers, Mechanism, Failure Modes, Open Questions.
  - `What This Page Is For`: - Original research query: I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Source Facts`: - `Implementation Hooks`: - [[papers/Wang-et-al-2025-Q-VLM-Post-training-Quantization-for-Large-Vision-Language-Models|Wang et al.
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis?
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.
  - `Publish / Review Notes`: - Keep source facts, wiki synthesis, and user ideas separated during review.
- [[topics/post-training-quantization|post-training quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `post-training quantization`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `post-training quantization`.
  - `Claims`: - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: Arai and Ichikawa - 2025 - Quantizat...
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/hardware-aware-quantization|hardware-aware quantization]]...
  - `Key Papers`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]] - [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers...
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: retrieved source page; extract only directly supported facts with page/section provenance.

## Wiki Synthesis

- Working synthesis target: This page should consolidate a method family across papers: what the mechanism actually changes, what implementation choices matter, which evidence is comparable, and where the family fails.
- Intended use: I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Source-fact boundary: use the retrieved `Source Facts` section for directly supported statements; keep this section as compiled wiki interpretation.
- Review contract:
  - Identify the shared mechanism before listing paper-specific variants.
  - Preserve implementation hooks that affect ablations or probes.
  - Separate evidence that supports the mechanism from evidence that only supports one paper's setting.
- Retrieval contract: future queries should be able to decide whether to read a method/topic/concept page first, which source papers to inspect next, and which uncertainty blocks a research decision.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.

## Evidence Map

- [[concepts/Quantization-error-propagation|Quantization error propagation]]: candidate evidence sections: What It Is, Evidence / Provenance, Where It Appears, Implementation Implications, Common Failure Modes, Minimal Checks / Probes, Why It Matters, Open Questions.
- [[methods/vision-language-model-quantization|vision-language model quantization]]: candidate evidence sections: Mechanism, Implementation Hooks, Used By Papers, What It Is, Failure Modes, Open Questions.
- [[concepts/Lookup-table-inference|Lookup-table inference]]: candidate evidence sections: Evidence / Provenance, What It Is, Common Failure Modes, Retrieval Hooks, Implementation Implications, Where It Appears, Minimal Checks / Probes, Related Concepts, Why It Matters, Open Questions.
- [[syntheses/Post-Training-Quantization-Method-Family-Synthesis|Post-Training Quantization Method Family Synthesis]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, Evidence Map, What This Page Is For, Source Facts, Open Questions, User Ideas / Decisions, Publish / Review Notes.
- [[topics/post-training-quantization|post-training quantization]]: candidate evidence sections: Scope, Retrieval Hooks, Claims, Method Families, Key Papers.
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: candidate evidence sections: needs manual section selection.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a cross-paper method-family synthesis for post-training quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
  Use because: It is the original research intent that produced `Post-Training Quantization Method Family Synthesis`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[methods/vision-language-model-quantization|vision-language model quantization]]
- [[concepts/Lookup-table-inference|Lookup-table inference]]
- [[syntheses/Post-Training-Quantization-Method-Family-Synthesis|Post-Training Quantization Method Family Synthesis]]
- [[topics/post-training-quantization|post-training quantization]]
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]
