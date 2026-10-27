# Worked Example: a latent-prediction draft for speculative decoding

A hypothetical design, not a reported result. The thresholds `δ` (useful
acceptance gain) and `ε` (fidelity tolerance) stand for numbers the user picks
for their budget before the deciding run.

## Feasibility review

The user asks: "JEPA and speculative decoding both predict the future. Would a
latent-prediction objective make a better draft model?" Lab places it as node
`spec-decode.C` under the draft-training thread, then grounds it with
`meridian.context`, `meridian.read` and `meridian.trace`.

**Claim.** An auxiliary latent-prediction loss improves the draft's token
proposals by teaching it useful hidden dynamics, beyond generic regularization
or extra capacity and compute. Nothing has been measured, so it is a
hypothesis.

**Analogy boundary.** Predicting a latent state and proposing the target's
next tokens are different objectives. The bridge needs a mapping from latent
dynamics to conditional token distributions; the shared word "prediction" is
not one.

- **M1:** learning predictable hidden dynamics raises draft–target overlap of
  the token distribution in the contexts that matter for acceptance.
- **M2:** any auxiliary loss regularizes the draft the same way; the latent
  structure is unnecessary. Capacity and compute are controlled separately.
- **M0:** no useful token-level transfer, or latent accuracy is bought with
  token fidelity. A broken verifier is a validity failure, checked first.

**Evidence ledger.**

| Statement | Status | Anchor |
| --- | --- | --- |
| With target `p` and draft `q` at one context, exact speculative sampling accepts with probability `Σ min(p, q) = 1 − TV(p, q)`. | `Source-supported` | the anchor `meridian.trace` returns for the speculative-decoding paper's acceptance derivation |
| A latent gain has to show up as token overlap, or in the contexts that govern multistep acceptance. | `Inference` | from the row above |
| A latent-prediction loss raises that overlap. | `New hypothesis` | none; novelty unresolved without a literature check |

## Discriminating Design

**Prediction matrix.**

| Intervention | M1 | M2 | M0 | Metric |
| --- | --- | --- | --- | --- |
| Predictable hidden dynamics, controlled emission noise | latent-specific gain where dynamics inform token probabilities | no latent-specific gain once the generic auxiliary loss is matched | no acceptance gain, maybe a fidelity loss | acceptance by proposal position |
| Shuffle the latent targets, keep the token data | the gain shrinks | may persist; shuffling also changes loss difficulty, so this row is labeled inconclusive for M2 | no consistent transfer | accepted-prefix length |
| Same architecture and budget, generic auxiliary loss | the latent gain remains | the gap closes | neither loss helps | distribution overlap at fixed contexts |

**Substrate.** Synthetic: a hidden-state sequence generator with known token
probabilities and a fixed target. Train token-only, token-plus-latent,
generic-auxiliary and shuffled-latent drafts; vary latent predictability and
emission noise separately; match capacity and account for training compute.
It preserves the latent-to-token mapping and removes natural-language scale; it
leaves end-to-end speedup untested. Teacher-forced averages alone do not show
rollout behavior.

**Validity checks.** The sampling correction reproduces the target
distribution on this enumerable toy; the shuffled targets do not change
gradient scale beyond the stated tolerance.

**Decision table.** Independent units are training runs, not tokens.

| Result pattern | Node state |
| --- | --- |
| The target-distribution check or the gradient-scale check fails | `repairable`, after the user confirms |
| The generic-auxiliary draft gains at least `δ` more than the latent draft, with the interval above zero | `repairable`, after the user confirms: reframe as a regularization claim, and propose a "generic auxiliary loss" `alternative` sibling |
| Latent minus generic-auxiliary acceptance gain ≥ `δ`, with the interval above zero and fidelity loss ≤ `ε` | `supported`, plus child node "latent draft on a small LM" |
| Latent minus generic-auxiliary gain is above zero but its interval stays below `δ`, fidelity loss ≤ `ε` | `supported`, no child node; the experiment conclusion says the gain is identified but below the `δ` gate |
| The interval excludes a gain of `δ` with all checks passing | `dead`, after the user confirms |
| The interval spans zero and `δ`, or the generic loss gains as much | stays `unresolved` |

Once the user settles it, one `meridian.lab_update` change declares it on the
node:

```json
{"op": "record_history", "node_id": "spec-decode.C", "message": "Decision table: validity check fails → repairable; generic−latent ≥ δ, interval > 0 → repairable (reframe) + sibling 'generic auxiliary loss'; latent−generic ≥ δ, interval > 0, fidelity loss ≤ ε → supported + child 'latent draft on a small LM'; latent−generic interval above 0 but below δ → supported, no child; interval excludes δ → dead; interval spans 0 and δ, or generic gains as much → unresolved"}
```

## Hand-off and the experiment conclusion

The Research Grounding Injection carries the four draft arms, the fixed
target, matched capacity, the acceptance metric by position, the training and
confirmation seeds, the compute budget and the table above into the coding
work.

Suppose the runs show a latent gain of `0.4 δ` with an interval spanning zero
and `δ`. That matches the last row. The experiment record's interpretation
names it, the node stays `unresolved`, and the next action is more runs. An
imprecise null is never a kill, and with the node neither `supported` nor
`dead`, no experiment conclusion is recorded.
Had the gain cleared `δ` with every check passing, the third row would set
`supported`, and the experiment conclusion would read "Row 3: the latent draft
beats the matched generic-auxiliary draft by at least δ acceptance on the
synthetic generator".
