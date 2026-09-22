# Adjudication Eval — baseline

- Items evaluated: 35
- Refute-recall@k: 0.743
- Prior-work-recall@k: n/a
- Corroborating-recall@k: n/a
- False-comfort rate: n/a

## Corpus negativity census

- Negative sections scanned: 580
- Substantive negatives: 35
- Boilerplate/empty: 545
- Substantive ratio: 0.060

> If the substantive ratio is near zero, the REFUTED gap is extraction-bound:
> Phase 1 retrieval alone cannot surface negatives the corpus never captured.

## How to read refute-recall

Bootstrap items derive each idea from a page's own title, then check whether
retrieval returns that same page. Bootstrap refute-recall is therefore a LEXICAL
SELF-RETRIEVAL ceiling, NOT the safety-net capability. The real capability
(an idea in your own words -> the page that refutes it) is measured only by the
hand-labeled gold set and the false-comfort rate, which stay n/a until gold ideas exist.

Refute-recall by label source:
- bootstrap: 0.743 (n=35)
