from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path


def slugify(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-")
    return slug[:96] or "untitled"


def default_context_base_dir() -> Path:
    if os.name == "nt":
        return Path(tempfile.gettempdir()) / "meridian-context"
    return Path("/private/tmp/meridian-context")


def default_context_out_dir(query: str) -> Path:
    return default_context_base_dir() / slugify(query)[:80]


def default_mcp_context_out_dir(query: str) -> Path:
    return default_context_base_dir() / f"mcp-{slugify(query)[:80]}"
