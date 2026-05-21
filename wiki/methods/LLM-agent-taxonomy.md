---
type: "method"
title: "LLM-agent taxonomy"
status: "active"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
sources:
  - "papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior.md"
  - "papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents.md"
source_papers:
  - "papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior.md"
  - "papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents.md"
related_papers:
  - "papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior.md"
  - "papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents.md"
related_methods:
related_topics:
  - "agent planning"
  - "LLM agents"
supports:
contradicts:
supersedes:
superseded_by:
confidence: "medium"
review_state: "auto_structured"
evolution_state: "active"
revision_id: "knowledge-58778634b4"
---
# LLM-agent taxonomy

## What It Is

This is a compiled method-family page for `LLM-agent taxonomy`. It groups canonical paper pages that use or discuss the method; source-grounded claims remain on the linked paper/evidence pages.

## Mechanism

- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior|Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior]]: ### Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior - Purpose: In this paper, we introduce generative agents: computational software agents that simulate believable human behavior. In this work, we demonstrate gene...
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents|Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents]]: ### Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents - Purpose: Organize primary papers into a taxonomy and expose gaps or follow-up sources rather than defining one algorithm. - Operates on: surveyed primary papers;...

## Used By Papers

- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior]]
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents]]

## Implementation Hooks

- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior|Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior]]: - Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior: Track rollout length, reward normalization, KL/clip constraints, seed variance, and baseline policy performance. - Equation-bearing sections ex...
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents|Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents]]: - Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents: Use the survey to route to primary agent papers by memory, planning, tool-use, and evaluation dimension. - Wang 等 - 2024 - A Survey on Large Lan...

## Failure Modes

- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior|Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior]]: - Agent results depend heavily on environment fidelity, tool/action availability, prompt policy, and evaluation leakage. - Behavioral claims should be tied to trace-level evidence rather than only aggregate benchmark sco...
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents|Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents]]: - Some hardware evidence depends on simulation or specific CPU/kernel settings. Open questions: - Do key figures, tables, or equations change the interpretation of the text extraction?

## Evidence

- [[papers/Park-2023-Generative-Agents-Interactive-Simulacra-of-Human-Behavior|Park 等 - 2023 - Generative Agents Interactive Simulacra of Human Behavior]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements; keep mechanism support, quality metrics, and systems/runtime claims separate. Claim candidates: - `...
- [[papers/Wang-2024-A-Survey-on-Large-Language-Model-based-Autonomous-Agents|Wang 等 - 2024 - A Survey on Large Language Model based Autonomous Agents]]: Evidence takeaways: - Evidence should be read through reported tables/figures/ablations, runtime or memory measurements, quality metrics; keep mechanism support, quality metrics, and systems/runtime claims separate. Clai...

## Open Questions

- Which linked papers provide the strongest source-grounded evidence for this method family?
## Prerequisite Concepts

- [[concepts/Agent-tool-state-grounding|Agent tool-state grounding]]
