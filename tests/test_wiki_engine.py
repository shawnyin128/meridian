"""Unit tests for the new-format Paper Wiki engine (spec 2026-09-14, interface.md 0.0.14).

Covers page reading/tracing on the aggregation layout (nested memberships and
claims), page-version fingerprinting, agent claim-proposal validation and
submission, the App's proposal/signal queue, and the MCP tool surface.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from meridian.mcp import adapter
from meridian.mcp.server import MeridianMCPServer
from meridian.wiki.claims import ProposalValidationError, validate_claim_ops
from meridian.wiki.pages import (
    fingerprint_text,
    generated_regions,
    page_children,
    page_members,
    page_version,
    resolve_page,
    resolve_vault_root,
)
from meridian.wiki.propose import submit_wiki_proposal
from meridian.wiki.queue import find_proposal_record, inbox_has_key, read_proposal_records, read_wiki_signals

FIXTURE_CASES = json.loads((Path(__file__).parent / "fixtures" / "wiki_version_cases.json").read_text(encoding="utf-8"))


def _build_vault(root: Path) -> Path:
    """Write a small new-format vault: one topic (with claims) and one member paper."""
    wiki_root = root / "wiki"
    (wiki_root / "topics").mkdir(parents=True)
    (wiki_root / "papers").mkdir(parents=True)
    (wiki_root / "schema.yaml").write_text(
        "version: 1\n"
        "kinds:\n"
        "  topic:\n"
        "    dir: topics\n"
        "    label: Topic\n"
        "    describe: {section: Problem, hint: x}\n"
        "sections:\n"
        "  - {key: experiments, label: Experiments}\n"
        "  - {key: open, label: Open questions}\n"
        "anchor:\n  require_quote: true\n",
        encoding="utf-8",
    )
    (wiki_root / "topics/speculative-decoding.md").write_text(
        "---\n"
        'kind: "topic"\n'
        'title: "Speculative decoding"\n'
        "aliases: []\n"
        "parents: []\n"
        "columns: []\n"
        "claims:\n"
        "  - id: knee\n"
        "    text: Single-request width gains taper around width 6\n"
        "    version: 2\n"
        "    since: 2026-06-09\n"
        "    by: 我\n"
        "    evidence:\n"
        "      - kind: experiment\n"
        "        project: draft\n"
        "        node: exp1\n"
        "        added: 2026-06-09\n"
        "        by: 我\n"
        "      - kind: source\n"
        "        paper: papers/star\n"
        "        page: 7\n"
        "        quote: verification cost is amortized\n"
        "        added: 2026-09-14\n"
        "        by: ai:harness.ingest\n"
        "    conflicts:\n"
        "      - id: batch\n"
        "        against:\n"
        "          kind: claim\n"
        "          ref: topics/batching#batch-wins\n"
        "        note: Batched decoding pushes the knee later\n"
        "        since: 2026-09-14\n"
        "        by: ai:harness.lint\n"
        "    history:\n"
        "      - version: 1\n"
        "        text: Width gains decrease (literature guess)\n"
        "        since: 2026-05-02\n"
        "        by: 我\n"
        'updated: "2026-05-20"\n'
        "---\n"
        "<!-- generated:children -->\n"
        "## Sub-aggregations\n(none)\n"
        "<!-- /generated -->\n"
        "<!-- generated:table -->\n"
        "## Table\n| Paper |\n|---|\n| [[papers/star]] |\n"
        "<!-- /generated -->\n"
        "<!-- generated:claims -->\n"
        "## Conclusions\n- knee v2 ^knee\n"
        "<!-- /generated -->\n"
        "\n## Problem\nSmall models draft, large models verify in parallel.\n"
        "\n## Experiments\n\n## Open questions\n",
        encoding="utf-8",
    )
    (wiki_root / "papers/star.md").write_text(
        "---\n"
        'type: "paper"\n'
        'title: "STAR speculative decoding"\n'
        'status: "draft"\n'
        'created: "2026-05-20"\n'
        'updated: "2026-05-20"\n'
        'source_id: "paper-pdf-a"\n'
        "memberships:\n"
        '  - in: "topics/speculative-decoding"\n'
        "    cells: []\n"
        "---\n"
        "## What this covers\nDrafts can be retrieved, then corrected against the target model.\n",
        encoding="utf-8",
    )
    return wiki_root


class PageVersionFingerprintTests(unittest.TestCase):
    """Page-version fingerprint parity (spec sec 3.2).

    `tests/fixtures/wiki_version_cases.json` is a temporary stand-in for the
    cross-suite fixture `apps/desktop/src/core/fixtures/wiki-version-cases.json`
    interface.md describes (created by the App task). Its expected `fm`/`body`
    values are computed by this same Python implementation, so this proves
    internal consistency (determinism, CRLF/generated-region/updated-line
    handling) but not yet parity with the TypeScript implementation. Swap in
    the App's fixture once it lands.
    """

    def test_fixture_cases_match_this_implementation(self) -> None:
        self.assertGreaterEqual(len(FIXTURE_CASES), 4)
        for case in FIXTURE_CASES:
            with self.subTest(case=case["name"]):
                actual = fingerprint_text(case["text"])
                self.assertEqual(actual["fm"], case["fm"])
                self.assertEqual(actual["body"], case["body"])

    def test_crlf_and_lf_versions_of_the_same_page_match(self) -> None:
        lf_text = "---\nkind: topic\ntitle: x\n---\n## Body\nhello\n"
        crlf_text = lf_text.replace("\n", "\r\n")
        self.assertEqual(fingerprint_text(lf_text), fingerprint_text(crlf_text))

    def test_updated_line_change_does_not_change_fingerprint(self) -> None:
        a = '---\nkind: topic\ntitle: x\nupdated: "2026-01-01"\n---\n## Body\nhello\n'
        b = '---\nkind: topic\ntitle: x\nupdated: "2026-09-22"\n---\n## Body\nhello\n'
        self.assertEqual(fingerprint_text(a), fingerprint_text(b))

    def test_generated_region_content_change_does_not_change_fingerprint(self) -> None:
        a = "---\nkind: topic\ntitle: x\n---\n<!-- generated:table -->\nold table\n<!-- /generated -->\n## Body\nhello\n"
        b = "---\nkind: topic\ntitle: x\n---\n<!-- generated:table -->\nnew table, different rows\n<!-- /generated -->\n## Body\nhello\n"
        self.assertEqual(fingerprint_text(a), fingerprint_text(b))

    def test_a_real_body_edit_changes_the_body_fingerprint_only(self) -> None:
        a = "---\nkind: topic\ntitle: x\n---\n## Body\nhello\n"
        b = "---\nkind: topic\ntitle: x\n---\n## Body\nhello there\n"
        fp_a, fp_b = fingerprint_text(a), fingerprint_text(b)
        self.assertEqual(fp_a["fm"], fp_b["fm"])
        self.assertNotEqual(fp_a["body"], fp_b["body"])

    def test_missing_page_has_null_version(self) -> None:
        with TemporaryDirectory() as tmp:
            self.assertIsNone(page_version(Path(tmp) / "does-not-exist.md"))

    def test_no_frontmatter_page_has_empty_fm(self) -> None:
        fp = fingerprint_text("# Just a body\n\nNo frontmatter fence here.\n")
        self.assertEqual(fp["fm"], fingerprint_text("")["fm"])


class PagesReadTraceTests(unittest.TestCase):
    def test_resolve_page_by_id_title_and_alias(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            by_id = resolve_page(wiki_root, "topics/speculative-decoding")
            by_title = resolve_page(wiki_root, "Speculative decoding")
            self.assertEqual(by_id["page_id"], "topics/speculative-decoding")
            self.assertEqual(by_title["page_id"], "topics/speculative-decoding")

    def test_resolve_page_raises_for_unknown_page(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            with self.assertRaises(FileNotFoundError):
                resolve_page(wiki_root, "topics/does-not-exist")

    def test_page_children_and_members_reverse_lookups(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            (wiki_root / "topics/speculative-decoding-child.md").write_text(
                "---\nkind: topic\ntitle: Child topic\naliases: []\n"
                'parents: ["topics/speculative-decoding"]\ncolumns: []\nupdated: "2026-09-16"\n---\n'
                "<!-- generated:children -->\n(none)\n<!-- /generated -->\n"
                "<!-- generated:table -->\n(none)\n<!-- /generated -->\n"
                "<!-- generated:claims -->\n(none)\n<!-- /generated -->\n\n## Problem\nx\n",
                encoding="utf-8",
            )
            children = page_children(wiki_root, "topics/speculative-decoding")
            self.assertEqual([c["id"] for c in children], ["topics/speculative-decoding-child"])
            members = page_members(wiki_root, "topics/speculative-decoding")
            self.assertEqual([m["id"] for m in members], ["papers/star"])

    def test_generated_regions_split_from_prose(self) -> None:
        body = (
            "<!-- generated:table -->\n## Table\nrow\n<!-- /generated -->\n"
            "\n## Problem\nprose stays\n"
        )
        regions, prose = generated_regions(body)
        self.assertEqual(regions["table"], "## Table\nrow")
        self.assertEqual(prose, "## Problem\nprose stays")

    def test_adapter_read_exposes_nested_memberships_and_claims(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            payload = adapter.read(page="papers/star", wiki_root=wiki_root)
            self.assertEqual(
                payload["frontmatter"]["memberships"],
                [{"in": "topics/speculative-decoding", "cells": []}],
            )
            topic_payload = adapter.read(page="topics/speculative-decoding", wiki_root=wiki_root)
            claims = topic_payload["frontmatter"]["claims"]
            self.assertEqual(claims[0]["id"], "knee")
            self.assertEqual(claims[0]["version"], 2)
            self.assertEqual(len(claims[0]["evidence"]), 2)
            self.assertEqual(claims[0]["conflicts"][0]["against"]["ref"], "topics/batching#batch-wins")
            self.assertEqual(claims[0]["history"][0]["version"], 1)
            self.assertIn("version", topic_payload)
            self.assertIn("fm", topic_payload["version"])

    def test_adapter_trace_reports_members_parents_and_claims(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            trace = adapter.trace(page="topics/speculative-decoding", wiki_root=wiki_root)
            self.assertEqual(trace["parents"], [])
            self.assertEqual(trace["children"], [])
            self.assertEqual([m["id"] for m in trace["members"]], ["papers/star"])
            self.assertEqual(trace["claims"][0]["id"], "knee")

            paper_trace = adapter.trace(page="papers/star", wiki_root=wiki_root)
            self.assertEqual(
                [m["id"] for m in paper_trace["memberships"]],
                ["topics/speculative-decoding"],
            )


class ClaimOpValidationTests(unittest.TestCase):
    """Shape validation for agent claim proposals (interface.md decisions 2 and 6)."""

    def _valid_add_claim(self) -> dict:
        return {
            "op": "addClaim",
            "page": "topics/speculative-decoding",
            "claim": {
                "id": "knee",
                "text": "Single-request width gains taper around width 6",
                "evidence": [{"kind": "experiment", "project": "draft", "node": "exp1"}],
            },
        }

    def test_valid_add_claim_passes(self) -> None:
        validate_claim_ops([self._valid_add_claim()])

    def test_rejects_a_non_claim_op(self) -> None:
        with self.assertRaises(ProposalValidationError) as raised:
            validate_claim_ops([{"op": "setBody", "page": "topics/speculative-decoding", "body": "x"}])
        self.assertIn("agents may only submit claim ops", str(raised.exception))

    def test_rejects_a_structural_op(self) -> None:
        with self.assertRaises(ProposalValidationError):
            validate_claim_ops([{"op": "createAggregation", "kind": "topic", "id": "topics/x", "title": "X"}])

    def test_add_claim_requires_experiment_evidence_not_just_source(self) -> None:
        op = self._valid_add_claim()
        op["claim"]["evidence"] = [
            {"kind": "source", "paper": "papers/star", "page": 7, "quote": "verification cost is amortized"}
        ]
        with self.assertRaises(ProposalValidationError) as raised:
            validate_claim_ops([op])
        self.assertIn("experiment evidence item", str(raised.exception))

    def test_add_claim_rejects_personal_evidence(self) -> None:
        op = self._valid_add_claim()
        op["claim"]["evidence"].append({"kind": "personal", "text": "my hunch"})
        with self.assertRaises(ProposalValidationError) as raised:
            validate_claim_ops([op])
        self.assertIn("personal", str(raised.exception))

    def test_add_claim_rejects_multiline_text(self) -> None:
        op = self._valid_add_claim()
        op["claim"]["text"] = "line one\nline two"
        with self.assertRaises(ProposalValidationError):
            validate_claim_ops([op])

    def test_add_claim_rejects_bad_claim_id(self) -> None:
        op = self._valid_add_claim()
        op["claim"]["id"] = "Not Valid!"
        with self.assertRaises(ProposalValidationError):
            validate_claim_ops([op])

    def test_revise_claim_requires_experiment_evidence(self) -> None:
        op = {"op": "reviseClaim", "page": "topics/speculative-decoding", "claim": "knee", "text": "revised text"}
        with self.assertRaises(ProposalValidationError) as raised:
            validate_claim_ops([op])
        self.assertIn("evidence", str(raised.exception))

    def test_revise_claim_with_only_source_evidence_is_rejected(self) -> None:
        op = {
            "op": "reviseClaim",
            "page": "topics/speculative-decoding",
            "claim": "knee",
            "text": "revised text",
            "evidence": [{"kind": "source", "paper": "papers/star", "page": 7, "quote": "verification cost is amortized"}],
        }
        with self.assertRaises(ProposalValidationError) as raised:
            validate_claim_ops([op])
        self.assertIn("experiment evidence item", str(raised.exception))

    def test_revise_claim_with_experiment_evidence_passes(self) -> None:
        op = {
            "op": "reviseClaim",
            "page": "topics/speculative-decoding",
            "claim": "knee",
            "text": "revised text",
            "evidence": [{"kind": "experiment", "project": "draft", "node": "exp2"}],
        }
        validate_claim_ops([op])

    def test_add_evidence_requires_at_least_one_item(self) -> None:
        op = {"op": "addEvidence", "page": "topics/speculative-decoding", "claim": "knee", "evidence": []}
        with self.assertRaises(ProposalValidationError):
            validate_claim_ops([op])

    def test_mark_conflict_valid_claim_target(self) -> None:
        op = {
            "op": "markConflict",
            "page": "topics/speculative-decoding",
            "claim": "knee",
            "conflict": {
                "id": "batch",
                "against": {"kind": "claim", "ref": "topics/batching#batch-wins"},
                "note": "Batching pushes the knee later",
            },
        }
        validate_claim_ops([op])

    def test_mark_conflict_rejects_malformed_claim_ref(self) -> None:
        op = {
            "op": "markConflict",
            "page": "topics/speculative-decoding",
            "claim": "knee",
            "conflict": {"id": "batch", "against": {"kind": "claim", "ref": "not-a-valid-ref"}, "note": "x"},
        }
        with self.assertRaises(ProposalValidationError):
            validate_claim_ops([op])

    def test_resolve_conflict_requires_a_known_outcome(self) -> None:
        op = {
            "op": "resolveConflict",
            "page": "topics/speculative-decoding",
            "claim": "knee",
            "conflict": "batch",
            "outcome": "not-a-real-outcome",
            "note": "resolved",
        }
        with self.assertRaises(ProposalValidationError):
            validate_claim_ops([op])

    def test_resolve_conflict_valid(self) -> None:
        op = {
            "op": "resolveConflict",
            "page": "topics/speculative-decoding",
            "claim": "knee",
            "conflict": "batch",
            "outcome": "dismissed",
            "note": "not a real contradiction",
        }
        validate_claim_ops([op])

    def test_retract_claim_requires_a_reason(self) -> None:
        op = {"op": "retractClaim", "page": "topics/speculative-decoding", "claim": "knee", "reason": ""}
        with self.assertRaises(ProposalValidationError):
            validate_claim_ops([op])

    def test_retract_claim_valid(self) -> None:
        op = {"op": "retractClaim", "page": "topics/speculative-decoding", "claim": "knee", "reason": "superseded"}
        validate_claim_ops([op])

    def test_empty_ops_list_is_rejected(self) -> None:
        with self.assertRaises(ProposalValidationError):
            validate_claim_ops([])


class WikiProposeSubmissionTests(unittest.TestCase):
    def test_submit_writes_atomically_and_returns_a_key(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            ops = [
                {
                    "op": "addClaim",
                    "page": "topics/speculative-decoding",
                    "claim": {
                        "id": "batch-wins",
                        "text": "Batched decoding pushes the knee later",
                        "evidence": [{"kind": "experiment", "project": "draft", "node": "exp2"}],
                    },
                }
            ]
            result = submit_wiki_proposal(wiki_root=wiki_root, ops=ops, title="Batch knee shift", project="draft", node="exp2")

            inbox_dir = resolve_vault_root(wiki_root) / ".meridian" / "proposal-inbox"
            files = list(inbox_dir.glob("*.json"))
            self.assertEqual(len(files), 1)
            self.assertEqual(files[0].name, f"{result['key']}.json")
            # No leftover temp file: the write really was rename-based, not left half-done.
            self.assertEqual(list(inbox_dir.glob("*.tmp")), [])

            envelope = json.loads(files[0].read_text(encoding="utf-8"))
            self.assertEqual(envelope["protocol"], 1)
            self.assertEqual(envelope["producer"], {"kind": "ai", "id": "skill.meridian"})
            self.assertEqual(envelope["trigger"], {"kind": "experiment", "project": "draft", "node": "exp2"})
            self.assertEqual(envelope["ops"], ops)

    def test_base_covers_every_named_page_including_a_missing_one(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            ops = [
                {
                    "op": "markConflict",
                    "page": "topics/speculative-decoding",
                    "claim": "knee",
                    "conflict": {
                        "id": "new-conflict",
                        "against": {"kind": "claim", "ref": "topics/does-not-exist#some-claim"},
                        "note": "x",
                    },
                }
            ]
            result = submit_wiki_proposal(wiki_root=wiki_root, ops=ops, title="t", project="draft")
            base = result["envelope"]["base"]
            self.assertIn("topics/speculative-decoding", base)
            self.assertIn("topics/does-not-exist", base)
            self.assertIsNotNone(base["topics/speculative-decoding"])
            self.assertIsNone(base["topics/does-not-exist"])

    def test_base_matches_the_page_version_fingerprint(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            expected = page_version(wiki_root / "topics/speculative-decoding.md")
            ops = [{"op": "retractClaim", "page": "topics/speculative-decoding", "claim": "knee", "reason": "x"}]
            result = submit_wiki_proposal(wiki_root=wiki_root, ops=ops, title="t", project="draft")
            self.assertEqual(result["envelope"]["base"]["topics/speculative-decoding"], expected)

    def test_submit_rejects_a_missing_project(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            ops = [{"op": "retractClaim", "page": "topics/speculative-decoding", "claim": "knee", "reason": "x"}]
            with self.assertRaises(ProposalValidationError):
                submit_wiki_proposal(wiki_root=wiki_root, ops=ops, title="t", project="")

    def test_submit_rejects_non_claim_ops_and_writes_nothing(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            ops = [{"op": "setBody", "page": "topics/speculative-decoding", "body": "x"}]
            with self.assertRaises(ProposalValidationError):
                submit_wiki_proposal(wiki_root=wiki_root, ops=ops, title="t", project="draft")
            inbox_dir = resolve_vault_root(wiki_root) / ".meridian" / "proposal-inbox"
            self.assertFalse(inbox_dir.exists())

    def test_two_submissions_get_distinct_keys(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            ops = [{"op": "retractClaim", "page": "topics/speculative-decoding", "claim": "knee", "reason": "x"}]
            first = submit_wiki_proposal(wiki_root=wiki_root, ops=ops, title="t", project="draft")
            second = submit_wiki_proposal(wiki_root=wiki_root, ops=ops, title="t", project="draft")
            self.assertNotEqual(first["key"], second["key"])

    def test_adapter_wiki_propose_end_to_end(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            ops = [
                {
                    "op": "addClaim",
                    "page": "topics/speculative-decoding",
                    "claim": {
                        "id": "new-finding",
                        "text": "A fresh finding",
                        "evidence": [{"kind": "experiment", "project": "draft", "node": "exp3"}],
                    },
                }
            ]
            result = adapter.wiki_propose(
                wiki_root=wiki_root, ops=ops, title="A fresh finding", trigger={"project": "draft", "node": "exp3"}
            )
            self.assertEqual(result["status"], "submitted")
            self.assertTrue(Path(result["path"]).is_file())


class QueueAndSignalsTests(unittest.TestCase):
    def test_missing_queue_and_signals_files_are_reported_without_erroring(self) -> None:
        with TemporaryDirectory() as tmp:
            vault_root = Path(tmp)
            self.assertEqual(read_proposal_records(vault_root), [])
            self.assertIsNone(find_proposal_record(vault_root, "any-key"))
            self.assertFalse(inbox_has_key(vault_root, "any-key"))
            self.assertIsNone(read_wiki_signals(vault_root))

    def test_status_reports_waiting_for_app_when_only_the_inbox_file_exists(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            ops = [{"op": "retractClaim", "page": "topics/speculative-decoding", "claim": "knee", "reason": "x"}]
            submitted = adapter.wiki_propose(wiki_root=wiki_root, ops=ops, title="t", trigger={"project": "draft"})
            status = adapter.wiki_proposal_status(wiki_root=wiki_root, key=submitted["key"])
            self.assertEqual(status["status"], "waiting_for_app")

    def test_status_reports_unknown_for_a_key_that_was_never_submitted(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            status = adapter.wiki_proposal_status(wiki_root=wiki_root, key="never-existed")
            self.assertEqual(status["status"], "unknown")

    def test_status_reads_an_applied_record_from_proposals_json(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            vault_root = resolve_vault_root(wiki_root)
            proposals_path = vault_root / ".meridian" / "proposals.json"
            proposals_path.parent.mkdir(parents=True, exist_ok=True)
            proposals_path.write_text(
                json.dumps(
                    [
                        {
                            "id": "proposal-1",
                            "digest": "abc",
                            "proposal": {"key": "the-key", "title": "t"},
                            "received": 0,
                            "path": "review",
                            "status": "applied",
                            "reason": None,
                            "decided": {"at": 0, "by": "我"},
                            "change": "c-1",
                        }
                    ]
                ),
                encoding="utf-8",
            )
            status = adapter.wiki_proposal_status(wiki_root=wiki_root, key="the-key")
            self.assertEqual(status["status"], "applied")
            self.assertEqual(status["record"]["id"], "proposal-1")

    def test_status_lists_recent_records_when_no_key_is_given(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            vault_root = resolve_vault_root(wiki_root)
            proposals_path = vault_root / ".meridian" / "proposals.json"
            proposals_path.parent.mkdir(parents=True, exist_ok=True)
            records = [
                {"id": f"proposal-{i}", "proposal": {"key": f"k{i}"}, "status": "queued"} for i in range(3)
            ]
            proposals_path.write_text(json.dumps(records), encoding="utf-8")
            status = adapter.wiki_proposal_status(wiki_root=wiki_root, limit=2)
            self.assertEqual(status["count"], 2)

    def test_audit_reports_not_run_without_a_signals_file(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            result = adapter.audit(wiki_root=wiki_root)
            self.assertEqual(result["status"], "not_run")
            self.assertEqual(result["signals"], [])

    def test_audit_reads_signals_once_the_app_has_run(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            vault_root = resolve_vault_root(wiki_root)
            signals_path = vault_root / ".meridian" / "wiki-signals.json"
            signals_path.parent.mkdir(parents=True, exist_ok=True)
            signals_path.write_text(
                json.dumps(
                    {
                        "generated_at": "2026-09-22T00:00:00Z",
                        "signals": [
                            {"kind": "open-conflict", "page": "topics/speculative-decoding", "related": [], "detail": "x"}
                        ],
                    }
                ),
                encoding="utf-8",
            )
            result = adapter.audit(wiki_root=wiki_root)
            self.assertEqual(result["status"], "ok")
            self.assertEqual(result["signal_count"], 1)
            self.assertEqual(result["signals"][0]["kind"], "open-conflict")


class McpToolSurfaceTests(unittest.TestCase):
    def test_tools_list_is_exactly_the_new_tool_set(self) -> None:
        server = MeridianMCPServer()
        response = server.handle_message({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        names = {tool["name"] for tool in response["result"]["tools"]}
        self.assertEqual(
            names,
            {
                "meridian.capabilities",
                "meridian.context",
                "meridian.read",
                "meridian.trace",
                "meridian.wiki_propose",
                "meridian.wiki_proposal_status",
                "meridian.audit",
                "meridian.workspace_status",
                "meridian.workspace_plan",
                "meridian.workspace_changes",
                "meridian.workspace_idea",
                "meridian.workspace_event_add",
                "meridian.workspace_idea_add",
                "meridian.lab_graph",
                "meridian.lab_node",
                "meridian.lab_update",
                "meridian.lab_result",
            },
        )

    def test_initialize_responds_and_names_the_server(self) -> None:
        server = MeridianMCPServer()
        response = server.handle_message(
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}}
        )
        self.assertEqual(response["result"]["serverInfo"]["name"], "meridian-paper-wiki")
        self.assertIn("wiki_propose", response["result"]["instructions"])

    def test_wiki_propose_tool_call_rejects_a_non_claim_op(self) -> None:
        with TemporaryDirectory() as tmp:
            wiki_root = _build_vault(Path(tmp))
            server = MeridianMCPServer(default_wiki_root=wiki_root)
            response = server.handle_message(
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {
                        "name": "meridian.wiki_propose",
                        "arguments": {
                            "ops": [{"op": "setBody", "page": "topics/speculative-decoding", "body": "x"}],
                            "title": "t",
                            "trigger": {"project": "draft"},
                        },
                    },
                }
            )
            self.assertTrue(response["result"]["isError"])
            payload = json.loads(response["result"]["content"][0]["text"])
            self.assertEqual(payload["error_code"], "invalid_proposal")

    def test_update_propose_and_apply_tools_no_longer_exist(self) -> None:
        server = MeridianMCPServer()
        response = server.handle_message({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        names = {tool["name"] for tool in response["result"]["tools"]}
        self.assertNotIn("meridian.update", names)
        self.assertNotIn("meridian.propose", names)
        self.assertNotIn("meridian.apply", names)


if __name__ == "__main__":
    unittest.main()
