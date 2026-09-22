"""Export the wiki fixture from the example vault. One-off; not production code.

Reads desktop/design/wiki-example-vault/ and writes:
- apps/desktop/src/core/fixtures/wiki.json: schema kinds, sections,
  and every page's frontmatter with its body: the lines after the last
  `<!-- /generated -->` (after the frontmatter when there is none), stripped.
  Every papers.json row outside the example vault gets a page of its own too:
  frontmatter holds only what the row carries, and the body is empty.
- apps/desktop/src/core/fixtures/papers.json: the example vault's papers replace
  rows with the same id and go first; every other row stays byte-for-byte.
"""
import io, json, pathlib, re
import yaml

VAULT = pathlib.Path("desktop/design/wiki-example-vault")
WIKI_OUT = pathlib.Path("apps/desktop/src/core/fixtures/wiki.json")
PAPERS_OUT = pathlib.Path("apps/desktop/src/core/fixtures/papers.json")

FM = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n(.*)$", re.S)

def body_of(text: str) -> str:
    """The body of a page given everything after its frontmatter: the lines after the last
    generated-region close marker, or all of them when there is none, stripped."""
    lines = text.split("\n")
    close = max((i for i, line in enumerate(lines) if line.strip() == "<!-- /generated -->"), default=-1)
    return "\n".join(lines[close + 1:]).strip()

def load(path: pathlib.Path) -> tuple[dict, str]:
    m = FM.match(io.open(path, encoding="utf-8").read())
    if not m:
        raise SystemExit(f"{path}: no frontmatter")
    return yaml.safe_load(m.group(1)) or {}, body_of(m.group(2))

def plain(value):
    """YAML dates come back as date objects; the fixture wants ISO strings."""
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [plain(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value

schema = yaml.safe_load(io.open(VAULT / "schema.yaml", encoding="utf-8").read())
pages = {}
for path in sorted((VAULT / "papers").glob("*.md")):
    fm, body = load(path)
    pages[f"papers/{path.stem}"] = {"kind": "paper", "fm": plain(fm), "body": body}
for kind, spec in schema["kinds"].items():
    for path in sorted((VAULT / spec["dir"]).glob("*.md")):
        fm, body = load(path)
        if fm.get("kind") != kind:
            raise SystemExit(f"{path}: kind is {fm.get('kind')!r}, expected {kind!r}")
        fm = plain(fm)
        del fm["kind"]
        pages[f"{spec['dir']}/{path.stem}"] = {"kind": kind, "fm": fm, "body": body}

def title_of(page_id: str) -> str:
    return pages[page_id]["fm"]["title"]

rows = []
for page_id, page in pages.items():
    if page["kind"] != "paper":
        continue
    fm = page["fm"]
    by_kind = {}
    for m in fm.get("memberships", []):
        by_kind.setdefault(pages[m["in"]]["kind"], []).append(title_of(m["in"]))
    rows.append({
        "id": page_id[len("papers/"):],
        "sourceId": page_id[len("papers/"):],
        "title": fm["title"],
        "year": fm["year"],
        "venue": fm.get("venue", ""),
        "topics": by_kind.get("topic", []),
        "methods": by_kind.get("method", []),
        "datasets": [],
        "metrics": [],
        "pageState": "draft",
        "pageCount": 0,
        "noteCount": 0,
        "conclusionCount": 0,
        "updated": fm["updated"],
        "custom": {},
    })
fresh = {r["id"] for r in rows}
kept = [r for r in json.load(io.open(PAPERS_OUT, encoding="utf-8")) if r["id"] not in fresh]
io.open(PAPERS_OUT, "w", encoding="utf-8", newline="\n").write(json.dumps(rows + kept, ensure_ascii=False, indent=1))

for r in kept:
    fm = {"title": r["title"], "updated": r["updated"]}
    if "year" in r:
        fm["year"] = r["year"]
    if r.get("venue"):
        fm["venue"] = r["venue"]
    pages[f"papers/{r['id']}"] = {"kind": "paper", "fm": fm, "body": ""}

wiki = {
    "requireQuote": schema["anchor"]["require_quote"],
    "kinds": schema["kinds"],
    "sections": schema["sections"],
    "pages": pages,
}
io.open(WIKI_OUT, "w", encoding="utf-8", newline="\n").write(json.dumps(wiki, ensure_ascii=False, indent=1))
print(f"exported {len(pages)} pages -> {WIKI_OUT}; {len(rows)} papers first, {len(kept)} kept -> {PAPERS_OUT}")
