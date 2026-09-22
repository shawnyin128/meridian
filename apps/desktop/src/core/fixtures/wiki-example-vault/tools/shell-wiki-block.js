/* ===== Wiki: Two aggregations (problems/methods) plus thesis base. Data and example vault have the same origin (wk.json) ===== */
const WK=__WK__;
const WKK=WK.kinds;
const WKPAGES=WK.pages;
const wkEsc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const wkAgg=id=>{const p=WKPAGES[id];return p&&p.kind!=='paper'?p:null};
const wkPaper=id=>{const p=WKPAGES[id];return p&&p.kind==='paper'?p:null};
const wkParents=id=>(WKPAGES[id].fm.parents||[]);
const wkKids=id=>Object.keys(WKPAGES).filter(k=>wkAgg(k)&&wkParents(k).includes(id)).sort();
const wkMembers=id=>Object.keys(WKPAGES).filter(k=>wkPaper(k)&&(WKPAGES[k].fm.memberships||[]).some(m=>m.in===id)).sort();
const wkMem=(pid,aid)=>(WKPAGES[pid].fm.memberships||[]).find(m=>m.in===aid);
const wkRoots=kind=>Object.keys(WKPAGES).filter(k=>WKPAGES[k].kind===kind&&!wkParents(k).length).sort();
const wkUpd=id=>String(WKPAGES[id].fm.updated||'');
const wkLint=id=>WK.lint.filter(l=>l.page===id);
const wkDescribe=a=>a.sections[WKK[a.kind].describe.section]||'';
const wkFirst=s=>(s.split('\n').find(l=>l.trim())||'');
const wkShort=id=>{const p=WKPAGES[id];return p?(p.fm.short||p.fm.title):id};
/* Inline tags in the text: [[id|text]] is an intra-page jump, (p.N) is the original text anchor, **x** is bold */
const wkInline=s=>wkEsc(s)
  .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,id,l)=>`<span class="wl" data-wk="${id}">${l||wkShort(id)}</span>`)
  .replace(/\(p\.(\d+)\)/g,'<span class="cite" title="原文第 $1 页">p.$1</span>')
  .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
const wkAnc=c=>`<span class="anc" data-page="${wkEsc(c.at.page)}" data-quote="${wkEsc(c.at.quote)}">${wkEsc(c.value)}<sup>p${wkEsc(c.at.page)}</sup></span>`;

/* The names referenced by other screens in the shell still exist, and the content is re-data mapped. */
const WIKIT={};
Object.keys(WKPAGES).filter(k=>WKPAGES[k].kind==='topic').forEach(k=>{WIKIT[k]={name:WKPAGES[k].fm.title,upd:wkUpd(k),sum:wkFirst(wkDescribe(WKPAGES[k]))}});
const WIKIP={};
const WIKIDOM={t:'',covers:[],upd:'',sum:''};
/* Recommended reading: The discovery of lint and the determination of recently added entries */
const WIKIREC=[
  {pg:'topics/ptq-weight-activation',why:'SmoothQuant 那页 9 月 5 日改过,你 8 月 1 日写的结论待复核'},
  {pg:'methods/rotation',why:'表里 QuaRot「旋转是否学习」那格是空的,由一条结论补上——原文摘要没写'},
  {pg:'topics/kv-cache-quantization',why:'只有 2 篇成员,再进一篇就够一张表'},
];
let wikiState={page:null};
const WK_LINT_LABEL={thin:'成员不足','single-child':'只有一子',split:'拆分',merge:'合并',stale:'待复核',error:'错误'};
const wkBadge=id=>wkLint(id).filter(l=>l.sev!=='info').slice(0,2)
  .map(l=>`<span class="stag ${l.kind==='stale'?'confx':'pend'}">${WK_LINT_LABEL[l.kind]||l.kind}</span>`).join('');
const DOTS=`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>`;
const aggCard=id=>{const a=WKPAGES[id],kids=wkKids(id),mem=wkMembers(id),par=wkParents(id),sum=wkFirst(wkDescribe(a));
  return `<div class="wkcard" data-wk="${id}" title="${wkEsc(sum)}">
  <div class="wt"><span class="wkind">${WKK[a.kind].label}</span><span class="tt">${wkEsc(a.fm.title)}</span>${par.length>1?`<span class="wkind" title="${wkEsc(par.join(', '))}">${par.length} 父</span>`:''}<span class="sp"></span><button class="dots" data-am="${id}" title="管理">${DOTS}</button></div>
  <div class="wm">${wkEsc(sum)}</div>
  <div class="wf">${kids.length?kids.length+' 子聚合 · ':''}${mem.length} 篇 · 更新 ${wkUpd(id)}${wkBadge(id)}</div></div>`};
const paperCard=p=>`<div class="wkcard" data-wk="p:${p.id||'x'}" title="${wkEsc(p.t)}">
  <div class="wt"><span class="wkind">论文</span><span class="tt">${wkEsc(p.t.split(':')[0])}</span><span class="sp"></span><button class="dots" data-lm="${wkEsc(p.t)}" title="管理">${DOTS}</button></div>
  <div class="wm">${p.y} ${p.v} · ${p.topics.join(' / ')}</div>
  <div class="wf">${p.notes||0} 笔记 · ${p.concl||0} 结论</div></div>`;
/* Unified skeleton of the page: attribute table + chapter header + associated row */
const wkProps=rows=>`<div class="wkprops">${rows.filter(r=>r[1]).map(([k,v])=>`<div class="pk">${k}</div><div class="pv">${v}</div>`).join('')}</div>`;
const wkSec=t=>`<div class="wksec">${t}</div>`;
const wkSh=t=>`<div class="sh">${t}</div>`;
const wkRel=(label,chips)=>`<div class="wkrel"><span class="rl">${label}</span>${chips}</div>`;
const wkChip=id=>`<span class="tagchip" data-wk="${id}">${wkEsc(WKPAGES[id].fm.title)}</span>`;
function wkTitle(k){
  if(k.startsWith('p:')){const p=PAPERS.find(x=>'p:'+x.id===k);return p?p.t.split(':')[0]:'论文'}
  return WKPAGES[k]?wkShort(k):k;
}
/* Aggregation Management:Cards...Menu (renamed) */
function aggMenu(id,x,y){
  openSelPop(x,y,`<div class="mi" id="agRen">重命名</div>`);
  $('agRen').onclick=()=>{
    closeSelPop();
    ddlPop(x,y,{title:'重命名聚合',ph:'名称,回车保存',val:WKPAGES[id].fm.title,onSave:v=>{
      WKPAGES[id].fm.title=v;if(WIKIT[id])WIKIT[id].name=v;
      wikiState.page?wkRender(wikiState.page):renderWikiHome();
      banner('已重命名 · 记入最近变动,可撤销');
    }});
  };
}
function wikiClicks(){
  $('deskBody').onclick=e=>{
    const am=e.target.closest('.dots[data-am]');
    if(am){const r=am.getBoundingClientRect();aggMenu(am.dataset.am,r.left-120,r.bottom+4);return}
    const lm=e.target.closest('.dots[data-lm]');
    if(lm){const r=lm.getBoundingClientRect();libMenu(lm.dataset.lm,r.left-120,r.bottom+4);return}
    if(e.target.closest('[data-open-thread]')){toast('(demo)原文阅读以 LongSpec 为例');return}
    const w=e.target.closest('[data-wk]');
    if(!w)return;
    openWikiPage(w.dataset.wk);
  };
}
let wikiPrev=[];
function openWiki(){
  if(!toggleDesk('desk:wiki'))return;
  exitReader();
  $('main').classList.add('desk-open');
  wikiPrev=[];wikiState.page=null;renderWikiHome();
}
function wikiHome(){wikiPrev=[];wikiState.page=null;renderWikiHome()}
function wkRender(id){
  wikiState.page=id;
  pagerFoot('');
  if(wkPaper(id))renderPaperWiki(id);
  else if(wkAgg(id))renderAgg(id);
  else{toast('(demo)该页不在示例数据里');wikiState.page=null;renderWikiHome()}
}
/*
 * Return = history return (return to where you came from); the structure jumps to breadcrumbs.
 * When jumping into a wiki across views, the source (other desk views) is also pushed into the stack. Returning can return to the original view.
 */
function restoreView(loc){
  if(loc.view.startsWith('inbox:')){openInbox(loc.view.slice(6));return}
  const f={'desk:resproj':openResProjects,'desk:restl':openResTimeline,'desk:papers':openPapers,
    'desk:changelog':openChangelog,'desk:inboxmgr':openInboxMgr}[loc.view];
  f&&f();
  if(loc.view==='desk:resproj'&&loc.proj){resState.proj=loc.proj;renderProject()}
}
function wikiBack(){
  const prev=wikiPrev.pop();
  if(prev&&typeof prev==='object'){restoreView(prev);return}
  if(prev)wkRender(prev);else wikiHome();
}
function openWikiPage(id){
  if(id.startsWith('p:'))id='papers/'+id.slice(2);
  if(deskView!=='desk:wiki'||!$('main').classList.contains('desk-open')){
    const origin=$('main').classList.contains('desk-open')&&deskView&&deskView!=='desk:wiki'
      ?{view:deskView,proj:resState.proj}:null;
    deskView='desk:wiki';markActive();$('deskFoot').style.display='none';
    $('main').classList.remove('feedmain');$('main').classList.add('desk-open');
    document.querySelectorAll('.chat-row').forEach(r=>r.classList.remove('on'));
    syncFeedRow();
    wikiPrev=origin?[origin]:[];
  }else if(wikiState.page!==id){
    wikiPrev.push(wikiState.page);
  }
  wkRender(id);
}
/* Home page: Recommended reading at the top, one grid for each type of aggregation (only the root node is placed, and the hierarchy goes down the page), and finally the paper base */
function renderWikiHome(){
  $('deskBack').style.display='none';
  const n=kind=>Object.keys(WKPAGES).filter(k=>WKPAGES[k].kind===kind).length;
  $('deskTitle').textContent='Wiki · '+Object.keys(WKK).map(k=>n(k)+' '+WKK[k].label).join(' · ');
  $('deskBody').innerHTML=`
    <div class="wk-sec">推荐阅读</div>
    <div class="wkcards">${WIKIREC.filter(r=>WKPAGES[r.pg]).map(r=>{const a=WKPAGES[r.pg];return`
      <div class="wkcard" data-wk="${r.pg}" title="${wkEsc(r.why)}">
        <div class="wt"><span class="tt">${wkEsc(a.fm.title)}</span><span class="sp"></span><button class="dots" data-am="${r.pg}" title="管理">${DOTS}</button></div>
        <div class="wm">${wkEsc(r.why)}</div><div class="wf">更新 ${wkUpd(r.pg)}${wkBadge(r.pg)}</div></div>`}).join('')}</div>
    ${Object.keys(WKK).map(kind=>`
    <div class="wk-sec">${WKK[kind].label}</div>
    <div class="wkgrid">${wkRoots(kind).map(aggCard).join('')}</div>`).join('')}
    <div class="wk-sec">论文</div>
    <div class="wkgrid">${pageSlice(PAPERS,wkPg).map(paperCard).join('')}</div>`;
  pagerFoot(pagerHTML('wkp',PAPERS.length,wkPg,[12,24,48]),
    e=>{if(pagerClick(e,wkPg))renderWikiHome()});
  wikiClicks();
  syncCrumb();
}
/* Aggregation page: Only the body of knowledge - description, sub-aggregation, comparison table, and three additional areas are placed in the main text; attributes and associations are placed in the right column */
function renderAgg(id){
  const a=WKPAGES[id],kind=a.kind,K=WKK[kind];
  $('deskBack').style.display='flex';
  $('deskTitle').textContent=a.fm.title;
  const kids=wkKids(id),mem=wkMembers(id),par=wkParents(id),cols=a.fm.columns||[],lint=wkLint(id),derived=K.derived_columns||[];
  const attn=lint.length?`${wkSec('需要注意 · '+lint.length)}<div class="attn">${lint.map(l=>
    `<div class="attnrow"><span class="ak ${l.sev==='warn'?'warn':l.sev==='err'?'bad':'info'}">${WK_LINT_LABEL[l.kind]||l.kind}</span>${wkEsc(l.text)}</div>`).join('')}</div>`:'';
  const table=(cols.length||mem.length)
    ?(mem.length?`<div class="tblwrap"><table class="cmp"><thead><tr><th>论文</th>${cols.map(c=>`<th>${wkEsc(c.label)}</th>`).join('')}${derived.map(d=>`<th class="dv">${wkEsc(d.label)}<span class="wkind">派生</span></th>`).join('')}</tr></thead><tbody>${
        mem.map(pid=>{const m=wkMem(pid,id),p=WKPAGES[pid];return`<tr><td class="rh"><span class="wl" data-wk="${pid}">${wkEsc(p.fm.short||p.fm.title)}</span></td>${
          cols.map(c=>{const cell=m.cells&&m.cells[c.key];return cell?`<td>${wkAnc(cell)}</td>`:'<td class="na">—</td>'}).join('')}${
          derived.map(d=>`<td class="dv">${(p.fm.memberships||[]).filter(x=>WKPAGES[x.in]&&WKPAGES[x.in].kind===d.from_kind).map(x=>wkChip(x.in)).join('')||'—'}</td>`).join('')}</tr>`}).join('')
      }</tbody></table></div>`:'<p class="lm">暂无成员。</p>')
    :'<p class="lm">这个节点不直接收论文;它的内容是「沿什么维度拆的」加子聚合。</p>';
  const dated=name=>{const rows=(a.sections[name]||'').split('\n').filter(l=>l.startsWith('- '));
    return rows.length?rows.map(l=>{const m=l.match(/^- (\d{4}-\d{2}-\d{2}) · (.*)$/);
      return`<div class="tlrow">${m?`<span class="tm">${m[1]}</span> ${wkInline(m[2])}`:wkInline(l.slice(2))}</div>`}).join('')
      :'<p class="lm">还没有条目</p>'};
  const rel=Object.keys(WKK).filter(k=>k!==kind).map(k=>{
    const ids=[...new Set(mem.flatMap(pid=>(WKPAGES[pid].fm.memberships||[]).map(m=>m.in).filter(x=>WKPAGES[x]&&WKPAGES[x].kind===k)))].sort();
    return ids.length?wkRel(WKK[k].label,ids.map(wkChip).join('')):''}).join('');
  $('deskBody').innerHTML=`<div class="wkpage">
    <div class="wkmain">
      ${attn}
      <p class="lede"${lint.length?' style="margin-top:18px"':''}>${wkInline(wkDescribe(a)).replace(/\n\n/g,'</p><p>')}</p>
      ${wkSec('子聚合')}
      ${kids.length?`<div class="wkgrid">${kids.map(aggCard).join('')}</div>`:'<p class="lm">没有子聚合。</p>'}
      ${wkSec('对照表')}
      ${table}
      ${WK.sections.map(s=>wkSec(s.label)+dated(s.label)).join('')}
    </div>
    <div class="wkside">
      ${wkSh('属性')}
      ${wkProps([['类型',K.label],['规模',`${mem.length} 篇${kids.length?' · '+kids.length+' 子聚合':''}`],['拆分',a.fm.split_on?wkEsc(a.fm.split_on):''],['更新',wkUpd(id)]])}
      ${(par.length||rel)?wkSh('关联'):''}
      ${par.length?wkRel('上级',par.map(wkChip).join('')):''}
      ${rel}
      ${wkSh('本页变动')}
      <div class="lm">${wkUpd(id)} · 对照表按成员重新生成</div>
    </div>
  </div>`;
  wikiClicks();
  syncCrumb();
}
/* Paper page: The main text is the abstract, mechanism, and results of this article; the right column contains attributes, original text entry, and its attribution in each aggregation. */
function renderPaperWiki(pid){
  const p=WKPAGES[pid],fm=p.fm,keys=Object.keys(p.sections);
  $('deskBack').style.display='flex';
  $('deskTitle').textContent=fm.short||fm.title;
  const mems=(fm.memberships||[]).map(m=>{const a=WKPAGES[m.in];if(!a)return'';const cols={};(a.fm.columns||[]).forEach(c=>cols[c.key]=c.label);
    return`<div class="memb">${wkRel(WKK[a.kind].label,wkChip(m.in))}
      <div class="wkprops">${Object.entries(m.cells||{}).map(([k,c])=>`<div class="pk">${wkEsc(cols[k]||k)}</div><div class="pv">${wkAnc(c)}</div>`).join('')}</div></div>`}).join('');
  $('deskBody').innerHTML=`<div class="wkpage">
    <div class="wkmain">
      <p class="lede">${wkInline(p.sections[keys[0]]||'')}</p>
      ${keys.slice(1).map(k=>wkSec(k)+`<p>${wkInline(p.sections[k])}</p>`).join('')}
    </div>
    <div class="wkside">
      ${wkSh('属性')}
      ${wkProps([['类型','论文'],['作者',wkEsc((fm.authors||[]).join(', '))],['发表',`${fm.year} ${wkEsc(fm.venue||'')}`],['原文',`<span class="lm">${wkEsc(fm.pdf||'')}</span>`],['更新',wkUpd(pid)]])}
      <div class="macts"><button class="btn pri" data-open-thread>打开原文阅读</button></div>
      ${wkSh('归属')}
      ${mems}
    </div>
  </div>`;
  wikiClicks();
  syncCrumb();
}
/* Two entries called by their old names elsewhere in the shell */
function renderTopicPage(id){renderAgg(WKPAGES[id]?id:('topics/'+id))}
function renderWikiPage(){wkRender(wikiState.page)}
/* Anchor tip: Hover a box to see the original text it refers to */
(function(){
  const t=document.createElement('div');t.id='wktip';t.hidden=true;document.body.appendChild(t);
  document.addEventListener('mouseover',e=>{
    const c=e.target.closest&&e.target.closest('.anc');if(!c)return;
    t.textContent='';const b=document.createElement('b');b.textContent='p.'+c.dataset.page+' · 原文';t.appendChild(b);t.append('“'+c.dataset.quote+'”');
    t.hidden=false;
    const r=c.getBoundingClientRect();
    t.style.left=Math.min(r.left,innerWidth-t.offsetWidth-12)+'px';
    let top=r.bottom+8;if(top+t.offsetHeight>innerHeight)top=r.top-t.offsetHeight-8;
    t.style.top=Math.max(8,top)+'px';
  });
  document.addEventListener('mouseout',e=>{if(e.target.closest&&e.target.closest('.anc'))t.hidden=true});
})();
