"""Export a papers fixture from the real vault. One-off; not production code."""
import io, json, pathlib, re

VAULT = pathlib.Path(r"D:\research\paper-wiki")
OUT = pathlib.Path("apps/desktop/src/core/fixtures/papers.json")

def scalar(fm: str, key: str) -> str:
    m = re.search(rf'^{key}:\s*"?([^"\r\n]*)"?', fm, re.M)
    return m.group(1).strip() if m else ""

def seq(fm: str, key: str) -> list[str]:
    m = re.search(rf'^{key}:\s*\n((?:\s+-\s+.*\n)+)', fm, re.M)
    if not m:
        return []
    return [re.sub(r'^\s*-\s*"?|"?\s*$', "", line) for line in m.group(1).splitlines()]

rows = []
seen = set()
for page in sorted((VAULT / "wiki" / "papers").glob("*.md")):
    text = io.open(page, encoding="utf-8", errors="replace").read()
    parts = text.split("---", 2)
    if len(parts) < 3:
        continue
    fm = parts[1]
    updated = scalar(fm, "updated") or "2026-01-01"
    # The file itself identifies a page; source_id is only one field on it. If two pages reference
    # the same source, keep one here because the fixture is UI sample data, not a live-vault mirror.
    source_id = scalar(fm, "source_id")
    if source_id in seen:
        continue
    seen.add(source_id)
    rows.append({
        "id": page.stem,
        "sourceId": source_id,
        "title": scalar(fm, "title") or page.stem,
        "year": int(updated[:4]),
        "venue": "arXiv",
        "topics": seq(fm, "topics")[:6],
        "methods": seq(fm, "methods")[:6],
        "datasets": seq(fm, "datasets")[:6],
        "metrics": seq(fm, "metrics")[:6],
        "status": scalar(fm, "status") or "draft",
        "pageCount": int(scalar(fm, "page_count") or 0),
        "noteCount": len(seq(fm, "user_insights")),
        "conclusionCount": len(seq(fm, "claims")),
        "updated": updated,
    })

OUT.parent.mkdir(parents=True, exist_ok=True)
io.open(OUT, "w", encoding="utf-8", newline="\n").write(json.dumps(rows, ensure_ascii=False, indent=1))
print(f"exported {len(rows)} papers -> {OUT}")
