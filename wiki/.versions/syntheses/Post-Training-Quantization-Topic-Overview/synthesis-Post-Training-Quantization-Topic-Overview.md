---
type: "synthesis"
title: "Post-Training Quantization Topic Overview"
status: "draft"
created: "2026-05-21"
updated: "2026-05-21"
proposal_id: "Post-Training-Quantization-Topic-Overview"
query: "I need a topic overview for post-training quantization that connects key papers, method families, claims, evidence, and open questions."
sources:
  - "methods/post-training-quantization"
  - "concepts/Quantization-error-propagation"
  - "evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview"
  - "topics/post-training-quantization"
  - "claims/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models-claim-004"
source_papers:
  - "methods/post-training-quantization"
  - "concepts/Quantization-error-propagation"
  - "evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview"
  - "topics/post-training-quantization"
  - "claims/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models-claim-004"
source_sections:
  - "methods/post-training-quantization#What It Is"
  - "methods/post-training-quantization#Implementation Hooks"
  - "methods/post-training-quantization#Failure Modes"
  - "methods/post-training-quantization#Mechanism"
  - "methods/post-training-quantization#Used By Papers"
  - "methods/post-training-quantization#Prerequisite Concepts"
  - "methods/post-training-quantization#Open Questions"
  - "concepts/Quantization-error-propagation#Evidence / Provenance"
  - "concepts/Quantization-error-propagation#What It Is"
  - "concepts/Quantization-error-propagation#Where It Appears"
  - "concepts/Quantization-error-propagation#Minimal Checks / Probes"
  - "concepts/Quantization-error-propagation#Why It Matters"
  - "concepts/Quantization-error-propagation#Open Questions"
  - "evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001#Source"
  - "evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001#Evidence Item"
  - "evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001#Supports"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview#Wiki Synthesis"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview#Retrieval Hooks"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview#Evidence Map"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview#What This Page Is For"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview#Source Facts"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview#User Ideas / Decisions"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview#Open Questions"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview#Publish / Review Notes"
  - "topics/post-training-quantization#Scope"
  - "topics/post-training-quantization#Key Papers"
  - "topics/post-training-quantization#Retrieval Hooks"
  - "topics/post-training-quantization#Claims"
  - "topics/post-training-quantization#Method Families"
  - "topics/post-training-quantization#Key Concepts"
  - "claims/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models-claim-004#Claim"
  - "claims/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models-claim-004#Supporting Evidence"
source_context: ".drafts/proposals/continuous-synthesis-r1/Post-Training-Quantization-Topic-Overview/source_context.json"
user_inputs:
  - "inline_user_note"
confidence: "low"
review_state: "published_proposal"
tags:
  - "paper-wiki/synthesis"
  - "paper-wiki/synthesis"
aliases:
  - "Post-Training Quantization Topic Overview"
  - "I need a topic overview for post-training quantization that connects key papers, method families, claims, evidence, and open questions."
topics:
methods:
related:
  - "methods/post-training-quantization"
  - "concepts/Quantization-error-propagation"
  - "evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview"
  - "topics/post-training-quantization"
  - "claims/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models-claim-004"
related_papers:
  - "methods/post-training-quantization"
  - "concepts/Quantization-error-propagation"
  - "evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001"
  - "syntheses/Hardware-Aware-Quantization-Topic-Overview"
  - "topics/post-training-quantization"
  - "claims/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models-claim-004"
related_methods:
related_topics:
source_quality_risk: false
evolution_state: "active"
revision_id: "synthesis-Post-Training-Quantization-Topic-Overview"
---
# Post-Training Quantization Topic Overview

## What This Page Is For

- Proposal type: `synthesis`.
- Original research query: I need a topic overview for post-training quantization that connects key papers, method families, claims, evidence, and open questions.
- Publish target after review: `syntheses/Post-Training-Quantization-Topic-Overview.md`.
- This draft exists to preserve useful retrieval context without pretending that synthesis is already final.

## Source Facts

- [[methods/post-training-quantization|post-training quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `What It Is`: This is a compiled method-family page for `post-training quantization`.
  - `Implementation Hooks`: - Quantization: Log pre/post-qu...
  - `Failure Modes`: - 2025 - EfficientQAT Efficient Quantization-Aware Training for Large Language Models]]: - Attention architecture claims can depend on sequence length, mask convention, positional encoding, and training compute.
  - `Mechanism`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models|Chen et al.
  - `Used By Papers`: - [[papers/Lasby-et-al-2025-REAP-the-Experts-Why-Pruning-Prevails-for-One-Shot-MoE-compression]] - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Lar...
  - `Prerequisite Concepts`: - [[concepts/Calibration-representativeness|Calibration representativeness]] - [[concepts/Quantization-error-propagation|Quantization error propagation]] - [[concepts/Rotation-transform-invariance|Rotation transform invariance]] - [[concepts/Activation-outlier...
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this method family?
- [[concepts/Quantization-error-propagation|Quantization error propagation]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Evidence / Provenance`: - [[papers/1909-13144v2|1909.13144v2]]: 1909 13144v2 1909 13144v2 low bit quantization non uniform quantization hardware aware quantization lookup table inference learned quantization intervals post training quantization calibration aware ptq non uniform weigh...
  - `What It Is`: `Quantization error propagation` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.
  - `Where It Appears`: - [[papers/1808-05779v3]] - [[papers/1909-13144v2]] - [[papers/2511-10645v1]] - [[papers/3549-Train-Freeze-or-Exit-Dyna]] - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]] - [[papers/Ashkboos-et...
  - `Minimal Checks / Probes`: - Run layer-drop or layer-only quantization sweeps.
  - `Why It Matters`: - Quantization error is not only a local reconstruction problem; upstream activation or weight error can change downstream inputs, routing, and evaluation behavior.
  - `Open Questions`: - Which linked papers provide the strongest source-grounded evidence for this concept? - Which methods fail when this concept is ignored?
- [[evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001|evidence-p0001]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Source`: [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization]]
  - `Evidence Item`: No summary.
  - `Supports`: none recorded
- [[syntheses/Hardware-Aware-Quantization-Topic-Overview|Hardware-Aware Quantization Topic Overview]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Wiki Synthesis`: - Intended use: I need a topic overview for hardware-aware quantization that connects key papers, method families, claims, evidence, and open questions.
  - `Retrieval Hooks`: - Query: "I need a topic overview for hardware-aware quantization that connects key papers, method families, claims, evidence, and open questions." Use because: It is the original research intent that produced `Hardware-Aware Quantization Topic Overview`.
  - `Evidence Map`: - [[topics/hardware-aware-quantization|hardware-aware quantization]]: candidate evidence sections: Scope, Retrieval Hooks, Claims, Key Papers, Method Families.
  - `What This Page Is For`: - Original research query: I need a topic overview for hardware-aware quantization that connects key papers, method families, claims, evidence, and open questions.
  - `Source Facts`: - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/MoE-quantization|MoE quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] -...
  - `User Ideas / Decisions`: Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.
  - `Open Questions`: - Which source facts are strong enough to preserve as canonical synthesis? - Which retrieved pages are adjacent context rather than direct evidence? - What should be checked against raw PDFs or user annotations before using this in a research decision?
  - `Publish / Review Notes`: - Run `meridian wiki proposal-lint` before publishing. - Keep source facts, wiki synthesis, and user ideas separated during review. - Do not promote source-quality holds as scientific evidence.
- [[topics/post-training-quantization|post-training quantization]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Scope`: This topic page compiles canonical paper pages around `post-training quantization`.
  - `Key Papers`: - [[papers/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models]] - [[papers/Chee-et-al-2024-QuIP-2-Bit-Quantization-of-Large-Language-Models-With-Guarantees]] - [[papers/Wang-et-al-2023-BitNet-Scaling-1-bit-Transformers...
  - `Retrieval Hooks`: - Retrieve this topic when comparing papers, mechanisms, limitations, or implementation hooks around `post-training quantization`.
  - `Claims`: - [[papers/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization|Arai and Ichikawa - 2025 - Quantization Error Propagation Revisiting Layer-Wise Post-Training Quantization]]: Arai and Ichikawa - 2025 - Quantizat...
  - `Method Families`: - [[methods/transformer-architecture|transformer architecture]] - [[methods/post-training-quantization|post-training quantization]] - [[methods/calibration-aware-PTQ|calibration-aware PTQ]] - [[methods/hardware-aware-quantization|hardware-aware quantization]]...
  - `Key Concepts`: - [[concepts/Calibration-representativeness|Calibration representativeness]]
- [[claims/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models-claim-004|3 EfficientQAT 3.1 Method Overview In this section, we introduce EfficientQAT, a novel quantization-aware training framework for LLMs that enhances memory efficiency.]]: retrieved source page; extract only directly supported facts with page/section provenance.
  - `Claim`: 3 EfficientQAT 3.1 Method Overview In this section, we introduce EfficientQAT, a novel quantization-aware training framework for LLMs that enhances memory efficiency.
  - `Supporting Evidence`: evidence-p0003

## Wiki Synthesis

- Working synthesis target: This page should become a dense cross-paper synthesis: the recurring mechanism, the useful distinctions, the evidence map, and the open decisions that matter for future retrieval.
- Intended use: I need a topic overview for post-training quantization that connects key papers, method families, claims, evidence, and open questions.
- Source-fact boundary: use the retrieved `Source Facts` section for directly supported statements; keep this section as compiled wiki interpretation.
- Review contract:
  - Compress repeated paper summaries into one cross-paper interpretation.
  - Preserve source facts separately from the wiki's synthesis.
  - Add retrieval hooks that match realistic research or coding intents.
- Retrieval contract: future queries should be able to decide whether to read a method/topic/concept page first, which source papers to inspect next, and which uncertainty blocks a research decision.

## User Ideas / Decisions

Automatically seeded by the final LLM Wiki synthesis growth loop from a compiled topic page.

## Evidence Map

- [[methods/post-training-quantization|post-training quantization]]: candidate evidence sections: What It Is, Implementation Hooks, Failure Modes, Mechanism, Used By Papers, Prerequisite Concepts, Open Questions.
- [[concepts/Quantization-error-propagation|Quantization error propagation]]: candidate evidence sections: Evidence / Provenance, What It Is, Where It Appears, Minimal Checks / Probes, Why It Matters, Open Questions.
- [[evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001|evidence-p0001]]: candidate evidence sections: Source, Evidence Item, Supports.
- [[syntheses/Hardware-Aware-Quantization-Topic-Overview|Hardware-Aware Quantization Topic Overview]]: candidate evidence sections: Wiki Synthesis, Retrieval Hooks, Evidence Map, What This Page Is For, Source Facts, User Ideas / Decisions, Open Questions, Publish / Review Notes.
- [[topics/post-training-quantization|post-training quantization]]: candidate evidence sections: Scope, Key Papers, Retrieval Hooks, Claims, Method Families, Key Concepts.
- [[claims/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models-claim-004|3 EfficientQAT 3.1 Method Overview In this section, we introduce EfficientQAT, a novel quantization-aware training framework for LLMs that enhances memory efficiency.]]: candidate evidence sections: Claim, Supporting Evidence.

## Open Questions

- Which source facts are strong enough to preserve as canonical synthesis?
- Which retrieved pages are adjacent context rather than direct evidence?
- What should be checked against raw PDFs or user annotations before using this in a research decision?

## Retrieval Hooks

- Query: "I need a topic overview for post-training quantization that connects key papers, method families, claims, evidence, and open questions."
  Use because: It is the original research intent that produced `Post-Training Quantization Topic Overview`.

## Publish / Review Notes

- Run `meridian wiki proposal-lint` before publishing.
- Keep source facts, wiki synthesis, and user ideas separated during review.
- Do not promote source-quality holds as scientific evidence.

## Source Links

- [[methods/post-training-quantization|post-training quantization]]
- [[concepts/Quantization-error-propagation|Quantization error propagation]]
- [[evidence/Arai-and-Ichikawa-2025-Quantization-Error-Propagation-Revisiting-Layer-Wise-Post-Training-Quantization-evidence-p0001|evidence-p0001]]
- [[syntheses/Hardware-Aware-Quantization-Topic-Overview|Hardware-Aware Quantization Topic Overview]]
- [[topics/post-training-quantization|post-training quantization]]
- [[claims/Chen-et-al-2025-EfficientQAT-Efficient-Quantization-Aware-Training-for-Large-Language-Models-claim-004|3 EfficientQAT 3.1 Method Overview In this section, we introduce EfficientQAT, a novel quantization-aware training framework for LLMs that enhances memory efficiency.]]
