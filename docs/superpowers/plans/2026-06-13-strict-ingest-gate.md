# Strict Ingest Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Paper Wiki ingest quarantine-first so canonical `wiki/papers/` publication requires an explicit source-fidelity pass, and strict health/retrieval treat unverified pages as unsafe.

**Architecture:** Add a focused `source_fidelity` module that validates source-fidelity result JSON, prepares agent-executed packets, and aggregates publication decisions. Change `flow` so `run_ingest` is draft-only first, then publish only after deterministic gates and source-fidelity pass; extend health and retrieval trust filtering around `validation_state` and `trust_state`.

**Tech Stack:** Python stdlib, existing Meridian CLI modules under `src/meridian/wiki/`, Markdown/YAML-ish frontmatter helpers, `unittest` test suite in `tests/test_cli.py`.

---

## File Structure

- Create `src/meridian/wiki/source_fidelity.py`: source-fidelity packet/result schema, result validation, publish decision aggregation, and manifest payload helpers.
- Modify `src/meridian/wiki/flow.py`: run ingest in draft-only mode first, run checks, read source-fidelity result if supplied, publish only after all gates pass, and record blocked outcomes.
- Modify `src/meridian/wiki/commands.py`: pass source-fidelity result/backend options through the command wrapper.
- Modify `src/meridian/cli.py`: add CLI options, update flow summary, and update publish-mode help text.
- Modify `src/meridian/wiki/health.py`: add strict trust-state audit over canonical paper pages.
- Modify `src/meridian/wiki/corpus.py`: filter untrusted pages from normal retrieval while allowing cleanup/source-quality queries to see cleanup material.
- Modify `tests/test_cli.py`: add unit and CLI coverage for source-fidelity schema, blocked publish, pass publish, manual override, strict health, and retrieval filtering.
- Modify docs/skills after code behavior is stable: `README.md`, `docs/mvp-paper-wiki-workflow.md`, `.codex/skills/paper-ingest/SKILL.md`, `.codex/skills/llm-wiki/SKILL.md`, and plugin wiki skill copies if they mention ingest completion behavior.

## Task 1: Source-Fidelity Contract

**Files:**
- Create: `src/meridian/wiki/source_fidelity.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Add failing tests for source-fidelity result validation**

Add imports near existing wiki imports in `tests/test_cli.py`:

```python
from meridian.wiki.source_fidelity import (
    SourceFidelityResult,
    decide_publish,
    load_source_fidelity_result,
)
```

Add tests to `CliTests`:

```python
    def test_source_fidelity_result_requires_core_statement_support(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source-fidelity-result.json"
            path.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "The method rotates activations before quantization.",
                                "role": "source_fact",
                                "core": True,
                                "verdict": "supported",
                                "support": [{"page": 2, "excerpt": "rotates activations before quantization"}],
                                "repair_bucket": "none",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = load_source_fidelity_result(path)

            self.assertEqual(result.decision, "pass")
            self.assertEqual(result.weighted_score, 4.8)
            self.assertEqual(result.blocking_findings, [])

    def test_source_fidelity_result_blocks_unsupported_core_statement(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source-fidelity-result.json"
            path.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "The paper proves lossless compression.",
                                "role": "source_fact",
                                "core": True,
                                "verdict": "unsupported",
                                "support": [],
                                "repair_bucket": "paper_model_extraction",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = load_source_fidelity_result(path)

            self.assertEqual(result.decision, "fail")
            self.assertEqual(result.blocking_findings[0]["rule_id"], "unsupported_core_statement")

    def test_publish_decision_requires_quality_structural_and_source_fidelity_pass(self) -> None:
        source = SourceFidelityResult(
            path=Path("source-fidelity-result.json"),
            decision="pass",
            weighted_score=4.7,
            blocking_findings=[],
        )

        decision = decide_publish(
            quality_gate_decision="pass",
            quality_self_check_decision="pass",
            quality_self_check_score=4.7,
            structural_self_check_decision="pass",
            structural_self_check_score=4.7,
            source_fidelity=source,
            publish_mode="auto",
        )

        self.assertEqual(decision.decision, "published")
        self.assertEqual(decision.reason, "all_required_gates_passed")
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_source_fidelity_result_requires_core_statement_support tests.test_cli.CliTests.test_source_fidelity_result_blocks_unsupported_core_statement tests.test_cli.CliTests.test_publish_decision_requires_quality_structural_and_source_fidelity_pass
```

Expected: import fails because `meridian.wiki.source_fidelity` does not exist.

- [ ] **Step 3: Implement `source_fidelity.py`**

Create `src/meridian/wiki/source_fidelity.py`:

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "paper_wiki_source_fidelity_result.v0"
PACKET_SCHEMA_VERSION = "paper_wiki_source_fidelity_packet.v0"

SUPPORTED_VERDICTS = {"supported", "unsupported", "contradicted", "insufficient_context"}
SUPPORTED_ROLES = {"source_fact", "wiki_synthesis", "uncertainty", "user_insight"}


@dataclass(frozen=True)
class SourceFidelityResult:
    path: Path
    decision: str
    weighted_score: float
    blocking_findings: list[dict[str, Any]]


@dataclass(frozen=True)
class PublishDecision:
    decision: str
    reason: str
    review_state: str
    validation_state: str
    trust_state: str
    blocking_findings: list[dict[str, Any]]


def load_source_fidelity_result(path: Path) -> SourceFidelityResult:
    payload = _read_json(path)
    findings = _validate_payload(payload)
    statement_findings = _statement_blocking_findings(payload)
    blocking = findings + statement_findings
    raw_decision = str(payload.get("decision") or "fail")
    decision = "fail" if blocking or raw_decision == "fail" else raw_decision
    if decision not in {"pass", "needs_review", "fail"}:
        blocking.append(_blocking("invalid_decision", f"decision={decision}", "source_fidelity_schema"))
        decision = "fail"
    return SourceFidelityResult(
        path=path,
        decision=decision,
        weighted_score=float(payload.get("weighted_score") or 1.0),
        blocking_findings=blocking,
    )


def missing_source_fidelity_result(expected_path: Path) -> SourceFidelityResult:
    return SourceFidelityResult(
        path=expected_path,
        decision="needs_review",
        weighted_score=1.0,
        blocking_findings=[
            _blocking(
                "missing_source_fidelity_result",
                str(expected_path),
                "source_fidelity_review",
            )
        ],
    )


def decide_publish(
    *,
    quality_gate_decision: str,
    quality_self_check_decision: str,
    quality_self_check_score: float,
    structural_self_check_decision: str,
    structural_self_check_score: float,
    source_fidelity: SourceFidelityResult,
    publish_mode: str,
) -> PublishDecision:
    if publish_mode == "always":
        return PublishDecision(
            decision="published",
            reason="manual_override_publish_mode_always",
            review_state="human_overrode_gate",
            validation_state="source_fidelity_not_passed",
            trust_state="manual_override",
            blocking_findings=source_fidelity.blocking_findings,
        )

    findings: list[dict[str, Any]] = []
    if quality_gate_decision != "pass":
        findings.append(_blocking("quality_gate_not_pass", quality_gate_decision, "quality_gate"))
    if quality_self_check_decision != "pass" or quality_self_check_score < 4.25:
        findings.append(
            _blocking(
                "quality_self_check_not_pass",
                f"{quality_self_check_decision}:{quality_self_check_score:.3f}",
                "quality_self_check",
            )
        )
    if structural_self_check_decision != "pass" or structural_self_check_score < 4.25:
        findings.append(
            _blocking(
                "structural_self_check_not_pass",
                f"{structural_self_check_decision}:{structural_self_check_score:.3f}",
                "structural_self_check",
            )
        )
    if source_fidelity.decision != "pass":
        findings.append(
            _blocking(
                "source_fidelity_not_pass",
                source_fidelity.decision,
                "source_fidelity_review",
            )
        )
    findings.extend(source_fidelity.blocking_findings)

    if findings:
        return PublishDecision(
            decision="blocked",
            reason=str(findings[0]["rule_id"]),
            review_state="needs_review",
            validation_state="source_fidelity_not_passed",
            trust_state="quarantined",
            blocking_findings=findings,
        )

    return PublishDecision(
        decision="published",
        reason="all_required_gates_passed",
        review_state="auto_converged",
        validation_state="source_fidelity_pass",
        trust_state="source_verified",
        blocking_findings=[],
    )


def build_source_fidelity_packet(*, run_manifest: Path, out_path: Path) -> Path:
    run = _read_json(run_manifest)
    artifacts = dict(run.get("draft_artifacts") or {})
    paper_path = Path(str(artifacts.get("paper_page") or run.get("paper_page") or ""))
    pages_path = Path(str(run.get("extraction_dir") or "")) / "pages.jsonl"
    packet = [
        "# Paper Wiki Source-Fidelity Packet",
        "",
        f"Schema version: `{PACKET_SCHEMA_VERSION}`",
        "",
        "Judge whether the generated paper candidate is faithful to the source excerpts.",
        "Return JSON matching `paper_wiki_source_fidelity_result.v0`.",
        "",
        "## Run Context",
        "",
        _fenced("json", json.dumps({"title": run.get("title"), "run_manifest": str(run_manifest)}, indent=2)),
        "",
        "## paper.md",
        "",
        _fenced("markdown", paper_path.read_text(encoding="utf-8") if paper_path.exists() else ""),
        "",
        "## Source Pages",
        "",
        _fenced("jsonl", pages_path.read_text(encoding="utf-8") if pages_path.exists() else ""),
        "",
        "## Required Result Shape",
        "",
        _fenced(
            "json",
            json.dumps(
                {
                    "schema_version": SCHEMA_VERSION,
                    "agent": "source_fidelity",
                    "decision": "pass | needs_review | fail",
                    "weighted_score": 1.0,
                    "statements": [],
                    "hard_failures": [],
                    "recommended_repairs": [],
                },
                indent=2,
            ),
        ),
    ]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(packet).rstrip() + "\n", encoding="utf-8")
    return out_path


def source_fidelity_manifest_payload(result: SourceFidelityResult, decision: PublishDecision) -> dict[str, Any]:
    return {
        "schema_version": "paper_wiki_source_fidelity_gate.v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "result_path": str(result.path),
        "decision": result.decision,
        "weighted_score": round(result.weighted_score, 3),
        "publish_decision": decision.decision,
        "block_reason": decision.reason if decision.decision == "blocked" else None,
        "blocking_findings": decision.blocking_findings,
    }


def _validate_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    findings = []
    for field in ("schema_version", "agent", "decision", "weighted_score", "statements"):
        if field not in payload:
            findings.append(_blocking("missing_field", field, "source_fidelity_schema"))
    if payload.get("schema_version") != SCHEMA_VERSION:
        findings.append(_blocking("unexpected_schema_version", str(payload.get("schema_version")), "source_fidelity_schema"))
    if payload.get("agent") != "source_fidelity":
        findings.append(_blocking("unexpected_agent", str(payload.get("agent")), "source_fidelity_schema"))
    if not isinstance(payload.get("statements"), list):
        findings.append(_blocking("statements_not_list", type(payload.get("statements")).__name__, "source_fidelity_schema"))
    return findings


def _statement_blocking_findings(payload: dict[str, Any]) -> list[dict[str, Any]]:
    findings = []
    for index, statement in enumerate(payload.get("statements") or [], start=1):
        if not isinstance(statement, dict):
            findings.append(_blocking("statement_not_object", f"index={index}", "source_fidelity_schema"))
            continue
        role = str(statement.get("role") or "")
        verdict = str(statement.get("verdict") or "")
        core = bool(statement.get("core"))
        support = statement.get("support")
        if role not in SUPPORTED_ROLES:
            findings.append(_blocking("invalid_statement_role", role, "source_fidelity_schema"))
        if verdict not in SUPPORTED_VERDICTS:
            findings.append(_blocking("invalid_statement_verdict", verdict, "source_fidelity_schema"))
        if core and verdict != "supported":
            findings.append(
                _blocking(
                    f"{verdict or 'invalid'}_core_statement",
                    str(statement.get("statement") or statement.get("statement_id") or index),
                    str(statement.get("repair_bucket") or "source_fidelity_review"),
                )
            )
        if core and verdict == "supported" and not isinstance(support, list):
            findings.append(_blocking("supported_core_statement_missing_support", str(statement.get("statement_id") or index), "source_fidelity_schema"))
    return findings


def _blocking(rule_id: str, evidence: str, repair_bucket: str) -> dict[str, Any]:
    return {"rule_id": rule_id, "evidence": evidence, "repair_bucket": repair_bucket}


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def _fenced(language: str, content: str) -> str:
    return f"```{language}\n{content.rstrip()}\n```"
```

- [ ] **Step 4: Run tests to verify Task 1 passes**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_source_fidelity_result_requires_core_statement_support tests.test_cli.CliTests.test_source_fidelity_result_blocks_unsupported_core_statement tests.test_cli.CliTests.test_publish_decision_requires_quality_structural_and_source_fidelity_pass
```

Expected: all three tests pass.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add src/meridian/wiki/source_fidelity.py tests/test_cli.py
git commit -m "feat(wiki): add source fidelity gate contract"
```

## Task 2: Quarantine-First Flow Publication

**Files:**
- Modify: `src/meridian/wiki/flow.py`
- Modify: `src/meridian/wiki/commands.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Add failing CLI tests for blocked default flow and pass-with-result flow**

Add tests to `CliTests`:

```python
    def test_wiki_flow_blocks_publish_without_source_fidelity_result(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            rubric = root / "rubric.md"
            rubric.write_text("# Rubric\n", encoding="utf-8")
            out = wiki_root / ".drafts/ingests/fake-flow"

            exit_code = main(
                [
                    "wiki",
                    "flow",
                    str(pdf),
                    "--out",
                    str(out),
                    "--wiki-root",
                    str(wiki_root),
                    "--rubric",
                    str(rubric),
                    "--overwrite",
                    "--no-auto-commit",
                ]
            )

            self.assertEqual(exit_code, 0)
            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            run = json.loads((out / "run.json").read_text(encoding="utf-8"))
            self.assertEqual(flow["publish_decision"], "blocked")
            self.assertEqual(run["canonical_wiki_mutated"], False)
            self.assertFalse((wiki_root / "papers/Fake-Research-Paper.md").exists())

    def test_wiki_flow_publishes_with_passing_source_fidelity_result(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            rubric = root / "rubric.md"
            rubric.write_text("# Rubric\n", encoding="utf-8")
            result = root / "source-fidelity-result.json"
            result.write_text(
                json.dumps(
                    {
                        "schema_version": "paper_wiki_source_fidelity_result.v0",
                        "agent": "source_fidelity",
                        "decision": "pass",
                        "weighted_score": 4.8,
                        "statements": [
                            {
                                "statement_id": "stmt-1",
                                "statement": "This paper studies a useful method.",
                                "role": "source_fact",
                                "core": True,
                                "verdict": "supported",
                                "support": [{"page": 1, "excerpt": "This paper studies a useful method."}],
                                "repair_bucket": "none",
                            }
                        ],
                        "hard_failures": [],
                        "recommended_repairs": [],
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            out = wiki_root / ".drafts/ingests/fake-flow"

            exit_code = main(
                [
                    "wiki",
                    "flow",
                    str(pdf),
                    "--out",
                    str(out),
                    "--wiki-root",
                    str(wiki_root),
                    "--rubric",
                    str(rubric),
                    "--source-fidelity-result",
                    str(result),
                    "--overwrite",
                    "--no-auto-commit",
                ]
            )

            self.assertEqual(exit_code, 0)
            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            self.assertEqual(flow["publish_decision"], "published")
            canonical = Path(flow["product_artifacts"]["canonical_paper_page"])
            self.assertTrue(canonical.exists())
            text = canonical.read_text(encoding="utf-8")
            self.assertIn('validation_state: "source_fidelity_pass"', text)
            self.assertIn('trust_state: "source_verified"', text)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_wiki_flow_blocks_publish_without_source_fidelity_result tests.test_cli.CliTests.test_wiki_flow_publishes_with_passing_source_fidelity_result
```

Expected: CLI rejects `--source-fidelity-result` and/or publishes before source-fidelity gate.

- [ ] **Step 3: Update `run_wiki_flow` signature and imports**

In `src/meridian/wiki/flow.py`, add imports:

```python
from meridian.wiki.publish import publish_canonical_draft
from meridian.wiki.source_fidelity import (
    SourceFidelityResult,
    build_source_fidelity_packet,
    decide_publish,
    load_source_fidelity_result,
    missing_source_fidelity_result,
    source_fidelity_manifest_payload,
)
```

Change `run_wiki_flow` signature:

```python
def run_wiki_flow(
    *,
    pdf_path: Path,
    out_dir: Path,
    wiki_root: Path,
    rubric_path: Path,
    title_override: str | None = None,
    overwrite: bool = False,
    publish_mode: str = "auto",
    case_path: Path | None = None,
    judge_result_path: Path | None = None,
    render_page_images: bool = True,
    source_root: Path | None = None,
    source_fidelity_result_path: Path | None = None,
) -> WikiFlowResult:
```

- [ ] **Step 4: Make ingest draft-only inside flow**

In `run_wiki_flow`, change the `run_ingest` call to:

```python
    ingest_result: IngestResult = run_ingest(
        pdf_path=pdf_path,
        out_dir=out_dir,
        title_override=title_override,
        overwrite=overwrite,
        wiki_root=wiki_root,
        source_root=source_root,
        publish_mode="never",
        render_page_images=render_page_images,
    )
```

- [ ] **Step 5: Add source-fidelity packet/result and publish decision**

After `structural_self_check` is created, insert:

```python
    source_fidelity_packet_path = build_source_fidelity_packet(
        run_manifest=ingest_result.run_path,
        out_path=out_dir / "source-fidelity-packet.md",
    )
    expected_source_fidelity_result = source_fidelity_result_path or out_dir / "source-fidelity-result.json"
    source_fidelity: SourceFidelityResult = (
        load_source_fidelity_result(source_fidelity_result_path)
        if source_fidelity_result_path is not None
        else missing_source_fidelity_result(expected_source_fidelity_result)
    )
    publish_decision = decide_publish(
        quality_gate_decision=ingest_result.quality_gate.decision,
        quality_self_check_decision=quality_self_check.decision,
        quality_self_check_score=quality_self_check.weighted_score,
        structural_self_check_decision=structural_self_check.decision,
        structural_self_check_score=structural_self_check.weighted_score,
        source_fidelity=source_fidelity,
        publish_mode=publish_mode,
    )
```

- [ ] **Step 6: Publish only after gate decision**

Before `flow_path = out_dir / "flow.json"`, add:

```python
    publish_result = None
    if publish_decision.decision == "published":
        run_snapshot = _read_json(ingest_result.run_path)
        source_pdf = Path(str(run_snapshot.get("source_pdf") or pdf_path))
        publish_result = publish_canonical_draft(
            wiki_root=wiki_root,
            title=str(run_snapshot.get("title") or title_override or pdf_path.stem),
            source_pdf=source_pdf,
            draft_paper_path=ingest_result.paper_path,
            draft_out_dir=out_dir,
            quality_gate=ingest_result.quality_gate,
            created_date=datetime.now(timezone.utc).date().isoformat(),
            overwrite=overwrite,
        )
```

Then update the canonical text state immediately after publish:

```python
    if publish_result is not None:
        text = publish_result.paper_path.read_text(encoding="utf-8")
        text = _replace_or_insert_frontmatter_field(text, "review_state", publish_decision.review_state)
        text = _replace_or_insert_frontmatter_field(text, "validation_state", publish_decision.validation_state)
        text = _replace_or_insert_frontmatter_field(text, "trust_state", publish_decision.trust_state)
        publish_result.paper_path.write_text(text, encoding="utf-8")
```

- [ ] **Step 7: Update `run_payload` and flow payload**

After `run_payload = _read_json(ingest_result.run_path)`, update it before writing:

```python
    if publish_result is not None:
        run_payload["canonical_artifacts"] = {
            "paper_page": str(publish_result.paper_path),
            "index": str(publish_result.index_path),
            "log": str(publish_result.log_path),
        }
        run_payload["product_artifacts"]["canonical_paper_page"] = str(publish_result.paper_path)
        run_payload["product_artifacts"]["wiki_index"] = str(publish_result.index_path)
        run_payload["product_artifacts"]["wiki_log"] = str(publish_result.log_path)
        run_payload["canonical_wiki_mutated"] = True
    else:
        run_payload["canonical_wiki_mutated"] = False
    run_payload["publish_decision"] = publish_decision.decision
    run_payload["block_reason"] = publish_decision.reason if publish_decision.decision == "blocked" else None
    run_payload["source_fidelity_gate"] = source_fidelity_manifest_payload(source_fidelity, publish_decision)
```

Add validation artifacts:

```python
        "source_fidelity_packet": str(source_fidelity_packet_path),
        "source_fidelity_result": str(source_fidelity.path),
```

Add flow fields:

```python
        "source_fidelity_packet": str(source_fidelity_packet_path),
        "source_fidelity_result": str(source_fidelity.path),
        "source_fidelity_decision": source_fidelity.decision,
        "source_fidelity_score": round(source_fidelity.weighted_score, 3),
        "publish_decision": publish_decision.decision,
        "block_reason": publish_decision.reason if publish_decision.decision == "blocked" else None,
        "blocking_findings": publish_decision.blocking_findings,
```

- [ ] **Step 8: Avoid post-publish deterministic state overwrite for blocked runs**

Replace:

```python
    deterministic_review_state = _apply_deterministic_review_state(...)
```

with:

```python
    deterministic_review_state = (
        _apply_deterministic_review_state(
            run_manifest=ingest_result.run_path,
            quality_self_check=quality_self_check,
            structural_self_check=structural_self_check,
        )
        if publish_result is not None
        else "source_fidelity_blocked"
    )
```

- [ ] **Step 9: Thread source-fidelity argument through `commands.run_flow`**

In `src/meridian/wiki/commands.py`, change `run_flow` signature:

```python
def run_flow(
    *,
    pdf_path: Path,
    out_dir: Path,
    wiki_root: Path,
    rubric_path: Path,
    title_override: str | None = None,
    overwrite: bool = False,
    publish_mode: str = "auto",
    case_path: Path | None = None,
    judge_result_path: Path | None = None,
    render_page_images: bool = True,
    source_root: Path | None = None,
    source_fidelity_result_path: Path | None = None,
) -> WikiFlowResult:
```

Pass it through:

```python
        source_fidelity_result_path=source_fidelity_result_path,
```

- [ ] **Step 10: Run tests to verify Task 2 passes**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_wiki_flow_blocks_publish_without_source_fidelity_result tests.test_cli.CliTests.test_wiki_flow_publishes_with_passing_source_fidelity_result
```

Expected: both tests pass.

- [ ] **Step 11: Commit Task 2**

Run:

```powershell
git add src/meridian/wiki/flow.py src/meridian/wiki/commands.py tests/test_cli.py
git commit -m "feat(wiki): gate flow publication on source fidelity"
```

## Task 3: CLI Surface and Product Output

**Files:**
- Modify: `src/meridian/cli.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Add failing tests for CLI output**

Add tests:

```python
    def test_wiki_flow_output_reports_blocked_publish_decision(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            rubric = root / "rubric.md"
            rubric.write_text("# Rubric\n", encoding="utf-8")
            out = wiki_root / ".drafts/ingests/fake-flow"

            exit_code, stdout, stderr = _run_cli_capture(
                [
                    "wiki",
                    "flow",
                    str(pdf),
                    "--out",
                    str(out),
                    "--wiki-root",
                    str(wiki_root),
                    "--rubric",
                    str(rubric),
                    "--overwrite",
                    "--no-auto-commit",
                ]
            )

            self.assertEqual(exit_code, 0, stderr)
            self.assertIn("Publish decision: blocked", stdout)
            self.assertIn("Block reason:", stdout)
            self.assertIn("Source-fidelity packet:", stdout)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_wiki_flow_output_reports_blocked_publish_decision
```

Expected: output lacks publish decision/source-fidelity packet.

- [ ] **Step 3: Add CLI argument**

In `build_parser()` under the `flow` parser, add:

```python
    flow.add_argument(
        "--source-fidelity-result",
        type=Path,
        default=None,
        help="Optional source-fidelity result JSON. Without this, strict auto publish blocks and writes a packet.",
    )
```

Update `flow.add_argument("--publish-mode"...` help:

```python
        help=(
            "Canonical publish policy. 'auto' publishes only after deterministic checks "
            "and source-fidelity pass; 'always' is a manual override and records untrusted state."
        ),
```

- [ ] **Step 4: Pass CLI argument to `run_flow`**

In `main()`, update the `run_flow` call:

```python
                source_fidelity_result_path=args.source_fidelity_result,
```

- [ ] **Step 5: Update flow summary**

In `_print_flow_summary`, add after review state:

```python
    print(f"Publish decision: {flow.get('publish_decision') or run.get('publish_decision') or 'unknown'}")
    if flow.get("block_reason") or run.get("block_reason"):
        print(f"Block reason: {flow.get('block_reason') or run.get('block_reason')}")
    if flow.get("source_fidelity_packet"):
        print(f"Source-fidelity packet: {flow['source_fidelity_packet']}")
```

- [ ] **Step 6: Run CLI output test**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_wiki_flow_output_reports_blocked_publish_decision
```

Expected: test passes.

- [ ] **Step 7: Commit Task 3**

Run:

```powershell
git add src/meridian/cli.py tests/test_cli.py
git commit -m "feat(cli): surface strict ingest publish decisions"
```

## Task 4: Strict Health Trust-State Audit

**Files:**
- Modify: `src/meridian/wiki/health.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Add failing strict health test**

Add test:

```python
    def test_wiki_health_strict_blocks_unverified_canonical_paper(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wiki_root = Path(tmp) / "wiki"
            _write_test_paper(
                wiki_root / "papers/Unverified.md",
                title="Unverified Paper",
                aliases=["Unverified"],
                topics=["agent workflow"],
                methods=["agent workflow acceleration"],
                settings=["agent workflow"],
                body_sections={
                    "Mechanism": "Provenance: p. 1. The generated page claims a mechanism.",
                    "Evidence Map": "Provenance: p. 2. Evidence is listed.",
                },
                review_state="needs_review",
                quality_gate="pass",
            )

            report = Path(tmp) / "health.json"
            exit_code = main(["wiki", "health", "--wiki-root", str(wiki_root), "--profile", "strict", "--out", str(report)])

            self.assertEqual(exit_code, 1)
            payload = json.loads(report.read_text(encoding="utf-8"))
            codes = {item["code"] for item in payload["hard_failures"]}
            self.assertIn("unverified_canonical_paper", codes)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_wiki_health_strict_blocks_unverified_canonical_paper
```

Expected: strict health does not yet flag unverified canonical pages.

- [ ] **Step 3: Add canonical trust audit helper**

In `src/meridian/wiki/health.py`, add import:

```python
from meridian.wiki.corpus import parse_frontmatter
```

Add helper:

```python
def _canonical_trust_findings(*, wiki_root: Path) -> list[dict[str, Any]]:
    findings = []
    papers_dir = wiki_root / "papers"
    if not papers_dir.exists():
        return findings
    for path in sorted(papers_dir.glob("*.md")):
        frontmatter = parse_frontmatter(path.read_text(encoding="utf-8"))
        review_state = str(frontmatter.get("review_state") or "")
        validation_state = str(frontmatter.get("validation_state") or "")
        trust_state = str(frontmatter.get("trust_state") or "")
        if validation_state != "source_fidelity_pass" or trust_state != "source_verified":
            findings.append(
                {
                    "code": "unverified_canonical_paper",
                    "path": str(path),
                    "review_state": review_state,
                    "validation_state": validation_state,
                    "trust_state": trust_state,
                    "message": "Canonical paper is missing source-fidelity verified trust state.",
                }
            )
        if review_state == "needs_review":
            findings.append(
                {
                    "code": "needs_review_canonical_paper",
                    "path": str(path),
                    "review_state": review_state,
                    "message": "Canonical paper still requires review.",
                }
            )
    return findings
```

- [ ] **Step 4: Wire trust findings into health inputs and hard failures**

In `run_wiki_health`, add to `inputs`:

```python
        "canonical_trust": {"findings": _canonical_trust_findings(wiki_root=wiki_root)},
```

In `_hard_failures`, add:

```python
    for finding in inputs.get("canonical_trust", {}).get("findings") or []:
        if finding.get("code") in {"unverified_canonical_paper", "needs_review_canonical_paper"}:
            failures.append({"code": finding["code"], "message": finding["message"], "path": finding["path"]})
```

In `_repair_queue`, add near the top:

```python
    trust_findings = list(inputs.get("canonical_trust", {}).get("findings") or [])
    if trust_findings:
        queue.insert(
            0,
            _repair(
                "Quarantine or recheck unverified canonical paper pages",
                "source_fidelity_review",
                "critical",
                f"{len(trust_findings)} canonical trust-state findings.",
                "Re-run source-fidelity review and publish only pages with source_fidelity_pass.",
            ),
        )
```

- [ ] **Step 5: Run strict health test**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_wiki_health_strict_blocks_unverified_canonical_paper
```

Expected: test passes.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add src/meridian/wiki/health.py tests/test_cli.py
git commit -m "feat(wiki): audit canonical source fidelity health"
```

## Task 5: Retrieval Trust Filtering

**Files:**
- Modify: `src/meridian/wiki/corpus.py`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Add failing retrieval trust-filter test**

Add test:

```python
    def test_retrieval_excludes_unverified_papers_from_scientific_queries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            wiki_root = Path(tmp) / "wiki"
            _write_test_paper(
                wiki_root / "papers/Verified.md",
                title="Verified Paper",
                aliases=["Verified"],
                topics=["agent workflow"],
                methods=["agent workflow acceleration"],
                settings=["agent workflow"],
                body_sections={"Mechanism": "Verified agent workflow mechanism."},
                review_state="auto_converged",
                quality_gate="pass",
            )
            _prepend_frontmatter_field(
                wiki_root / "papers/Verified.md",
                'validation_state: "source_fidelity_pass"\ntrust_state: "source_verified"',
            )
            _write_test_paper(
                wiki_root / "papers/Unverified.md",
                title="Unverified Paper",
                aliases=["Unverified"],
                topics=["agent workflow"],
                methods=["agent workflow acceleration"],
                settings=["agent workflow"],
                body_sections={"Mechanism": "Unverified agent workflow mechanism."},
                review_state="needs_review",
                quality_gate="pass",
            )

            result = retrieve_papers(
                query="agent workflow mechanism evidence",
                wiki_root=wiki_root,
                top_k=5,
                strategy="v1",
            )

            paths = {item["relative_path"] for item in result.results}
            self.assertIn("papers/Verified.md", paths)
            self.assertNotIn("papers/Unverified.md", paths)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_retrieval_excludes_unverified_papers_from_scientific_queries
```

Expected: unverified page appears in retrieval results.

- [ ] **Step 3: Add trust filter helpers**

In `src/meridian/wiki/corpus.py`, add:

```python
def _is_cleanup_query(query_analysis: dict[str, Any]) -> bool:
    return bool(query_analysis.get("source_quality_query"))


def _is_scientific_trustworthy(record: dict[str, Any]) -> bool:
    if record.get("corpus_type") != "papers":
        return True
    if record.get("review_state") == "source_quality_hold":
        return False
    return (
        record.get("validation_state") == "source_fidelity_pass"
        and record.get("trust_state") == "source_verified"
        and record.get("review_state") != "needs_review"
    )
```

- [ ] **Step 4: Filter normalized catalog before scoring**

In `retrieve_papers`, after `query_analysis = _query_analysis(query)`, add:

```python
    if strategy == "v1" and not _is_cleanup_query(query_analysis):
        catalog = [record for record in catalog if _is_scientific_trustworthy(record)]
```

- [ ] **Step 5: Run retrieval trust-filter test**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_retrieval_excludes_unverified_papers_from_scientific_queries
```

Expected: test passes.

- [ ] **Step 6: Commit Task 5**

Run:

```powershell
git add src/meridian/wiki/corpus.py tests/test_cli.py
git commit -m "feat(wiki): filter unverified papers from retrieval"
```

## Task 6: Manual Override, Docs, and Full Verification

**Files:**
- Modify: `src/meridian/wiki/flow.py`
- Modify: `src/meridian/cli.py`
- Modify: `README.md`
- Modify: `docs/mvp-paper-wiki-workflow.md`
- Modify: `.codex/skills/paper-ingest/SKILL.md`
- Modify: `.codex/skills/llm-wiki/SKILL.md`
- Test: `tests/test_cli.py`

- [ ] **Step 1: Add manual override test**

Add test:

```python
    def test_wiki_flow_always_publish_records_manual_override_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wiki_root = root / "wiki"
            pdf = root / "paper.pdf"
            pdf.write_bytes(b"%PDF fake")
            rubric = root / "rubric.md"
            rubric.write_text("# Rubric\n", encoding="utf-8")
            out = wiki_root / ".drafts/ingests/fake-flow"

            exit_code = main(
                [
                    "wiki",
                    "flow",
                    str(pdf),
                    "--out",
                    str(out),
                    "--wiki-root",
                    str(wiki_root),
                    "--rubric",
                    str(rubric),
                    "--publish-mode",
                    "always",
                    "--overwrite",
                    "--no-auto-commit",
                ]
            )

            self.assertEqual(exit_code, 0)
            flow = json.loads((out / "flow.json").read_text(encoding="utf-8"))
            canonical = Path(flow["product_artifacts"]["canonical_paper_page"])
            text = canonical.read_text(encoding="utf-8")
            self.assertIn('review_state: "human_overrode_gate"', text)
            self.assertIn('validation_state: "source_fidelity_not_passed"', text)
            self.assertIn('trust_state: "manual_override"', text)
```

- [ ] **Step 2: Run manual override test**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_wiki_flow_always_publish_records_manual_override_state
```

Expected: test passes after Tasks 2-3; if it fails, fix frontmatter state replacement in `flow.py`.

- [ ] **Step 3: Update documentation text**

In `README.md`, add a concise ingest note:

```markdown
`meridian wiki flow` is quarantine-first: it registers the source and writes draft artifacts, but `--publish-mode auto` publishes to `wiki/papers/` only after source-fidelity validation passes. Without a passing source-fidelity result, the flow writes a packet and leaves the run blocked in `.drafts/ingests/`.
```

In `docs/mvp-paper-wiki-workflow.md`, update the workflow contract sentence to:

```markdown
Canonical paper writes pass through a strict source-fidelity gate. A blocked ingest is a successful safety outcome: raw source state and draft artifacts exist, but canonical wiki pages are not created until source-fidelity validation passes.
```

In `.codex/skills/paper-ingest/SKILL.md`, update the self-check command section with:

```markdown
Default ingest flow is quarantine-first. Treat missing or non-passing source-fidelity results as a publication block, not a failure to continue. Do not present blocked draft `paper.md` as canonical wiki memory.
```

In `.codex/skills/llm-wiki/SKILL.md`, update the Meridian Paper Ingest Flow paragraph with:

```markdown
Canonical draft publish happens after source-fidelity validation, not before. If source-fidelity is missing, contradicted, unsupported, or insufficient, the run remains in `.drafts/ingests/` and records `publish_decision: blocked`.
```

- [ ] **Step 4: Run targeted test suite**

Run:

```powershell
python -m unittest tests.test_cli.CliTests.test_source_fidelity_result_requires_core_statement_support tests.test_cli.CliTests.test_source_fidelity_result_blocks_unsupported_core_statement tests.test_cli.CliTests.test_publish_decision_requires_quality_structural_and_source_fidelity_pass tests.test_cli.CliTests.test_wiki_flow_blocks_publish_without_source_fidelity_result tests.test_cli.CliTests.test_wiki_flow_publishes_with_passing_source_fidelity_result tests.test_cli.CliTests.test_wiki_flow_output_reports_blocked_publish_decision tests.test_cli.CliTests.test_wiki_health_strict_blocks_unverified_canonical_paper tests.test_cli.CliTests.test_retrieval_excludes_unverified_papers_from_scientific_queries tests.test_cli.CliTests.test_wiki_flow_always_publish_records_manual_override_state
```

Expected: all listed tests pass.

- [ ] **Step 5: Run broad CLI tests**

Run:

```powershell
python -m unittest tests.test_cli
```

Expected: full `tests.test_cli` passes. If legacy tests expect `flow` to publish without source-fidelity, update those tests to assert blocked draft behavior or pass a fixture source-fidelity result when the test is specifically about canonical publication.

- [ ] **Step 6: Inspect final diff**

Run:

```powershell
git diff -- src/meridian/wiki/source_fidelity.py src/meridian/wiki/flow.py src/meridian/wiki/commands.py src/meridian/cli.py src/meridian/wiki/health.py src/meridian/wiki/corpus.py tests/test_cli.py README.md docs/mvp-paper-wiki-workflow.md .codex/skills/paper-ingest/SKILL.md .codex/skills/llm-wiki/SKILL.md
```

Expected: diff only contains strict ingest gate, source-fidelity, health, retrieval, tests, and doc/skill updates.

- [ ] **Step 7: Commit Task 6**

Run:

```powershell
git add src/meridian/wiki/source_fidelity.py src/meridian/wiki/flow.py src/meridian/wiki/commands.py src/meridian/cli.py src/meridian/wiki/health.py src/meridian/wiki/corpus.py tests/test_cli.py README.md docs/mvp-paper-wiki-workflow.md .codex/skills/paper-ingest/SKILL.md .codex/skills/llm-wiki/SKILL.md
git commit -m "docs(wiki): document quarantine-first ingest"
```

## Self-Review Notes

- Spec coverage: the plan covers quarantine-first flow, source-fidelity result schema, blocked publication state, manual override state, strict health findings, retrieval filtering, CLI output, tests, and docs/skills updates.
- Scope: source-fidelity semantic execution remains agent-executed by result file in this implementation. That is stricter than a weak deterministic auto-pass and prevents false confidence.
- Type consistency: `SourceFidelityResult`, `PublishDecision`, `publish_decision`, `block_reason`, `validation_state`, and `trust_state` use the same names across tasks.
- No migration of existing real wiki pages is performed automatically; strict health reports them so the user can recheck or quarantine through a follow-up repair workflow.
