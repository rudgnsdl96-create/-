// 시험: 저장 단어 또는 JLPT 급수별 한자. 정답률 기록 → 80%+ 숙달 항목은 출제 빈도 낮춤.
// 선택 즉시 채점·해설 표시 후 자동으로 다음 문제.
const app = document.getElementById('app');
let bank = null;         // { N5:[{k,e,d,on,kun}], ... }
let examples = {};       // { 한자: [{w,r,k,m}] } 대표 숙어
let etymology = {};      // { 한자: {r,re,type,comp,sem,phon} } 자원
let vocab = [];          // 저장 단어
let stats = {};          // { key: {n,c} }
let kanjiOnKun = {};     // { 한자: {on,kun} } 저장 단어 음/훈 보정용
let cfg = { src: 'jlpt', level: 'L1', cumulative: false, type: 'mix', num: 10 };
let META = {L1:'초1',L2:'초2',L3:'초3~4',L4:'초5~6',L5:'상용1',L6:'상용2'};
const LVL = ['L1','L2','L3','L4','L5','L6'];
let pool = [], questions = [], idx = 0, score = 0, wrong = [], advancing = false;

Promise.all([
  fetch(chrome.runtime.getURL('kanji_bank.json')).then(r => r.json()).catch(() => null),
  fetch(chrome.runtime.getURL('examples.json')).then(r => r.json()).catch(() => ({})),
  fetch(chrome.runtime.getURL('etymology.json')).then(r => r.json()).catch(() => ({})),
  new Promise(res => chrome.storage.local.get(['vocab', 'quizStats'], r => res(r)))
]).then(([b, ex, ety, r]) => {
  bank = b || {}; if(bank._meta) META=bank._meta;
  examples = ex || {};
  etymology = ety || {};
  vocab = Object.values(r.vocab || {});
  stats = r.quizStats || {};
  for (const L of LVL) for (const x of (bank[L]||[])) kanjiOnKun[(x.k||'').normalize('NFC')] = { on: x.on || [], kun: x.kun || [] };
  renderSetup();
});

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function uniqBy(a,f){const seen=new Set();return a.filter(x=>{const k=f(x);if(seen.has(k))return false;seen.add(k);return true;});}
function saveStats(){chrome.storage.local.set({quizStats:stats});}

function buildPool() {
  let items = [];
  if (cfg.src === 'vocab') {
    items = vocab.map(v => {
      const ok = kanjiOnKun[(v.w || '').normalize('NFC')];
      const single = Array.from(v.w || '').length === 1;
      return {
        key: 'v:' + v.w, q: v.w, ko: v.ko, hun: v.hun,
        on: (single && ok) ? ok.on : [],
        kun: (single && ok) ? ok.kun : [],
        jpword: (single && ok) ? '' : (v.jp || '')  // 숙어면 저장된 읽기를 그대로
      };
    });
  } else {
    const order = ['L1','L2','L3','L4','L5','L6'];
    let levels = cfg.cumulative ? order.slice(0, order.indexOf(cfg.level)+1) : [cfg.level];
    levels.forEach(L => (bank[L]||[]).forEach(x => {
      items.push({ key:'k:'+x.k, q:x.k, ko:x.e, hun:x.d, on:x.on||[], kun:x.kun||[] });
    }));
  }
  return items;
}

// 자원(字源) 우측 패널
function setSide(html) { const s = document.getElementById('side'); if (s) s.innerHTML = html; }
function sidePlaceholder() { setSide('<div class="ph">정답을 고르면<br>이 한자의 자원(字源)이<br>여기에 표시됩니다.</div>'); }
function etymologyBlock(kanji) {
  const e = etymology[(kanji || '').normalize('NFC')];
  if (!e) return `<div class="ety-block"><div class="ety-han">${esc(kanji)}</div><div class="ph">자원 정보가 없습니다.</div></div>`;
  const comp = (e.comp || []).map(c => `<span class="ety-comp"><span class="cc">${esc(c.c)}</span>${c.e?`<span class="ce">${esc(c.e)}</span>`:'<span class="ce-none">자소</span>'}</span>`).join(' ');
  let note = '';
  if (e.sem && e.phon) note = `<div class="ety-note">뜻 <span class="sem">${esc(e.sem.c)}${e.sem.e?'('+esc(e.sem.e)+')':''}</span> + 소리 <span class="phon">${esc(e.phon.c)}${e.phon.e?'('+esc(e.phon.e)+')':'(자소)'}</span></div>`;
  return `<div class="ety-block">
    <div class="ety-han">${esc(kanji)}</div>
    ${e.type?`<div class="ety-row"><span class="k">유형</span><span class="v"><span class="ety-tag">${esc(e.type)}</span></span></div>`:''}
    ${e.r?`<div class="ety-row"><span class="k">부수</span><span class="v"><span class="ety-comp"><span class="cc">${esc(e.r)}</span>${e.re?`<span class="ce">${esc(e.re)}</span>`:''}</span></span></div>`:''}
    ${comp?`<div class="ety-row"><span class="k">구성</span><span class="v ety-comp">${comp}</span></div>`:''}
    ${note}
    ${e.story?`<div class="ety-story">${esc(e.story)}</div>`:''}
  </div>`;
}

function etymologyHtml(word) {
  const chars = Array.from(word || '').filter(c => /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(c));
  const uniq = [...new Set(chars)];
  if (!uniq.length) return `<h3>자원(字源)</h3><div class="ph">한자가 없습니다.</div>`;
  return `<h3>자원(字源)</h3>` + uniq.map(etymologyBlock).join('<div class="ety-sep"></div>');
}

// 대표 숙어 HTML (시험 해설용)
function exHtml(kanji) {
  const list = (examples && examples[(kanji||'').normalize('NFC')]) || [];
  if (!list.length) return '';
  const rows = list.map(e =>
    `<div class="ex-row"><span class="ex-w">${esc(e.w)}</span> <span class="ex-r">${esc(e.r)}</span>${e.k?` <span class="ex-k">${esc(e.k)}</span>`:''} <span class="ex-m">${esc(e.m)}</span></div>`
  ).join('');
  return `<div class="v-ex"><div class="v-ex-h">대표 숙어</div>${rows}</div>`;
}

// 음독/훈독 표시 HTML (정답 공개 후 각 보기 왼쪽에)
function readingHtml(o) {
  const on = (o.on||[]).slice(0,3).join(' / ');
  const kun = (o.kun||[]).slice(0,3).join(' / ');
  if (!on && !kun && o.jpword) {   // 숙어(저장 단어): 음/훈 구분 없이 읽기만
    return `<span class="r-on">읽기 ${esc(o.jpword)}</span>`;
  }
  return `<span class="r-on">음 ${on || '<span class="r-none">없음</span>'}</span>` +
         `<span class="r-kun">훈 ${kun || '<span class="r-none">없음</span>'}</span>`;
}

function weightOf(key) {
  const s = stats[key] || { n:0, c:0 };
  if (s.n === 0) return 4;
  const acc = s.c / s.n;
  if (s.n >= 3 && acc >= 0.8) return 0.25;
  if (acc >= 0.5) return 1;
  return 2.5;
}
function weightedPick(items, n) {
  const picked = [], arr = items.slice();
  for (let k = 0; k < n && arr.length; k++) {
    const weights = arr.map(it => weightOf(it.key));
    let total = weights.reduce((a,b)=>a+b,0), r = Math.random()*total, i = 0;
    while (r > weights[i]) { r -= weights[i]; i++; }
    picked.push(arr.splice(i,1)[0]);
  }
  return picked;
}
function answerOf(it, type){ return type==='hun' ? it.hun : it.ko; }

// ---- 설정 ----
function renderSetup() {
  setSide('<div class="ph">시험을 시작하면<br>각 문제의 자원(字源)이<br>여기에 표시됩니다.</div>');
  const vocabN = vocab.length;
  const levelCounts = LVL.map(L=>`${L}(${META[L]||''}) ${(bank[L]||[]).length}`).join(' · ');
  app.innerHTML = `
    <h1>한자 시험</h1>
    <p class="muted">선택하면 바로 채점되고 해설이 잠깐 뜬 뒤 다음 문제로 넘어갑니다. 80%+ 숙달 한자는 점점 덜 나와요.</p>
    <label>출제 범위</label>
    <div class="seg" id="src">
      <button data-v="jlpt" class="${cfg.src==='jlpt'?'on':''}">JLPT 급수별 한자</button>
      <button data-v="vocab" class="${cfg.src==='vocab'?'on':''}">내 저장 단어 (${vocabN})</button>
    </div>
    <div id="jlpt-box" style="${cfg.src==='jlpt'?'':'display:none'}">
      <label>레벨 <span class="muted" style="font-weight:400">(${levelCounts})</span></label>
      <div class="seg" id="level">
        ${LVL.map(L=>`<button data-v="${L}" class="${cfg.level===L?'on':''}">${L}</button>`).join('')}
      </div>
      <label style="font-weight:400;margin-top:10px"><input type="checkbox" id="cum" ${cfg.cumulative?'checked':''}> 이 레벨 이하 전체 포함</label>
    </div>
    <label>문제 유형</label>
    <div class="seg" id="type">
      <button data-v="mix" class="${cfg.type==='mix'?'on':''}">섞기</button>
      <button data-v="ko" class="${cfg.type==='ko'?'on':''}">한국음</button>
      <button data-v="hun" class="${cfg.type==='hun'?'on':''}">훈음</button>
    </div>
    <label>문제 수</label>
    <select id="num">${[10,20,30,50].map(n=>`<option value="${n}" ${cfg.num===n?'selected':''}>${n}문제</option>`).join('')}</select>
    <p style="margin-top:22px"><button class="btn" id="start">시작하기</button></p>
    ${masteryLine()}
  `;
  bindSeg('src', v => { cfg.src=v; renderSetup(); });
  bindSeg('level', v => { cfg.level=v; renderSetup(); });
  bindSeg('type', v => { cfg.type=v; renderSetup(); });
  const cum=document.getElementById('cum'); if(cum) cum.addEventListener('change',e=>cfg.cumulative=e.target.checked);
  document.getElementById('num').addEventListener('change',e=>cfg.num=parseInt(e.target.value,10));
  document.getElementById('start').addEventListener('click', start);
}
function bindSeg(id, cb){ const el=document.getElementById(id); if(el) el.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>cb(b.getAttribute('data-v')))); }

function masteryLine() {
  const items = buildPool();
  if (!items.length) return '';
  let mastered=0, seen=0;
  items.forEach(it=>{ const s=stats[it.key]; if(s&&s.n>0){seen++; if(s.n>=3&&s.c/s.n>=0.8)mastered++;} });
  return `<div class="stat">이 범위 <b>${items.length}</b>자 · 학습함 ${seen} · 숙달(80%+) <b>${mastered}</b></div>`;
}

// ---- 진행 ----
function start() {
  const items = buildPool();
  if (cfg.src==='vocab' && items.length<4) { alert('저장 단어가 4개 이상이어야 합니다. (현재 '+items.length+'개)'); return; }
  if (!items.length) { alert('출제할 한자가 없습니다.'); return; }
  pool = items; idx=0; score=0; wrong=[];
  const chosen = weightedPick(items, Math.min(cfg.num, items.length));
  questions = chosen.map(it=>{
    const type = cfg.type==='mix' ? (Math.random()<0.5?'ko':'hun') : cfg.type;
    const correct = answerOf(it, type);
    const hanCount = w => Array.from(w||'').filter(c=>/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(c)).length;
    const tlen = hanCount(it.q);
    // 오답 후보(답 기준 중복 제거, 정답 제외)
    let cand = uniqBy(items.filter(x=>x.key!==it.key), x=>answerOf(x,type)).filter(x=>answerOf(x,type)!==correct);
    // 정답과 한자 수가 같은 것 우선, 모자라면 나머지로 보충
    let same = shuffle(cand.filter(x=>hanCount(x.q)===tlen));
    let rest = shuffle(cand.filter(x=>hanCount(x.q)!==tlen));
    let picked = same.concat(rest).slice(0,3);
    let distract = picked.map(x=>({ ans:answerOf(x,type), han:x.q, on:x.on, kun:x.kun, jpword:x.jpword }));
    const opts = shuffle([{ ans:correct, han:it.q, on:it.on, kun:it.kun, jpword:it.jpword }, ...distract]);
    return { it, type, correct, options:opts };
  });
  renderQuestion();
}

function renderQuestion() {
  advancing = false;
  sidePlaceholder();
  const q = questions[idx];
  const label = q.type==='hun' ? '훈음을 고르세요' : '한국음을 고르세요';
  app.innerHTML = `
    <div class="topbar"><span>${idx+1} / ${questions.length}</span><span>점수 ${score}</span></div>
    <div class="bar"><div style="width:${(idx/questions.length)*100}%"></div></div>
    <div class="qtype">${label}</div>
    <div class="han">${esc(q.it.q)}</div>
    <div class="options">${q.options.map((o,i)=>
      `<button class="opt" data-i="${i}"><span class="opt-reading reveal">${readingHtml(o)}</span><span class="opt-ans">${esc(o.ans)}</span><span class="opt-han reveal">${esc(o.han)}</span></button>`
    ).join('')}</div>
    <div class="verdict" id="verdict"></div>`;
  app.querySelectorAll('.opt').forEach(b=>b.addEventListener('click',()=>choose(b,q)));
}

function choose(btn, q) {
  if (advancing) return;
  advancing = true;
  const chosenIdx = parseInt(btn.getAttribute('data-i'),10);
  const chosen = q.options[chosenIdx];
  const ok = chosen.ans === q.correct;

  app.querySelectorAll('.opt').forEach(b=>{
    b.disabled = true;
    b.querySelectorAll('.reveal').forEach(el=>el.classList.add('shown')); // 채점 후 음훈독·한자 공개
    const o = q.options[parseInt(b.getAttribute('data-i'),10)];
    if (o.ans === q.correct) b.classList.add('correct');
    else if (b===btn) b.classList.add('wrong');
  });

  if (ok) score++; else wrong.push(q);
  setSide(etymologyHtml(q.it.q));
  const s = stats[q.it.key] || {n:0,c:0};
  s.n++; if(ok) s.c++; stats[q.it.key]=s; saveStats();

  // 해설: 한자 · 한국음 · 훈음 · (일본 음독) + 다음 버튼
  const other = answerOf(q.it, q.type==='hun' ? 'ko' : 'hun');
  const last = idx===questions.length-1;
  const v = document.getElementById('verdict');
  v.className = 'verdict ' + (ok ? 'ok' : 'no');
  v.innerHTML = `
    <div class="v-head">${ok ? '⭕ 정답' : '❌ 오답'}</div>
    <div class="v-body"><b>${esc(q.it.q)}</b> — ${esc(q.correct)}
      <span class="muted">(${esc(other)})</span></div>
    <div class="v-read">${readingHtml(q.it)}</div>
    <div class="v-legend"><b>.</b> 뒤 = 활용 어미(한자 소리는 점 앞) &nbsp;·&nbsp; <b>-</b> = 다른 글자가 붙음</div>
    ${exHtml(q.it.q)}
    <div class="v-actions">
      <button class="btn ghost sm" id="save-word" type="button">+ 단어장</button>
      <button class="btn" id="next">${last ? '결과 보기' : '다음 →'}</button>
    </div>`;
  const sb = document.getElementById('save-word');
  updateSaveBtn(sb, q.it);
  sb.addEventListener('click', () => saveWord(q.it, sb));
  const nb = document.getElementById('next');
  nb.focus();
  nb.addEventListener('click', () => { if(last) renderResult(); else { idx++; renderQuestion(); } });
}

// 이 항목이 이미 단어장에 있는지 표시
function updateSaveBtn(btn, it) {
  if (!btn) return;
  chrome.storage.local.get(['vocab'], r => {
    const v = r.vocab || {};
    if (v[it.q]) { btn.textContent = '단어장에 있음'; btn.classList.add('saved'); btn.disabled = true; }
  });
}
function saveWord(it, btn) {
  chrome.storage.local.get(['vocab'], r => {
    const v = r.vocab || {};
    if (v[it.q]) { btn.textContent = '단어장에 있음'; btn.classList.add('saved'); btn.disabled = true; return; }
    v[it.q] = {
      w: it.q, ko: it.ko, hun: it.hun,
      jp: (it.on||[]).slice(0,3).join('·'),
      url: '(시험)', t: Date.now()
    };
    chrome.storage.local.set({ vocab: v }, () => {
      btn.textContent = '저장됨 ✓'; btn.classList.add('saved'); btn.disabled = true;
    });
  });
}

function renderResult() {
  setSide('');
  const total=questions.length, pct=Math.round((score/total)*100);
  app.innerHTML = `
    <div class="center"><h1>시험 완료</h1>
      <div class="score">${score} / ${total}</div>
      <div class="muted">이번 정답률 ${pct}%</div></div>
    ${masteryLine()}
    ${wrong.length?`<h3 style="margin-top:20px">오답 노트 (${wrong.length})</h3>
      <div class="review">${wrong.map(q=>`<div class="r"><span class="h">${esc(q.it.q)}</span>
        <span class="a">${esc(q.correct)}</span>
        <span class="muted"> · ${esc(answerOf(q.it, q.type==='hun'?'ko':'hun'))}</span></div>`).join('')}</div>`
      :`<p class="center" style="color:#8ce99a;margin-top:18px">전부 정답입니다! 🎉</p>`}
    <div class="center" style="margin-top:20px">
      <button class="btn" id="again">같은 범위 다시</button>
      <button class="btn ghost" id="home" style="margin-left:8px">설정으로</button>
    </div>`;
  document.getElementById('again').addEventListener('click', start);
  document.getElementById('home').addEventListener('click', renderSetup);
}
