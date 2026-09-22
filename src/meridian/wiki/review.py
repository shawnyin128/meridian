from __future__ import annotations

import json
from pathlib import Path


def append_review_record(review_packet: Path, record: dict[str, object]) -> Path:
    if not review_packet.exists():
        raise FileNotFoundError(f"review packet does not exist: {review_packet}")
    if review_packet.name != "review.md":
        raise ValueError("expected a review.md packet")

    record_path = review_packet.parent / "human_review.jsonl"
    with record_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record_path

