"""把示例 vault 的 wiki 接进拍板的壳:fork platform-shell-demo.html,只替换 wiki 那一块。

用法:python fork_shell.py
读:desktop/design/platform-shell-demo.html、wk.json、shell-wiki-block.js
写:wiki-aggregation-shell-demo.html(可直接发布的页面,去掉了文档外壳标签)
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
VAULT = HERE.parent
DESIGN = VAULT.parent
SRC = DESIGN / 'platform-shell-demo.html'
OUT = DESIGN / 'wiki-aggregation-shell-demo.html'

html = SRC.read_text('utf-8')
wk = json.loads((VAULT / 'wk.json').read_text('utf-8'))


def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'{label}: 期望恰好 1 处,实际 {n} 处')
    return s.replace(old, new)
# 1. Replace the entire wiki data and renderer.
start = html.index('/* ===== Wiki: Knowledge layer maintained by Meridian.')
end = html.index('/* ===== Trash: a safety net for deleting all applications')
block = (HERE / 'shell-wiki-block.js').read_text('utf-8').replace(
    '__WK__', json.dumps(wk, ensure_ascii=False).replace('</', '<\\/'))
html = html[:start] + block + '\n' + html[end:]
# 2. Breadcrumbs show parent and current page for aggregations, and only the current paper page.
old_crumb = """    if(deskView==='desk:wiki'&&wikiState.page){
      const k=wikiState.page;
      parts[parts.length-1].fn=wikiHome;
      if(k.startsWith('t:')||k.startsWith('p:'))parts.push({t:wkTitle(k)});
      else{
        const tid=Object.keys(WIKIT).find(t=>WIKIT[t].name===WIKIP[k].topic);
        parts.push({t:WIKIP[k].topic,fn:tid?()=>openWikiPage('t:'+tid):wikiHome});
        parts.push({t:WIKIP[k].t});
      }
    }"""
new_crumb = """    if(deskView==='desk:wiki'&&wikiState.page){
      const k=wikiState.page;
      parts[parts.length-1].fn=wikiHome;
      const a=wkAgg(k),par=a?(a.fm.parents||[])[0]:null;
      if(par)parts.push({t:wkTitle(par),fn:()=>openWikiPage(par)});
      parts.push({t:wkTitle(k)});
    }"""
html = replace_once(html, old_crumb, new_crumb, '面包屑')
# 3. Global search index.
old_ix = """  Object.entries(WIKIP).forEach(([id,p])=>ix.push({t:'Wiki:'+p.t,m:p.topic||'Wiki 页',go:()=>openWikiPage(id)}));
  Object.entries(WIKIT).forEach(([tid,t])=>ix.push({t:'主题:'+t.name,m:'Wiki 主题页',go:()=>openWikiPage('t:'+tid)}));"""
new_ix = """  Object.keys(WKPAGES).filter(k=>WKPAGES[k].kind!=='paper').forEach(k=>ix.push({t:WKK[WKPAGES[k].kind].label+':'+WKPAGES[k].fm.title,m:'Wiki 聚合页',go:()=>openWikiPage(k)}));"""
html = replace_once(html, old_ix, new_ix, '搜索索引')
# 4. Redraw after deleting a paper.
old_rr = """      wikiState.page&&wikiState.page.startsWith('t:')
        ?renderTopicPage(wikiState.page.slice(2)):renderWikiHome();"""
new_rr = """      wikiState.page?wkRender(wikiState.page):renderWikiHome();"""
html = replace_once(html, old_rr, new_rr, '论文删除重绘')
# 5. Paper foundation: prepend the ten examples.
def entry(pid, pg):
    fm = pg['fm']
    author = fm['authors'][0].split()[-1] + ' et al.'
    topics = [wk['pages'][m['in']]['fm']['title'] for m in fm.get('memberships', [])
              if wk['pages'][m['in']]['kind'] == 'topic']
    return ('  {id:%s,t:%s,a:%s,y:%s,v:%s,topics:%s,projects:[],st:\'读过\',notes:0,concl:0},\n' % (
        json.dumps(pid.split('/')[1]), json.dumps(fm['title'], ensure_ascii=False), json.dumps(author),
        fm['year'], json.dumps(str(fm.get('venue', '')).split()[0]), json.dumps(topics, ensure_ascii=False)))


papers_js = ''.join(entry(pid, pg) for pid, pg in wk['pages'].items() if pg['kind'] == 'paper')
html = replace_once(html, 'const PAPERS=[\n', 'const PAPERS=[\n' + papers_js, 'PAPERS')
# 6. Sidebar badge.
n_aggs = sum(1 for pg in wk['pages'].values() if pg['kind'] != 'paper')
html = replace_once(html, 'Wiki<span class="n">96</span>', f'Wiki<span class="n">{n_aggs}</span>', '侧栏角标')
# 7. New styles for comparison tables, anchors, and memberships.
css = """
/* Comparison table on a wiki aggregation page: rows are member papers, columns come from the aggregation, and cells carry source anchors. */
.cmp{width:100%;border-collapse:collapse;font-size:12.5px;margin:0 0 4px;line-height:1.5}
.cmp th{text-align:left;font-size:12px;color:var(--ter);font-weight:600;padding:6px 10px;border-bottom:1px solid var(--sep);white-space:nowrap}
.cmp td{padding:7px 10px;border-bottom:1px solid var(--sep2);vertical-align:top;max-width:26ch}
.cmp tbody tr:last-child td{border-bottom:0}
.cmp td.rh{white-space:nowrap;font-weight:600}
.cmp td.na{color:var(--ter);text-align:center}
.cmp th.dv,.cmp td.dv{background:var(--hover)}
.cmp th .wkind{margin-left:6px;font-weight:400}
.wl{color:var(--accent);cursor:pointer}
.wl:hover{text-decoration:underline}
.anc{border-bottom:1px dotted var(--ter);cursor:help}
.anc sup{font-size:9px;color:var(--ter);margin-left:2px}
#wktip{position:fixed;z-index:60;max-width:min(44ch,60vw);padding:8px 11px;background:var(--card);color:var(--ink);border:1px solid var(--sep);border-radius:10px;box-shadow:var(--shadow);font-size:12px;line-height:1.55;pointer-events:none}
#wktip b{display:block;font-size:11px;color:var(--ter);margin-bottom:2px}
.memb{margin:4px 0 12px}
.memb .wkprops{grid-template-columns:max-content 1fr;margin-top:4px}
.wkmain .tlrow{font-size:13.5px}
.wkmain .tlrow .tm{margin-right:4px}
"""
i = html.index('</style>')
html = html[:i] + css + html[i:]
# 8. Title and initial wiki route.
html = re.sub(r'<title>.*?</title>', '<title>Meridian Wiki 聚合示例</title>', html, count=1)
html = replace_once(html, '</body>',
                    '<script>window.addEventListener("load",()=>setTimeout(()=>{try{openWiki()}catch(e){console.error(e)}},0))</script>\n</body>',
                    'body 收尾')
# 9. Remove document-shell tags because publishing supplies another shell.
for pat in (r'<!doctype html>\s*', r'<html[^>]*>', r'</html>', r'<head>', r'</head>', r'<body[^>]*>', r'</body>'):
    html = re.sub(pat, '', html, count=1, flags=re.I)

OUT.write_text(html, 'utf-8')
print(f'written {OUT.name}: {len(html)} bytes, {n_aggs} aggs, {len(papers_js.splitlines())} papers prepended')
