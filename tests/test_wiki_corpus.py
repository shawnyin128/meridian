from __future__ import annotations

import unittest

from meridian.wiki.corpus import parse_frontmatter


class FrontmatterParsingTests(unittest.TestCase):
    def test_parse_frontmatter_preserves_nested_memberships(self) -> None:
        frontmatter = parse_frontmatter(
            "---\n"
            "kind: paper\n"
            "title: Nested membership\n"
            "updated: 2026-09-15\n"
            "memberships:\n"
            "  - in: topics/speculative-decoding\n"
            "    cells:\n"
            "      mechanism:\n"
            "        value: tree verification\n"
            "        at:\n"
            "          page: 3\n"
            "          quote: \"verify candidates in parallel\"\n"
            "      speedup:\n"
            "        value: 2.4\n"
            "        at: {page: 7, quote: \"2.4x end-to-end\"}\n"
            "aliases: [Tree verifier, Draft tree]\n"
            "reviewed: true\n"
            "optional: null\n"
            "---\n"
            "# Body\n"
        )

        self.assertEqual(frontmatter["updated"], "2026-09-15")
        self.assertEqual(frontmatter["aliases"], ["Tree verifier", "Draft tree"])
        self.assertIs(frontmatter["reviewed"], True)
        self.assertIsNone(frontmatter["optional"])
        self.assertEqual(
            frontmatter["memberships"],
            [
                {
                    "in": "topics/speculative-decoding",
                    "cells": {
                        "mechanism": {
                            "value": "tree verification",
                            "at": {"page": 3, "quote": "verify candidates in parallel"},
                        },
                        "speedup": {
                            "value": "2.4",
                            "at": {"page": 7, "quote": "2.4x end-to-end"},
                        },
                    },
                }
            ],
        )

    def test_parse_frontmatter_rejects_a_non_mapping_root(self) -> None:
        with self.assertRaisesRegex(ValueError, "front matter is not a mapping"):
            parse_frontmatter("---\n- paper\n- topic\n---\n")

    def test_parse_frontmatter_reports_invalid_yaml_instead_of_no_front_matter(self) -> None:
        with self.assertRaisesRegex(ValueError, "front matter is not valid YAML"):
            parse_frontmatter("---\ntitle: [unclosed\n---\n# Body\n")

    def test_parse_frontmatter_reads_a_page_without_or_with_an_empty_block_as_no_fields(self) -> None:
        self.assertEqual(parse_frontmatter("# Body\n"), {})
        self.assertEqual(parse_frontmatter("---\n\n---\n# Body\n"), {})


if __name__ == "__main__":
    unittest.main()
