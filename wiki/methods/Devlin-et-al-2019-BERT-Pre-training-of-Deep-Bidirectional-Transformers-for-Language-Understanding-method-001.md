---
type: "method"
title: "Devlin et al. - 2019 - BERT Pre-training of Deep Bidirectional Transformers for Language Understanding"
status: "draft"
sources:
  - "[[papers/Devlin-et-al-2019-BERT-Pre-training-of-Deep-Bidirectional-Transformers-for-Language-Understanding|Devlin et al. - 2019 - BERT Pre-training of Deep Bidirectional Transformers for Language Understanding]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Devlin-et-al-2019-BERT-Pre-training-of-Deep-Bidirectional-Transformers-for-Language-Understanding.md"
related_papers:
  - "papers/Devlin-et-al-2019-BERT-Pre-training-of-Deep-Bidirectional-Transformers-for-Language-Understanding.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-e8062b9707"
---
# Devlin et al. - 2019 - BERT Pre-training of Deep Bidirectional Transformers for Language Understanding

- Source paper: [[papers/Devlin-et-al-2019-BERT-Pre-training-of-Deep-Bidirectional-Transformers-for-Language-Understanding|Devlin et al. - 2019 - BERT Pre-training of Deep Bidirectional Transformers for Language Understanding]]
- Summary: For example, in OpenAI GPT, the authors use a left-to- right architecture, where every token can only at- tend to previous tokens in the self-attention layers of the Transformer (Vaswani et al., 2017). 3 BERT We introduce BERT and its detailed implementa- tion in this section. There are two steps in our framework: pre-training and ﬁne-tuning.
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights
- Outputs: contextual token representations, sequence-model predictions
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task
- Provenance: p. 1; p. 3; p. 5
