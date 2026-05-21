---
type: research_dev_idea
title: "Separate Attention Sink and Retrieval-Critical Tokens in KV-Cache Compression"
status: triaging
origin: user
created: 2026-05-21
updated: 2026-05-21
related_papers:
  - "[[Cai et al. - 2025 - PyramidKV Dynamic KV Cache Compression based on Pyramidal Information Funneling]]"
related_methods:
  - "[[KV-cache compression]]"
related_concepts: []
related_experiments: []
evidence_state: unknown
decision: test_next
---

# Idea Card: Separate Attention Sink and Retrieval-Critical Tokens in KV-Cache Compression

Suggested target-repo path:

```text
.meridian/ideas/separate-attention-sink-and-retrieval-critical-tokens.md
```

## Raw Idea

KV-cache compression should preserve attention sink or retrieval-critical tokens
differently from normal tokens. Maybe recent-token retention and key-token
selection are mixing two different roles.

## Hypothesis

If attention sink tokens and retrieval-critical content tokens play different
roles in long-context decoding, then separating their retention policies should
improve quality at the same KV-cache budget or reveal different failure modes
than a single retention score.

## Wiki Grounding

Retrieved with:

```bash
PYTHONPATH=src python3 -m meridian.mcp context \
  --wiki-root wiki \
  --query "KV-cache compression should preserve attention sink or retrieval-critical tokens differently from normal tokens; evaluate whether this idea is worth testing and what minimal experiment would ground it." \
  --top-k 6
```

High-value context:

- `syntheses/KV-Cache-Compression-Failure-Boundary-Summary.md`: compiled
  failure-boundary context for KV-cache compression.
- `topics/KV-cache-compression.md`: topic-level orientation and related method
  cluster.
- `syntheses/Kv-Cache-Compression-Method-Family-Synthesis.md`: method-family
  comparison surface.
- `papers/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling.md`:
  paper-level source context for dynamic KV-cache compression.
- `claims/Adnan-et-al-2024-Keyformer-KV-Cache-Reduction-through-Key-Tokens-Selection-for-Efficient-Generative-Inference-claim-002.md`:
  candidate claim about combining selected key tokens with recent tokens.
- `evidence/Cai-et-al-2025-PyramidKV-Dynamic-KV-Cache-Compression-based-on-Pyramidal-Information-Funneling-evidence-p0001.md`:
  evidence candidate to inspect before relying on a metric claim.

## Feasibility Read

Support:

- The wiki retrieves both method-family and failure-boundary syntheses, which
  suggests this idea belongs to an existing cluster rather than a standalone
  paper-specific hunch.
- The Keyformer claim candidate indicates that key-token selection plus recent
  token retention is already a meaningful adjacent mechanism.

Risk:

- The current grounding does not prove that attention sink tokens and
  retrieval-critical tokens are separable in this repo's task distribution.
- Evidence pages need source trace before this becomes a claim about expected
  quality.
- The idea may collapse into an implementation detail if the metric cannot
  distinguish sink-token preservation from content-token preservation.

Novelty risk:

- Adjacent KV-cache methods already combine selected key tokens with recent
  tokens. The novelty should be tested as a probe/analysis or policy split, not
  assumed as a new method.

Implementation risk:

- Need access to attention scores, selected token positions, retention masks,
  and per-example quality changes.

## Minimal Test

Start with an offline probe before training or full benchmark sweeps:

1. Run the existing KV-cache compression baseline on a tiny long-context subset.
2. Log retained token positions and separate them into:
   - early/sink-like tokens
   - recent tokens
   - high-score retrieval-critical content tokens
3. Compare three masks at the same budget:
   - baseline retention
   - sink-preserving retention
   - retrieval-critical-token-preserving retention
4. Sanity check that each mask is actually active and has the expected token
   distribution.
5. Stop if masks do not differ meaningfully or if the metric cannot detect the
   perturbation.

## Evidence Log

No local run yet.

Required evidence identity when run:

- command
- config
- model/checkpoint
- dataset slice
- cache budget
- metric definition
- output path
- commit hash

## Decision

Current decision: `test_next`.

Reason: wiki grounding shows the idea is adjacent to real KV-cache compression
mechanisms, but it needs a cheap mask/probe test before becoming an
implementation direction.

## Write-back Candidate

Do not write this raw idea to canonical Paper Wiki.

Possible future write-back:

- If the probe reveals a reusable failure boundary, create a synthesis proposal.
- If the implementation exposes a missing prerequisite concept, create a concept
  proposal.
- If the result only affects this repo, keep it as dev evidence and link it from
  the Idea Card.
