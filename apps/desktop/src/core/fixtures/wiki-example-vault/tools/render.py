"""Build generated regions from schema and stored page data, run lint, and emit wiki-demo.html.

Usage: python render.py
Reads: schema.yaml, papers/*.md, <kind.dir>/*.md, and template.html
Writes: aggregation <!-- generated:* --> regions in place and wiki-demo.html
"""
import html
import json
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

import yaml

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
schema = yaml.safe_load((ROOT / 'schema.yaml').read_text('utf-8'))
KINDS = schema['kinds']
SECTION_LABELS = [s['label'] for s in schema['sections']]
LINT = schema['lint']
REQUIRE_QUOTE = schema['anchor']['require_quote']

FM_RE = re.compile(r'^---\r?\n(.*?)\r?\n---\r?\n(.*)$', re.S)
LINK_RE = re.compile(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]')
BULLET_RE = re.compile(r'^- (\d{4}-\d{2}-\d{2}) · (.*)$')

errors = []


def load(path):
    text = path.read_text('utf-8')
    m = FM_RE.match(text)
    if not m:
        raise SystemExit(f'{path}: 没有 frontmatter')
    return (yaml.safe_load(m.group(1)) or {}), m.group(1), m.group(2)


pages = {}
for p in sorted((ROOT / 'papers').glob('*.md')):
    fm, fm_text, body = load(p)
    pages[f'papers/{p.stem}'] = dict(kind='paper', fm=fm, fm_text=fm_text, body=body, path=p)
for kind, spec in KINDS.items():
    for p in sorted((ROOT / spec['dir']).glob('*.md')):
        fm, fm_text, body = load(p)
        pid = f"{spec['dir']}/{p.stem}"
        if fm.get('kind') != kind:
            errors.append(f'{pid}: kind 是 {fm.get("kind")!r},但文件在 {spec["dir"]}/ 下')
        pages[pid] = dict(kind=kind, fm=fm, fm_text=fm_text, body=body, path=p)

members = defaultdict(list)    # 聚合 id -> [(论文 id, cells)]
children = defaultdict(list)   # 聚合 id -> [子聚合 id]
parents = defaultdict(list)    # 聚合 id -> [父聚合 id]

for pid, pg in pages.items():
    if pg['kind'] == 'paper':
        for m in pg['fm'].get('memberships') or []:
            tgt = m.get('in')
            if tgt not in pages or pages[tgt]['kind'] == 'paper':
                errors.append(f'{pid}: memberships.in = {tgt!r} 不是聚合页')
                continue
            cols = {c['key'] for c in pages[tgt]['fm'].get('columns') or []}
            for k, cell in (m.get('cells') or {}).items():
                if k not in cols:
                    errors.append(f'{pid}: 格子 {k!r} 不在 {tgt} 的 columns 里')
                at = (cell or {}).get('at') or {}
                if REQUIRE_QUOTE and not at.get('quote'):
                    errors.append(f'{pid}: {tgt}.{k} 没有 at.quote')
                if 'page' not in at:
                    errors.append(f'{pid}: {tgt}.{k} 没有 at.page')
            members[tgt].append((pid, m.get('cells') or {}))
    else:
        for par in pg['fm'].get('parents') or []:
            if par not in pages:
                errors.append(f'{pid}: parents 里的 {par!r} 不存在')
                continue
            if pages[par]['kind'] != pg['kind']:
                errors.append(f'{pid}: parent {par} 的 kind 不同')
            children[par].append(pid)
            parents[pid].append(par)


def title(pid):
    return pages[pid]['fm'].get('title', pid)


def short(pid):
    return pages[pid]['fm'].get('short') or title(pid)


def esc(s):
    return html.escape(str(s), quote=True)


def columns(aid):
    return pages[aid]['fm'].get('columns') or []


def derived(aid):
    return KINDS[pages[aid]['kind']].get('derived_columns') or []


def derived_links(aid, pid):
    out = []
    for d in derived(aid):
        out.append([m['in'] for m in pages[pid]['fm'].get('memberships') or []
                    if pages.get(m['in'], {}).get('kind') == d['from_kind']])
    return out
# ---------- Generated regions: Markdown backfill ----------

def gen_children_md(aid):
    kids = sorted(children[aid])
    return '## 子聚合\n' + ('\n'.join(f'- [[{k}|{title(k)}]]' for k in kids) if kids else '(无)')


def gen_table_md(aid):
    cols, rows = columns(aid), sorted(members[aid])
    if not cols and not rows:
        return '## 对照表\n(此节点不直接收论文)'
    if not rows:
        return '## 对照表\n(暂无成员)'
    head = ['论文'] + [c['label'] for c in cols] + [d['label'] for d in derived(aid)]
    lines = ['## 对照表', '| ' + ' | '.join(head) + ' |', '|' + '---|' * len(head)]
    for pid, cells in rows:
        r = [f'[[{pid}|{short(pid)}]]']
        for c in cols:
            cell = cells.get(c['key'])
            r.append(f"{cell['value']} ·p{cell['at']['page']}" if cell else '—')
        for links in derived_links(aid, pid):
            r.append(', '.join(f'[[{l}|{title(l)}]]' for l in links) or '—')
        lines.append('| ' + ' | '.join(r) + ' |')
    return '\n'.join(lines)


def write_lf(path, text):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def fill(pid, body, name, content):
    pat = re.compile(rf'(<!-- generated:{name} -->\n).*?(<!-- /generated -->)', re.S)
    if not pat.search(body):
        errors.append(f'{pid}: 缺少 generated:{name} 区')
        return body
    return pat.sub(lambda m: m.group(1) + content + '\n' + m.group(2), body)


for pid, pg in pages.items():
    if pg['kind'] == 'paper':
        continue
    body = fill(pid, pg['body'], 'children', gen_children_md(pid))
    body = fill(pid, body, 'table', gen_table_md(pid))
    pg['body'] = body
    write_lf(pg['path'], f"---\n{pg['fm_text']}\n---\n{body}")
for pid, pg in pages.items():
    pg['raw'] = pg['path'].read_text('utf-8')


# ---------- HTML ----------

def link(pid, label=None):
    return f'<a class="wl" data-id="{esc(pid)}" href="#{esc(pid)}">{esc(label or title(pid))}</a>'


def inline(s):
    s = esc(s)
    s = LINK_RE.sub(lambda m: link(m.group(1), m.group(2) or (short(m.group(1)) if m.group(1) in pages else m.group(1))), s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    return s


def anchor_span(cell):
    at = cell['at']
    return (f'<span class="cell" data-page="{esc(at["page"])}" data-quote="{esc(at["quote"])}">'
            f'{esc(cell["value"])}<sup>p{esc(at["page"])}</sup></span>')


def section_tag(kind, heading):
    if kind == 'paper':
        return None
    spec = KINDS[kind]
    if heading == spec['describe']['section']:
        return ('append', '追加', '聚合出生时 LLM 写一版,之后只追加')
    if heading in ('子聚合', '对照表'):
        return ('gen', '生成', '由论文页上的 memberships 算出;手改会被下次生成盖掉')
    if heading in SECTION_LABELS:
        return ('append', '追加', 'ingest 不覆盖这一节')
    return None


def gen_children_html(aid):
    kids = sorted(children[aid])
    if not kids:
        return '<p class="muted">没有子聚合。</p>'
    return '<ul class="kids">' + ''.join(
        f'<li>{link(k)} <span class="n">{len(members[k])} 篇</span>'
        + (f' <span class="multi" title="{esc(", ".join(parents[k]))}">{len(parents[k])} 父</span>' if len(parents[k]) > 1 else '')
        + '</li>' for k in kids) + '</ul>'


def gen_table_html(aid):
    cols, rows = columns(aid), sorted(members[aid])
    if not cols and not rows:
        return '<p class="muted">此节点不直接收论文;它的内容是「沿什么维度拆的」加子聚合。</p>'
    if not rows:
        return '<p class="muted">暂无成员。</p>'
    h = ['<div class="tblwrap"><table class="cmp"><thead><tr><th>论文</th>']
    h += [f'<th>{esc(c["label"])}</th>' for c in cols]
    h += [f'<th class="derived">{esc(d["label"])}<span class="tag tag-gen">派生</span></th>' for d in derived(aid)]
    h.append('</tr></thead><tbody>')
    for pid, cells in rows:
        h.append(f'<tr><td class="rowhead">{link(pid, short(pid))}</td>')
        for c in cols:
            cell = cells.get(c['key'])
            h.append(f'<td>{anchor_span(cell)}</td>' if cell else '<td class="na">—</td>')
        for links in derived_links(aid, pid):
            h.append('<td class="derived">' + (', '.join(link(l) for l in links) or '—') + '</td>')
        h.append('</tr>')
    h.append('</tbody></table></div>')
    return ''.join(h)


def paper_header_html(pid):
    fm = pages[pid]['fm']
    meta = ' · '.join(x for x in [
        esc(', '.join(fm.get('authors') or [])), esc(fm.get('year', '')), esc(fm.get('venue', '')),
        f'<code>{esc(fm.get("pdf", ""))}</code>', f'updated {esc(fm.get("updated", ""))}'] if x)
    parts = [f'<p class="meta">{meta}</p>',
             '<h2 class="sec">归属 <span class="tag tag-store" title="边与格子只存在这一页;聚合页上的表由此算出">存</span></h2>',
             '<div class="memberships">']
    for m in fm.get('memberships') or []:
        tgt = m['in']
        if tgt not in pages:
            continue
        k = pages[tgt]['kind']
        cols = {c['key']: c['label'] for c in columns(tgt)}
        parts.append(f'<div class="mem"><div class="mem-head"><span class="kind kind-{esc(k)}">{esc(KINDS[k]["label"])}</span>{link(tgt)}</div><dl class="cells">')
        for key, cell in (m.get('cells') or {}).items():
            parts.append(f'<dt>{esc(cols.get(key, key))}</dt><dd>{anchor_span(cell)}</dd>')
        parts.append('</dl></div>')
    parts.append('</div>')
    return ''.join(parts)


def to_html(pid):
    pg = pages[pid]
    kind = pg['kind']
    out = []
    out.append(f'<h1>{esc(title(pid))}</h1>')
    if kind == 'paper':
        out.append(paper_header_html(pid))
    buf = []

    def flush():
        if buf:
            out.append('<p>' + inline(' '.join(buf)) + '</p>')
            buf.clear()

    lines = pg['body'].split('\n')
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith('<!-- generated:'):
            name = re.match(r'<!-- generated:(\w+) -->', ln).group(1)
            while i < len(lines) and lines[i].strip() != '<!-- /generated -->':
                i += 1
            flush()
            label = '子聚合' if name == 'children' else '对照表'
            tag = section_tag(kind, label)
            out.append(f'<h2 class="sec">{label} <span class="tag tag-{tag[0]}" title="{esc(tag[2])}">{tag[1]}</span></h2>')
            out.append(gen_children_html(pid) if name == 'children' else gen_table_html(pid))
            i += 1
            continue
        if ln.startswith('# '):
            flush()
            out.append(f'<h1>{inline(ln[2:])}</h1>')
        elif ln.startswith('## '):
            flush()
            head = ln[3:].strip()
            tag = section_tag(kind, head)
            badge = f' <span class="tag tag-{tag[0]}" title="{esc(tag[2])}">{tag[1]}</span>' if tag else ''
            out.append(f'<h2 class="sec">{inline(head)}{badge}</h2>')
        elif ln.startswith('- '):
            flush()
            items = []
            while i < len(lines) and lines[i].startswith('- '):
                items.append(lines[i][2:])
                i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(it)}</li>' for it in items) + '</ul>')
            continue
        elif ln.strip() == '':
            flush()
        else:
            buf.append(ln)
        i += 1
    flush()
    s = ''.join(out)
    # Mark an empty append region explicitly instead of placing two headings next to each other.
    s = re.sub(r'(</h2>)(?=<h2|$)', r'\1<p class="muted empty">还没有条目</p>', s)
    return s


# ---------- lint ----------
lint = []
aggs = [pid for pid, pg in pages.items() if pg['kind'] != 'paper']
nearest_split = None
for aid in aggs:
    kids, mem = children[aid], members[aid]
    if not kids and len(mem) < LINT['thin_below']:
        lint.append(dict(sev='warn', kind='thin', page=aid,
                         text=f'叶聚合只有 {len(mem)} 个成员,阈值 {LINT["thin_below"]}。要么等论文攒够,要么它其实是父节点表里的一行。'))
    if kids and len(kids) == 1 and not mem:
        lint.append(dict(sev='warn', kind='single-child', page=aid,
                         text='只有一个子聚合、没有直接成员:这一层没有在分东西。'))
    cols = columns(aid)
    if len(mem) >= LINT['split_min_rows']:
        for c in cols:
            na = sum(1 for _, cells in mem if c['key'] not in cells)
            ratio = na / len(mem)
            if nearest_split is None or ratio > nearest_split[0]:
                nearest_split = (ratio, aid, c['label'], na, len(mem))
            if ratio >= LINT['split_na_ratio']:
                lint.append(dict(sev='warn', kind='split', page=aid,
                                 text=f'列「{c["label"]}」在 {na}/{len(mem)} 行为空:建议沿它拆,split_on 填它。'))
    elif cols and mem:
        for c in cols:
            na = sum(1 for _, cells in mem if c['key'] not in cells)
            if na and (nearest_split is None or na / len(mem) > nearest_split[0]):
                nearest_split = (na / len(mem), aid, c['label'], na, len(mem))
if nearest_split and not any(l['kind'] == 'split' for l in lint):
    r, aid, lab, na, n = nearest_split
    lint.append(dict(sev='info', kind='split', page=aid,
                     text=f'没有表触发拆分。最接近的是「{lab}」列 {na}/{n} 行为空'
                          + ('' if n >= LINT['split_min_rows'] else f'(表只有 {n} 行,不到 {LINT["split_min_rows"]} 行不判断)') + '。'))
for i, a in enumerate(aggs):
    for b in aggs[i + 1:]:
        if pages[a]['kind'] != pages[b]['kind']:
            continue
        ca, cb = {c['key'] for c in columns(a)}, {c['key'] for c in columns(b)}
        if ca and ca == cb:
            shared = {p for p, _ in members[a]} & {p for p, _ in members[b]}
            if shared:
                lint.append(dict(sev='warn', kind='merge', page=a,
                                 text=f'与 {title(b)} 列完全相同且共享 {len(shared)} 篇成员:可能是同一个聚合。'))


def as_date(v):
    return date.fromisoformat(v) if isinstance(v, str) else v


for aid in aggs:
    sec = None
    for ln in pages[aid]['body'].split('\n'):
        if ln.startswith('## '):
            sec = ln[3:].strip()
            continue
        m = BULLET_RE.match(ln)
        if not m or sec not in SECTION_LABELS:
            continue
        written = date.fromisoformat(m.group(1))
        for lm in LINK_RE.finditer(ln):
            tgt = lm.group(1)
            if tgt not in pages:
                errors.append(f'{aid}: 「{sec}」里链接的 {tgt} 不存在')
                continue
            upd = as_date(pages[tgt]['fm'].get('updated'))
            if upd and upd > written:
                lint.append(dict(sev='warn', kind='stale', page=aid,
                                 text=f'「{sec}」里 {m.group(1)} 的条目引用了 {short(tgt)},而那一页在 {upd} 改过:待复核。'))
# ---------- Output ----------
nav = []
for kind, spec in KINDS.items():
    ids = [pid for pid, pg in pages.items() if pg['kind'] == kind]
    nav.append(dict(kind=kind, label=spec['label'], dir=spec['dir'],
                    roots=sorted(pid for pid in ids if not parents[pid])))

data = dict(
    nav=nav,
    children={k: sorted(v) for k, v in children.items()},
    parents={k: v for k, v in parents.items()},
    papers=sorted(pid for pid in pages if pages[pid]['kind'] == 'paper'),
    pages={pid: dict(kind=pg['kind'], title=title(pid), short=short(pid), html=to_html(pid), raw=pg['raw'],
                     members=(len(members[pid]) if pg['kind'] != 'paper' else None))
           for pid, pg in pages.items()},
    lint=lint, errors=errors,
    schema=(ROOT / 'schema.yaml').read_text('utf-8'),
    counts=dict(papers=sum(1 for p in pages if pages[p]['kind'] == 'paper'),
                aggs=len(aggs), edges=sum(len(v) for v in members.values())),
)
payload = json.dumps(data, ensure_ascii=False, default=str).replace('</', '<\\/')
out = (TOOLS / 'template.html').read_text('utf-8').replace('__DATA__', payload)
write_lf(ROOT.parent / 'wiki-example-pilot.html', out)

print(f"pages: {len(pages)}  papers: {data['counts']['papers']}  aggs: {data['counts']['aggs']}  edges: {data['counts']['edges']}")
print('errors:', len(errors))
for e in errors:
    print('  !', e)
print('lint:', len(lint))
for l in lint:
    print(f"  [{l['sev']}] {l['kind']:12s} {l['page']}: {l['text']}")
# ---------- wk.json: structured shell data derived from the same pages ----------
def sections_of(body):
    out, cur, in_gen = {}, None, False
    for ln in body.split('\n'):
        if ln.startswith('<!-- generated:'):
            in_gen = True
            continue
        if ln.strip() == '<!-- /generated -->':
            in_gen = False
            continue
        if in_gen:
            continue
        if ln.startswith('## '):
            cur = ln[3:].strip()
            out[cur] = []
        elif cur is not None:
            out[cur].append(ln)
    return {k: '\n'.join(v).strip() for k, v in out.items()}


wk = dict(
    kinds=KINDS, sections=schema['sections'], lint=lint, errors=errors,
    pages={pid: dict(kind=pg['kind'], fm=pg['fm'], sections=sections_of(pg['body']))
           for pid, pg in pages.items()},
)
write_lf(ROOT / 'wk.json', json.dumps(wk, ensure_ascii=False, default=str, indent=1))
print('wk.json written')
