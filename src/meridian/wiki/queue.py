"""Read-only views of Core-owned Wiki proposal and signal files (spec sec 5.3, 6.2).

Python never writes these files. `.meridian/proposals.json` is the review
queue Core appends to after scanning the proposal inbox; `wiki-signals.json`
is Core's deterministic lint output. Both are optional until the App has run
at least once against this vault.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def read_proposal_records(vault_root: Path) -> list[dict[str, Any]]:
    """Return the queue records, newest first, or `[]` if Core has not written the file yet."""
    path = vault_root / ".meridian" / "proposals.json"
    if not path.is_file():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("proposals") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        return []
    return [record for record in records if isinstance(record, dict)]


def find_proposal_record(vault_root: Path, key: str) -> dict[str, Any] | None:
    for record in read_proposal_records(vault_root):
        proposal = record.get("proposal") or {}
        if proposal.get("key") == key or record.get("id") == key:
            return record
    return None


def inbox_has_key(vault_root: Path, key: str) -> bool:
    return (vault_root / ".meridian" / "proposal-inbox" / f"{key}.json").is_file()


def read_wiki_signals(vault_root: Path) -> dict[str, Any] | None:
    """Return `{generated_at, signals}`, or `None` if the App has not run yet."""
    path = vault_root / ".meridian" / "wiki-signals.json"
    if not path.is_file():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else None
