---
type: "method"
title: "Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents"
status: "draft"
sources:
  - "[[papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents|Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents.md"
related_papers:
  - "papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-516b743bcd"
consolidation_target: "methods/agent-workflow-modeling"
candidate_scope: "paper_specific_method_record"
retrieval_visibility: "suppressed_unless_exact_identity"
---
# Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents

- Source paper: [[papers/Maharana-2024-Evaluating-Very-Long-Term-Conversational-Memory-of-LLM-Agents|Maharana 等 - 2024 - Evaluating Very Long-Term Conversational Memory of LLM Agents]]
- Summary: To address this research gap, we introduce a machine-human pipeline to generate high-quality, very long- term dialogues by leveraging LLM-based agent architectures and grounding their dialogues on personas and temporal event graphs. To this end, we present the first study of very long-term open-domain multi-modal dialogues, closely mirroring real-world online interactions, collected via a human-machine pipeline where we first use LLM-based generative agents to generate conversations and then ask human annotators to fix any long-term inconsistencies in the conversa- tions. We design a long-term conversation generation pipeline based on retrieval augmenta- tion and events graphs and propose a framework for evaluating long-term dialog agents.
- Inputs: long sequence tokens, positional encoding or attention state
- Outputs: extended-context model behavior or evaluation results
- Assumptions: quality must be checked at the target context lengths, not inferred from short-context behavior
- Provenance: p. 4; p. 12; p. 1
