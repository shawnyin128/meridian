---
type: reference
title: "Research Coding Event Map"
status: draft
created: 2026-05-18
updated: 2026-05-18
tags:
  - research-coding
  - event-map
  - mvp-boundary
confidence: medium
---

# Research Coding Event Map

This document maps common research coding events. It is a boundary reference, not an MVP feature list.

The product should not try to own every event. The highest leverage workflows are the ones that connect paper knowledge, experiment design, execution evidence, and next research decisions.

## Full Event Surface

### 1. Reproduction

- Run an official paper repo and solve dependency, data path, checkpoint, and version issues.
- Reproduce a baseline's reported number and diagnose whether gaps come from code, data, hyperparameters, or hardware.
- Extract a method from another repo and integrate it into the user's experiment framework.
- Compare paper formulas with code to find hidden details.
- Migrate old experiments to a new model, dataset, or evaluation protocol.

### 2. Experiment Design

- Design an ablation matrix from a research question.
- Choose the minimum viable experiment: small model, small data, short run.
- Separate control experiments, main experiments, and sanity checks.
- Define fair comparison constraints: fixed configs versus tunable configs.
- Split a large hypothesis into smaller verifiable experiments.

### 3. Experiment Execution

- Write training, evaluation, and sweep scripts.
- Generate configs for learning rates, seeds, dataset splits, and model variants.
- Write Slurm, bash, Hugging Face Jobs, or local GPU commands.
- Resume checkpoints, rerun failures, and recover partial results.
- Organize output directories to avoid overwriting results or losing configs.

### 4. Debugging

- Fix tensor shape, dtype, and device mismatches.
- Diagnose loss not decreasing, NaNs, exploding gradients, or abnormal metrics.
- Fix batch, sequence length, padding, and mask errors.
- Fix tokenizer, label alignment, and preprocessing issues.
- Resolve distributed training, mixed precision, and checkpoint load problems.
- Align metric implementation with the paper definition.

### 5. Sanity Checks

- Overfit a tiny dataset to check the training loop.
- Run random-label or random-input checks.
- Check train/eval leakage.
- Check metric range, baseline floor, and oracle upper bound.
- Print intermediate activations, logits, attention, and sample predictions.
- Verify a change is actually enabled rather than silently disabled by config.

### 6. Analysis

- Aggregate repeated runs and compute mean, standard deviation, or confidence intervals.
- Plot loss, accuracy, scaling, and ablation curves.
- Compare seed stability.
- Perform error analysis over failed samples, categories, and lengths.
- Analyze why a method works through activations, gradients, representations, clusters, or attention.
- Attribute results to code bug, data difference, hyperparameters, or method behavior.

### 7. Paper Implementation

- Translate equations into PyTorch or JAX code.
- Check reduction order, normalization, and masking.
- Implement a loss, regularizer, quantizer, scheduler, or sampler.
- Split algorithm pseudocode into testable functions.
- Write small unit tests for mathematical properties and edge cases.
- Compare diagonal, full-matrix, and heuristic variants.

### 8. Data

- Download, clean, split, and cache datasets.
- Write dataset loaders, collators, and transforms.
- Check label mappings, imbalance, duplicates, and leakage.
- Generate synthetic data or controlled test cases.
- Visualize data and compute statistics.
- Convert raw data into the training framework format.

### 9. Evaluation

- Write an evaluation harness.
- Align metrics with paper or benchmark definitions.
- Support batch evaluation, multi-checkpoint evaluation, and multi-seed evaluation.
- Generate qualitative examples.
- Handle evaluation speed, memory, OOM, and cache issues.
- Decide whether a metric supports a paper claim.

### 10. Result Recording

- Record config, commit hash, command, environment, and results.
- Extract core conclusions from logs, W&B, TensorBoard, or CSV.
- Generate an experiment note: purpose, setup, result, interpretation, next step.
- Mark failed experiments with why they failed and whether they should be rerun.
- Build result tables so completed runs are not forgotten.
- Turn temporary exploration into paper or appendix tables.

### 11. Research Decisions

- Decide the next experiment after a round of results.
- Decide whether a direction should stop.
- Decide whether results support a hypothesis.
- Decide which control or ablation is missing.
- Decide whether evidence is enough for a paper claim.
- Separate "engineering is not tuned" from "the idea is false."

### 12. Repo Organization

- Turn temporary code into reusable experiment modules.
- Remove obsolete scripts and merge duplicate logic.
- Convert notebooks into scripts.
- Replace hardcoded paths and configs with parameters.
- Add READMEs and command examples for future experiments.

This category is closest to normal software development. Keep its MVP boundary narrow.

## MVP High-Leverage Workflows

The MVP should prioritize five workflows:

1. **Experiment design**: turn a hypothesis into the smallest useful experiment.
2. **Sanity check**: prevent wasting GPU on broken code or invalid metrics.
3. **Result interpretation**: turn run output into a next research decision.
4. **Experiment memory**: record what ran, why it ran, what it showed, and what to do next.
5. **Reproduction diagnosis**: explain why paper, code, and reported numbers do not match.

These workflows are high leverage because they sit at the knowledge bottleneck between paper understanding, code execution, and research decisions.

## Non-MVP Defaults

Do not make the first version own every script-writing, data-cleaning, debugging, or repo-cleanup task. These can be supported when they serve a high-leverage workflow, but they should not define the product.
