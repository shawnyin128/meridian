---
type: "method-family"
title: "Speculative Decoding Method Family Synthesis"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Speculative-Decoding-Method-Family-Synthesis"
query: "I need a cross-paper method-family synthesis for speculative decoding with mechanism, implementation hooks, evidence boundaries, and failure modes."
source_papers:
  - "concepts/Speculative-decoding-acceptance-rate"
  - "methods/speculative-decoding"
  - "concepts/Per-channel-scaling"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis"
  - "topics/speculative-decoding"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
source_sections:
  - "concepts/Speculative-decoding-acceptance-rate#What It Is"
  - "concepts/Speculative-decoding-acceptance-rate#Evidence / Provenance"
  - "concepts/Speculative-decoding-acceptance-rate#Retrieval Hooks"
  - "concepts/Speculative-decoding-acceptance-rate#Where It Appears"
  - "concepts/Speculative-decoding-acceptance-rate#Why It Matters"
  - "concepts/Speculative-decoding-acceptance-rate#Implementation Implications"
  - "concepts/Speculative-decoding-acceptance-rate#Common Failure Modes"
  - "concepts/Speculative-decoding-acceptance-rate#Open Questions"
  - "methods/speculative-decoding#What It Is"
  - "methods/speculative-decoding#Used By Papers"
  - "methods/speculative-decoding#Mechanism"
  - "methods/speculative-decoding#Implementation Hooks"
  - "methods/speculative-decoding#Failure Modes"
  - "methods/speculative-decoding#Prerequisite Concepts"
  - "methods/speculative-decoding#Open Questions"
  - "concepts/Per-channel-scaling#What It Is"
  - "concepts/Per-channel-scaling#Evidence / Provenance"
  - "concepts/Per-channel-scaling#Implementation Implications"
  - "concepts/Per-channel-scaling#Common Failure Modes"
  - "concepts/Per-channel-scaling#Retrieval Hooks"
  - "concepts/Per-channel-scaling#Open Questions"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis#Retrieval Hooks"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis#Evidence Map"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis#Wiki Synthesis"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis#What This Page Is For"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis#Source Facts"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis#Open Questions"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis#User Ideas / Decisions"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis#Publish / Review Notes"
  - "topics/speculative-decoding#Scope"
  - "topics/speculative-decoding#Retrieval Hooks"
  - "topics/speculative-decoding#Claims"
  - "topics/speculative-decoding#Key Papers"
  - "topics/speculative-decoding#Key Concepts"
  - "topics/speculative-decoding#Method Families"
source_context: ".drafts/proposals/product-maturity-synthesis-r2/Speculative-Decoding-Method-Family-Synthesis/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/method-family"
aliases:
  - "Speculative Decoding Method Family Synthesis"
  - "I need a cross-paper method-family synthesis for speculative decoding with mechanism, implementation hooks, evidence boundaries, and failure modes."
topics:
methods:
related:
  - "concepts/Speculative-decoding-acceptance-rate"
  - "methods/speculative-decoding"
  - "concepts/Per-channel-scaling"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis"
  - "topics/speculative-decoding"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
related_papers:
  - "concepts/Speculative-decoding-acceptance-rate"
  - "methods/speculative-decoding"
  - "concepts/Per-channel-scaling"
  - "syntheses/Long-Context-Inference-Method-Family-Synthesis"
  - "topics/speculative-decoding"
  - "claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Speculative-Decoding-Method-Family-Synthesis"
---
# Speculative Decoding Method Family Synthesis

## What This Page Is For

- Proposal type: `method-family`.
- Original research query: I need a cross-paper method-family synthesis for speculative decoding with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Publish target after review: `syntheses/Speculative-Decoding-Method-Family-Synthesis.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: `Speculative decoding acceptance rate` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family...
  - `Evidence / Provenance`: - [[papers/13979-STAR-Speculative-Decodin|13979_STAR_Speculative_Decodin]]: 13979 star speculative decodin 13979 star speculative decodin speculative decoding kv cache compression transformer architecture draft acceptance context extrapolation speculative deco...
  - `Retrieval Hooks`: - Use for speculative decoding debug, acceptance-rate regressions, and draft/target ablations.
  - `Where It Appears`: - [[papers/13979-STAR-Speculative-Decodin]] - [[papers/Cai-et-al-2024-Medusa-Simple-LLM-Inference-Acceleration-Framework-with-Multiple-Decoding-Heads]] - [[papers/DeepSeek-AI-2025-DeepSeek-V3-Technical-Report]] - [[papers/ERNIE-Technical-Report]] - [[papers/El...
  - `Why It Matters`: - Speculative decoding speed depends on how many draft tokens survive target-model verification, not just draft model throughput.
  - `Implementation Implications`: - Log acceptance length distributions, not only average speedup. - Tie acceptance statistics to target model, prompt domain, and draft batch schedule.
  - `Common Failure Modes`: - A faster draft model reduces acceptance enough to lose end-to-end speedup. - Acceptance metrics are computed before rejection handling or EOS corner cases.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[methods/speculative-decoding|speculative decoding]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `speculative decoding`.
  - `Used By Papers`: - [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]] - [[papers/Miao-et-al-2024-SpecInfer-Accelerating-Generative-Large-Language-Model-Serving-with-Tree-based-Speculative-Inferenc]] - [[papers/Liu-et-al-2025-PEARL-Paralle...
  - `Mechanism`: - [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al.
  - `Implementation Hooks`: - [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al.
  - `Failure Modes`: - [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al.
  - `Prerequisite Concepts`: - [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Per-channel-scaling|Per-channel scaling]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: `Per-channel scaling` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Evidence / Provenance`: - [[papers/2511-10645v1|2511.10645v1]]: 2511 10645v1 2511 10645v1 post training quantization low bit quantization quantization error rotation based quantization hardware aware quantization lookup table inference benchmark evaluation survey synthesis survey syn...
  - `Implementation Implications`: - Treat scale granularity as part of the kernel/data-layout contract, not just a math detail. - Check whether scale tensors broadcast over the intended axis.
  - `Common Failure Modes`: - A tensor axis mismatch silently applies the wrong scale. - Fine-grained scales recover accuracy but erase the intended memory or speed benefit.
  - `Retrieval Hooks`: - Use for quantizer implementation, axis bugs, and scale-granularity ablations.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[syntheses/Long-Context-Inference-Method-Family-Synthesis|Long-Context Inference Method Family Synthesis]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for long-context inference with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Long-Context Inference Method Family...
  - `Evidence Map`: - [[methods/long-context-inference|long-context inference]]: candidate evidence sections: What It Is, Mechanism, Implementation Hooks, Used By Papers, Failure Modes, Open Questions.
  - `Wiki Synthesis`: - Intended use: I need a cross-paper method-family synthesis for long-context inference with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `What This Page Is For`: - Original research query: I need a cross-paper method-family synthesis for long-context inference with mechanism, implementation hooks, evidence boundaries, and failure modes.
  - `Source Facts`: - `Retrieval Hooks`: - Query: "I need a cross-paper method-family synthesis for KV-cache compression with mechanism, implementation hooks, evidence boundaries, and failure modes." Use because: It is the original research intent that produced `Kv-Cache Compress...
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis?
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.
  - `Publish / Review Notes`: - Keep source facts, wiki synthesis, and user ideas separated during review.
- [[topics/speculative-decoding|speculative decoding]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `speculative decoding`.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `speculative decoding`.
  - `Claims`: - [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques|Hu et al.
  - `Key Papers`: - [[papers/Lu-et-al-2022-A-continental-scale-analysis-reveals-widespread-root-bimodality]] - [[papers/Hu-et-al-2025-Speculative-Decoding-and-Beyond-An-In-Depth-Survey-of-Techniques]] - [[papers/Tiwari-et-al-2025-QuantSpec-Self-Speculative-Decoding-with-Hierarc...
  - `Key Concepts`: - [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]
  - `Method Families`: - [[methods/clustering-algorithm|clustering algorithm]] - [[methods/audio-language-modeling|audio-language modeling]] - [[methods/multimodal-instruction-tuning|multimodal instruction tuning]] - [[methods/speculative-decoding|speculative decoding]] - [[methods/...
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: retrieved source page; extract only directly supported facts with page/section provenance.

## Wiki Synthesis

- This is a low-confidence synthesis scaffold generated from canonical retrieval context.
- Preserve the source facts below as evidence candidates; do not treat this scaffold as a final thesis.
- Intended use: I need a cross-paper method-family synthesis for speculative decoding with mechanism, implementation hooks, evidence boundaries, and failure modes.
- Next reviewer action: compress retrieved source facts into a tighter cross-paper thesis only after checking provenance.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled method page.

## Evidence Map

- [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]: candidate evidence sections: What It Is, Evidence / Provenance, Retrieval Hooks, Where It Appears, Why It Matters, Implementation Implications, Common Failure Modes, Open Questions.
- [[methods/speculative-decoding|speculative decoding]]: candidate evidence sections: What It Is, Used By Papers, Mechanism, Implementation Hooks, Failure Modes, Prerequisite Concepts, Open Questions.
- [[concepts/Per-channel-scaling|Per-channel scaling]]: candidate evidence sections: What It Is, Evidence / Provenance, Implementation Implications, Common Failure Modes, Retrieval Hooks, Open Questions.
- [[syntheses/Long-Context-Inference-Method-Family-Synthesis|Long-Context Inference Method Family Synthesis]]: candidate evidence sections: Retrieval Hooks, Evidence Map, Wiki Synthesis, What This Page Is For, Source Facts, Open Questions, User Ideas / Decisions, Publish / Review Notes.
- [[topics/speculative-decoding|speculative decoding]]: candidate evidence sections: Scope, Retrieval Hooks, Claims, Key Papers, Key Concepts, Method Families.
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]: candidate evidence sections: needs manual section selection.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a cross-paper method-family synthesis for speculative decoding with mechanism, implementation hooks, evidence boundaries, and failure modes."
  Use because: It is the original research intent that produced `Speculative Decoding Method Family Synthesis`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[concepts/Speculative-decoding-acceptance-rate|Speculative decoding acceptance rate]]
- [[methods/speculative-decoding|speculative decoding]]
- [[concepts/Per-channel-scaling|Per-channel scaling]]
- [[syntheses/Long-Context-Inference-Method-Family-Synthesis|Long-Context Inference Method Family Synthesis]]
- [[topics/speculative-decoding|speculative decoding]]
- [[claims/Yang-et-al-2025-Diffusion-Models-A-Comprehensive-Survey-of-Methods-and-Applications-claim-003|4 DIFFUSION MODELS WITH IMPROVED LIKELIHOOD As discussed in Section 2.1, the training objective for diffusion models is a (negative) variational lower bound (VLB) on the log-likelihood.]]
