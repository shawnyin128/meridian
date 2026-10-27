# Discriminating Design Framework

Read only the part the current design choice needs.

## Finding M2 and M0

Draw a concrete, charitable M2 or one consequential M0 from these sources:

- **Capacity:** parameters, memory, cache or lookup entries, context length.
- **Compute:** FLOPs, training steps, search, calibration budget.
- **Optimization:** regularization, conditioning, initialization, gradient scale.
- **Data:** leakage, train/test overlap, curriculum, sampling, preprocessing.
- **Measurement:** metric mismatch, evaluator error, extraction failure, truncation.
- **Implementation:** kernels, batching, caching, precision, framework behavior.
- **Selection:** the chosen checkpoints, seeds, tasks, model sizes, workloads.

Name one artifact for M0 rather than folding every failure into an M0 nothing
can falsify. State shared assumptions and possible mixtures. When two
explanations predict the same thing under every feasible intervention, record
that identification gap on the node instead of inventing a difference.

## Fork axes

Vary something that changes the competing predictions:

| Family | Axes |
| --- | --- |
| Data | noise, sample size, shift, latent predictability, imbalance, tails, calibration versus held-out mismatch |
| Model and optimization | size, capacity, budget, initialization, regularization, depth, horizon, bottleneck width, objective weight |
| Representation | information kept or destroyed, local versus global dependence, predictable versus unpredictable factors, token versus sequence targets |
| Systems | batch size, prompt and output length, prefix reuse, arrival rate, prefill/decode balance, compute or memory bound, component versus end-to-end path, cache pressure |
| Time | early versus late training, short versus long rollout, first failure, accumulation, warmup versus steady state |

A useful contrast differs in sign, monotonicity, threshold, localization,
scaling, persistence under a control, temporal order, or failure mode, and has
a stated causal or computational reason. Weigh separation, cost and confounding
separately; never add them into one score. Prefer the contrast that can change
the node's next action within the user's budget.

## Substrate levels

Take the lowest level that keeps the disputed mechanism; this is not a ladder
every node must climb.

- **Analytic:** a construction or counterexample settles possibility,
  impossibility, direction, or non-equivalence under its assumptions.
- **Synthetic:** latent factors and interventions are under control.
- **Isolated component:** an operator, layer, kernel, or state transition
  exposes a local mechanism.
- **Small learned system:** keeps learning dynamics and multistep behavior.
- **Full system:** needed for scale-dependent effects, interactions, hardware
  or workload limits, and external validity. Say why nothing smaller keeps the
  mechanism.

For the chosen level, state what it preserves, removes, establishes, and
leaves untested, and set the expansion gate before spending beyond it.

## Analogy checks

A cross-domain analogy maps variables onto a shared mathematical object,
optimization problem, information constraint, or causal structure, and lists
the assumptions that do not transfer. A mapping that yields no testable
prediction is not a bridge.

- **Objectives and representations:** connect the training objective to the
  metric that matters; test capacity, regularization and optimization as M2.
- **Systems:** name the bottleneck and what changes in bytes, FLOPs, launches,
  synchronization or communication; keep component gains apart from
  end-to-end results on stated hardware and workloads.
- **Causal claims:** separate observation from intervention; look for a
  confounder, a negative control, a mediator, or a predicted temporal order.

Match capacity, compute or workload when that removes an alternative. When the
proposed mediator is the saving itself (less compute, less prefill), measure it
instead of matching it away.

## Decision discipline

- Fix the primary contrast, practical threshold, tolerance, independent unit,
  and uncertainty plan before the deciding run. Tokens or requests inside one
  run are not independent replicates.
- A pilot may estimate variance or feasibility; freeze the table before the
  fresh run that decides the node.
- Call a table preregistered only when it was recorded before the outcome, for
  example as the node's `record_history` line. Otherwise it is a proposed or
  exploratory plan.
- A failed intervention, implementation or evaluator check calls for repair,
  not a mechanistic reading. A null weakens M1 only as far as the test could
  have detected M1's predicted effect.
- Read mixed results conditionally and only within the tested regime. A
  positive result every explanation predicts adds little.
