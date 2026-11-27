/* Frozen copy of the old events page's scoring code (src/events/app.src.html, Oct 18 2026), kept only so
   test/compat.test.ts can check the new code gives the same results. Not used by the site. */
const PARS18 = [4,5,3,4,4,5,3,4,4,4,5,4,3,4,5,3,4,4];
const FORMATS = {
  stroke:{label:'Stroke play', short:'Stroke play', team:false, desc:'Everyone plays their own ball. Lowest score wins.'},
  stableford:{label:'Stableford', short:'Stableford', team:false, desc:'Points per hole: par 2, birdie 3, eagle 4, bogey 1, double or worse 0. Most points wins.'},
  team:{label:'Team stroke play', short:'Team stroke', team:true, desc:'Everyone plays their own ball. The team counts its best scores.'},
  bestball:{label:'Best ball', short:'Best ball', team:true, desc:'Everyone plays their own ball. The team takes the single best score on each hole.'},
  scramble:{label:'Scramble', short:'Scramble', team:true, desc:'The team plays one ball and enters one score per hole.'},
  shamble:{label:'Shamble', short:'Shamble', team:true, desc:'Everyone tees off, the team picks the best drive, then each player plays their own ball in. The team counts its best scores on each hole.'},
  altshot:{label:'Alternate shot', short:'Alt shot', team:true, desc:'Partners play one ball, taking turns. One score per team.'},
  skins:{label:'Skins', short:'Skins', team:false, desc:'The lowest score on a hole wins a skin, but only if nobody ties it. Holes are decided once every player has a score.'},
  ryder:{label:'Ryder Cup', short:'Ryder Cup', team:true, desc:'Two sides play head-to-head matches (singles, four-ball or alternate shot), hole by hole. 1 point per match won, ½ for a halved match.'}
};
const oneBall = () => ['scramble','altshot'].includes(fmt());
const isRyder = () => fmt()==='ryder';
const DEFAULT_EVENT = {
  name: LOCK_FORMAT==='ryder' ? 'The Wildcat Cup' : 'Friday Tournament', date:'', course:'Rochester Country Club', holes:18, pars:PARS18, format: LOCK_FORMAT||'stroke', colorA:'royal', colorB:'white',
  countN:2, countMode:'hole', showIndividual:true, skinsCarry:true, sideA:'Team Blue', sideB:'Team White',
  visibility:'live', revealAt:0, show:'full', codes:false, messaging:true, locked:false, listed:true, createdAt:0
};
const app = document.getElementById('app');
const S = {
  mode:null, api:null, uid:null, email:null, signedInGoogle:false, org:false, admins:[],
  events:[], eventsReady:false, eid:null, ev:null, evReady:false,
  groups:[], players:[], teams:[], scores:{}, myGroup:null, memberLoaded:false,
  messages:[], myMsgs:[], log:[], blocked:[], codes:{}, codesLoaded:false,
  view:'home', tab:'board', hole:null, editId:null, confirm:null, err:'', dirty:false, joining:false, codeDraft:'', msgDraft:'', replyEdit:null,
  demoAs:'player', newOpen:false, savedCourse:null, canOrg:false, asPlayer:false, wipeRoster:false
};

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const E = () => ({...DEFAULT_EVENT, ...(S.ev||{})});
const fmt = () => LOCK_FORMAT || (E().format in FORMATS ? E().format : 'stroke');
/* UNH palette for team colors */
const SW = {royal:{c:'#003594',on:'#ffffff',el:'#003594',ed:'rgba(187,188,188,.7)',bar:'#3d7be8',n:'UNH blue'},navy:{c:'#041e42',on:'#ffffff',el:'#041e42',ed:'rgba(187,188,188,.7)',bar:'#7f9cc9',n:'Navy'},white:{c:'#ffffff',on:'#041e42',el:'#041e42',ed:'#ffffff',bar:'#ffffff',n:'White'},gray:{c:'#bbbcbc',on:'#041e42',el:'#8d8f8f',ed:'#bbbcbc',bar:'#bbbcbc',n:'Gray'},black:{c:'#000000',on:'#ffffff',el:'#000000',ed:'rgba(187,188,188,.7)',bar:'#000000',n:'Black'},red:{c:'#c8102e',on:'#ffffff',el:'#c8102e',ed:'rgba(255,255,255,.75)',bar:'#e4344a',n:'Red'}};
function teamVars(){ const A=SW[E().colorA]||SW.royal, B=SW[E().colorB]||SW.white; for(const [k,v] of [['a',A],['b',B]]){ app.style.setProperty('--'+k,v.c); app.style.setProperty('--'+k+'-on',v.on); app.style.setProperty('--'+k+'-edge-l',v.el); app.style.setProperty('--'+k+'-edge-d',v.ed); app.style.setProperty('--'+k+'-bar',v.bar||v.c); } }
const isTeam = () => FORMATS[fmt()].team;
const nH = () => +E().holes===9 ? 9 : 18;
const parOf = h => +(E().pars||PARS18)[h-1] || 4;
const P = path => 'events/'+S.eid+'/'+path;
const store = {get(k){try{return localStorage.getItem(k)}catch(_){return null}}, set(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(_){}}};
let toastT; function toast(m){const t=document.getElementById('toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2600);}
const fmtPar = n => n===0?'E':(n>0?'+'+n:''+n);
const id6 = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const newCode=()=>String(Math.floor(1000+Math.random()*9000));
function fmtWhen(ms){ if(!ms) return ''; return new Date(ms).toLocaleString([], {weekday:'short', hour:'numeric', minute:'2-digit'}); }
function fmtAgo(ms){ const s=Math.max(0,(Date.now()-ms)/1000|0); if(s<60) return 'just now'; if(s<3600) return Math.floor(s/60)+'m ago'; if(s<86400) return Math.floor(s/3600)+'h ago'; return new Date(ms).toLocaleDateString(); }
function fmtDate(d){ return d ? new Date(d+'T12:00').toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'}) : ''; }
/* What players see while no matches are posted: the exec's own message, or the default. */
const noMatchMsg = e => [ (e.noMatchTitle||'').trim()||'Pairings coming soon', (e.noMatchTitle||e.noMatchText)?(e.noMatchText||'').trim():`Matches will be posted here before ${fmtDate(e.date)||'the event'}.` ];
/* Where the event is in time, by its date and the phone's clock: 'before' | 'today' | 'after'. No date counts as today. */
function dayPhase(e){ if(!e||!e.date) return 'today'; const t=new Date(), p=n=>String(n).padStart(2,'0'), today=`${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`;
  return e.date>today?'before':e.date<today?'after':'today'; }
/* Earliest tee time typed on a match/group ("12:30 PM", "1:00"), as typed; '' if none can be read. */
function firstTee(){ return teeInfo().txt; }
/* Earliest tee time as {txt, mins} (minutes after midnight); mins is null if none can be read. */
function teeInfo(){ let best=null, txt='';
  S.groups.forEach(g=>{ const m=/(\d{1,2})(?::(\d{2}))?\s*([ap])?/i.exec(g.tee||''); if(!m) return; let h=+m[1]%12; const ap=(m[3]||'').toLowerCase(); if(ap==='p'||(!ap&&h<7)) h+=12;
    const v=h*60+(+m[2]||0); if(best==null||v<best){ best=v; txt=String(g.tee).trim(); } });
  return {txt,mins:best}; }
/* On event day, the page goes Live 10 minutes before the first tee time. 0 = no tee time (Live all day). */
function liveAt(e){ const {mins}=teeInfo(); if(mins==null||dayPhase(e)!=='today') return 0; const d=new Date(); d.setHours(0,mins-10,0,0); return d.getTime(); }
const liveNow = e => dayPhase(e)==='today' && Date.now()>=liveAt(e);
/* Re-render once at the switch to Live, so an open page flips on its own. */
function armLive(){ const e=S.ev&&E(), t=e?liveAt(e):0; if(S.liveT){ clearTimeout(S.liveT); S.liveT=null; }
  if(t>Date.now()) S.liveT=setTimeout(()=>{ S.liveT=null; render(); }, t-Date.now()+500); }
const isOrgEmail = () => !!S.email && (S.email.toLowerCase()===OWNER_EMAIL.toLowerCase() || S.admins.map(e=>String(e).toLowerCase()).includes(S.email.toLowerCase()));
const revealed = () => { const e=E(); return e.visibility==='live'||e.visibility==='published'||(e.visibility==='scheduled'&&e.revealAt&&Date.now()>=e.revealAt); };
const groupById = id => S.groups.find(g=>g.id===id);
const teamById = id => S.teams.find(t=>t.id===id);
const scorersOf = g => Array.isArray(g&&g.scorers) ? g.scorers : [];
const byOrder = (a,b)=>(+a.order||0)-(+b.order||0);
/* scoring units: players, or teams in a scramble */
const unitsIn = gid => isRyder() ? [] : (oneBall() ? S.teams.filter(t=>t.groupId===gid) : S.players.filter(p=>p.groupId===gid)).sort(byOrder);
const playersIn = gid => S.players.filter(p=>p.groupId===gid).sort(byOrder);
const iScore = gid => !!gid && !E().locked && scorersOf(groupById(gid)).includes(S.uid) && !groupById(gid)?.submitted;
function unitHoles(id){ return ((S.scores[id]||{}).holes)||{}; }

/* ---------- scoring math ---------- */
function line(u){
  const h=unitHoles(u.id); let strokes=0, rel=0, thru=0, pts=0;
  for(let i=1;i<=nH();i++){ const v=+h['h'+i]; if(v>0){ strokes+=v; rel+=v-parOf(i); pts+=Math.max(0,2+parOf(i)-v); thru++; } }
  return {u, strokes, rel, pts, thru, done:thru===nH()};
}
function teamLine(t){
  const members=S.players.filter(p=>p.teamId===t.id && !p.status);
  const e=E(); const X = fmt()==='bestball' ? 1 : Math.max(1,+e.countN||1); /* team + shamble use countN */
  if(fmt()==='team' && e.countMode==='round'){
    const ls=members.map(line).filter(l=>l.thru>0).sort((a,b)=>a.rel-b.rel||b.thru-a.thru);
    const c=ls.slice(0,X);
    return {u:t, rel:c.reduce((a,l)=>a+l.rel,0), strokes:c.reduce((a,l)=>a+l.strokes,0), thru:c.length, label:`${c.length}/${Math.min(X,members.length)||X}`, done:members.length>0 && members.every(p=>line(p).done), counting:c.map(l=>l.u.id)};
  }
  const k=Math.min(X, members.length||X); let rel=0, strokes=0, thru=0;
  for(let i=1;i<=nH();i++){
    const vals=members.map(p=>+unitHoles(p.id)['h'+i]).filter(v=>v>0).sort((a,b)=>a-b);
    if(members.length && vals.length>=k){ const s=vals.slice(0,k).reduce((a,b)=>a+b,0); strokes+=s; rel+=s-k*parOf(i); thru++; }
  }
  return {u:t, rel, strokes, thru, done:thru===nH()};
}
function rank(rows, desc){
  rows.sort((a,b)=> desc ? (b.key-a.key || b.thru-a.thru) : (a.key-b.key || b.thru-a.thru) || String(a.u.name).localeCompare(b.u.name));
  let pos=0, prev=null; rows.forEach((r,i)=>{ if(prev===null||r.key!==prev){pos=i+1;prev=r.key;} r.pos=pos; });
  rows.forEach(r=>{ r.tie=rows.filter(x=>x.pos===r.pos).length>1; });
  return rows;
}
function individualRows(){
  const stab = fmt()==='stableford';
  return rank(S.players.filter(p=>!p.status).map(line).filter(r=>r.thru>0).map(r=>({...r,key:stab?r.pts:r.rel})), stab);
}
function teamRows(){
  const rows = oneBall() ? S.teams.filter(t=>!t.status).map(line) : S.teams.map(teamLine);
  return rank(rows.filter(r=>r.thru>0).map(r=>({...r,key:r.rel})), false);
}
function outsRows(){ return oneBall() ? S.teams.filter(t=>t.status).map(line) : S.players.filter(p=>p.status).map(line); }

function skinsRows(){
  const act=S.players.filter(p=>!p.status); const won={}, holes={}; let carry=0;
  act.forEach(p=>{won[p.id]=0;holes[p.id]=[];});
  for(let h=1;h<=nH();h++){
    const v=act.map(p=>[p,+unitHoles(p.id)['h'+h]||0]);
    if(!act.length || v.some(x=>!x[1])) continue;
    const lo=Math.min(...v.map(x=>x[1])); const w=v.filter(x=>x[1]===lo);
    if(w.length===1){ won[w[0][0].id]+=1+carry; holes[w[0][0].id].push(h); carry=0; } else if(E().skinsCarry) carry++;
  }
  const rows=rank(act.map(line).filter(r=>r.thru>0).map(r=>({...r,key:won[r.u.id],skins:won[r.u.id],won:holes[r.u.id]})), true);
  return {rows, carry};
}
/* Ryder Cup matches: each group is a match; scores/{groupId}.holes = 'A' | 'B' | 'H' */
const sideName = k => (k==='A'?E().sideA:E().sideB) || (k==='A'?'Team Blue':'Team White');
const mPlayers = (g,k) => ((k==='A'?g.aIds:g.bIds)||[]).map(id=>S.players.find(p=>p.id===id)).filter(Boolean);
const mNames = (g,k) => mPlayers(g,k).map(p=>p.name).join(' & ') || 'TBD';
const MTYPES = {singles:'Singles', fourball:'Four-ball', foursomes:'Alternate shot'};
function mSeq(g){ const n=nH(), s=Math.min(n,Math.max(1,+g.start||1)); return Array.from({length:n},(_,i)=>((s-1+i)%n)+1); }
function mstatus(g){
  const h=unitHoles(g.id), seq=mSeq(g), n=nH(); let diff=0, thru=0, closed=false;
  for(let k=0;k<n;k++){ const v=h['h'+seq[k]]; if(v!=='A'&&v!=='B'&&v!=='H') break; thru=k+1; if(v==='A')diff++; else if(v==='B')diff--; if(Math.abs(diff)>n-thru){closed=true;break;} }
  const left=n-thru, lead=diff>0?'A':diff<0?'B':null, final=closed||thru===n;
  let label, sub, pa=0, pb=0;
  if(thru===0){label='—';sub='Not started';}
  else if(final){ if(!lead){label='Halved';pa=pb=.5;} else {label=left>0?`${Math.abs(diff)}&${left}`:`${Math.abs(diff)} UP`; if(lead==='A')pa=1; else pb=1;} sub='Final'; }
  else { label=lead?`${Math.abs(diff)} UP`:'AS'; sub=`Thru ${thru}`+(lead&&Math.abs(diff)===left?' · Dormie':''); }
  let ja=pa, jb=pb; if(!final&&thru>0){ if(!lead){ja=jb=.5;} else if(lead==='A')ja=1; else jb=1; }
  return {thru,lead,final,label,sub,pa,pb,ja,jb,seq,next:final?null:seq[thru]};
}
const fmtPts = n => (Math.round(n*2)/2).toString().replace('.5','½').replace(/^0½$/,'½');
function cupState(){
  const ms=[...S.groups].sort(byOrder), st=ms.map(mstatus);
  const A=st.reduce((s,x)=>s+x.pa,0), B=st.reduce((s,x)=>s+x.pb,0), JA=st.reduce((s,x)=>s+x.ja,0), JB=st.reduce((s,x)=>s+x.jb,0);
  const n=ms.length, toWin=n?n/2+.5:0, winner=n?(A>=toWin?'A':B>=toWin?'B':null):null;
  const allFinal=n>0 && st.every(x=>x.final), playing=st.filter(x=>!x.final).length;
  return {ms,st,A,B,JA,JB,n,toWin,winner,allFinal,playing,halved:allFinal&&!winner};
}
