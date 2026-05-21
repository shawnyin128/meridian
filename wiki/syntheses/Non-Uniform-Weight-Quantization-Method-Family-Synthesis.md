---
type: "method-family"
title: "Non-Uniform Weight Quantization Method Family Synthesis"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Non-Uniform-Weight-Quantization-Method-Family-Synthesis"
query: "I need a cross-paper method-family synthesis for non-uniform weight quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
sources:
  - "concepts/Lookup-table-inference.md"
  - "methods/non-uniform-weight-quantization.md"
  - "evidence/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks-evidence-p0001.md"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis.md"
  - "topics/non-uniform-quantization.md"
  - "claims/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs-claim-005.md"
  - "papers/1909-13144v2.md"
  - "papers/2511-10645v1.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP....md"
  - "concepts/Per-channel-scaling.md"
  - "concepts/Quantization-error-propagation.md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Li-et-al-2020-Additive-Powers-of....md"
  - "methods/rotation-based-quantization.md"
  - "methods/transformer-architecture.md"
  - "methods/post-training-quantization.md"
  - "methods/MoE-quantization.md"
  - "methods/calibration-aware-PTQ.md"
  - "methods/rotation-b....md"
source_papers:
  - "papers/1909-13144v2.md"
  - "papers/2511-10645v1.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP....md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Li-et-al-2020-Additive-Powers-of....md"
source_sections:
  - "concepts/Lookup-table-inference#Evidence / Provenance"
  - "concepts/Lookup-table-inference#What It Is"
  - "concepts/Lookup-table-inference#Retrieval Hooks"
  - "concepts/Lookup-table-inference#Common Failure Modes"
  - "concepts/Lookup-table-inference#Minimal Checks / Probes"
  - "concepts/Lookup-table-inference#Implementation Implications"
  - "concepts/Lookup-table-inference#Where It Appears"
  - "concepts/Lookup-table-inference#Related Concepts"
  - "concepts/Lookup-table-inference#Why It Matters"
  - "concepts/Lookup-table-inference#Open Questions"
  - "methods/non-uniform-weight-quantization#What It Is"
  - "methods/non-uniform-weight-quantization#Mechanism"
  - "methods/non-uniform-weight-quantization#Implementation Hooks"
  - "methods/non-uniform-weight-quantization#Used By Papers"
  - "methods/non-uniform-weight-quantization#Failure Modes"
  - "methods/non-uniform-weight-quantization#Open Questions"
  - "evidence/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks-evidence-p0001#Source"
  - "evidence/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks-evidence-p0001#Evidence Item"
  - "evidence/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks-evidence-p0001#Supports"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis#Wiki Synthesis"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis#Retrieval Hooks"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis#Evidence Map"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis#What This Page Is For"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis#Source Facts"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis#Open Questions"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis#User Ideas / Decisions"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis#Publish / Review Notes"
  - "topics/non-uniform-quantization#Scope"
  - "topics/non-uniform-quantization#Retrieval Hooks"
  - "topics/non-uniform-quantization#Claims"
  - "topics/non-uniform-quantization#Method Families"
  - "topics/non-uniform-quantization#Key Papers"
  - "claims/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs-claim-005#Claim"
  - "claims/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs-claim-005#Supporting Evidence"
source_context: ".drafts/proposals/continuous-synthesis-r1/Non-Uniform-Weight-Quantization-Method-Family-Synthesis/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/method-family"
aliases:
  - "Non-Uniform Weight Quantization Method Family Synthesis"
  - "I need a cross-paper method-family synthesis for non-uniform weight quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
topics:
methods:
related:
  - "concepts/Lookup-table-inference"
  - "methods/non-uniform-weight-quantization"
  - "evidence/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks-evidence-p0001"
  - "syntheses/Rotation-Based-Quantization-Method-Family-Synthesis"
  - "topics/non-uniform-quantization"
  - "claims/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs-claim-005"
related_papers:
  - "papers/1909-13144v2.md"
  - "papers/2511-10645v1.md"
  - "papers/3549-Train-Freeze-or-Exit-Dyna.md"
  - "papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati.md"
  - "papers/Chee-et-al-2024-QuIP....md"
  - "papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks.md"
  - "papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression.md"
  - "papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees.md"
  - "papers/Li-et-al-2020-Additive-Powers-of....md"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Non-Uniform-Weight-Quantization-Method-Family-Synthesis"
supports:
contradicts:
supersedes:
superseded_by:
---
# Non-Uniform Weight Quantization Method Family Synthesis

## What This Page Is For

- Proposal type: `method-family`.
- Original research query: I need a cross-paper method-family synthesis for non-uniform weight quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Publish target after review: `syntheses/Non-Uniform-Weight-Quantization-Method-Family-Synthesis.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[concepts/Lookup-table-inference|Lookup-table inference]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence / Provenance`: - [[papers/1909-13144v2|1909.13144v2]]: 1909 13144v2 1909 13144v2 low bit quantization non uniform quantization hardware aware quantization lookup table inference learned quantization intervals post training quantization calibration aware ptq non uniform weigh...
  - `What It Is`: `Lookup-table inference` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Retrieval Hooks`: - Use for hardware-aware quantization, LUT kernels, and non-uniform quantizer implementation checks.
  - `Common Failure Modes`: - Offline quantization accuracy is measured on a representation that the kernel cannot serve efficiently.
  - `Minimal Checks / Probes`: - Compare kernel-level latency and memory traffic against a uniform quantization baseline.
  - `Implementation Implications`: - Count table reads, metadata movement, and packing layout alongside arithmetic savings. - Keep the quantizer code path and inference kernel assumptions in the same experiment config.
  - `Where It Appears`: - [[papers/1909-13144v2]] - [[papers/2511-10645v1]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Blumenberg-et-al-2025-Improving-Block-Wise-LLM-Quantization-by-4-bit-Block-Wise-Optimal-Float-BOF4-Analysis-and-Variati]] - [[papers/Chee-et-al-2024-QuIP...
  - `Related Concepts`: - [[concepts/Per-channel-scaling|Per-channel scaling]] - [[concepts/Quantization-error-propagation|Quantization error propagation]]
  - `Why It Matters`: - A quantization method that depends on lookup tables must align quantizer design with memory layout, table access cost, and kernel support; otherwise accuracy gains can disappear at deployment.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `non-uniform weight quantization`.
  - `Mechanism`: - 2024 - QuIP 2-Bit Quantization of Large Language Models With Guarantees]]: ### LUT-based system implementation - Purpose: Deploys clustered weights through lookup-table kernels so non-uniform centroids can be used for lower memory and faster inference.
  - `Implementation Hooks`: - [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al.
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]] - [[papers/1909-13144v2]] - [[papers/Li-et-al-2020-Additive-Powers-of...
  - `Failure Modes`: - [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[evidence/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks-evidence-p0001|evidence-p0001]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Source`: [[papers/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks|Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks]]
  - `Evidence Item`: No summary.
  - `Supports`: none recorded
- [[syntheses/Rotation-Based-Quantization-Method-Family-Synthesis|Rotation-Based Quantization Method Family Synthesis]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Wiki Synthesis`: - Intended use: I need a cross-paper method-family synthesis for rotation-based quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for rotation-based quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Rotation-Based Quantization Met...
  - `Evidence Map`: - [[methods/rotation-based-quantization|rotation-based quantization]]: candidate evidence sections: What It Is, Implementation Hooks, Mechanism, Used By Papers, Failure Modes, Open Questions.
  - `What This Page Is For`: - Original research query: I need a cross-paper method-family synthesis for rotation-based quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Source Facts`: - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for hardware-aware quantization with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Hardware-A...
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis?
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.
  - `Publish / Review Notes`: - Keep source facts, wiki synthesis, and user ideas separated during review.
- [[topics/non-uniform-quantization|non-uniform quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `non-uniform quantization`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `non-uniform quantization`.
  - `Claims`: - 2024 - SqueezeLLM Dense-and-Sparse Quantization is a pipeline: Sensitivity-based non-uniform quantization: Allocates non-uniform quantization centroids according to both weight distribution and sensitivity,...
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/MoE-quantization|MoE quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/rotation-b...
  - `Key Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]] - [[papers/1909-13144v2]] - [[papers/Li-et-al-2020-Additive-Powers-of...
- [[claims/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs-claim-005|Our fine-grained non-uniform quantization technique not only achieves better LLM quality than the current state-of-the-art (about a 0.9-point improvement in perplexity at similar bits per weight for the LLaMA-3 8B model) but also demonstrates a high throughput comparable to low-decompression overhead uniform quantization techniques during token generation.]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Claim`: Our fine-grained non-uniform quantization technique not only achieves better LLM quality than the current state-of-the-art (about a 0.9-point improvement in perplexity at similar bits per weight for the LLaMA-3 8B model) but also demonstrates a high throughput...
  - `Supporting Evidence`: evidence-p0003

## Wiki Synthesis

- Working synthesis target: This page should consolidate a method family across papers: what the mechanism actually changes, what implementation choices matter, which evidence is comparable, and where the family fails.
- Intended use: I need a cross-paper method-family synthesis for non-uniform weight quantization with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Source-fact boundary: use the retrieved `Source Facts` section for directly supported statements; keep this section as compiled wiki interpretation.
- Review contract:
  - Identify the shared mechanism before listing paper-specific variants.
  - Preserve implementation hooks that affect ablations or probes.
  - Separate evidence that supports the mechanism from evidence that only supports one paper's setting.
- Retrieval contract: future queries should be able to decide whether to read a method/topic/concept page first, which source papers to inspect next, and which uncertainty blocks a research decision.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.

## Evidence Map

- [[concepts/Lookup-table-inference|Lookup-table inference]]: candidate evidence sections: Evidence / Provenance, What It Is, Retrieval Hooks, Common Failure Modes, Minimal Checks / Probes, Implementation Implications, Where It Appears, Related Concepts, Why It Matters, Open Questions.
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]: candidate evidence sections: What It Is, Mechanism, Implementation Hooks, Used By Papers, Failure Modes, Open Questions.
- [[evidence/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks-evidence-p0001|evidence-p0001]]: candidate evidence sections: Source, Evidence Item, Supports.
- [[syntheses/Rotation-Based-Quantization-Method-Family-Synthesis|Rotation-Based Quantization Method Family Synthesis]]: candidate evidence sections: Wiki Synthesis, Retrieval Hooks, Evidence Map, What This Page Is For, Source Facts, Open Questions, User Ideas / Decisions, Publish / Review Notes.
- [[topics/non-uniform-quantization|non-uniform quantization]]: candidate evidence sections: Scope, Retrieval Hooks, Claims, Method Families, Key Papers.
- [[claims/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs-claim-005|Our fine-grained non-uniform quantization technique not only achieves better LLM quality than the current state-of-the-art (about a 0.9-point improvement in perplexity at similar bits per weight for the LLaMA-3 8B model) but also demonstrates a high throughput comparable to low-decompression overhead uniform quantization techniques during token generation.]]: candidate evidence sections: Claim, Supporting Evidence.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a cross-paper method-family synthesis for non-uniform weight quantization with mechanism, implementation hooks, evidence boundaries, and failure modes."
  Use because: It is the original research intent that produced `Non-Uniform Weight Quantization Method Family Synthesis`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[concepts/Lookup-table-inference|Lookup-table inference]]
- [[methods/non-uniform-weight-quantization|non-uniform weight quantization]]
- [[evidence/Li-et-al-2020-Additive-Powers-of-Two-Quantization-An-Efficient-Non-uniform-Discretization-for-Neural-Networks-evidence-p0001|evidence-p0001]]
- [[syntheses/Rotation-Based-Quantization-Method-Family-Synthesis|Rotation-Based Quantization Method Family Synthesis]]
- [[topics/non-uniform-quantization|non-uniform quantization]]
- [[claims/Gope-et-al-2024-Highly-Optimized-Kernels-and-Fine-Grained-Codebooks-for-LLM-Inference-on-Arm-CPUs-claim-005|Our fine-grained non-uniform quantization technique not only achieves better LLM quality than the current state-of-the-art (about a 0.9-point improvement in perplexity at similar bits per weight for the LLaMA-3 8B model) but also demonstrates a high throughput comparable to low-decompression overhead uniform quantization techniques during token generation.]]
