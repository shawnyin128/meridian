---
type: "synthesis"
title: "Low-Rank Adaptation Topic Overview"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Low-Rank-Adaptation-Topic-Overview"
query: "I need a topic overview for low-rank adaptation that connects key papers, method families, claims, evidence, and open questions."
sources:
  - "methods/low-rank-compensation"
  - "concepts/Per-channel-scaling"
  - "evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview"
  - "topics/low-rank-adaptation"
  - "claims/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity-claim-004"
source_papers:
  - "methods/low-rank-compensation"
  - "concepts/Per-channel-scaling"
  - "evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview"
  - "topics/low-rank-adaptation"
  - "claims/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity-claim-004"
source_sections:
  - "methods/low-rank-compensation#What It Is"
  - "methods/low-rank-compensation#Mechanism"
  - "methods/low-rank-compensation#Implementation Hooks"
  - "methods/low-rank-compensation#Used By Papers"
  - "methods/low-rank-compensation#Failure Modes"
  - "methods/low-rank-compensation#Open Questions"
  - "concepts/Per-channel-scaling#Evidence / Provenance"
  - "concepts/Per-channel-scaling#What It Is"
  - "concepts/Per-channel-scaling#Where It Appears"
  - "concepts/Per-channel-scaling#Why It Matters"
  - "concepts/Per-channel-scaling#Open Questions"
  - "evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001#Source"
  - "evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001#Evidence Item"
  - "evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001#Supports"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview#Wiki Synthesis"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview#Retrieval Hooks"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview#Source Facts"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview#What This Page Is For"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview#Evidence Map"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview#User Ideas / Decisions"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview#Open Questions"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview#Publish / Review Notes"
  - "topics/low-rank-adaptation#Scope"
  - "topics/low-rank-adaptation#Key Papers"
  - "topics/low-rank-adaptation#Claims"
  - "topics/low-rank-adaptation#Retrieval Hooks"
  - "topics/low-rank-adaptation#Method Families"
  - "claims/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity-claim-004#Claim"
  - "claims/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity-claim-004#Supporting Evidence"
source_context: ".drafts/proposals/continuous-synthesis-r1/Low-Rank-Adaptation-Topic-Overview/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/synthesis"
aliases:
  - "Low-Rank Adaptation Topic Overview"
  - "I need a topic overview for low-rank adaptation that connects key papers, method families, claims, evidence, and open questions."
topics:
methods:
related:
  - "methods/low-rank-compensation"
  - "concepts/Per-channel-scaling"
  - "evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview"
  - "topics/low-rank-adaptation"
  - "claims/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity-claim-004"
related_papers:
  - "methods/low-rank-compensation"
  - "concepts/Per-channel-scaling"
  - "evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001"
  - "syntheses/Parameter-Efficient-Adaptation-Topic-Overview"
  - "topics/low-rank-adaptation"
  - "claims/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity-claim-004"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Low-Rank-Adaptation-Topic-Overview"
---
# Low-Rank Adaptation Topic Overview

## What This Page Is For

- Proposal type: `synthesis`.
- Original research query: I need a topic overview for low-rank adaptation that connects key papers, method families, claims, evidence, and open questions.
- Publish target after review: `syntheses/Low-Rank-Adaptation-Topic-Overview.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[methods/low-rank-compensation|low-rank compensation]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `low-rank compensation`.
  - `Mechanism`: - [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al.
  - `Implementation Hooks`: - [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al.
  - `Used By Papers`: - [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators]]
  - `Failure Modes`: - [[papers/Huang-et-al-2025-MiLo-Efficient-Quantized-MoE-Inference-with-Mixture-of-Low-Rank-Compensators|Huang et al.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Per-channel-scaling|Per-channel scaling]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence / Provenance`: - [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models|Wang 等 - LSVD Loss-Aware Low-Rank Approximation for Efficient Low-Precision Vision-Language Models]]: wang lsvd loss aware low rank approximation for effi...
  - `What It Is`: `Per-channel scaling` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Where It Appears`: - [[papers/2511-10645v1]] - [[papers/Liang-et-al-2025-ParoQuant-Pairwise-Rotation-Quantization-for-Efficient-Reasoning-LLM-Inference]] - [[papers/Wang-LSVD-Loss-Aware-Low-Rank-Approximation-for-Efficient-Low-Precision-Vision-Language-Models]]
  - `Why It Matters`: - Scale granularity controls which variation is preserved by a low-bit representation and determines the tradeoff between accuracy, metadata cost, and kernel simplicity.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001|evidence-p0001]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Source`: [[papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models|Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models]]
  - `Evidence Item`: No summary.
  - `Supports`: none recorded
- [[syntheses/Parameter-Efficient-Adaptation-Topic-Overview|Parameter-Efficient Adaptation Topic Overview]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Wiki Synthesis`: - Intended use: I need a topic overview for parameter-efficient adaptation that connects key papers, method families, claims, evidence, and open questions.
  - `Retrieval Hooks`: - Query: "I need a topic overview for parameter-efficient adaptation that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Parameter-Efficient Adaptation Topic Overview`...
  - `Source Facts`: - `Retrieval Hooks`: - Query: "I need a topic overview for performance evaluation that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Performance Evaluation Topic Over...
  - `What This Page Is For`: - Original research query: I need a topic overview for parameter-efficient adaptation that connects key papers, method families, claims, evidence, and open questions.
  - `Evidence Map`: - [[syntheses/Performance-Evaluation-Topic-Overview|Performance Evaluation Topic Overview]]: candidate evidence sections: Retrieval Hooks, Wiki Synthesis, What This Page Is For, Source Facts, Evidence Map, User Ideas / Decisions, Open Questions, Publish / Revi...
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis? - Which retrieved pages are adjacent context rather than direct evidence? - What should be checked against raw PDFs or user annotations before using this in a research decision?
  - `Publish / Review Notes`: - Run `meridian wiki proposal-lint` before publishing. - Keep source facts, wiki synthesis, and user ideas separated during review. - Do not promote source-quality holds as scientific evidence.
- [[topics/low-rank-adaptation|low-rank adaptation]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `low-rank adaptation`.
  - `Key Papers`: - [[papers/Li-et-al-2025-Uni-LoRA-One-Vector-is-All-You-Need]] - [[papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models]] - [[papers/Zhang-et-al-2025-RefLoRA-Refactored-Low-Rank-Adaptation-for-Effi...
  - `Claims`: - [[papers/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models|Rahmati et al.
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `low-rank adaptation`.
  - `Method Families`: - [[methods/paper-specific-research-method|paper-specific research method]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/rotation-based-quantization|rotation-based qua...
- [[claims/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity-claim-004|3 Self-Attention is Low Rank In this section, we demonstrate that the self-attention mechanism, i.e., the context mapping matrix P, is low-rank.]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Claim`: 3 Self-Attention is Low Rank In this section, we demonstrate that the self-attention mechanism, i.e., the context mapping matrix P, is low-rank.
  - `Supporting Evidence`: evidence-p0003

## Wiki Synthesis

- Working synthesis target: This page should become a dense cross-paper synthesis: the recurring mechanism, the useful distinctions, the evidence map, and the open decisions that matter for future retrieval.
- Intended use: I need a topic overview for low-rank adaptation that connects key papers, method families, claims, evidence, and open questions.
- Source-fact boundary: use the retrieved `Source Facts` section for directly supported statements; keep this section as compiled wiki interpretation.
- Review contract:
  - Compress repeated paper summaries into one cross-paper interpretation.
  - Preserve source facts separately from the wiki's synthesis.
  - Add retrieval hooks that match realistic research or coding intents.
- Retrieval contract: future queries should be able to decide whether to read a method/topic/concept page first, which source papers to inspect next, and which uncertainty blocks a research decision.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.

## Evidence Map

- [[methods/low-rank-compensation|low-rank compensation]]: candidate evidence sections: What It Is, Mechanism, Implementation Hooks, Used By Papers, Failure Modes, Open Questions.
- [[concepts/Per-channel-scaling|Per-channel scaling]]: candidate evidence sections: Evidence / Provenance, What It Is, Where It Appears, Why It Matters, Open Questions.
- [[evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001|evidence-p0001]]: candidate evidence sections: Source, Evidence Item, Supports.
- [[syntheses/Parameter-Efficient-Adaptation-Topic-Overview|Parameter-Efficient Adaptation Topic Overview]]: candidate evidence sections: Wiki Synthesis, Retrieval Hooks, Source Facts, What This Page Is For, Evidence Map, User Ideas / Decisions, Open Questions, Publish / Review Notes.
- [[topics/low-rank-adaptation|low-rank adaptation]]: candidate evidence sections: Scope, Key Papers, Claims, Retrieval Hooks, Method Families.
- [[claims/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity-claim-004|3 Self-Attention is Low Rank In this section, we demonstrate that the self-attention mechanism, i.e., the context mapping matrix P, is low-rank.]]: candidate evidence sections: Claim, Supporting Evidence.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a topic overview for low-rank adaptation that connects key papers, method families, claims, evidence, and open questions."
  Use because: It is the original research intent that produced `Low-Rank Adaptation Topic Overview`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[methods/low-rank-compensation|low-rank compensation]]
- [[concepts/Per-channel-scaling|Per-channel scaling]]
- [[evidence/Rahmati-et-al-2025-C-LoRA-Contextual-Low-Rank-Adaptation-for-Uncertainty-Estimation-in-Large-Language-Models-evidence-p0001|evidence-p0001]]
- [[syntheses/Parameter-Efficient-Adaptation-Topic-Overview|Parameter-Efficient Adaptation Topic Overview]]
- [[topics/low-rank-adaptation|low-rank adaptation]]
- [[claims/Wang-et-al-2020-Linformer-Self-Attention-with-Linear-Complexity-claim-004|3 Self-Attention is Low Rank In this section, we demonstrate that the self-attention mechanism, i.e., the context mapping matrix P, is low-rank.]]
