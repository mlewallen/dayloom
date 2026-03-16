// ─── State ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'dayloom_v4';
const USERS_KEY = 'dayloom_users';
const SESSION_KEY = 'dayloom_session';
let currentUser = null; // { id, username, displayName, email, avatar, provider }

// ─── User registry (all accounts on this browser) ────────────────────────────
function getUsers(){ try{return JSON.parse(localStorage.getItem(USERS_KEY)||'{}');}catch(e){return{};} }
function saveUsers(u){ localStorage.setItem(USERS_KEY,JSON.stringify(u)); }
function userDataKey(uid){ return `dayloom_data_${uid}`; }

// ─── Per-user save / load ─────────────────────────────────────────────────────
let state = { currentPage:'week', tasks:[], weekJournals:{}, goals:[], workoutPlan:null, activeWeek:getWeekKey(new Date()), taskFilter:{tag:null,query:''} };
function save() {
  if(!currentUser)return;
  try{localStorage.setItem(userDataKey(currentUser.id),JSON.stringify(state));}catch(e){}
}
function load() {
  if(!currentUser)return;
  try{const r=localStorage.getItem(userDataKey(currentUser.id));if(r)Object.assign(state,JSON.parse(r));}catch(e){}
}
function resetState(){
  state={ currentPage:'week', tasks:[], weekJournals:{}, goals:[], workoutPlan:null, activeWeek:getWeekKey(new Date()), taskFilter:{tag:null,query:''} };
}

function getWeekKey(date) { const d=new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()+1); return d.toISOString().split('T')[0]; }
function getWeekNumber(key) { const d=new Date(key); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7); const j=new Date(d.getFullYear(),0,4); return 1+Math.round(((d-j)/86400000-3+(j.getDay()+6)%7)/7); }
function getWeekLabel(key) { const d=new Date(key),e=new Date(d); e.setDate(d.getDate()+6); const f=dt=>dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}); return `W${getWeekNumber(key)} · ${f(d)} – ${f(e)}`; }
function weekOffset(key,n) { const d=new Date(key); d.setDate(d.getDate()+n*7); return getWeekKey(d); }
function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDate(dt) { if(!dt)return''; try{return new Date(dt).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}catch(e){return dt;} }
const TAGS=[{id:'health',label:'Health',cls:'tag-health'},{id:'habit',label:'Habit',cls:'tag-habit'},{id:'family',label:'Family',cls:'tag-family'},{id:'relationships',label:'Relationships',cls:'tag-relationships'},{id:'home',label:'Home',cls:'tag-home'},{id:'work',label:'Work',cls:'tag-work'},{id:'finance',label:'Finance',cls:'tag-finance'},{id:'growth',label:'Growth',cls:'tag-growth'}];
const TAG_COLORS={health:'#4ADE80',habit:'#A78BFA',family:'#FB923C',relationships:'#F472B6',home:'#38BDF8',work:'#9CA3AF',finance:'#34D399',growth:'#F87171'};
const tagCls=id=>(TAGS.find(t=>t.id===id)||{cls:'tag-custom'}).cls;
const tagLabel=id=>(TAGS.find(t=>t.id===id)||{label:id}).label;

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV=[
  {id:'week',label:'Week',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="nav-icon"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`},
  {id:'tasks',label:'Tasks',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="nav-icon"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`},
  {id:'goals',label:'Goals',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="nav-icon"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`},
  {id:'workout',label:'Workout',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="nav-icon"><path d="M6.5 6.5h11m-11 11h11M4 9.5H20M4 14.5H20M6 4v16M18 4v16"/></svg>`},
  {id:'insights',label:'Insights',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="nav-icon"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>`},
];
function renderNav() {
  document.getElementById('nav').innerHTML=NAV.map(n=>`<div class="nav-item${state.currentPage===n.id?' active':''}" onclick="navigate('${n.id}')">${n.icon}<span class="nav-label">${n.label}</span></div>`).join('');
  const nk=getWeekKey(new Date());
  document.getElementById('week-label').textContent=`W${getWeekNumber(nk)} · ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
}
function navigate(p){state.currentPage=p;renderNav();renderPage();}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function parseMarkdown(text,scope) {
  if(!text)return'<p style="color:var(--text3);font-size:13.5px">Nothing written yet…</p>';
  const lines=text.split('\n'); let html='',inUl=false,inCb=false;
  const closeUl=()=>{if(inUl){html+='</ul>';inUl=false;}if(inCb){html+='</ul>';inCb=false;}};
  lines.forEach((line,idx)=>{
    const cbX=line.match(/^- \[x\] (.+)/i), cbO=line.match(/^- \[ \] (.+)/);
    if(cbX||cbO){if(inUl){html+='</ul>';inUl=false;}if(!inCb){html+='<ul class="cb-list">';inCb=true;}
      const chk=!!cbX,ct=inline(cbX?cbX[1]:cbO[1]),cid=`cb-${scope}-${idx}`;
      html+=`<li class="md-checkbox-item${chk?' cb-checked':''}" id="li-${cid}"><div class="cb-box" onclick="toggleCb('${scope}',${idx})"></div><span class="cb-text">${ct}</span></li>`;return;}
    if(inCb&&!line.match(/^- \[/)){html+='</ul>';inCb=false;}
    if(line.match(/^### /)){closeUl();html+=`<h3>${inline(line.slice(4))}</h3>`;return;}
    if(line.match(/^## /)){closeUl();html+=`<h2>${inline(line.slice(3))}</h2>`;return;}
    if(line.match(/^# /)){closeUl();html+=`<h1>${inline(line.slice(2))}</h1>`;return;}
    if(line.match(/^---+$/)){closeUl();html+='<hr>';return;}
    if(line.match(/^> /)){closeUl();html+=`<blockquote>${inline(line.slice(2))}</blockquote>`;return;}
    if(line.match(/^- /)){if(inCb){html+='</ul>';inCb=false;}if(!inUl){html+='<ul>';inUl=true;}html+=`<li>${inline(line.slice(2))}</li>`;return;}
    closeUl();
    if(line.trim()===''){html+='<br>';return;}
    html+=`<p>${inline(line)}</p>`;
  });
  closeUl(); return html;
}
function inline(t){return t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`(.+?)`/g,'<code>$1</code>').replace(/~~(.+?)~~/g,'<del>$1</del>');}

function toggleCb(scope,lineIdx){
  const mutate=(content)=>{const lines=content.split('\n');const l=lines[lineIdx];if(l?.match(/^- \[x\]/i))lines[lineIdx]=l.replace(/^- \[x\]/i,'- [ ]');else if(l?.match(/^- \[ \]/))lines[lineIdx]=l.replace(/^- \[ \]/,'- [x]');return lines.join('\n');};
  if(scope.startsWith('task-')){
    const id=scope.slice(5);
    // If drawer is open for this task, mutate the draft and refresh just the preview
    if(_editTaskId===id){
      _draft.notes=mutate(_draft.notes||'');
      const preview=document.getElementById('notes-preview-render');
      if(preview) preview.innerHTML=parseMarkdown(_draft.notes,scope);
      // Also persist to state
      const t=state.tasks.find(t=>t.id===id);if(t){t.notes=_draft.notes;save();}
      return;
    }
    const t=state.tasks.find(t=>t.id===id);if(t){t.notes=mutate(t.notes||'');save();renderPage();}
  }
  else if(scope.startsWith('goal-')){
    const id=scope.slice(5);
    if(_editGoalId===id){
      _gDraft.content=mutate(_gDraft.content||'');
      const preview=document.getElementById('goal-preview-render');
      if(preview) preview.innerHTML=parseMarkdown(_gDraft.content,scope);
      const g=state.goals.find(g=>g.id===id);if(g){g.content=_gDraft.content;save();}
      return;
    }
    const g=state.goals.find(g=>g.id===id);if(g){g.content=mutate(g.content||'');save();renderPage();}
  }
  else{const wk=state.activeWeek;state.weekJournals[wk]=mutate(state.weekJournals[wk]||'');save();renderPage();}
}

// ─── Week Page ────────────────────────────────────────────────────────────────
let _jMode='edit';
let _jModeSetByUser=false;
function renderWeekPage(){
  const wk=state.activeWeek,journal=state.weekJournals[wk]||'',weekTasks=state.tasks.filter(t=>t.weekKey===wk),isNow=wk===getWeekKey(new Date());
  // Only default to preview on first load of a week with content — never override a user's explicit choice
  if(journal.trim() && !_jModeSetByUser) _jMode='preview';
  return `<div class="page">
    <div class="page-header">
      <div class="week-nav">
        <button class="btn btn-sm btn-ghost btn-icon" onclick="shiftWeek(-1)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
        <span class="week-nav-label">${getWeekLabel(wk)}</span>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="shiftWeek(1)" ${isNow?'disabled style="opacity:0.25;cursor:default"':''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
        ${isNow?`<span style="font-size:11.5px;color:var(--accent);background:var(--accent-light);padding:3px 10px;border-radius:20px;font-weight:500">This week</span>`:''}
      </div>
      <h1 class="page-title">Weekly Reflection</h1>
      <p class="page-subtitle">Capture your thoughts, feelings, and what matters this week.</p>
    </div>
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:24px;">
      <div class="editor-toolbar">
        <button class="toolbar-btn" onclick="insertMd('# ')"><b>H1</b></button>
        <button class="toolbar-btn" onclick="insertMd('## ')"><b>H2</b></button>
        <button class="toolbar-btn" onclick="insertMd('### ')">H3</button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn" onclick="wrapMd('**','**')"><b>B</b></button>
        <button class="toolbar-btn" onclick="wrapMd('*','*')"><i>I</i></button>
        <button class="toolbar-btn" onclick="wrapMd('~~','~~')"><s>S</s></button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn" onclick="insertMd('- ')">• List</button>
        <button class="toolbar-btn" onclick="insertMd('- [ ] ')">☐ Task</button>
        <button class="toolbar-btn" onclick="insertMd('> ')">❝ Quote</button>
        <button class="toolbar-btn" onclick="insertMd('---\n')">— Divide</button>
        <div style="flex:1"></div>
        <div class="editor-tabs" style="border:none;">
          <button class="editor-tab${_jMode==='edit'?' active':''}" onclick="setJMode('edit')">Write</button>
          <button class="editor-tab${_jMode==='preview'?' active':''}" onclick="setJMode('preview')">Preview</button>
        </div>
      </div>
      ${_jMode==='edit'
        ?`<textarea class="editor-area" id="journal-editor" placeholder="Start writing… What happened? How do you feel? What are you grateful for?">${esc(journal)}</textarea>`
        :`<div class="md-preview" style="padding:20px 24px;min-height:200px;">${parseMarkdown(journal,'journal')}</div>`}
      <div style="padding:8px 20px 12px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);">
        <span class="save-status" id="j-status">Auto-saved</span>
        <button class="btn btn-primary btn-sm" onclick="saveJournal()">Save reflection</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div class="section-title" style="margin-bottom:0">This week's tasks</div>
      <button class="btn btn-sm btn-primary" onclick="openTaskDrawer(null,'${wk}')">+ Add task</button>
    </div>
    ${weekTasks.length===0?`<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No tasks yet — add one above</div></div>`:weekTasks.map(renderTaskItem).join('')}
  </div>`;
}

let _jTimer;
function setJMode(m){_jMode=m;_jModeSetByUser=true;if(m==='edit'){const v=document.getElementById('journal-editor')?.value;if(v!==undefined)state.weekJournals[state.activeWeek]=v;}renderPage();}
function saveJournal(){const v=document.getElementById('journal-editor')?.value;if(v!==undefined)state.weekJournals[state.activeWeek]=v;save();_jMode='preview';_jModeSetByUser=false;renderPage();showToast('Reflection saved ✓');}
function bindJournal(){
  const el=document.getElementById('journal-editor');if(!el)return;
  el.addEventListener('input',()=>{state.weekJournals[state.activeWeek]=el.value;clearTimeout(_jTimer);document.getElementById('j-status').textContent='Saving…';_jTimer=setTimeout(()=>{save();document.getElementById('j-status').textContent='Auto-saved';},1000);});
}
function insertMd(p){const el=document.getElementById('journal-editor');if(!el)return;const s=el.selectionStart,v=el.value,ls=v.lastIndexOf('\n',s-1)+1;el.value=v.slice(0,ls)+p+v.slice(ls);el.selectionStart=el.selectionEnd=ls+p.length+(s-ls);el.focus();}
function wrapMd(b,a){const el=document.getElementById('journal-editor');if(!el)return;const s=el.selectionStart,e=el.selectionEnd,v=el.value,sel=v.slice(s,e)||'text';el.value=v.slice(0,s)+b+sel+a+v.slice(e);el.selectionStart=s+b.length;el.selectionEnd=s+b.length+sel.length;el.focus();}
function shiftWeek(d){state.activeWeek=weekOffset(state.activeWeek,d);_jMode='edit';_jModeSetByUser=false;renderPage();}

// ─── Task Item ────────────────────────────────────────────────────────────────
function renderTaskItem(task){
  const hasNotes=task.notes&&task.notes.trim().length>0;
  const noteLines=hasNotes?task.notes.trim().split('\n').filter(l=>l.trim()).length:0;
  const statusCfg = _statusCfg(task.status||'todo');
  const showStatus = task.status && task.status !== 'todo';
  return `<div class="task-item${task.done?' done':''}" onclick="openTaskDrawer('${task.id}')">
    <div class="task-check${task.done?' checked':''}" onclick="event.stopPropagation();toggleTask('${task.id}')"></div>
    <div class="task-body">
      <div class="task-title${task.done?' done-text':''}">${esc(task.title)}</div>
      <div class="task-meta">
        ${task.startDate?`<span class="task-date">${formatDate(task.startDate)}</span>`:''}
        ${showStatus?`<span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:${statusCfg.color};font-weight:500"><span style="width:6px;height:6px;border-radius:50%;background:${statusCfg.color};flex-shrink:0;display:inline-block"></span>${statusCfg.label}</span>`:''}
        ${(task.tags||[]).map(t=>`<span class="tag ${tagCls(t)}">${tagLabel(t)}</span>`).join('')}
        ${hasNotes?`<span style="font-size:11px;color:var(--text3);display:inline-flex;align-items:center;gap:3px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${noteLines} line${noteLines!==1?'s':''}</span>`:''}
      </div>
      ${(task.effort||task.impact)?`<div class="task-scores">${task.effort?`<span class="score-mini"><span class="score-dot" style="background:var(--amber)"></span> Effort ${task.effort}/5</span>`:''} ${task.impact?`<span class="score-mini"><span class="score-dot" style="background:var(--blue)"></span> Impact ${task.impact}/5</span>`:''}</div>`:''}
    </div>
  </div>`;
}

// ─── Tasks Page ───────────────────────────────────────────────────────────────
function renderTasksPage(){
  const {tag,query}=state.taskFilter;
  let tasks=[...state.tasks];
  if(tag)tasks=tasks.filter(t=>(t.tags||[]).includes(tag));
  if(query)tasks=tasks.filter(t=>t.title.toLowerCase().includes(query.toLowerCase()));
  tasks.sort((a,b)=>(a.startDate||'z')>(b.startDate||'z')?-1:1);
  const grouped={};tasks.forEach(t=>{const k=t.weekKey||'none';if(!grouped[k])grouped[k]=[];grouped[k].push(t);});
  const tc={};state.tasks.forEach(t=>(t.tags||[]).forEach(tg=>{tc[tg]=(tc[tg]||0)+1;}));
  return `<div class="page">
    <div class="page-header"><h1 class="page-title">All Tasks</h1><p class="page-subtitle">${state.tasks.length} tasks across all weeks</p></div>
    <div class="filter-bar">
      <input type="text" placeholder="Search…" value="${esc(query)}" oninput="setFilter('query',this.value)" style="width:180px;flex-shrink:0">
      <span class="tag tag-custom${!tag?' tag-selected':''}" onclick="setFilter('tag',null)" style="cursor:pointer">All</span>
      ${TAGS.map(t=>`<span class="tag ${tagCls(t.id)}${tag===t.id?' tag-selected':''}" onclick="setFilter('tag','${tag===t.id?null:t.id}')">${t.label}${tc[t.id]?` <b style="font-size:10px;opacity:0.65">${tc[t.id]}</b>`:''}</span>`).join('')}
    </div>
    <div style="margin-bottom:16px"><button class="btn btn-primary btn-sm" onclick="openTaskDrawer(null,'${state.activeWeek}')">+ New task</button></div>
    ${Object.keys(grouped).length===0?`<div class="empty"><div class="empty-icon">✓</div><div class="empty-text">No tasks found</div></div>`:
      Object.keys(grouped).sort().reverse().map(wk=>`<div class="date-group-header">${wk==='none'?'Undated':getWeekLabel(wk)}</div>${grouped[wk].map(renderTaskItem).join('')}`).join('')}
  </div>`;
}
function setFilter(k,v){state.taskFilter[k]=v;renderPage();}
function toggleTask(id){const t=state.tasks.find(t=>t.id===id);if(t){t.done=!t.done;t.status=t.done?'done':(t.status==='done'?'todo':t.status||'todo');save();renderPage();}}

// ─── Goals Page ───────────────────────────────────────────────────────────────
function renderGoalsPage(){
  return `<div class="page">
    <div class="page-header"><h1 class="page-title">Annual Goals</h1><p class="page-subtitle">Living intentions for the year — edit them freely as you grow.</p></div>
    <div style="margin-bottom:20px"><button class="btn btn-primary" onclick="openGoalDrawer(null)">+ New goal</button></div>
    ${state.goals.length===0
      ? `<div class="empty"><div class="empty-icon">🎯</div><div class="empty-text">Add your first goal to get started</div></div>`
      : state.goals.map(renderGoalItem).join('')}
  </div>`;
}

function renderGoalItem(goal){
  const linked=state.tasks.filter(t=>(t.tags||[]).some(tg=>(goal.tags||[]).includes(tg))||((goal.keywords||[]).some(kw=>t.title.toLowerCase().includes(kw.toLowerCase()))));
  const prog=countProgress(goal.content||'');
  const pct=prog.total>0?Math.round(prog.checked/prog.total*100):0;
  const hasContent = goal.content && goal.content.trim();
  return `<div class="task-item" style="align-items:center;" onclick="openGoalDrawer('${goal.id}')">
    <div style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border2);flex-shrink:0;display:flex;align-items:center;justify-content:center;">
      ${prog.total>0
        ? `<svg viewBox="0 0 36 36" width="36" height="36" style="position:absolute;transform:rotate(-90deg)">
            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--surface2)" stroke-width="3"/>
            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="${Math.round(pct*0.88)} 88" stroke-linecap="round"/>
           </svg>
           <span style="font-size:10px;font-weight:600;color:var(--text2);position:relative;z-index:1">${pct}%</span>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`}
    </div>
    <div class="task-body">
      <div class="task-title">${esc(goal.title)}</div>
      <div class="task-meta">
        ${prog.total>0 ? `<span class="task-date">${prog.checked}/${prog.total} complete</span>` : ''}
        ${linked.length>0 ? `<span class="aligned-badge">⟳ ${linked.length} task${linked.length>1?'s':''}</span>` : ''}
        ${(goal.tags||[]).map(t=>`<span class="tag ${tagCls(t)}" style="font-size:10.5px;padding:2px 7px">${tagLabel(t)}</span>`).join('')}
        ${hasContent ? `<span style="font-size:11px;color:var(--text3);display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Notes</span>` : ''}
      </div>
      ${prog.total>0 ? `<div style="margin-top:6px;height:3px;background:var(--surface2);border-radius:4px;overflow:hidden;max-width:200px"><div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;transition:width 0.4s ease"></div></div>` : ''}
    </div>
  </div>`;
}

function countProgress(c){return{checked:(c.match(/- \[x\]/gi)||[]).length,total:(c.match(/- \[x\]/gi)||[]).length+(c.match(/- \[ \]/g)||[]).length};}

// ─── Goal Drawer ──────────────────────────────────────────────────────────────
let _editGoalId=null, _goalContentMode='edit', _gDraft={};

function openGoalDrawer(id){
  _editGoalId=id;
  const goal=id?state.goals.find(g=>g.id===id):{title:'',content:'',tags:[],keywords:[]};
  if(!goal)return;
  _goalContentMode = (goal.content && goal.content.trim()) ? 'preview' : 'edit';
  _gDraft = { title:goal.title||'', content:goal.content||'', keywords:(goal.keywords||[]).join(', ') };
  window._gTags=[...(goal.tags||[])];
  _renderGoalDrawer(goal);
}

function _renderGoalDrawer(goal){
  const id=_editGoalId;
  const linked=state.tasks.filter(t=>(t.tags||[]).some(tg=>(goal.tags||[]).includes(tg))||((goal.keywords||[]).some(kw=>t.title.toLowerCase().includes(kw.toLowerCase()))));
  const prog=countProgress(_gDraft.content||'');
  const pct=prog.total>0?Math.round(prog.checked/prog.total*100):0;
  const created=goal.createdAt?`Created ${new Date(goal.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`:id?'':'New goal';

  document.getElementById('modal-root').innerHTML=`
    <div class="drawer-overlay" onclick="closeGoalDrawer()"></div>
    <div class="drawer" id="goal-drawer">
      <div class="drawer-header">
        <div class="drawer-header-main">
          <input class="drawer-title-input" id="g-title" type="text" value="${esc(_gDraft.title)}" placeholder="Goal title…" oninput="_gAutoSave()">
          <div class="drawer-created">${created}</div>
        </div>
        <button class="drawer-close" onclick="closeGoalDrawer()">✕</button>
      </div>
      <div class="drawer-body">

        <div class="drawer-section">
          <div class="drawer-section-label">Content</div>
          <div class="notes-toolbar">
            <button class="toolbar-btn" onclick="_gIMd('# ')"><b>H1</b></button>
            <button class="toolbar-btn" onclick="_gIMd('## ')">H2</button>
            <button class="toolbar-btn" onclick="_gIMd('### ')">H3</button>
            <div style="width:1px;background:var(--border2);margin:3px 3px;align-self:stretch"></div>
            <button class="toolbar-btn" onclick="_gWMd('**','**')"><b>B</b></button>
            <button class="toolbar-btn" onclick="_gWMd('*','*')"><i>I</i></button>
            <div style="width:1px;background:var(--border2);margin:3px 3px;align-self:stretch"></div>
            <button class="toolbar-btn" onclick="_gIMd('- ')">• List</button>
            <button class="toolbar-btn" onclick="_gIMd('- [ ] ')">☐ Task</button>
            <button class="toolbar-btn" onclick="_gIMd('> ')">❝</button>
            <div style="flex:1"></div>
            <div class="notes-mode-toggle">
              <button class="notes-mode-btn${_goalContentMode==='edit'?' active':''}" data-mode="edit" onclick="setGoalContentMode('edit')">Write</button>
              <button class="notes-mode-btn${_goalContentMode==='preview'?' active':''}" data-mode="preview" onclick="setGoalContentMode('preview')">Preview</button>
            </div>
          </div>
          <div id="goal-content-area">
            ${_goalContentMode==='edit'
              ? `<textarea class="notes-area" id="g-content" placeholder="Describe your goal, add milestones, or track with checkboxes…&#10;&#10;Try: - [ ] milestone" oninput="_gOnInput()" style="min-height:220px">${esc(_gDraft.content)}</textarea>`
              : `<div class="notes-preview md-preview" id="goal-preview-render" style="min-height:80px">${parseMarkdown(_gDraft.content||'','goal-'+(id||'new'))}</div>`}
          </div>
          ${prog.total>0 ? `<div style="margin-top:10px">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:5px"><span>${prog.checked} of ${prog.total} complete</span><span>${pct}%</span></div>
            <div style="height:4px;background:var(--surface2);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;transition:width 0.5s ease"></div></div>
          </div>` : ''}
        </div>

        <div class="drawer-section">
          <div class="drawer-section-label">Tags</div>
          <div class="tag-picker" id="goal-tag-picker">${TAGS.map(t=>`<span class="tag ${tagCls(t.id)}${window._gTags.includes(t.id)?' tag-selected':''}" onclick="toggleGoalTag('${t.id}')">${t.label}</span>`).join('')}</div>
        </div>

        <div class="drawer-section">
          <div class="drawer-section-label">Keywords for task alignment</div>
          <input type="text" id="g-keywords" value="${esc(_gDraft.keywords)}" placeholder="gym, workout, running…" oninput="_gAutoSave()" style="font-size:13.5px">
          <div style="font-size:11px;color:var(--text3);margin-top:5px">Tasks with these words in the title will surface as aligned to this goal</div>
        </div>

        ${linked.length>0 ? `<div class="drawer-section">
          <div class="drawer-section-label">Aligned tasks</div>
          ${linked.slice(0,8).map(t=>`<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--border)">
            <div class="task-check${t.done?' checked':''}" style="width:16px;height:16px;flex-shrink:0" onclick="toggleTask('${t.id}')"></div>
            <span style="font-size:13.5px;${t.done?'text-decoration:line-through;color:var(--text3)':''}">${esc(t.title)}</span>
            ${(t.tags||[]).slice(0,2).map(tg=>`<span class="tag ${tagCls(tg)}" style="font-size:10px;padding:1px 6px">${tagLabel(tg)}</span>`).join('')}
          </div>`).join('')}
          ${linked.length>8?`<div style="font-size:12px;color:var(--text3);padding-top:8px">+${linked.length-8} more</div>`:''}
        </div>` : ''}

      </div>
      <div class="drawer-footer">
        <div>${id?`<button class="btn btn-danger btn-sm" onclick="deleteGoal('${id}')">Delete goal</button>`:''}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="closeGoalDrawer()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="saveGoal()">Save</button>
        </div>
      </div>
    </div>`;

  if(_goalContentMode==='edit') setTimeout(()=>document.getElementById('g-content')?.focus(),60);
  else setTimeout(()=>document.getElementById('g-title')?.focus(),60);
}

function setGoalContentMode(m){
  const el=document.getElementById('g-content');
  if(el) _gDraft.content=el.value;
  _goalContentMode=m;
  const area=document.getElementById('goal-content-area');
  if(!area)return;
  const id=_editGoalId;
  if(m==='edit'){
    area.innerHTML=`<textarea class="notes-area" id="g-content" oninput="_gOnInput()" style="min-height:220px">${esc(_gDraft.content||'')}</textarea>`;
    document.getElementById('g-content').focus();
  } else {
    area.innerHTML=`<div class="notes-preview md-preview" id="goal-preview-render" style="min-height:80px">${parseMarkdown(_gDraft.content||'','goal-'+(id||'new'))}</div>`;
  }
  document.querySelectorAll('.notes-mode-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.mode===m));
  // refresh progress bar
  const prog=countProgress(_gDraft.content||'');
  const pct=prog.total>0?Math.round(prog.checked/prog.total*100):0;
}

function _gOnInput(){
  const el=document.getElementById('g-content');
  if(el) _gDraft.content=el.value;
  _gAutoSave();
}

let _gTimer;
function _gAutoSave(){
  const titleEl=document.getElementById('g-title');
  if(titleEl) _gDraft.title=titleEl.value;
  const kwEl=document.getElementById('g-keywords');
  if(kwEl) _gDraft.keywords=kwEl.value;
  const contentEl=document.getElementById('g-content');
  if(contentEl) _gDraft.content=contentEl.value;
  clearTimeout(_gTimer);
  _gTimer=setTimeout(()=>{
    const id=_editGoalId; if(!id)return;
    const g=state.goals.find(g=>g.id===id); if(!g)return;
    g.title=_gDraft.title||g.title;
    g.content=_gDraft.content??g.content;
    g.keywords=_gDraft.keywords.split(',').map(k=>k.trim()).filter(Boolean);
    g.tags=[...window._gTags];
    save();
  },700);
}

function toggleGoalTag(id){
  const i=window._gTags.indexOf(id);
  if(i>-1)window._gTags.splice(i,1); else window._gTags.push(id);
  document.getElementById('goal-tag-picker').innerHTML=TAGS.map(t=>`<span class="tag ${tagCls(t.id)}${window._gTags.includes(t.id)?' tag-selected':''}" onclick="toggleGoalTag('${t.id}')">${t.label}</span>`).join('');
  _gAutoSave();
}

function _gIMd(p){
  const el=document.getElementById('g-content');if(!el)return;
  const s=el.selectionStart,v=el.value,ls=v.lastIndexOf('\n',s-1)+1;
  el.value=v.slice(0,ls)+p+v.slice(ls);
  el.selectionStart=el.selectionEnd=ls+p.length+(s-ls);
  el.focus();
}
function _gWMd(b,a){
  const el=document.getElementById('g-content');if(!el)return;
  const s=el.selectionStart,e=el.selectionEnd,v=el.value,sel=v.slice(s,e)||'text';
  el.value=v.slice(0,s)+b+sel+a+v.slice(e);
  el.selectionStart=s+b.length;el.selectionEnd=s+b.length+sel.length;
  el.focus();
}

function saveGoal(){
  const titleEl=document.getElementById('g-title');
  const contentEl=document.getElementById('g-content');
  if(contentEl) _gDraft.content=contentEl.value;
  if(titleEl) _gDraft.title=titleEl.value;
  const kwEl=document.getElementById('g-keywords');
  if(kwEl) _gDraft.keywords=kwEl.value;
  const title=_gDraft.title.trim();
  if(!title){showToast('Enter a goal title');return;}
  const data={
    title,
    content:_gDraft.content||'',
    tags:[...window._gTags],
    keywords:_gDraft.keywords.split(',').map(k=>k.trim()).filter(Boolean),
  };
  const id=_editGoalId;
  if(id){const i=state.goals.findIndex(g=>g.id===id);if(i>-1)state.goals[i]={...state.goals[i],...data};}
  else{const newId=genId();state.goals.push({id:newId,...data,createdAt:new Date().toISOString()});_editGoalId=newId;}
  save();
  // Switch to preview if there's content, else close
  if(_gDraft.content && _gDraft.content.trim()){
    _goalContentMode='preview';
    const g=state.goals.find(g=>g.id===_editGoalId);
    if(g) _renderGoalDrawer(g);
  } else {
    closeGoalDrawer();
  }
  showToast('Goal saved ✓');
}

function deleteGoal(id){
  state.goals=state.goals.filter(g=>g.id!==id);
  save(); closeGoalDrawer(); showToast('Goal deleted');
}

function closeGoalDrawer(){
  const d=document.getElementById('goal-drawer'),o=document.querySelector('.drawer-overlay');
  if(d)d.classList.add('closing');
  if(o){o.style.transition='opacity 0.22s';o.style.opacity='0';}
  setTimeout(()=>{document.getElementById('modal-root').innerHTML='';renderPage();},230);
}
let _editTaskId=null,_editWeekKey=null,_notesMode='edit';

function openTaskDrawer(id,weekKey,prefill){
  _editTaskId=id; _editWeekKey=weekKey||state.activeWeek;
  const task=id?state.tasks.find(t=>t.id===id):{title:prefill?.title||'',tags:[],effort:0,impact:0,startDate:'',endDate:'',reminder:'',notes:''};
  if(!task)return;
  // Preview if existing notes, write if new or empty
  _notesMode = (task.notes && task.notes.trim()) ? 'preview' : 'edit';
  _draft = { title:task.title||'', notes:task.notes||'', startDate:task.startDate||'', endDate:task.endDate||'', reminder:task.reminder||'' };
  window._pTags=[...(task.tags||[])];
  window._pScores={effort:task.effort||0,impact:task.impact||0};
  _renderDrawer(task);
}

function _renderDrawer(task){
  const id=_editTaskId, notes=_draft.notes||task.notes||'';
  const created=task.createdAt?`Created ${new Date(task.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`:id?'':'New task';
  const isDone = task.done||false;
  const status = task.status||'todo';
  const statusCfg = _statusCfg(status);
  document.getElementById('modal-root').innerHTML=`
    <div class="drawer-overlay" onclick="closeDrawer()"></div>
    <div class="drawer" id="the-drawer">
      <div class="drawer-header">
        <div class="drawer-header-main">
          <input class="drawer-title-input" id="t-title" type="text" value="${esc(_draft.title??task.title)}" placeholder="Task title…" oninput="_dAutoSave()">
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
            <div class="drawer-created">${created}</div>
            ${id ? `<div class="status-select-wrap" id="status-wrap">
              <div class="status-pill" onclick="toggleStatusDrop(event)">
                <span class="sp-dot" style="background:${statusCfg.color}"></span>
                <span>${statusCfg.label}</span>
                <span class="sp-chevron">▾</span>
              </div>
            </div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${id ? `<button class="complete-btn${isDone?' is-done':''}" id="complete-btn" onclick="completeTask('${id}',${isDone})" title="${isDone?'Mark incomplete':'Mark complete'}">
            <span class="cb-icon"></span>
            <span class="cb-label">${isDone?'Completed':'Complete'}</span>
          </button>` : ''}
          <button class="drawer-close" onclick="closeDrawer()">✕</button>
        </div>
      </div>
      <div class="drawer-body">
        <div class="drawer-section">
          <div class="drawer-section-label">Notes &amp; subtasks</div>
          <div class="notes-toolbar">
            <button class="toolbar-btn" onclick="_iMd('## ')">H2</button>
            <button class="toolbar-btn" onclick="_iMd('### ')">H3</button>
            <div style="width:1px;background:var(--border2);margin:3px 3px;align-self:stretch"></div>
            <button class="toolbar-btn" onclick="_wMd('**','**')"><b>B</b></button>
            <button class="toolbar-btn" onclick="_wMd('*','*')"><i>I</i></button>
            <button class="toolbar-btn" onclick="_wMd('~~','~~')"><s>S</s></button>
            <div style="width:1px;background:var(--border2);margin:3px 3px;align-self:stretch"></div>
            <button class="toolbar-btn" onclick="_iMd('- ')">• List</button>
            <button class="toolbar-btn" onclick="_iMd('- [ ] ')">☐ Task</button>
            <button class="toolbar-btn" onclick="_iMd('> ')">❝</button>
            <div style="flex:1"></div>
            <div class="notes-mode-toggle">
              <button class="notes-mode-btn${_notesMode==='edit'?' active':''}" data-mode="edit" onclick="setNotesMode('edit')">Write</button>
              <button class="notes-mode-btn${_notesMode==='preview'?' active':''}" data-mode="preview" onclick="setNotesMode('preview')">Preview</button>
            </div>
          </div>
          <div id="notes-content-area">
            ${_notesMode==='edit'
              ?`<textarea class="notes-area" id="t-notes" placeholder="Add notes, outlines, or subtasks…&#10;&#10;Try: - [ ] subtask" oninput="_onNotesInput()">${esc(notes)}</textarea>`
              :`<div class="notes-preview md-preview">${parseMarkdown(notes,'task-'+(id||'new'))}</div>`}
          </div>
        </div>
        <div class="drawer-section">
          <div class="drawer-section-label">Timing</div>
          <div class="form-row" style="margin-bottom:10px">
            <div class="form-group" style="margin-bottom:0"><label>Start</label><input type="datetime-local" id="t-start" value="${_draft.startDate??task.startDate??''}" oninput="_dAutoSave()"></div>
            <div class="form-group" style="margin-bottom:0"><label>End</label><input type="datetime-local" id="t-end" value="${_draft.endDate??task.endDate??''}" oninput="_dAutoSave()"></div>
          </div>
          <div class="form-group" style="margin-bottom:0"><label>Reminder</label><input type="datetime-local" id="t-reminder" value="${_draft.reminder??task.reminder??''}" oninput="_dAutoSave()"></div>
        </div>
        <div class="drawer-section">
          <div class="drawer-section-label">Tags</div>
          <div class="tag-picker" id="tag-picker">${TAGS.map(t=>`<span class="tag ${tagCls(t.id)}${window._pTags.includes(t.id)?' tag-selected':''}" onclick="toggleTagPick('${t.id}')">${t.label}</span>`).join('')}</div>
        </div>
        <div class="drawer-section">
          <div class="star-row">
            <div class="score-group"><div class="drawer-section-label">Effort</div><div class="stars" id="stars-effort">${renderStars('effort',window._pScores.effort)}</div><div class="score-label">Energy cost</div></div>
            <div class="score-group"><div class="drawer-section-label">Joy / Impact</div><div class="stars" id="stars-impact">${renderStars('impact',window._pScores.impact)}</div><div class="score-label">Value brought</div></div>
          </div>
        </div>
      </div>
      <div class="drawer-footer">
        <div>${id?`<button class="btn btn-danger btn-sm" onclick="deleteTask('${id}')">Delete task</button>`:''}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="closeDrawer()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="saveTask()">Save</button>
        </div>
      </div>
    </div>`;
  if(_notesMode==='edit') setTimeout(()=>document.getElementById('t-notes')?.focus(),60);
  else setTimeout(()=>document.getElementById('t-title')?.focus(),60);
}

// Live draft — always reflects current textarea value, survives mode switches
let _draft = {};

function _syncDraft(){
  const notesEl = document.getElementById('t-notes');
  if(notesEl) _draft.notes = notesEl.value;
  const titleEl = document.getElementById('t-title');
  if(titleEl) _draft.title = titleEl.value;
  const startEl = document.getElementById('t-start');
  if(startEl) _draft.startDate = startEl.value;
  const endEl = document.getElementById('t-end');
  if(endEl) _draft.endDate = endEl.value;
  const remEl = document.getElementById('t-reminder');
  if(remEl) _draft.reminder = remEl.value;
}

function setNotesMode(m){
  _syncDraft(); // capture latest textarea before touching DOM
  _notesMode = m;
  // Only swap out the notes content area — leave the rest of the drawer untouched
  const notesContent = document.getElementById('notes-content-area');
  if(!notesContent) return;
  const id = _editTaskId;
  const scope = 'task-' + (id||'new');
  if(m === 'edit'){
    notesContent.innerHTML = `<textarea class="notes-area" id="t-notes" placeholder="Add notes, outlines, or subtasks…&#10;&#10;Try: - [ ] subtask" oninput="_onNotesInput()">${esc(_draft.notes||'')}</textarea>`;
    document.getElementById('t-notes').focus();
  } else {
    notesContent.innerHTML = `<div class="notes-preview md-preview" id="notes-preview-render">${parseMarkdown(_draft.notes||'','task-'+(id||'new'))}</div>`;
  }
  // Update toggle button states without re-rendering
  document.querySelectorAll('.notes-mode-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.mode === m);
  });
}

function _onNotesInput(){
  const el = document.getElementById('t-notes');
  if(el) _draft.notes = el.value;
  _dCommit();
}

let _dTimer;
function _dAutoSave(){
  _syncDraft();
  _dCommit();
}

function _dCommit(){
  clearTimeout(_dTimer);
  _dTimer = setTimeout(()=>{
    const id = _editTaskId;
    if(!id) return; // new tasks saved on explicit Save only
    const t = state.tasks.find(t=>t.id===id);
    if(!t) return;
    t.notes = _draft.notes ?? t.notes ?? '';
    t.title = (_draft.title||'').trim() || t.title;
    t.startDate = _draft.startDate ?? '';
    t.endDate = _draft.endDate ?? '';
    t.reminder = _draft.reminder ?? '';
    t.tags = [...window._pTags];
    t.effort = window._pScores.effort;
    t.impact = window._pScores.impact;
    save();
  }, 600);
}

function closeDrawer(){
  const d=document.getElementById('the-drawer'),o=document.querySelector('.drawer-overlay');
  if(d)d.classList.add('closing');if(o)o.style.opacity='0';o&&(o.style.transition='opacity 0.22s');
  setTimeout(()=>{document.getElementById('modal-root').innerHTML='';renderPage();},230);
}

function renderStars(type,val){return[1,2,3,4,5].map(i=>`<span class="star${i<=val?' filled':''}" onclick="setStar('${type}',${i})">★</span>`).join('');}
function setStar(type,val){window._pScores[type]=val;document.getElementById(`stars-${type}`).innerHTML=renderStars(type,val);_dAutoSave();}
function toggleTagPick(id){const i=window._pTags.indexOf(id);if(i>-1)window._pTags.splice(i,1);else window._pTags.push(id);document.getElementById('tag-picker').innerHTML=TAGS.map(t=>`<span class="tag ${tagCls(t.id)}${window._pTags.includes(t.id)?' tag-selected':''}" onclick="toggleTagPick('${t.id}')">${t.label}</span>`).join('');_dAutoSave();}

function _iMd(p){const el=document.getElementById('t-notes');if(!el)return;const s=el.selectionStart,v=el.value,ls=v.lastIndexOf('\n',s-1)+1;el.value=v.slice(0,ls)+p+v.slice(ls);el.selectionStart=el.selectionEnd=ls+p.length+(s-ls);el.focus();}
function _wMd(b,a){const el=document.getElementById('t-notes');if(!el)return;const s=el.selectionStart,e=el.selectionEnd,v=el.value,sel=v.slice(s,e)||'text';el.value=v.slice(0,s)+b+sel+a+v.slice(e);el.selectionStart=s+b.length;el.selectionEnd=s+b.length+sel.length;el.focus();}

function saveTask(){
  _syncDraft();
  const title=(_draft.title||document.getElementById('t-title')?.value||'').trim();
  if(!title){showToast('Enter a task title');return;}
  const data={title,notes:_draft.notes||'',startDate:_draft.startDate||'',endDate:_draft.endDate||'',reminder:_draft.reminder||'',tags:[...window._pTags],effort:window._pScores.effort,impact:window._pScores.impact,weekKey:_editWeekKey};
  if(_editTaskId){const i=state.tasks.findIndex(t=>t.id===_editTaskId);if(i>-1)state.tasks[i]={...state.tasks[i],...data};}
  else{const newId=genId();state.tasks.push({id:newId,done:false,...data,createdAt:new Date().toISOString()});_editTaskId=newId;}
  save();
  // Switch to preview if there are notes, otherwise close
  if(_draft.notes && _draft.notes.trim()){
    _notesMode='preview';
    const task=state.tasks.find(t=>t.id===_editTaskId);
    if(task) _renderDrawer(task);
  } else {
    closeDrawer();
  }
  showToast('Task saved ✓');
}
function deleteTask(id){state.tasks=state.tasks.filter(t=>t.id!==id);save();closeDrawer();showToast('Task deleted');}

// ─── Status & Complete ────────────────────────────────────────────────────────
const STATUSES = [
  {id:'todo',    label:'To do',       color:'#ABABAB'},
  {id:'doing',   label:'In progress', color:'#2563EB'},
  {id:'blocked', label:'Blocked',     color:'#D97706'},
  {id:'review',  label:'In review',   color:'#7C3AED'},
  {id:'done',    label:'Done',        color:'#16a34a'},
];
function _statusCfg(id){ return STATUSES.find(s=>s.id===id)||STATUSES[0]; }

let _statusDropOpen = false;
function toggleStatusDrop(e){
  e.stopPropagation();
  const wrap = document.getElementById('status-wrap'); if(!wrap) return;
  const existing = wrap.querySelector('.status-dropdown');
  if(existing){ existing.remove(); _statusDropOpen=false; return; }
  _statusDropOpen = true;
  const task = state.tasks.find(t=>t.id===_editTaskId);
  const cur = task?.status||'todo';
  const drop = document.createElement('div');
  drop.className = 'status-dropdown';
  drop.innerHTML = STATUSES.map(s=>`
    <div class="status-option${s.id===cur?' active':''}" onclick="setStatus('${s.id}')">
      <span class="so-dot" style="background:${s.color}"></span>
      <span>${s.label}</span>
      ${s.id===cur?`<svg style="margin-left:auto;opacity:0.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`:''}
    </div>`).join('');
  wrap.appendChild(drop);
  // close on outside click
  setTimeout(()=>document.addEventListener('click', function _c(){ drop.remove(); _statusDropOpen=false; document.removeEventListener('click',_c); }, {once:true}), 10);
}

function setStatus(statusId){
  const task = state.tasks.find(t=>t.id===_editTaskId); if(!task) return;
  task.status = statusId;
  // sync done flag with done status
  if(statusId==='done' && !task.done){ task.done=true; }
  if(statusId!=='done' && task.done){ task.done=false; }
  save();
  // Refresh just the status pill and complete button without re-rendering whole drawer
  const wrap = document.getElementById('status-wrap');
  if(wrap){
    const cfg = _statusCfg(statusId);
    wrap.querySelector('.status-pill').innerHTML = `<span class="sp-dot" style="background:${cfg.color}"></span><span>${cfg.label}</span><span class="sp-chevron">▾</span>`;
  }
  const btn = document.getElementById('complete-btn');
  if(btn){
    btn.classList.toggle('is-done', task.done);
    btn.querySelector('.cb-label').textContent = task.done ? 'Completed' : 'Complete';
  }
}

function completeTask(id, wasDone){
  const task = state.tasks.find(t=>t.id===id); if(!task) return;
  const nowDone = !wasDone;
  task.done = nowDone;
  task.status = nowDone ? 'done' : 'todo';
  save();

  // Animate the button
  const btn = document.getElementById('complete-btn');
  if(btn){
    btn.classList.add('completing');
    setTimeout(()=>btn.classList.remove('completing'), 500);
    btn.classList.toggle('is-done', nowDone);
    btn.querySelector('.cb-label').textContent = nowDone ? 'Completed' : 'Complete';
    btn.setAttribute('onclick', `completeTask('${id}',${nowDone})`);
  }

  // Refresh status pill
  const wrap = document.getElementById('status-wrap');
  if(wrap){
    const cfg = _statusCfg(task.status);
    wrap.querySelector('.status-pill').innerHTML = `<span class="sp-dot" style="background:${cfg.color}"></span><span>${cfg.label}</span><span class="sp-chevron">▾</span>`;
  }

  if(nowDone){
    _launchConfetti(btn);
    showToast('Task completed 🎉');
  }
}

// ─── Confetti ────────────────────────────────────────────────────────────────
function _launchConfetti(originEl){
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Origin: centre of the button
  const rect = originEl ? originEl.getBoundingClientRect() : {left:window.innerWidth/2, top:window.innerHeight/2, width:0, height:0};
  const ox = rect.left + rect.width/2;
  const oy = rect.top + rect.height/2;

  const COLORS = ['#0F0F0F','#6B6B6B','#ABABAB','#2563EB','#D97706','#16a34a','#7C3AED','#F472B6'];
  const SHAPES = ['rect','circle','strip'];
  const N = 80;

  const particles = Array.from({length:N}, ()=>({
    x: ox, y: oy,
    vx: (Math.random()-0.5)*18,
    vy: -(Math.random()*14+4),
    rot: Math.random()*360,
    rotV: (Math.random()-0.5)*12,
    w: Math.random()*8+4,
    h: Math.random()*5+3,
    color: COLORS[Math.floor(Math.random()*COLORS.length)],
    shape: SHAPES[Math.floor(Math.random()*SHAPES.length)],
    alpha: 1,
    gravity: 0.45+Math.random()*0.3,
    drag: 0.97,
  }));

  let frame;
  const tick = ()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let alive = false;
    particles.forEach(p=>{
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.x += p.vx; p.y += p.vy;
      p.rot += p.rotV;
      p.alpha -= 0.016;
      if(p.alpha <= 0) return;
      alive = true;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.color;
      if(p.shape==='circle'){
        ctx.beginPath(); ctx.arc(0,0,p.w/2,0,Math.PI*2); ctx.fill();
      } else if(p.shape==='strip'){
        ctx.fillRect(-p.h/2,-p.w/2,p.h,p.w);
      } else {
        ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
      }
      ctx.restore();
    });
    if(alive) frame = requestAnimationFrame(tick);
    else { cancelAnimationFrame(frame); canvas.remove(); }
  };
  frame = requestAnimationFrame(tick);
  // Safety cleanup after 4s
  setTimeout(()=>{ cancelAnimationFrame(frame); canvas.remove(); }, 4000);
}

// ─── Workout Page ─────────────────────────────────────────────────────────────
let _wLoading=false,_wExpanded={};
function renderWorkoutPage(){
  const plan=state.workoutPlan;
  return `<div class="page">
    <div class="page-header"><h1 class="page-title">Workout Planner</h1><p class="page-subtitle">AI-generated splits tailored to your goals and schedule.</p></div>
    <div class="workout-header">
      <div class="section-title">Generate a plan</div>
      <div class="form-row" style="margin-bottom:12px">
        <div class="form-group" style="margin-bottom:0"><label>Fitness goal</label><select id="wg-goal"><option value="general fitness">General fitness</option><option value="muscle building">Muscle building</option><option value="fat loss">Fat loss</option><option value="strength">Strength & power</option><option value="endurance">Endurance</option><option value="mobility & flexibility">Mobility & flexibility</option></select></div>
        <div class="form-group" style="margin-bottom:0"><label>Days per week</label><select id="wg-days"><option value="3">3 days</option><option value="4" selected>4 days</option><option value="5">5 days</option><option value="6">6 days</option></select></div>
      </div>
      <div class="form-row" style="margin-bottom:14px">
        <div class="form-group" style="margin-bottom:0"><label>Experience level</label><select id="wg-level"><option value="beginner">Beginner</option><option value="intermediate" selected>Intermediate</option><option value="advanced">Advanced</option></select></div>
        <div class="form-group" style="margin-bottom:0"><label>Equipment</label><select id="wg-equipment"><option value="full gym">Full gym</option><option value="dumbbells only">Dumbbells only</option><option value="home bodyweight">Home / bodyweight</option><option value="resistance bands">Resistance bands</option></select></div>
      </div>
      <div class="plan-actions">
        <button class="btn btn-ai" onclick="generateWorkout()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>Generate with AI</button>
        ${plan?`<button class="btn btn-sm" onclick="addPlanToTasks()">+ Add to this week</button>`:''}
        ${plan?`<button class="btn btn-sm btn-ghost" onclick="state.workoutPlan=null;save();renderPage()">Clear</button>`:''}
      </div>
    </div>
    ${_wLoading?`<div class="ai-generating"><div class="ai-dots"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div></div><span>Designing your personalised workout split…</span></div>`
      :plan?plan.days.map((day,idx)=>{const isRest=day.type==='Rest',exp=_wExpanded[idx]!==false;
        return `<div class="workout-day${exp?' expanded':''}">
          <div class="workout-day-header" onclick="toggleWDay(${idx})">
            <div><span class="workout-day-label">${esc(day.day)}</span><span class="workout-day-type"> — ${esc(day.type)}</span></div>
            <div style="display:flex;align-items:center;gap:8px">${isRest?`<span class="badge-rest">Rest</span>`:`<span class="badge-active">${day.exercises?.length||0} exercises</span>`}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" style="transition:transform 0.2s;transform:rotate(${exp?'180':'0'}deg)"><path d="M6 9l6 6 6-6"/></svg></div>
          </div>
          <div class="workout-exercises">${isRest?`<p style="font-size:13.5px;color:var(--text3);padding:12px 0">Active recovery — stretch, walk, or foam roll.</p>`:
            `${(day.exercises||[]).map(ex=>`<div class="exercise-row"><div><div class="exercise-name">${esc(ex.name)}</div><div class="exercise-muscle">${esc(ex.muscle||'')}</div></div><span class="exercise-sets">${esc(ex.sets)}</span></div>`).join('')}
            ${day.notes?`<p style="font-size:12.5px;color:var(--text3);padding:10px 0 0;font-style:italic">${esc(day.notes)}</p>`:''}`}
          </div>
        </div>`;}).join('')
      :`<div class="empty" style="padding:32px 24px"><div class="empty-icon">🏋️</div><div class="empty-text">Configure your preferences and generate a plan</div></div>`}
  </div>`;
}
function toggleWDay(idx){_wExpanded[idx]=_wExpanded[idx]===false?true:false;renderPage();}
async function generateWorkout(){
  const goal=document.getElementById('wg-goal').value,days=document.getElementById('wg-days').value,level=document.getElementById('wg-level').value,equipment=document.getElementById('wg-equipment').value;
  _wLoading=true;renderPage();
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1500,messages:[{role:'user',content:`Create a ${days}-day per week workout split. Goal: ${goal}. Level: ${level}. Equipment: ${equipment}. Return ONLY valid JSON with this structure (no markdown): {"goal":"${goal}","level":"${level}","daysPerWeek":${days},"days":[{"day":"Monday","type":"Push (Chest, Shoulders, Triceps)","exercises":[{"name":"Bench Press","muscle":"Chest","sets":"4 × 8-10"}],"notes":"Rest 60-90s between sets"},{"day":"Tuesday","type":"Rest","exercises":[],"notes":""}]} Generate exactly 7 days Mon-Sun with ${days} training days mixed with rest days. Make exercises specific and appropriate for ${level} with ${equipment}.`}]})});
    const data=await res.json();const text=data.content.map(c=>c.text||'').join('');
    const plan=JSON.parse(text.replace(/```json|```/g,'').trim());
    state.workoutPlan=plan;_wExpanded={};save();
  }catch(e){showToast('Could not generate plan — try again');}
  _wLoading=false;renderPage();
}
function addPlanToTasks(){
  if(!state.workoutPlan)return;const wk=state.activeWeek,wkDate=new Date(wk);let added=0;
  state.workoutPlan.days.forEach((day,idx)=>{if(day.type==='Rest')return;const td=new Date(wkDate);td.setDate(wkDate.getDate()+idx);td.setHours(7,0,0,0);
    state.tasks.push({id:genId(),title:`Workout: ${day.type}`,tags:['health','habit'],startDate:td.toISOString().slice(0,16),endDate:'',reminder:'',notes:'',effort:3,impact:4,done:false,weekKey:wk,createdAt:new Date().toISOString()});added++;});
  save();navigate('week');showToast(`Added ${added} sessions to this week ✓`);
}

// ─── Insights Page ────────────────────────────────────────────────────────────
function renderInsightsPage(){
  const total=state.tasks.length,done=state.tasks.filter(t=>t.done).length;
  const avgEff=total?(state.tasks.reduce((s,t)=>s+(t.effort||0),0)/total).toFixed(1):'—';
  const avgImp=total?(state.tasks.reduce((s,t)=>s+(t.impact||0),0)/total).toFixed(1):'—';
  const tc={};state.tasks.forEach(t=>(t.tags||[]).forEach(tg=>{tc[tg]=(tc[tg]||0)+1;}));
  const maxC=Math.max(...Object.values(tc),1);const stags=Object.entries(tc).sort((a,b)=>b[1]-a[1]);
  const topImp=[...state.tasks].filter(t=>t.impact).sort((a,b)=>b.impact-a.impact).slice(0,4);
  const drainers=state.tasks.filter(t=>(t.effort||0)>=4&&(t.impact||0)<=2);
  const sugg=buildSuggestions();
  return `<div class="page">
    <div class="page-header"><h1 class="page-title">Insights</h1><p class="page-subtitle">What your data reveals about your time, energy, and joy.</p></div>
    <div class="insight-grid">
      <div class="insight-card"><div class="insight-num">${total}</div><div class="insight-label">Total tasks</div><div class="insight-sub">${done} completed</div></div>
      <div class="insight-card"><div class="insight-num">${done&&total?Math.round(done/total*100)+'%':'—'}</div><div class="insight-label">Completion</div><div class="insight-sub">across all time</div></div>
      <div class="insight-card"><div class="insight-num">${avgEff}</div><div class="insight-label">Avg effort</div><div class="insight-sub">out of 5</div></div>
      <div class="insight-card"><div class="insight-num">${avgImp}</div><div class="insight-label">Avg joy</div><div class="insight-sub">out of 5</div></div>
    </div>
    ${stags.length>0?`<div class="card" style="margin-bottom:16px"><div class="section-title">Time by category</div>${stags.map(([tag,count])=>`<div class="tag-bar"><div class="tag-bar-label"><span class="tag ${tagCls(tag)}" style="font-size:11px;padding:2px 8px">${tagLabel(tag)}</span><span style="font-size:12.5px;color:var(--text2);font-weight:500">${count} tasks</span></div><div class="tag-bar-track"><div class="tag-bar-fill" style="width:${Math.round(count/maxC*100)}%;background:${TAG_COLORS[tag]||'#9CA3AF'}"></div></div></div>`).join('')}</div>`:''}
    ${topImp.length>0?`<div class="card" style="margin-bottom:16px"><div class="section-title">Highest joy activities</div>${topImp.map(t=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)"><span style="font-size:14px">${esc(t.title)}</span><span style="font-size:13px;color:var(--blue);font-weight:600">★ ${t.impact}/5</span></div>`).join('')}</div>`:''}
    ${drainers.length>0?`<div class="card" style="margin-bottom:16px;border-color:rgba(217,119,6,0.3)"><div class="section-title" style="color:var(--amber)">⚡ High effort, low joy</div><p style="font-size:13.5px;color:var(--text2);margin-bottom:12px">These tasks cost energy but don't bring joy. Consider delegating or eliminating.</p>${drainers.map(t=>`<div style="font-size:13.5px;padding:7px 0;border-bottom:1px solid var(--border);color:var(--text2)">${esc(t.title)}</div>`).join('')}</div>`:''}
    <div class="card"><div class="section-title">Suggestions for you</div>${sugg.map(s=>`<div class="suggestion" onclick="handleSugg('${esc(s.action)}','${esc(s.prefill||'')}')"><span class="suggestion-icon">${s.icon}</span><div class="suggestion-text"><strong>${esc(s.title)}</strong><span>${esc(s.desc)}</span></div></div>`).join('')}</div>
  </div>`;
}
function buildSuggestions(){
  const tags={};state.tasks.forEach(t=>(t.tags||[]).forEach(tg=>{tags[tg]=(tags[tg]||0)+1;}));const s=[];
  if(!tags['health']||tags['health']<3)s.push({icon:'🏃',title:'Start a workout routine',desc:'Generate a personalised training split.',action:'workout',prefill:''});
  if(!tags['habit'])s.push({icon:'🔁',title:'Build a daily habit',desc:'Track one small habit this week.',action:'task',prefill:'Daily habit: '});
  if(!tags['relationships'])s.push({icon:'💬',title:'Nurture a relationship',desc:"You haven't logged any relationship time.",action:'task',prefill:'Catch up with '});
  if(Object.keys(state.weekJournals).length<2)s.push({icon:'📝',title:'Journal this week',desc:'Reflection builds clarity.',action:'journal',prefill:''});
  if(state.goals.length===0)s.push({icon:'🎯',title:'Set your first goal',desc:'Start with one thing you want this year.',action:'goal',prefill:''});
  if(s.length===0)s.push({icon:'✨',title:"You're building great habits",desc:'Keep tracking to see deeper patterns.',action:'',prefill:''});
  return s.slice(0,4);
}
function handleSugg(a,p){if(a==='workout')navigate('workout');else if(a==='task')openTaskDrawer(null,state.activeWeek,{title:p});else if(a==='goal')openGoalDrawer(null);else if(a==='journal')navigate('week');}

// ─── Utils ────────────────────────────────────────────────────────────────────
function closeModal(){document.getElementById('modal-root').innerHTML='';}
function showToast(msg){
  const el=document.createElement('div');el.className='toast';el.textContent=msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(()=>{el.classList.add('toast-out');setTimeout(()=>el.remove(),280);},2400);
}
function renderPage(){
  const el=document.getElementById('main-content');
  if(state.currentPage==='week')el.innerHTML=renderWeekPage();
  else if(state.currentPage==='tasks')el.innerHTML=renderTasksPage();
  else if(state.currentPage==='goals')el.innerHTML=renderGoalsPage();
  else if(state.currentPage==='workout')el.innerHTML=renderWorkoutPage();
  else if(state.currentPage==='insights')el.innerHTML=renderInsightsPage();
  bindJournal();
  // Right panel — only renders content if visible (≥1280px)
  const rp=document.getElementById('right-panel');
  if(rp) rp.innerHTML=renderRightPanel();
}

function renderRightPanel(){
  const today=getWeekKey(new Date());
  const weekTasks=state.tasks.filter(t=>t.weekKey===today);
  const pending=weekTasks.filter(t=>!t.done);
  const done=weekTasks.filter(t=>t.done);
  const total=state.tasks.length;
  const allDone=state.tasks.filter(t=>t.done).length;
  const goalsWithProgress=state.goals.map(g=>{const p=countProgress(g.content||'');return{...g,prog:p,pct:p.total>0?Math.round(p.checked/p.total*100):0};}).filter(g=>g.prog.total>0||g.title);

  return `
    <div class="rp-section">
      <div class="rp-label">This week</div>
      <div class="rp-stat-grid">
        <div class="rp-stat"><div class="rp-stat-num">${pending.length}</div><div class="rp-stat-label">Remaining</div></div>
        <div class="rp-stat"><div class="rp-stat-num">${done.length}</div><div class="rp-stat-label">Completed</div></div>
      </div>
    </div>

    ${pending.length>0?`<div class="rp-section">
      <div class="rp-label">Up next</div>
      ${pending.slice(0,5).map(t=>`<div class="rp-task" onclick="openTaskDrawer('${t.id}')">
        <div class="rp-task-check${t.done?' done':''}"></div>
        <span class="rp-task-title">${esc(t.title)}</span>
      </div>`).join('')}
      ${pending.length>5?`<div style="font-size:11.5px;color:var(--text3);padding:6px 0">+${pending.length-5} more this week</div>`:''}
    </div>`:''}

    <div class="rp-divider"></div>

    <div class="rp-section">
      <div class="rp-label">Goals</div>
      ${goalsWithProgress.length===0?`<div class="rp-empty">No goals yet</div>`:
        goalsWithProgress.slice(0,5).map(g=>`<div class="rp-goal" onclick="openGoalDrawer('${g.id}')">
          <div class="rp-goal-bar-wrap">
            <div class="rp-goal-title">${esc(g.title)}</div>
            ${g.prog.total>0?`<div class="rp-goal-track"><div class="rp-goal-fill" style="width:${g.pct}%"></div></div>`:''}
          </div>
          ${g.prog.total>0?`<span class="rp-goal-pct">${g.pct}%</span>`:''}
        </div>`).join('')}
    </div>

    <div class="rp-divider"></div>

    <div class="rp-section">
      <div class="rp-label">All time</div>
      <div class="rp-stat-grid">
        <div class="rp-stat"><div class="rp-stat-num">${total}</div><div class="rp-stat-label">Tasks</div></div>
        <div class="rp-stat"><div class="rp-stat-num">${total?Math.round(allDone/total*100):0}%</div><div class="rp-stat-label">Done</div></div>
      </div>
    </div>`;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function showApp(){
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  // Populate user UI
  const u=currentUser;
  const av=document.getElementById('user-avatar');
  if(u.avatar){ av.innerHTML=`<img src="${esc(u.avatar)}" alt="">`; }
  else { av.textContent=(u.displayName||u.username||'?')[0].toUpperCase(); }
  document.getElementById('user-name-display').textContent=u.displayName||u.username;
  document.getElementById('user-handle-display').textContent=u.email||('@'+u.username);
  resetState(); load(); renderNav(); renderPage();
}

function showAuth(mode='login'){
  document.getElementById('app').style.display='none';
  const el=document.getElementById('auth-screen');
  el.style.display='flex';
  el.innerHTML=renderAuthScreen(mode);
}

function renderAuthScreen(mode){
  const isLogin=mode==='login';
  const autoComplete=isLogin?'current-password':'new-password';
  const submitFn=isLogin?'doLogin()':'doSignup()';
  const footerMsg=isLogin
    ?`Don't have an account? <span class="auth-link" onclick="showAuth('signup')">Sign up</span>`
    :`Already have an account? <span class="auth-link" onclick="showAuth('login')">Sign in</span>`;
  return `<div class="auth-card">
    <div class="auth-logo">
      <div class="auth-logo-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
      <span class="auth-logo-text">Dayloom</span>
    </div>
    <div class="auth-title">${isLogin?'Welcome back':'Create your account'}</div>
    <div class="auth-subtitle">${isLogin?'Sign in to your life OS':'Your personal space for tasks, goals, and reflection'}</div>

    <button class="btn-google" onclick="signInWithGoogle()">
      <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Continue with Google
    </button>

    <div class="auth-divider"><span>or</span></div>

    <div class="auth-error" id="auth-error"></div>

    ${!isLogin?`<div class="form-group" style="margin-bottom:12px">
      <label>Display name</label>
      <input type="text" id="auth-name" placeholder="Your name" autocomplete="name">
    </div>`:''}
    <div class="form-group" style="margin-bottom:12px">
      <label>Username</label>
      <input type="text" id="auth-username" placeholder="e.g. alex_doe" autocomplete="username" style="text-transform:lowercase" oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9_]/g,'')">
    </div>
    <div class="form-group" style="margin-bottom:18px">
      <label>Password</label>
      <input type="password" id="auth-password" placeholder="••••••••" autocomplete="${autoComplete}" onkeydown="if(event.key==='Enter')${submitFn}">
    </div>

    <button class="btn btn-primary" style="width:100%;justify-content:center;padding:11px;" onclick="${submitFn}">
      ${isLogin?'Sign in':'Create account'}
    </button>

    <div class="auth-footer">${footerMsg}</div>
  </div>`;
}

function authError(msg){
  const el=document.getElementById('auth-error');
  if(el){el.textContent=msg;el.classList.add('show');}
}

// Simple hash for password (not cryptographically strong, but fine for local-only auth)
async function hashPass(p){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p+'dayloom_salt'));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function doLogin(){
  const username=(document.getElementById('auth-username')?.value||'').trim().toLowerCase();
  const password=document.getElementById('auth-password')?.value||'';
  if(!username||!password){authError('Please fill in all fields');return;}
  const users=getUsers();
  const user=Object.values(users).find(u=>u.username===username&&u.provider==='local');
  if(!user){authError('No account found with that username');return;}
  const hash=await hashPass(password);
  if(user.passwordHash!==hash){authError('Incorrect password');return;}
  currentUser=user;
  localStorage.setItem(SESSION_KEY,user.id);
  showApp();
}

async function doSignup(){
  const username=(document.getElementById('auth-username')?.value||'').trim().toLowerCase();
  const password=document.getElementById('auth-password')?.value||'';
  const displayName=(document.getElementById('auth-name')?.value||'').trim();
  if(!username||!password){authError('Please fill in all fields');return;}
  if(username.length<3){authError('Username must be at least 3 characters');return;}
  if(password.length<6){authError('Password must be at least 6 characters');return;}
  const users=getUsers();
  if(Object.values(users).find(u=>u.username===username)){authError('Username already taken');return;}
  const hash=await hashPass(password);
  const id=genId();
  const user={id,username,displayName:displayName||username,provider:'local',passwordHash:hash,createdAt:new Date().toISOString()};
  users[id]=user;
  saveUsers(users);
  currentUser=user;
  localStorage.setItem(SESSION_KEY,id);
  showApp();
}

function signInWithGoogle(){
  // Google OAuth2 implicit flow — opens popup
  const CLIENT_ID=''; // Placeholder — user can add their own Google Client ID
  if(!CLIENT_ID){
    // Demo mode: simulate Google sign-in with a fake account for prototype
    _mockGoogleSignIn();
    return;
  }
  const params=new URLSearchParams({
    client_id:CLIENT_ID, redirect_uri:window.location.href.split('?')[0],
    response_type:'token id_token', scope:'openid email profile',
    nonce:genId(), prompt:'select_account'
  });
  const popup=window.open(`https://accounts.google.com/o/oauth2/v2/auth?${params}`,'google-auth','width=500,height=600,left=200,top=100');
  if(!popup){authError('Popup blocked — please allow popups for this page');return;}
  const check=setInterval(()=>{
    try{
      if(popup.closed){clearInterval(check);return;}
      const hash=popup.location.hash;
      if(hash&&hash.includes('id_token')){
        popup.close(); clearInterval(check);
        const p=new URLSearchParams(hash.slice(1));
        const idToken=p.get('id_token');
        const payload=JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        _onGoogleUser(payload.sub,payload.name,payload.email,payload.picture);
      }
    }catch(e){}
  },300);
}

function _mockGoogleSignIn(){
  // For the prototype without a real Client ID — creates a demo Google-style account
  const mockEmail='demo@gmail.com';
  const users=getUsers();
  let user=Object.values(users).find(u=>u.email===mockEmail&&u.provider==='google');
  if(!user){
    const id=genId();
    user={id,provider:'google',email:mockEmail,displayName:'Demo User',username:'demo_user',avatar:'',createdAt:new Date().toISOString()};
    users[id]=user; saveUsers(users);
  }
  currentUser=user;
  localStorage.setItem(SESSION_KEY,user.id);
  showApp();
}

function _onGoogleUser(googleId,name,email,picture){
  const users=getUsers();
  let user=Object.values(users).find(u=>u.googleId===googleId||u.email===email);
  if(!user){
    const id=genId();
    user={id,provider:'google',googleId,email,displayName:name,username:email.split('@')[0].replace(/[^a-z0-9_]/gi,'_').toLowerCase(),avatar:picture||'',createdAt:new Date().toISOString()};
    users[id]=user; saveUsers(users);
  }
  currentUser=user;
  localStorage.setItem(SESSION_KEY,user.id);
  showApp();
}

// ─── User menu ────────────────────────────────────────────────────────────────
let _userMenuOpen=false;
function toggleUserMenu(){
  const existing=document.getElementById('user-dropdown');
  if(existing){existing.remove();_userMenuOpen=false;return;}
  _userMenuOpen=true;
  const btn=document.getElementById('user-menu-btn');
  const drop=document.createElement('div');
  drop.id='user-dropdown'; drop.className='user-dropdown';
  drop.innerHTML=`
    <button class="user-drop-item" onclick="closeUserMenu();navigate('insights')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> Insights
    </button>
    <div class="user-drop-sep"></div>
    <button class="user-drop-item" onclick="closeUserMenu();signOut()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Sign out
    </button>
    <button class="user-drop-item danger" onclick="closeUserMenu();confirmDeleteAccount()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg> Delete account
    </button>`;
  btn.appendChild(drop);
  setTimeout(()=>document.addEventListener('click',_closeUserMenuOutside,{once:true}),10);
}
function _closeUserMenuOutside(){ closeUserMenu(); }
function closeUserMenu(){ document.getElementById('user-dropdown')?.remove(); _userMenuOpen=false; }

function signOut(){
  currentUser=null;
  localStorage.removeItem(SESSION_KEY);
  resetState();
  showAuth('login');
}

function confirmDeleteAccount(){
  const id=_editTaskId; // save context
  document.getElementById('modal-root').innerHTML=`<div class="modal-bg" onclick="if(event.target===this)closeModal()">
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><span class="modal-title">Delete account</span><button class="btn btn-ghost btn-icon btn-sm" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <p style="font-size:14px;color:var(--text2);margin-bottom:16px">This will permanently delete your account and all your data — tasks, goals, journals, and workout plans. This cannot be undone.</p>
        <input type="text" id="delete-confirm-input" placeholder="Type DELETE to confirm" style="margin-bottom:4px">
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAccount()">Delete everything</button>
      </div>
    </div>
  </div>`;
}

function deleteAccount(){
  const val=document.getElementById('delete-confirm-input')?.value||'';
  if(val!=='DELETE'){showToast('Type DELETE to confirm');return;}
  const uid=currentUser.id;
  localStorage.removeItem(userDataKey(uid));
  localStorage.removeItem(SESSION_KEY);
  const users=getUsers(); delete users[uid]; saveUsers(users);
  currentUser=null; resetState();
  closeModal(); showAuth('login'); showToast('Account deleted');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
(function boot(){
  const sessionId=localStorage.getItem(SESSION_KEY);
  if(sessionId){
    const users=getUsers();
    const user=users[sessionId];
    if(user){ currentUser=user; showApp(); return; }
  }
  showAuth('login');
})();