# Discriminating Design Checks

Check what the design actually says before presenting it. Each check points at
a concrete repair or an evidence gap; passing them is not evidence that the
design works, so never score yourself.

| Check | What to look for |
| --- | --- |
| Competing explanations | M1 keeps the user's idea; M2 is charitable; M0 is one concrete artifact; assumptions and mixtures are stated. |
| Separation | The prediction matrix holds an intervention and a metric on which the roles differ for a stated reason; unknown and shared predictions are labeled. |
| Substrate | The test keeps the disputed mechanism at the smallest sufficient level and states what it establishes and what it leaves untested. |
| Decision table | Every row is observable and scoped, maps to one node state, and was declared before the deciding run; rows are exclusive or ordered validity, contrast, expansion gate. |
| Evidence ledger | Each statement is `Source-supported` with a Paper Wiki anchor, `Inference`, or `New hypothesis`; missing grounding is visible. |
| Validity | Intervention and evaluator checks, controls, independent units and an uncertainty plan can tell an informative result from an invalid or inconclusive one. |

Strength elsewhere does not offset an unsupported source claim, a broken
intervention or evaluator, a substrate that removes the mechanism, or the
absence of any feasible separation. Repair what the evidence allows; otherwise
present the design as provisional and name the missing condition. Never invent
alternatives, thresholds, results or certainty to pass a check.
