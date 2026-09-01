'use strict';
const $ = id => document.getElementById(id);
const view = $('view'), titleEl = $('title');
const LV = ['L1','L2','L3','L4','L5','L6'];
let META = {L1:'초1',L2:'초2',L3:'초3~4',L4:'초5~6',L5:'상용1',L6:'상용2'};
const lvLabel = L => `${L} (${META[L]||''})`;
let BANK = {}, EX = {}, ETY = {}, ONKUN = {}, WORD = {};
let vocab = load('vocab', {}), stats = load('quizStats', {});
let tab = 'learn';
let learnMode = load('learnMode','kanji');

function load(k, d){ try{ return JSON.parse(localStorage.getItem(k)) || d; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function uniqBy(a,f){ const s=new Set(); return a.filter(x=>{const k=f(x); if(s.has(k))return false; s.add(k); return true;}); }
function hanCount(w){ return Array.from(w||'').filter(c=>/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(c)).length; }

Promise.all([
  fetch('kanji_bank.json').then(r=>r.json()),
  fetch('examples.json').then(r=>r.json()).catch(()=>({})),
  fetch('etymology.json').then(r=>r.json()).catch(()=>({})),
  fetch('word_bank.json').then(r=>r.json()).catch(()=>({}))
]).then(([b,ex,ety,wb])=>{
  BANK=b; EX=ex; ETY=ety; WORD=wb||{};
  if(BANK._meta) META=BANK._meta;
  for(const L of LV) for(const x of (BANK[L]||[])) ONKUN[(x.k||'').normalize('NFC')]={on:x.on||[],kun:x.kun||[],e:x.e,d:x.d};
  document.querySelectorAll('.tabbar button').forEach(btn=>btn.addEventListener('click',()=>{ tab=btn.dataset.tab; syncTabs(); render(); }));
  render();
}).catch(e=>{ view.innerHTML='<div class="empty">데이터를 불러오지 못했습니다.<br>index.html·app.js·json 파일이 같은 폴더에 있고,<br>웹서버(https)로 열었는지 확인하세요.</div>'; });

function syncTabs(){ document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('on', b.dataset.tab===tab)); }
function render(){ if(tab==='learn') renderLearn(); else if(tab==='vocab') renderVocab(); else renderQuiz(); }

/* ---------- 공통 렌더 조각 ---------- */
function jpLine(x){
  const on=(x.on||[]).slice(0,3).join(' / '), kun=(x.kun||[]).slice(0,3).join(' / ');
  return `<span class="lbl">음</span><span class="on">${on||'없음'}</span><span class="lbl">훈</span><span class="kun">${kun||'없음'}</span>`;
}
function exHtml(k){
  const list=(EX[(k||'').normalize('NFC')])||[];
  if(!list.length) return '';
  return `<div class="sec ex"><h4>대표 숙어</h4>`+list.map(e=>
    `<div class="ex-row"><span class="w">${esc(e.w)}</span><span class="r">${esc(e.r||'')}</span>${e.k?`<span class="k">${esc(e.k)}</span>`:''}<span class="m">${esc(e.m||'')}</span></div>`).join('')+`</div>`;
}
function etyBlock(k){
  const e=ETY[(k||'').normalize('NFC')];
  if(!e) return `<div class="ety"><div class="row muted">자원 정보가 없습니다.</div></div>`;
  const comp=(e.comp||[]).map(c=>`<span class="cc">${esc(c.c)}</span>${c.e?`<span class="ce">${esc(c.e)}</span>`:'<span class="ce-none">자소</span>'}`).join(' ');
  let note='';
  if(e.sem&&e.phon) note=`<div class="row">뜻 <span class="sem" style="color:#8ce99a;font-weight:700">${esc(e.sem.c)}${e.sem.e?'('+esc(e.sem.e)+')':''}</span> + 소리 <span class="phon" style="color:var(--orange);font-weight:700">${esc(e.phon.c)}${e.phon.e?'('+esc(e.phon.e)+')':'(자소)'}</span></div>`;
  return `<div class="ety">
    ${e.type?`<div class="row"><span class="lab">유형</span><span class="tag">${esc(e.type)}</span></div>`:''}
    ${e.r?`<div class="row"><span class="lab">부수</span><span class="cc">${esc(e.r)}</span>${e.re?`<span class="ce">${esc(e.re)}</span>`:''}</div>`:''}
    ${comp?`<div class="row"><span class="lab">구성</span>${comp}</div>`:''}
    ${note}
    ${e.story?`<div class="story">${esc(e.story)}</div>`:''}</div>`;
}
function etyHtml(word){
  const uniq=[...new Set(Array.from(word||'').filter(c=>/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(c)))];
  return uniq.map(c=>`<div style="margin-bottom:10px"><div style="font-size:22px;font-weight:800;margin-bottom:4px">${esc(c)}</div>${etyBlock(c)}</div>`).join('');
}

/* ---------- 학습 (카드 한 장씩, 랜덤) ---------- */
let learnLv = load('learnLv','L1'), learnIdx = 0, learnIdxW = 0;
let memo = load('memo', {});  // { 한자/숙어: true } 암기완료 표시
let learnDeck = [], learnDeckLv = null, learnDeckW = [], learnDeckWLv = null;
// 암기완료는 뒤로 밀리는 가중 셔플
function wshuffle(list, keyFn){
  const arr=list.slice(), out=[];
  while(arr.length){
    const ws=arr.map(x=>memo[keyFn(x)]?0.12:1);
    let tot=ws.reduce((a,b)=>a+b,0), r=Math.random()*tot, i=0;
    while(r>ws[i]){ r-=ws[i]; i++; }
    out.push(arr.splice(i,1)[0]);
  }
  return out;
}
function renderLearn(){
  titleEl.textContent='학습';
  view.innerHTML = `<div class="seg" id="mode" style="margin-bottom:12px">
      <button data-v="kanji" class="${learnMode==='kanji'?'on':''}">한자</button>
      <button data-v="word" class="${learnMode==='word'?'on':''}">숙어</button>
    </div><div id="learn-body"></div>`;
  $('mode').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ learnMode=b.dataset.v; save('learnMode',learnMode); renderLearn(); }));
  if(learnMode==='word') renderLearnWord(); else renderLearnKanji();
}

function renderLearnKanji(){
  const body=$('learn-body');
  if(learnDeckLv!==learnLv || !learnDeck.length){ learnDeck=wshuffle(BANK[learnLv]||[], x=>x.k); learnDeckLv=learnLv; learnIdx=0; }
  const list=learnDeck;
  if(!list.length){ body.innerHTML='<div class="empty">데이터가 없습니다.</div>'; return; }
  if(learnIdx>=list.length) learnIdx=0;
  const x=list[learnIdx];
  const inv=vocab[x.k], done=!!memo[x.k];
  body.innerHTML=`
    <div class="learn-top">
      <div class="seg" id="lv">${LV.map(L=>`<button data-v="${L}" class="${learnLv===L?'on':''}">${L}</button>`).join('')}</div>
      <div class="muted" style="font-size:13px">${learnIdx+1} / ${list.length}</div>
    </div>
    <div class="muted" style="font-size:12px;margin:-4px 0 8px">${LV.map(L=>L+' '+(META[L]||'')).join(' · ')}</div>
    <div class="kcard">
      <span class="lvl">${lvLabel(learnLv)}${done?' · 암기완료':''}</span>
      <div class="han">${esc(x.k)}</div>
      <div class="eumhun">${esc(x.d)}</div>
      <div class="jp">${jpLine(x)}</div>
      ${exHtml(x.k)}
      <div class="sec"><h4>자원(字源)</h4>${etyHtml(x.k)}</div>
      <div class="learn-btns">
        <button class="btn ghost memo-btn ${done?'done':''}" id="memo">${done?'✓ 암기완료됨':'암기완료'}</button>
        <button class="btn ghost save-btn ${inv?'saved':''}" id="save" ${inv?'disabled':''}>${inv?'단어장에 있음':'+ 단어장'}</button>
      </div>
      <div class="nav"><button class="btn ghost" id="prev">← 이전</button><button class="btn" id="next">다음 →</button></div>
    </div>`;
  $('lv').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ learnLv=b.dataset.v; save('learnLv',learnLv); learnDeckLv=null; renderLearn(); }));
  $('prev').addEventListener('click',()=>{ learnIdx=(learnIdx-1+list.length)%list.length; renderLearn(); });
  $('next').addEventListener('click',()=>{ learnIdx=(learnIdx+1)%list.length; renderLearn(); });
  const sb=$('save'); if(!inv) sb.addEventListener('click',()=>{ addVocab(x); renderLearn(); });
  $('memo').addEventListener('click',()=>{ memo[x.k]=true; save('memo',memo); learnIdx=(learnIdx+1)%list.length; renderLearn(); });
}

function renderLearnWord(){
  const body=$('learn-body');
  if(learnDeckWLv!==learnLv){ learnDeckW=wshuffle(WORD[learnLv]||[], x=>x.w); learnDeckWLv=learnLv; learnIdxW=0; }
  const list=learnDeckW;
  if(!list.length){ body.innerHTML=`<div class="seg" id="wlv" style="margin-bottom:12px">${LV.map(L=>`<button data-v="${L}" class="${learnLv===L?'on':''}">${L}</button>`).join('')}</div><div class="empty">이 레벨의 숙어 데이터가 없습니다.</div>`;
    $('wlv').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{learnLv=b.dataset.v;save('learnLv',learnLv);learnDeckWLv=null;renderLearn();})); return; }
  if(learnIdxW>=list.length) learnIdxW=0;
  const x=list[learnIdxW];
  const inv=vocab[x.w], done=!!memo[x.w];
  const per=Array.from(x.w).filter(c=>/[\u4e00-\u9fff]/.test(c)).map(c=>{ const bk=ONKUN[c.normalize('NFC')]; return `<span style="margin-right:12px"><b style="font-size:18px">${esc(c)}</b> <span style="color:var(--gold)">${bk?esc(bk.d):'?'}</span></span>`; }).join('');
  body.innerHTML=`
    <div class="learn-top">
      <div class="seg" id="wlv">${LV.map(L=>`<button data-v="${L}" class="${learnLv===L?'on':''}">${L}</button>`).join('')}</div>
      <div class="muted" style="font-size:13px">${learnIdxW+1} / ${list.length}</div>
    </div>
    <div class="muted" style="font-size:12px;margin:-4px 0 8px">${LV.map(L=>L+' '+(META[L]||'')).join(' · ')}</div>
    <div class="kcard">
      <span class="lvl">${lvLabel(learnLv)} 숙어${done?' · 암기완료':''}</span>
      <div class="han" style="font-size:64px">${esc(x.w)}</div>
      <div class="jp" style="font-size:22px;color:var(--orange);text-align:center;margin-bottom:6px">${esc(x.r)}</div>
      <div class="eumhun">${esc(x.k)}</div>
      <div style="text-align:center;font-size:18px;color:var(--accent);font-weight:700;margin-bottom:14px">${esc(x.m)}</div>
      <div class="sec"><h4>글자별 음훈</h4><div>${per||'<span class="muted">-</span>'}</div></div>
      <div class="sec"><h4>자원(字源)</h4>${etyHtml(x.w)}</div>
      <div class="learn-btns">
        <button class="btn ghost memo-btn ${done?'done':''}" id="wmemo">${done?'✓ 암기완료됨':'암기완료'}</button>
        <button class="btn ghost save-btn ${inv?'saved':''}" id="wsave" ${inv?'disabled':''}>${inv?'단어장에 있음':'+ 단어장'}</button>
      </div>
      <div class="nav"><button class="btn ghost" id="wprev">← 이전</button><button class="btn" id="wnext">다음 →</button></div>
    </div>`;
  $('wlv').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ learnLv=b.dataset.v; save('learnLv',learnLv); learnDeckWLv=null; renderLearn(); }));
  $('wprev').addEventListener('click',()=>{ learnIdxW=(learnIdxW-1+list.length)%list.length; renderLearn(); });
  $('wnext').addEventListener('click',()=>{ learnIdxW=(learnIdxW+1)%list.length; renderLearn(); });
  const sb=$('wsave'); if(!inv) sb.addEventListener('click',()=>{ vocab[x.w]={w:x.w,ko:x.k,hun:x.m,jp:x.r,lvl:learnLv+' 숙어',t:Date.now()}; save('vocab',vocab); renderLearn(); });
  $('wmemo').addEventListener('click',()=>{ memo[x.w]=true; save('memo',memo); learnIdxW=(learnIdxW+1)%list.length; renderLearn(); });
}

function addVocab(x){
  vocab[x.k]={ w:x.k, ko:x.e, hun:x.d, jp:(x.on||[]).slice(0,3).join('·'), lvl:learnLvOf(x.k), t:Date.now() };
  save('vocab',vocab);
}
function learnLvOf(k){ for(const L of LV){ if((BANK[L]||[]).some(y=>y.k===k)) return L; } return ''; }

/* ---------- 단어장 ---------- */
function renderVocab(){
  titleEl.textContent='단어장';
  view.ontouchstart=view.ontouchend=null;
  const arr=Object.values(vocab).sort((a,b)=>(b.t||0)-(a.t||0));
  view.innerHTML=`
    <div class="toolbar">
      <button class="btn" id="toquiz">단어장으로 시험</button>
      <button class="btn ghost" id="csv">CSV 내보내기</button>
      <button class="btn ghost" id="anki">Anki</button>
      <button class="btn ghost" id="imp">가져오기</button>
      <button class="btn ghost" id="clear">전체삭제</button>
    </div>
    <input id="search" placeholder="한자·음·훈 검색">
    <div id="vlist"></div>
    <input type="file" id="file" accept=".csv,text/csv" style="display:none">`;
  const draw=()=>{
    const q=($('search').value||'').trim();
    let a=arr; if(q) a=a.filter(v=>(v.w+' '+v.ko+' '+v.hun).includes(q));
    $('vlist').innerHTML = a.length? a.map(v=>`
      <div class="item"><div class="han">${esc(v.w)}</div>
      <div class="meta"><div><span class="eh">${esc(v.ko)}</span> · ${esc(v.hun)}${v.lvl?` <span class="muted">(${v.lvl})</span>`:''}</div></div>
      <div class="del" data-w="${esc(v.w)}">×</div></div>`).join('')
      : `<div class="empty">${Object.keys(vocab).length?'검색 결과가 없습니다.':'담은 한자가 없습니다.<br>학습 탭에서 "+ 단어장에 담기"를 눌러보세요.'}</div>`;
    $('vlist').querySelectorAll('.del').forEach(el=>el.addEventListener('click',()=>{ delete vocab[el.dataset.w]; save('vocab',vocab); renderVocab(); }));
  };
  draw();
  $('search').addEventListener('input',draw);
  $('toquiz').addEventListener('click',()=>{ tab='quiz'; syncTabs(); quizCfg.src='vocab'; renderQuiz(); });
  $('csv').addEventListener('click',exportCsv);
  $('anki').addEventListener('click',exportAnki);
  $('imp').addEventListener('click',()=>$('file').click());
  $('file').addEventListener('change',importCsv);
  $('clear').addEventListener('click',()=>{ if(Object.keys(vocab).length&&confirm('모두 삭제할까요?')){ vocab={}; save('vocab',vocab); renderVocab(); } });
}
function download(name,text,mime){ const b=new Blob([text],{type:mime||'text/plain;charset=utf-8'}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1000); }
function csvField(s){ return '"'+String(s==null?'':s).replace(/"/g,'""')+'"'; }
function exportCsv(){
  const arr=Object.values(vocab); if(!arr.length)return;
  const rows=[['한자','한국음','훈음','음독','급수','저장일']];
  arr.forEach(v=>rows.push([v.w,v.ko,v.hun,v.jp||'',v.lvl||'',new Date(v.t||Date.now()).toLocaleString('ko-KR')]));
  download('한자단어장.csv','\uFEFF'+rows.map(r=>r.map(csvField).join(',')).join('\r\n'),'text/csv;charset=utf-8');
}
function exportAnki(){
  const arr=Object.values(vocab); if(!arr.length)return;
  download('한자단어장_Anki.txt', arr.map(v=>v.w+'\t'+['한국음: '+v.ko,'훈음: '+v.hun].join('<br>')).join('\n'));
}
function importCsv(ev){
  const f=ev.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    const text=String(r.result).replace(/^\uFEFF/,'');
    const lines=text.split(/\r?\n/).filter(Boolean);
    let n=0;
    for(let i=1;i<lines.length;i++){
      const m=lines[i].match(/^"?([^",]+)"?/);
      const han=m&&m[1]?m[1].trim():'';
      if(han && /[\u4e00-\u9fff]/.test(han) && !vocab[han]){
        const bk=ONKUN[han.normalize('NFC')];
        vocab[han]={ w:han, ko:bk?bk.e:'', hun:bk?bk.d:'', jp:bk?(bk.on||[]).join('·'):'', lvl:learnLvOf(han), t:Date.now() };
        n++;
      }
    }
    save('vocab',vocab); alert(n+'개 가져왔습니다.'); renderVocab();
  };
  r.readAsText(f,'utf-8');
}

/* ---------- 시험 ---------- */
let quizCfg={src:'jlpt',level:'L1',cumulative:false,type:'mix',num:10};
let Q=[], qi=0, sc=0, wrong=[], advancing=false;

function poolItems(){
  if(quizCfg.src==='vocab'){
    return Object.values(vocab).map(v=>{
      const ok=ONKUN[(v.w||'').normalize('NFC')]; const single=Array.from(v.w||'').length===1;
      return { key:'v:'+v.w, q:v.w, ko:v.ko, hun:v.hun, on:(single&&ok)?ok.on:[], kun:(single&&ok)?ok.kun:[], jpword:(single&&ok)?'':(v.jp||'') };
    });
  }
  const order=LV; let levels=quizCfg.cumulative?order.slice(0,order.indexOf(quizCfg.level)+1):[quizCfg.level];
  let items=[];
  levels.forEach(L=>(BANK[L]||[]).forEach(x=>items.push({ key:'k:'+x.k, q:x.k, ko:x.e, hun:x.d, on:x.on||[], kun:x.kun||[] })));
  return items;
}
function answerOf(it,t){ return t==='hun'?it.hun:it.ko; }
function weightOf(key){ const s=stats[key]||{n:0,c:0}; if(s.n===0)return 4; const a=s.c/s.n; if(s.n>=3&&a>=0.8)return .25; if(a>=.5)return 1; return 2.5; }
function wpick(items,n){ const out=[],arr=items.slice(); for(let k=0;k<n&&arr.length;k++){ const w=arr.map(weightOfItem); let tot=w.reduce((a,b)=>a+b,0),r=Math.random()*tot,i=0; while(r>w[i]){r-=w[i];i++;} out.push(arr.splice(i,1)[0]);} return out; }
function weightOfItem(it){ let w=weightOf(it.key); if(memo[it.q]) w*=0.08; return w; }  // 암기완료는 출제 빈도 확 down

function readingHtml(o){
  const on=(o.on||[]).slice(0,3).join(' / '), kun=(o.kun||[]).slice(0,3).join(' / ');
  if(!on&&!kun&&o.jpword) return `<span class="r-on">읽기 ${esc(o.jpword)}</span>`;
  return `<span class="r-on">음 ${on||'<span class="r-none">없음</span>'}</span><span class="r-kun">훈 ${kun||'<span class="r-none">없음</span>'}</span>`;
}
function mastery(items){
  if(!items.length)return '';
  let seen=0,m=0; items.forEach(it=>{const s=stats[it.key]; if(s&&s.n>0){seen++; if(s.n>=3&&s.c/s.n>=.8)m++;}});
  return `<div class="stat">이 범위 <b>${items.length}</b>자 · 학습함 ${seen} · 숙달(80%+) <b>${m}</b></div>`;
}

function renderQuiz(){ titleEl.textContent='시험'; view.ontouchstart=view.ontouchend=null; quizSetup(); }
function quizSetup(){
  const vN=Object.keys(vocab).length;
  view.innerHTML=`
    <h1>한자 시험</h1>
    <p class="muted">선택 즉시 채점·해설. 80%+ 숙달 한자는 점점 덜 나옵니다.</p>
    <label>출제 범위</label>
    <div class="seg" id="src">
      <button data-v="jlpt" class="${quizCfg.src==='jlpt'?'on':''}">JLPT 급수</button>
      <button data-v="vocab" class="${quizCfg.src==='vocab'?'on':''}">내 단어장 (${vN})</button>
    </div>
    <div id="lvbox" style="${quizCfg.src==='jlpt'?'':'display:none'}">
      <label>레벨 <span class="muted" style="font-weight:400">(${LV.map(L=>L+'('+(META[L]||'')+') '+(BANK[L]||[]).length).join(' · ')})</span></label>
      <div class="seg" id="qlv">${LV.map(L=>`<button data-v="${L}" class="${quizCfg.level===L?'on':''}">${L}</button>`).join('')}</div>
      <label style="font-weight:400;margin-top:10px"><input type="checkbox" id="cum" ${quizCfg.cumulative?'checked':''}> 이 레벨 이하 전체 포함</label>
    </div>
    <label>문제 수</label>
    <select id="num">${[10,20,30,50].map(n=>`<option value="${n}" ${quizCfg.num===n?'selected':''}>${n}문제</option>`).join('')}</select>
    <p style="margin-top:20px"><button class="btn" id="start" style="width:100%">시작하기</button></p>
    ${mastery(poolItems())}`;
  const seg=(id,cb)=>$(id).querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>cb(b.dataset.v)));
  seg('src',v=>{quizCfg.src=v;quizSetup();});
  seg('qlv',v=>{quizCfg.level=v;quizSetup();});
  const cum=$('cum'); if(cum)cum.addEventListener('change',e=>quizCfg.cumulative=e.target.checked);
  $('num').addEventListener('change',e=>quizCfg.num=parseInt(e.target.value,10));
  $('start').addEventListener('click',quizStart);
}
function quizStart(){
  const items=poolItems();
  if(quizCfg.src==='vocab'&&items.length<4){ alert('단어장에 4개 이상 담아주세요. (현재 '+items.length+'개)'); return; }
  if(!items.length){ alert('출제할 한자가 없습니다.'); return; }
  qi=0; sc=0; wrong=[];
  const chosen=wpick(items,Math.min(quizCfg.num,items.length));
  Q=chosen.map(it=>{
    const dir=Math.random()<.5?'h2m':'m2h';
    const tlen=hanCount(it.q);
    let cand=uniqBy(items.filter(x=>x.key!==it.key),x=>x.hun).filter(x=>x.hun!==it.hun && x.q!==it.q);
    let same=shuffle(cand.filter(x=>hanCount(x.q)===tlen)), rest=shuffle(cand.filter(x=>hanCount(x.q)!==tlen));
    let picked=same.concat(rest).slice(0,3);
    const mk=x=> dir==='h2m'
      ? {ans:x.hun,reveal:x.q,on:x.on,kun:x.kun,jpword:x.jpword}
      : {ans:x.q,reveal:x.hun,on:x.on,kun:x.kun,jpword:x.jpword};
    const correct=dir==='h2m'?it.hun:it.q;
    const opts=shuffle([mk(it),...picked.map(mk)]);
    return { it, dir, prompt:(dir==='h2m'?it.q:it.hun), correct, options:opts };
  });
  quizQuestion();
}
function quizQuestion(){
  advancing=false;
  const q=Q[qi], label=q.dir==='h2m'?'알맞은 훈음을 고르세요':'알맞은 한자를 고르세요';
  const promptHtml=q.dir==='h2m'?`<div class="qhan">${esc(q.prompt)}</div>`:`<div class="qhun">${esc(q.prompt)}</div>`;
  const optCls=q.dir==='m2h'?' opt-kanji':'';
  view.innerHTML=`
    <div class="topinfo"><span>${qi+1} / ${Q.length}</span><span>점수 ${sc}</span></div>
    <div class="bar"><div style="width:${(qi/Q.length)*100}%"></div></div>
    <div class="qtype">${label}</div>
    ${promptHtml}
    <div class="options">${q.options.map((o,i)=>`<button class="opt" data-i="${i}"><span class="opt-reading">${readingHtml(o)}</span><span class="opt-ans${optCls}">${esc(o.ans)}</span><span class="opt-han">${esc(o.reveal)}</span></button>`).join('')}</div>
    <div class="verdict" id="verdict"></div>`;
  view.querySelectorAll('.opt').forEach(b=>b.addEventListener('click',()=>quizChoose(b,q)));
}
function quizChoose(btn,q){
  if(advancing)return; advancing=true;
  const chosen=q.options[+btn.dataset.i], ok=chosen.ans===q.correct;
  view.querySelectorAll('.opt').forEach(b=>{
    b.disabled=true; b.querySelectorAll('.opt-reading,.opt-han').forEach(el=>el.classList.add('shown'));
    const o=q.options[+b.dataset.i];
    if(o.ans===q.correct)b.classList.add('correct'); else if(b===btn)b.classList.add('wrong');
  });
  if(ok)sc++; else wrong.push(q);
  const s=stats[q.it.key]||{n:0,c:0}; s.n++; if(ok)s.c++; stats[q.it.key]=s; save('quizStats',stats);
  const last=qi===Q.length-1, inv=vocab[q.it.q];
  const v=$('verdict'); v.className='verdict '+(ok?'ok':'no');
  v.innerHTML=`
    <div class="vh">${ok?'⭕ 정답':'❌ 오답'}</div>
    <div class="vb"><b>${esc(q.it.q)}</b> — ${esc(q.it.hun)}</div>
    <div class="v-read">${readingHtml(q.it)}</div>
    <div class="v-legend"><b>.</b> 뒤 = 활용 어미(한자 소리는 점 앞) · <b>-</b> = 다른 글자가 붙음</div>
    ${(EX[q.it.q.normalize('NFC')]||[]).length?`<div class="v-ex"><div class="h">대표 숙어</div>${(EX[q.it.q.normalize('NFC')]||[]).map(e=>`<div class="ex-row"><span class="w">${esc(e.w)}</span><span class="r">${esc(e.r||'')}</span>${e.k?`<span class="k">${esc(e.k)}</span>`:''}<span class="m">${esc(e.m||'')}</span></div>`).join('')}</div>`:''}
    <div class="v-ety"><div class="h">자원(字源)</div>${etyHtml(q.it.q)}</div>
    <div class="v-actions">
      <button class="btn ghost" id="savew" ${inv?'disabled':''}>${inv?'단어장에 있음':'+ 단어장'}</button>
      <button class="btn" id="next">${last?'결과 보기':'다음 →'}</button>
    </div>`;
  const sw=$('savew');
  if(!inv&&hanCount(q.it.q)===1) sw.addEventListener('click',()=>{ const bk=ONKUN[q.it.q.normalize('NFC')]; vocab[q.it.q]={w:q.it.q,ko:q.it.ko,hun:q.it.hun,jp:bk?(bk.on||[]).join('·'):'',lvl:learnLvOf(q.it.q),t:Date.now()}; save('vocab',vocab); sw.textContent='저장됨 ✓'; sw.disabled=true; });
  else if(!inv){ sw.textContent='숙어는 담기 불가'; sw.disabled=true; }
  $('next').addEventListener('click',()=>{ if(last)quizResult(); else { qi++; quizQuestion(); } });
}
function quizResult(){
  const pct=Math.round((sc/Q.length)*100);
  view.innerHTML=`
    <h1 class="center">시험 완료</h1>
    <div class="score">${sc} / ${Q.length}</div>
    <div class="center muted">이번 정답률 ${pct}%</div>
    ${mastery(poolItems())}
    ${wrong.length?`<h4 style="margin-top:18px">오답 노트 (${wrong.length})</h4><div class="review">${wrong.map(q=>`<div class="r"><span class="h">${esc(q.it.q)}</span><span class="a">${esc(q.it.hun)}</span></div>`).join('')}</div>`:`<p class="center" style="color:#8ce99a;margin-top:16px">전부 정답입니다! 🎉</p>`}
    <div class="center" style="margin-top:18px"><button class="btn" id="again">같은 범위 다시</button> <button class="btn ghost" id="home">설정으로</button></div>`;
  $('again').addEventListener('click',quizStart);
  $('home').addEventListener('click',quizSetup);
}

/* 서비스워커 등록(오프라인) */
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }
