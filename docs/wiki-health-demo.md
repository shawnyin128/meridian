# Meridian Wiki Health Demo

Status: draft demo for 0.2.0
Model: `meridian.wiki_health.v0.2.0-draft`
Wiki snapshot: existing `.index` audit/catalog files on 2026-05-26

## Verdict

Health level: `usable_with_warnings`

Overall score: `86 / 100`

The wiki is safe to use for daily research and coding questions, but the current
weak spot is not source integrity. The weak spot is that some compiled knowledge
is still hard to navigate: method/topic aliases overlap, prerequisite concept
coverage is conservative, and one claim still lacks evidence.

## Main Insight

This wiki is not blocked. It is already source-clean and retrieval-ready.

The next improvement should focus on making retrieved context more useful for
research coding:

1. Consolidate overlapping method/topic pages so retrieval does not split the
   same concept across competing nodes.
2. Add prerequisite concepts to high-value method pages so coding/debug queries
   return background mechanisms, not just method summaries.
3. Repair the remaining claim evidence gap so claim-support queries stay
   trustworthy.

## Health Dimensions

Default view should show only the five summary scores. Each dimension expands
on click to reveal deterministic subdimension scores and signals.

- Trust: `97`
  - Sources: `100` - 239 managed sources, 0 missing, 0 SHA mismatch.
  - Provenance: `100` - 0 evidence records without source provenance.
  - Boundaries: `94` - 0 source-quality misuse; source/user/synthesis boundaries hold.
- Surface: `88`
  - Canonical Corpus: `92` - canonical pages are indexed and parseable.
  - Product Boundary: `95` - no `.drafts` / `.versions` leakage detected.
  - Navigation: `78` - 2 paper pages reported with no wikilinks.
- Context: `82`
  - Retrieval Coverage: `90` - corpus includes papers, methods, topics, concepts, claims, evidence, syntheses.
  - Task Usefulness: `78` - coding/debug queries need denser method + concept context.
  - Context Explanation: `80` - why-to-read and repair hints should be stronger.
- Graph: `68`
  - Method/Topic Clarity: `60` - 35 duplicate method/topic alias groups.
  - Concept Coverage: `74` - 31 of 63 methods needing prerequisites have concept links.
  - Claim/Evidence Trace: `90` - 1 claim without evidence; 0 evidence records without source provenance.
  - Stub Suppression: `95` - 0 low-information pages reported.
- Growth: `76`
  - Repair Queue: `82` - findings map to repair buckets and next actions.
  - Synthesis Evolution: `75` - 60 syntheses exist; density still needs task-driven strengthening.
  - Revision Readiness: `72` - proposal/revision path exists.

## Problem Diagnosis

### 1. Knowledge graph has duplicate method/topic aliases

Evidence: 35 duplicate method/topic alias groups.

Why it matters: a method query may scatter across a method page and a topic page
with the same name. That makes retrieval feel less decisive and makes Obsidian
navigation noisier.

Next fix: generate a knowledge repair proposal that decides which pages are
method-family pages, which are topic overview pages, and which backlinks can be
published safely.

### 2. Concept coverage is still conservative

Evidence: 31 of 63 methods that need prerequisite concepts currently have them.

Why it matters: for coding/debug/probe tasks, the user often needs preliminary
mechanisms such as acceptance rate, KV-cache bandwidth, activation outliers, or
calibration sensitivity. A method-only answer can miss the thing needed to write
or debug code.

Next fix: add prerequisite concept links to high-value method-family pages first.

### 3. Claim/evidence traceability has one known gap

Evidence: 1 claim without linked evidence.

Why it matters: claim-support queries should be able to trace from claim to
evidence to source paper. Even one gap should be visible because it affects trust.

Next fix: attach existing source-grounded evidence, or mark the claim as
`needs_evidence`.

### 4. A few paper pages are isolated

Evidence: 2 paper pages reported with no wikilinks.

Why it matters: isolated papers are harder to retrieve through method/topic/
concept paths and are less useful in the Obsidian graph.

Next fix: add low-risk topic, method, and concept backlinks.

## Snapshot Signals

| Signal | Current Value |
|---|---:|
| Managed sources | 239 |
| Missing managed sources | 0 |
| SHA mismatches | 0 |
| Duplicate SHA groups | 0 |
| Papers | 236 |
| Methods | 302 |
| Topics | 91 |
| Concepts | 24 |
| Claims | 1135 |
| Evidence records | 2737 |
| Syntheses | 60 |
| Claims without evidence | 1 |
| Evidence without source provenance | 0 |
| Low-information pages | 0 |
| Duplicate method/topic alias groups | 35 |
| Source-quality misuse | 0 |
| Methods requiring prerequisite concepts | 63 |
| Methods with prerequisite concepts | 31 |

## Scoring Contract Demo

Scores are deterministic. Each question starts at 100 and applies bounded
deductions. Hard failures override score and block release.

Example deductions:

- missing managed source: `-25 each`, max `-75`
- SHA mismatch: `-25 each`, max `-75`
- retrieval returns `.drafts` or `.versions`: hard fail
- source-quality contamination: hard fail
- claim without evidence: `-10 each`, max `-40`
- evidence without source provenance: `-15 each`, max `-60`
- duplicate method/topic alias group: `-1 each`, max `-25`
- missing prerequisite concept coverage: proportional deduction, max `-30`

The overall score is useful for trend comparison only within the same
`health_model_version`.
