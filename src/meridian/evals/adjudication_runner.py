from __future__ import annotations

import json
from pathlib import Path

from meridian.evals.adjudication_baseline import baseline_adjudicate
from meridian.evals.adjudication_census import corpus_negativity_census
from meridian.evals.adjudication_dataset import dump_dataset, load_dataset
from meridian.evals.adjudication_metrics import evaluate
from meridian.evals.adjudication_miner import mine_bootstrap_items


def _fmt(value) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def render_summary(report: dict, census: dict) -> str:
    lines = [
        "# Adjudication Eval — baseline",
        "",
        f"- Items evaluated: {report['item_count']}",
        f"- Refute-recall@k: {_fmt(report['refute_recall'])}",
        f"- Prior-work-recall@k: {_fmt(report['prior_work_recall'])}",
        f"- Corroborating-recall@k: {_fmt(report['corroborating_recall'])}",
        f"- False-comfort rate: {_fmt(report['false_comfort_rate'])}",
        "",
        "## Corpus negativity census",
        "",
        f"- Negative sections scanned: {census['sections_scanned']}",
        f"- Substantive negatives: {census['substantive_negative']}",
        f"- Boilerplate/empty: {census['boilerplate']}",
        f"- Substantive ratio: {_fmt(census['substantive_ratio'])}",
        "",
        "> If the substantive ratio is near zero, the REFUTED gap is extraction-bound:",
        "> Phase 1 retrieval alone cannot surface negatives the corpus never captured.",
    ]
    lines += [
        "",
        "## How to read refute-recall",
        "",
        "Bootstrap items derive each idea from a page's own title, then check whether",
        "retrieval returns that same page. Bootstrap refute-recall is therefore a LEXICAL",
        "SELF-RETRIEVAL ceiling, NOT the safety-net capability. The real capability",
        "(an idea in your own words -> the page that refutes it) is measured only by the",
        "hand-labeled gold set and the false-comfort rate, which stay n/a until gold ideas exist.",
        "",
        "Refute-recall by label source:",
    ]
    by_source = report.get("refute_recall_by_source", {})
    counts = report.get("item_count_by_source", {})
    for source in sorted(by_source):
        lines.append(f"- {source}: {_fmt(by_source[source])} (n={counts.get(source, 0)})")
    return "\n".join(lines) + "\n"


def run_adjudication_eval(*, wiki_root: Path, out_dir: Path, gold_path=None, top_k: int = 6,
                          bootstrap_limit=None, adapter=baseline_adjudicate) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    items = mine_bootstrap_items(wiki_root, limit=bootstrap_limit)
    if gold_path is not None:
        items = items + load_dataset(Path(gold_path))
    dump_dataset(items, out_dir / "dataset.jsonl")

    predictions = {item.id: adapter(item.idea, wiki_root, top_k=top_k) for item in items}
    report = evaluate(items, predictions)
    census = corpus_negativity_census(wiki_root)
    report["census"] = census

    (out_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (out_dir / "summary.md").write_text(render_summary(report, census), encoding="utf-8")
    return report
