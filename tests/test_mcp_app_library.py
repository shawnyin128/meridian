from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from meridian.mcp import adapter
from meridian.mcp.app_library import app_native_catalog_records
from meridian.mcp.context_contract import CONTEXT_SCHEMA_VERSION
from meridian.mcp.server import MeridianMCPServer

ROOT = Path(__file__).resolve().parents[1]
APP_LIBRARY_FIXTURE = ROOT / "apps/desktop/src/core/fixtures/vault"


class MCPAppLibraryTests(unittest.TestCase):
    def test_context_reads_desktop_layout_and_nested_memberships(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            library_root = Path(tmp) / "library"
            shutil.copytree(APP_LIBRARY_FIXTURE, library_root)
            wiki_root = library_root / "wiki"
            out_dir = Path(tmp) / "context"
            paper_path = wiki_root / "papers/13979-STAR-Speculative-Decodin.md"
            # This is exactly the pair applyPaperWikiDraft (apps/desktop/src/core/vault-store.ts) writes
            # when a Harness Wiki draft is applied — the only trust state an app-built library ever holds.
            paper_path.write_text(
                paper_path.read_text(encoding="utf-8").replace(
                    'status: "draft"',
                    'status: "active"\nvalidation_state: "text_converged"\ntrust_state: "source_grounded_text"',
                ),
                encoding="utf-8",
            )
            # A page with neither key mirrors a freshly imported paper whose draft was never applied;
            # it otherwise matches the query as well as the trusted page does.
            untrusted_path = wiki_root / "papers/Jiang-et-al-2024-Mixtral-of-Experts.md"
            untrusted_path.write_text(
                untrusted_path.read_text(encoding="utf-8")
                + "\n## What this covers\nMixtral also applies speculative decoding to expert routing.\n",
                encoding="utf-8",
            )
            records = app_native_catalog_records(wiki_root)
            self.assertIs(app_native_catalog_records(wiki_root), records)
            paper_record = next(item for item in records if item["page_id"].startswith("papers/13979-"))
            self.assertEqual(
                {item["id"] for item in paper_record["_memberships"]},
                {
                    "topics/speculative-decoding",
                    "topics/draft-acceptance",
                    "methods/kv-compression",
                },
            )

            payload = adapter.context(
                query="speculative decoding",
                wiki_root=wiki_root,
                top_k=6,
                max_chars_per_result=320,
                out_dir=out_dir,
            )

            packet = payload["context"]
            self.assertEqual(packet["schema_version"], CONTEXT_SCHEMA_VERSION)
            self.assertEqual(packet["source"], {"kind": "paper_wiki", "layout": "app_native"})
            self.assertLessEqual(len(packet["results"]), 6)
            self.assertTrue(packet["results"])
            paper = next(item for item in packet["results"] if item["result_type"] == "paper")
            self.assertEqual(paper["provenance"]["canonical_path"].split("/")[0], "papers")
            self.assertIn("topics/speculative-decoding", {item["id"] for item in paper["memberships"]})
            self.assertTrue(all(
                len(item["excerpt"]) + sum(len(section["snippet"]) for section in item["sections"]) <= 320
                for item in packet["results"]
            ))
            self.assertFalse((wiki_root / ".index").exists())
            result_paths = {item["provenance"]["canonical_path"] for item in packet["results"]}
            self.assertIn("papers/13979-STAR-Speculative-Decodin.md", result_paths)
            self.assertNotIn("papers/Jiang-et-al-2024-Mixtral-of-Experts.md", result_paths)

            saved = json.loads((out_dir / "context.json").read_text(encoding="utf-8"))
            self.assertEqual(saved, packet)

    def test_context_reads_a_page_with_no_claims_and_a_page_with_an_unknown_extra_field(self) -> None:
        """Backward/forward compatibility (AGENTS.md): a paper page (which never has `claims`) and
        an aggregation page carrying an additive field this version does not know about yet both
        read fine rather than being rejected or dropped from results."""
        with tempfile.TemporaryDirectory() as tmp:
            library_root = Path(tmp) / "library"
            shutil.copytree(APP_LIBRARY_FIXTURE, library_root)
            wiki_root = library_root / "wiki"
            topic_path = wiki_root / "topics/speculative-decoding.md"
            self.assertIn("claims:", topic_path.read_text(encoding="utf-8"))
            topic_path.write_text(
                topic_path.read_text(encoding="utf-8").replace(
                    'aliases: []',
                    'aliases: []\nfuture_field: "a newer Meridian added this"',
                    1,
                ),
                encoding="utf-8",
            )

            records = app_native_catalog_records(wiki_root)
            topic_record = next(item for item in records if item["page_id"] == "topics/speculative-decoding")
            self.assertEqual(topic_record["raw_frontmatter"].get("future_field"), "a newer Meridian added this")
            self.assertTrue(topic_record["raw_frontmatter"].get("claims"))
            paper_record = next(item for item in records if item["page_id"].startswith("papers/13979-"))
            self.assertNotIn("claims", paper_record["raw_frontmatter"])

            payload = adapter.context(query="speculative decoding", wiki_root=wiki_root, top_k=6, out_dir=Path(tmp) / "ctx")
            paths = {item["provenance"]["canonical_path"] for item in payload["context"]["results"]}
            self.assertIn("topics/speculative-decoding.md", paths)

    def test_stdio_tool_returns_inline_v1_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            library_root = Path(tmp) / "library"
            shutil.copytree(APP_LIBRARY_FIXTURE, library_root)
            server = MeridianMCPServer(default_wiki_root=library_root / "wiki")

            response = server.handle_message(
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {
                        "name": "meridian.context",
                        "arguments": {
                            "query": "speculative decoding",
                            "top_k": 4,
                            "max_chars_per_result": 240,
                        },
                    },
                }
            )

            payload = json.loads(response["result"]["content"][0]["text"])
            self.assertEqual(payload["context"]["schema_version"], CONTEXT_SCHEMA_VERSION)
            self.assertEqual(payload["context"]["budget"]["max_chars_per_result"], 240)
            self.assertEqual(payload["context"]["source"]["layout"], "app_native")


if __name__ == "__main__":
    unittest.main()
