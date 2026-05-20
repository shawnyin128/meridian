---
type: "method"
title: "Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"
status: "draft"
sources:
  - "[[papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena|Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena.md"
related_papers:
  - "papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-cc658fcd55"
---
# Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena

- Source paper: [[papers/Zheng-et-al-2023-Judging-LLM-as-a-Judge-with-MT-Bench-and-Chatbot-Arena|Zheng et al. - 2023 - Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena]]
- Summary: Schedules attention tiles, GPU memory movement, and low-precision compute so exact attention runs faster on the target hardware.
- Inputs: query/key/value tiles, attention mask or sequence layout, GPU memory hierarchy, precision mode
- Outputs: attention outputs, kernel throughput/latency measurements, numerical-error profile
- Assumptions: the target GPU exposes the asynchronous copy/compute and tensor-core behavior that the kernel schedule relies on
- Provenance: p. 11; p. 12
