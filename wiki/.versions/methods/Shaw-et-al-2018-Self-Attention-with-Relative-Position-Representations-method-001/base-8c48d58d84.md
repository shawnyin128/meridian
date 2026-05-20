---
type: "method"
title: "Shaw et al. - 2018 - Self-Attention with Relative Position Representations"
status: "draft"
sources:
  - "[[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations|Shaw et al. - 2018 - Self-Attention with Relative Position Representations]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
---
# Shaw et al. - 2018 - Self-Attention with Relative Position Representations

- Source paper: [[papers/Shaw-et-al-2018-Self-Attention-with-Relative-Position-Representations|Shaw et al. - 2018 - Self-Attention with Relative Position Representations]]
- Summary: In this work we present an alternative approach, extend- ing the self-attention mechanism to efﬁciently consider representations of the relative posi- tions, or distances between sequence elements. We describe an efﬁcient implementation of our method and cast it as an instance of relation-aware self-attention mech- anisms that can generalize to arbitrary graph- labeled inputs. Attention-based models have therefore used posi- tion encodings or biased attention weights based on distance (Parikh et al., 2016).
- Inputs: token embeddings, query/key/value projections, positional or attention bias terms, model weights
- Outputs: contextual token representations, sequence-model predictions, attention logits or values augmented with relative position information
- Assumptions: attention computation and positional representation capture the dependencies required by the sequence task, relative distance information improves sequence modeling without breaking attention computation
- Provenance: p. 1; p. 3
