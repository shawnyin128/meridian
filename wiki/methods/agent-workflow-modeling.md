---
type: "method"
title: "agent workflow modeling"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
  - "papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior.md"
  - "papers/Piao-2026-AgentSociety-Large-Scale-Simulation-of-LLM-Driven-Generative-Agents-Advances-Understanding-of-Human.md"
  - "papers/Vezhnevets-2023-Generative-agent-based-modeling-with-actions-grounded-in-physical-social-or-digital-space-using-Co.md"
  - "papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents.md"
  - "papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents.md"
source_papers:
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
  - "papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior.md"
  - "papers/Piao-2026-AgentSociety-Large-Scale-Simulation-of-LLM-Driven-Generative-Agents-Advances-Understanding-of-Human.md"
  - "papers/Vezhnevets-2023-Generative-agent-based-modeling-with-actions-grounded-in-physical-social-or-digital-space-using-Co.md"
  - "papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents.md"
  - "papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents.md"
related_papers:
  - "papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning.md"
  - "papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior.md"
  - "papers/Piao-2026-AgentSociety-Large-Scale-Simulation-of-LLM-Driven-Generative-Agents-Advances-Understanding-of-Human.md"
  - "papers/Vezhnevets-2023-Generative-agent-based-modeling-with-actions-grounded-in-physical-social-or-digital-space-using-Co.md"
  - "papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents.md"
  - "papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents.md"
related_methods:
related_topics:
  - "expert routing"
  - "speculative decoding"
  - "agent planning"
  - "LLM agents"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-890c5b2f68"
---
# agent workflow modeling

## What It Is

This is a compiled method-family page for `agent workflow modeling`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning|Guan et al. - 2025 - Dynamic Speculative Agent Planning]]: ### Guan et al. - 2025 - Dynamic Speculative Agent Planning - Purpose: In this paper, we propose Dynamic Speculative Planning (DSP), a lossless, user-controllable agent planning acceleration framework that requires no pre-deployment prepara...
- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior|Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior]]: ### Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior - Purpose: In this paper, we introduce generative agents: computational software agents that simulate believable human behavior. In this work, we demonstrate gene...
- [[papers/Piao-2026-AgentSociety-Large-Scale-Simulation-of-LLM-Driven-Generative-Agents-Advances-Understanding-of-Human|Piao 等 - 2026 - AgentSociety Large-Scale Simulation of LLM-Driven Generative Agents Advances Understanding of Human]]: ### Piao 等 - 2026 - AgentSociety Large-Scale Simulation of LLM-Driven Generative Agents Advances Understanding of Human - Purpose: Compress or filter cached key/value entries while preserving long-context quality and exposing the memory/run...
- [[papers/Vezhnevets-2023-Generative-agent-based-modeling-with-actions-grounded-in-physical-social-or-digital-space-using-Co|Vezhnevets 等 - 2023 - Generative agent-based modeling with actions grounded in physical, social, or digital space using Co]]: ### Vezhnevets 等 - 2023 - Generative agent-based modeling with actions grounded in physical, social, or digital space using Co - Purpose: Here we propose Generative Agent-Based Mod- els (GABM)s, which are much more flexible and expressive t...
- [[papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents|Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents]]: ### Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents - Purpose: To address this research gap, we introduce a machine-human pipeline to generate high-quality, very long- term dialogues by leveraging LLM-based...
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents|Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents]]: ### Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents - Purpose: Organize primary papers into a taxonomy and expose gaps or follow-up sources rather than defining one algorithm. - Operates on: surveyed primary papers;...

## Used By Papers

- [[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning]]
- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior]]
- [[papers/Piao-2026-AgentSociety-Large-Scale-Simulation-of-LLM-Driven-Generative-Agents-Advances-Understanding-of-Human]]
- [[papers/Vezhnevets-2023-Generative-agent-based-modeling-with-actions-grounded-in-physical-social-or-digital-space-using-Co]]
- [[papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents]]
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents]]

## Implementation Hooks

- [[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning|Guan et al. - 2025 - Dynamic Speculative Agent Planning]]: - Guan et al. - 2025 - Dynamic Speculative Agent Planning: Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance. - Speculative decoding: Measure acceptance rate,...
- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior|Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior]]: - Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior: Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance. - Equation-bearing sections ex...
- [[papers/Piao-2026-AgentSociety-Large-Scale-Simulation-of-LLM-Driven-Generative-Agents-Advances-Understanding-of-Human|Piao 等 - 2026 - AgentSociety Large-Scale Simulation of LLM-Driven Generative Agents Advances Understanding of Human]]: - Piao 等 - 2026 - AgentSociety Large-Scale Simulation of LLM-Driven Generative Agents Advances Understanding of Human: Record environment state, available tools/actions, planner outputs, execution traces, and success/fai...
- [[papers/Vezhnevets-2023-Generative-agent-based-modeling-with-actions-grounded-in-physical-social-or-digital-space-using-Co|Vezhnevets 等 - 2023 - Generative agent-based modeling with actions grounded in physical, social, or digital space using Co]]: - Vezhnevets 等 - 2023 - Generative agent-based modeling with actions grounded in physical, social, or digital space using Co: Record environment state, available tools/actions, planner outputs, execution traces, and succ...
- [[papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents|Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents]]: - Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents: Sweep context length and separate retrieval/position failures from model-capacity failures. - Vision-language: Evaluate text-only, imag...
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents|Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents]]: - Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents: Use the survey to route to primary agent papers by memory, planning, tool-use, and evaluation dimension. - Wang 等 - 2024 - A Survey on Large Lan...

## Failure Modes

- [[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning|Guan et al. - 2025 - Dynamic Speculative Agent Planning]]: - Agent results depend heavily on environment fidelity, tool/action availability, prompt policy, and evaluation leakage. - Behavioral claims should be tied to trace-level evidence rather than only aggregate benchmark sco...
- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior|Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior]]: - Agent results depend heavily on environment fidelity, tool/action availability, prompt policy, and evaluation leakage. - Behavioral claims should be tied to trace-level evidence rather than only aggregate benchmark sco...
- [[papers/Piao-2026-AgentSociety-Large-Scale-Simulation-of-LLM-Driven-Generative-Agents-Advances-Understanding-of-Human|Piao 等 - 2026 - AgentSociety Large-Scale Simulation of LLM-Driven Generative Agents Advances Understanding of Human]]: - Some hardware evidence depends on simulation or specific CPU/kernel settings. Open questions: - Do key figures, tables, or equations change the interpretation of the text extraction?
- [[papers/Vezhnevets-2023-Generative-agent-based-modeling-with-actions-grounded-in-physical-social-or-digital-space-using-Co|Vezhnevets 等 - 2023 - Generative agent-based modeling with actions grounded in physical, social, or digital space using Co]]: - Some hardware evidence depends on simulation or specific CPU/kernel settings. Open questions: - Do key figures, tables, or equations change the interpretation of the text extraction?
- [[papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents|Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents]]: - Agent results depend heavily on environment fidelity, tool/action availability, prompt policy, and evaluation leakage. - Behavioral claims should be tied to trace-level evidence rather than only aggregate benchmark sco...
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents|Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents]]: - Some hardware evidence depends on simulation or specific CPU/kernel settings. Open questions: - Do key figures, tables, or equations change the interpretation of the text extraction?

## Evidence

- [[papers/Guan-et-al-2025-Dynamic-Speculative-Agent-Planning|Guan et al. - 2025 - Dynamic Speculative Agent Planning]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior|Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `...
- [[papers/Piao-2026-AgentSociety-Large-Scale-Simulation-of-LLM-Driven-Generative-Agents-Advances-Understanding-of-Human|Piao 等 - 2026 - AgentSociety Large-Scale Simulation of LLM-Driven Generative Agents Advances Understanding of Human]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Vezhnevets-2023-Generative-agent-based-modeling-with-actions-grounded-in-physical-social-or-digital-space-using-Co|Vezhnevets 等 - 2023 - Generative agent-based modeling with actions grounded in physical, social, or digital space using Co]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents|Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents|Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
