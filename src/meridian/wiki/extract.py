from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PageExtraction:
    page_number: int
    text: str
    section_hint: str | None
    image_path: str
    image_count: int
    drawing_count: int


@dataclass(frozen=True)
class PdfExtraction:
    metadata: dict[str, Any]
    page_count: int
    pages: list[PageExtraction]


SECTION_RE = re.compile(
    r"^\s*(?:\d+(?:\.\d+)*\s+)?("
    r"abstract|introduction|background|related work|method|methods|approach|"
    r"experiments?|evaluation|results?|discussion|limitations?|conclusion"
    r")\b",
    re.IGNORECASE,
)


def extract_pdf(pdf_path: Path, extraction_dir: Path) -> PdfExtraction:
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF does not exist: {pdf_path}")
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError(f"expected a .pdf file: {pdf_path}")

    try:
        import fitz  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "PyMuPDF is required for PDF extraction. Install project dependencies "
            "with `python3 -m pip install -e .`."
        ) from exc

    extraction_dir.mkdir(parents=True, exist_ok=True)
    page_images_dir = extraction_dir / "page-images"
    figures_dir = extraction_dir / "figures"
    tables_dir = extraction_dir / "tables"
    page_images_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)

    document = fitz.open(pdf_path)
    pages: list[PageExtraction] = []

    for page_index in range(len(document)):
        page = document.load_page(page_index)
        page_number = page_index + 1
        text = page.get_text("text").strip()
        image_path = page_images_dir / f"page-{page_number:04d}.png"

        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        pixmap.save(image_path)

        images = page.get_images(full=True)
        drawings = page.get_drawings()

        pages.append(
            PageExtraction(
                page_number=page_number,
                text=text,
                section_hint=_section_hint(text),
                image_path=str(image_path),
                image_count=len(images),
                drawing_count=len(drawings),
            )
        )

    extraction = PdfExtraction(
        metadata=dict(document.metadata or {}),
        page_count=len(document),
        pages=pages,
    )
    _write_pages_jsonl(extraction_dir / "pages.jsonl", pages)
    _write_placeholder_readme(figures_dir / "README.md", "figures")
    _write_placeholder_readme(tables_dir / "README.md", "tables")
    return extraction


def _section_hint(text: str) -> str | None:
    for line in text.splitlines()[:20]:
        match = SECTION_RE.search(line)
        if match:
            return match.group(1).title()
    return None


def _write_pages_jsonl(path: Path, pages: list[PageExtraction]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for page in pages:
            handle.write(json.dumps(page.__dict__, ensure_ascii=False) + "\n")


def _write_placeholder_readme(path: Path, label: str) -> None:
    path.write_text(
        f"# {label.title()}\n\n"
        "This v0 prototype renders page images for multimodal review. "
        f"Standalone {label} extraction is intentionally deferred.\n",
        encoding="utf-8",
    )

