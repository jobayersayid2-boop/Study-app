'use strict';
const $=s=>document.querySelector(s),pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const pd=s=>{const[a,b,c]=s.split('-');return new Date(+a,b-1,+c)};
const addD=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return ymd(d)};
const wsOf=s=>addD(s,-pd(s).getDay());
const today=()=>ymd(new Date());
const BD=['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
const hms=s=>{s=Math.floor(s);return pad(Math.floor(s/3600))+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60)};
const hr=s=>(s/3600).toFixed(1)+' ঘণ্টা';
const esc=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const bar=p=>`<div class="bar"><i style="width:${Math.min(100,p)}%"></i></div>`;
const pct=(a,b)=>b?Math.round(a/b*100):0;
const KEYS=['settings','sessions','archives','timer','alarmed','prev'];
const DEF=()=>({subjects:[['বাংলা',2],['ICT',1],['English',2],['Finance',1],['Analytical Ability',2],['Mathematics',2],['পরীক্ষা ও রিভিশন',2],['Typing',1]].map((x,i)=>({id:i+1,name:x[0],target:x[1]*60,days:[0,1,2,3,4]})),weekly:65,off:[5,6],dark:false,next:9});
let db,D={},view='dashboard',wsel='cur',repDate=today(),mon=today().slice(0,7),ac,ai;

/* ---------- IndexedDB ---------- */
const open=()=>new Promise((r,j)=>{const q=indexedDB.open('study',1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
const dbget=k=>new Promise(r=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>r(undefined)});
const dbput=(k,v)=>new Promise(r=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=r;t.onerror=r});
const sv=k=>dbput(k,D[k]);
const svAll=()=>Promise.all(KEYS.map(sv));

/* ---------- Calculations ---------- */
const isOff=d=>D.settings.off.includes(pd(d).getDay());
const elapsed=()=>D.timer?D.timer.acc+(D.timer.since?Date.now()-D.timer.since:0):0;
const subName=id=>(D.settings.subjects.find(s=>s.id==id)||{}).name||'(মুছে ফেলা বিষয়)';
function dayMap(date){const m={};D.sessions.forEach(x=>{if(x.date===date)(m[x.sid]=m[x.sid]||{name:x.name,secs:0}).secs+=x.secs});
 if(D.timer&&D.timer.date===date){const t=m[D.timer.sid]=m[D.timer.sid]||{name:subName(D.timer.sid),secs:0};t.secs+=elapsed()/1000}return m}
const daySecs=d=>Object.values(dayMap(d)).reduce((a,x)=>a+x.secs,0);
const subjSecs=(sid,d)=>(dayMap(d)[sid]||{secs:0}).secs;
const dayTarget=d=>isOff(d)?0:D.settings.subjects.filter(s=>s.days.includes(pd(d).getDay())).reduce((a,s)=>a+s.target*60,0);
const subjWeekTarget=s=>s.target*60*s.days.filter(d=>!D.settings.off.includes(d)).length;
function weekData(ws,live){const we=addD(ws,6),bySub={},byDay={};let total=0;
 for(let i=0;i<7;i++)byDay[addD(ws,i)]=0;
 const add=(d,sid,name,s)=>{if(isOff(d))return;total+=s;byDay[d]+=s;(bySub[sid]=bySub[sid]||{name,secs:0}).secs+=s};
 D.sessions.forEach(x=>{if(x.date>=ws&&x.date<=we)add(x.date,x.sid,x.name,x.secs)});
 if(live&&D.timer&&D.timer.date>=ws&&D.timer.date<=we)add(D.timer.date,D.timer.sid,subName(D.timer.sid),elapsed()/1000);
 const completed=D.settings.subjects.filter(s=>subjWeekTarget(s)>0&&(bySub[s.id]?bySub[s.id].secs:0)>=subjWeekTarget(s)).map(s=>s.name);
 return{ws,we,total,bySub,byDay,completed,pct:pct(total,D.settings.weekly*3600)}}

/* ---------- Archive ---------- */
async function archive(ws,manual){const w=weekData(ws,false);w.manual=!!manual;w.final=!manual;w.at=Date.now();
 D.archives[ws]=w;await sv('archives')}
async function autoArchive(){const cw=wsOf(today());
 for(const ws of new Set(D.sessions.map(x=>wsOf(x.date))))
  if(ws<cw&&!(D.archives[ws]&&D.archives[ws].final))await archive(ws,false)}

/* ---------- Alarm ---------- */
function unlock(){try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();ac.resume&&ac.resume()}catch(e){}}
function beep(){if(!ac)return;[660,880,1100].forEach((f,i)=>{const o=ac.createOscillator(),g=ac.createGain(),t=ac.currentTime+i*.25;o.frequency.value=f;o.connect(g);g.connect(ac.destination);g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.22);o.start(t);o.stop(t+.25)})}
function ring(name){$('#atxt').textContent=name+' এর দৈনিক লক্ষ্য পূরণ হয়েছে';$('#alarm').hidden=false;beep();clearInterval(ai);ai=setInterval(beep,1500);
 navigator.vibrate&&navigator.vibrate([300,150,300]);
 try{if(window.Notification&&Notification.permission==='granted')new Notification('🔔 লক্ষ্য পূরণ',{body:name})}catch(e){}}
function checkAlarm(){const t=D.timer;if(!t||!t.since)return;const s=D.settings.subjects.find(x=>x.id==t.sid);if(!s||!s.target)return;
 const k=t.date+'_'+s.id;if(!D.alarmed[k]&&subjSecs(s.id,t.date)>=s.target*60){D.alarmed[k]=1;sv('alarmed');ring(s.name)}}

/* ---------- Views ---------- */
function vDash(){const t=today(),d=new Date(),w=weekData(wsOf(t),true),sec=daySecs(t),tg=dayTarget(t);
 const sched=D.settings.subjects.filter(s=>s.days.includes(d.getDay())&&!isOff(t)),done=sched.filter(s=>s.target&&subjSecs(s.id,t)>=s.target*60).length;
 return`<div class=card><p class=sub>${BD[d.getDay()]}, ${t}${isOff(t)?' (ছুটির দিন)':''}</p><h3>আজকের পড়া</h3><p class=big>${hms(sec)}</p>${bar(pct(sec,tg))}<p>লক্ষ্য ${hr(tg)} · অগ্রগতি ${pct(sec,tg)}%</p></div>
 <div class=card><h3>এই সপ্তাহ (রবি–বৃহ)</h3><p class=big>${hr(w.total)}</p>${bar(w.pct)}<p>${w.pct}% / লক্ষ্য ${D.settings.weekly} ঘণ্টা</p></div>
 <div class=card><h3>আজ সম্পন্ন বিষয়</h3><p class=big>${done} / ${sched.length}</p></div>`}
function vTimer(){const t=today(),T=D.timer,sched=D.settings.subjects.filter(s=>s.days.includes(new Date().getDay())&&!isOff(t));
 if(!sched.length)return'<div class=card>আজ কোনো বিষয় নির্ধারিত নেই (ছুটির দিন বা রুটিনে খালি)। রুটিন সেটিংসে পরিবর্তন করুন।</div>';
 return sched.map(s=>{const sec=subjSecs(s.id,t),mine=T&&T.sid==s.id,run=mine&&T.since,tg=s.target*60,rem=Math.max(0,tg-sec);
  const btn=mine?(run?`<button class=p onclick="A.pause()">⏸ Pause</button>`:`<button class=p onclick="A.resume()">▶ Resume</button>`)+`<button onclick="A.stop()">⏹ Stop</button>`:`<button class=p onclick="A.start(${s.id})">▶ Start</button>`;
  return`<div class=card><h3>${esc(s.name)} ${run?'🟢':mine?'⏸':''}</h3><p class=mono>${hms(sec)}</p>${bar(pct(sec,tg))}<p class=sub>লক্ষ্য ${hr(tg)} · বাকি ${hms(rem)}${sec>=tg&&tg?' ✅':''}</p><div class=row>${btn}<button class=d onclick="A.reset(${s.id})">↺ Reset</button></div></div>`}).join('')}
function vDaily(){const m=dayMap(repDate),tg=dayTarget(repDate),tot=daySecs(repDate);
 return`<div class=card><input type=date value="${repDate}" onchange="A.setDate(this.value)"><p class=big>${hms(tot)}</p>${bar(pct(tot,tg))}<p>${BD[pd(repDate).getDay()]} · লক্ষ্য ${hr(tg)} (${pct(tot,tg)}%)</p></div>
 <div class=card><h3>বিষয়ভিত্তিক</h3>${Object.entries(m).map(([id,x])=>{const s=D.settings.subjects.find(q=>q.id==id),tg=s?s.target*60:0;return`<p>${esc(x.name)}: ${hms(x.secs)}${tg?` / ${hr(tg)} ${x.secs>=tg?'✅':''}`:''}</p>${tg?bar(pct(x.secs,tg)):''}`}).join('')||'<p>এই দিনে কোনো পড়া রেকর্ড নেই।</p>'}</div>`}
function wBlock(w){return`<div class=card><h3>${w.ws} → ${w.we}${w.manual?' (ম্যানুয়াল সেভ)':''}</h3><p class=big>${hr(w.total)}</p>${bar(w.pct)}<p>লক্ষ্যের ${w.pct}% পূরণ</p></div>
 <div class=card><h3>বিষয়ভিত্তিক সময়</h3>${Object.values(w.bySub).map(s=>`<p>${esc(s.name)}: ${hr(s.secs)}</p>`).join('')||'<p>তথ্য নেই</p>'}</div>
 <div class=card><h3>দিনভিত্তিক সময়</h3>${Object.keys(w.byDay).map(d=>`<p>${BD[pd(d).getDay()]} ${d}: ${isOff(d)?'ছুটি':hr(w.byDay[d])}</p>`).join('')}</div>
 <div class=card><h3>✅ লক্ষ্য পূরণ হয়েছে</h3><p>${w.completed.map(esc).join(', ')||'এখনো কোনো বিষয় নয়'}</p></div>`}
function vWeekly(){const keys=Object.keys(D.archives).sort().reverse(),cur=wsOf(today()),w=wsel==='cur'?weekData(cur,true):D.archives[wsel]||weekData(cur,true);
 return`<div class=card><select onchange="A.wsel(this.value)"><option value=cur>চলতি সপ্তাহ</option>${keys.map(k=>`<option value="${k}" ${k==wsel?'selected':''}>${k} → ${D.archives[k].we}</option>`).join('')}</select>
 ${wsel==='cur'?`<div class=row><button class=p onclick="A.saveWeek()">💾 Save Week</button></div>`:''}</div>`+wBlock(w)}
function vMonthly(){const[y,m]=mon.split('-').map(Number),n=new Date(y,m,0).getDate();let tot=0,tg=0;const bs={},bw={};
 for(let i=1;i<=n;i++)tg+=dayTarget(mon+'-'+pad(i));
 const add=(d,sid,name,s)=>{if(d.slice(0,7)!==mon||isOff(d))return;tot+=s;(bs[sid]=bs[sid]||{name,secs:0}).secs+=s;const w=wsOf(d);bw[w]=(bw[w]||0)+s};
 D.sessions.forEach(x=>add(x.date,x.sid,x.name,x.secs));if(D.timer)add(D.timer.date,D.timer.sid,subName(D.timer.sid),elapsed()/1000);
 return`<div class=card><input type=month value="${mon}" onchange="A.setMon(this.value)"><p class=big>${hr(tot)}</p>${bar(pct(tot,tg))}<p>মাসিক লক্ষ্য ${hr(tg)} · পূরণ ${pct(tot,tg)}%</p></div>
 <div class=card><h3>বিষয়ভিত্তিক</h3>${Object.values(bs).map(s=>`<p>${esc(s.name)}: ${hr(s.secs)}</p>`).join('')||'<p>তথ্য নেই</p>'}</div>
 <div class=card><h3>সপ্তাহভিত্তিক তুলনা</h3>${Object.keys(bw).sort().map(w=>`<p>${w} থেকে: ${hr(bw[w])}</p>${bar(pct(bw[w],D.settings.weekly*3600))}`).join('')||'<p>তথ্য নেই</p>'}</div>`}
function vHist(){const l=D.sessions.slice().sort((a,b)=>b.id-a.id).slice(0,200);
 return l.map(x=>`<div class=card><b>${esc(x.name)}</b> — ${hms(x.secs)}<p class=sub>${x.date} · ${BD[pd(x.date).getDay()]}</p><button class=d onclick="A.delSess(${x.id})">মুছুন</button></div>`).join('')||'<div class=card>এখনো কোনো সেশন নেই। Stop করলে এখানে জমা হবে।</div>'}
function vSet(){const S=D.settings;
 return`<div class=card><h3>সাপ্তাহিক লক্ষ্য (ঘণ্টা)</h3><input type=number min=1 value="${S.weekly}" onchange="A.wk(this.value)"><h3 style="margin-top:12px">ছুটির দিন</h3><div class=days>${BD.map((n,i)=>`<label><input type=checkbox ${S.off.includes(i)?'checked':''} onchange="A.off(${i},this.checked)"> ${n}</label>`).join('')}</div></div>`+
 S.subjects.map(s=>`<div class=card><input value="${esc(s.name)}" onchange="A.sn(${s.id},this.value)"> <input type=number min=1 style="width:80px" value="${s.target}" onchange="A.st(${s.id},this.value)"> মিনিট<div class=days style="margin-top:8px">${BD.map((n,i)=>`<label><input type=checkbox ${s.days.includes(i)?'checked':''} onchange="A.sd(${s.id},${i},this.checked)"> ${n.slice(0,3)}</label>`).join('')}</div><button class=d onclick="A.del(${s.id})" style="margin-top:8px">বিষয় মুছুন</button></div>`).join('')+
 `<button class=p onclick="A.add()">➕ নতুন বিষয়</button>`}
function vBackup(){return`<div class=card><h3>ব্যাকআপ (JSON)</h3><p class=sub>ফাইল ডাউনলোড করে নিজে Google Drive-এ আপলোড করুন। স্বয়ংক্রিয় Drive Sync নেই।</p><div class=row><button class=p onclick="A.export()">⬇ Export / Download</button><label><button onclick="this.nextElementSibling.click()">⬆ Import</button><input type=file accept=".json,application/json" hidden onchange="A.import(this.files[0])"></label><button onclick="A.restore()" ${D.prev?'':'disabled'}>↩ Restore Previous Data</button></div></div>
 <div class=card><h3>নোটিফিকেশন</h3><button onclick="Notification.requestPermission().then(()=>alert('অনুমতি: '+Notification.permission))">অনুমতি দিন</button></div>
 <div class=card><h3>বিপজ্জনক</h3><button class=d onclick="A.resetAll()">সব ডাটা Reset</button></div>`}
const V={dashboard:vDash,timer:vTimer,daily:vDaily,weekly:vWeekly,monthly:vMonthly,history:vHist,settings:vSet,backup:vBackup};
const NAV=[['dashboard','🏠','ড্যাশবোর্ড'],['timer','⏱️','টাইমার'],['daily','📅','দৈনিক'],['weekly','📊','সাপ্তাহিক'],['monthly','🗓️','মাসিক'],['history','📜','ইতিহাস'],['settings','⚙️','রুটিন'],['backup','💾','ব্যাকআপ']];
const nav=()=>$('#nav').innerHTML=NAV.map(n=>`<a href="#${n[0]}" class="${n[0]==view?'on':''}">${n[1]}<small>${n[2]}</small></a>`).join('');
const render=()=>{$('#app').innerHTML=V[view]();document.documentElement.dataset.theme=D.settings.dark?'dark':''};
const route=()=>{view=location.hash.slice(1);if(!V[view])view='dashboard';nav();render()};

/* ---------- Actions ---------- */
const S_=()=>D.settings;
const A=window.A={
 async start(id){if(D.timer)return alert('আগে চলমান বিষয়টি Stop করুন।');unlock();
  try{if(window.Notification&&Notification.permission==='default')Notification.requestPermission()}catch(e){}
  D.timer={sid:id,date:today(),acc:0,since:Date.now()};await sv('timer');render()},
 async pause(){D.timer.acc=elapsed();D.timer.since=null;await sv('timer');render()},
 async resume(){unlock();D.timer.since=Date.now();await sv('timer');render()},
 async stop(){const t=D.timer,secs=Math.round(elapsed()/1000);if(secs>0)D.sessions.push({id:Date.now(),sid:t.sid,name:subName(t.sid),date:t.date,secs});
  D.timer=null;await sv('sessions');await sv('timer');render()},
 async reset(id){if(!confirm('Reset করলে এই বিষয়ের আজকের সময় মুছে যাবে। নিশ্চিত?'))return;
  if(D.timer&&D.timer.sid==id)D.timer=null;D.sessions=D.sessions.filter(x=>!(x.sid==id&&x.date===today()));
  delete D.alarmed[today()+'_'+id];await svAll();render()},
 stopAlarm(){clearInterval(ai);$('#alarm').hidden=true},
 theme(){D.settings.dark=!D.settings.dark;sv('settings');render()},
 setDate(v){if(v)repDate=v;render()},setMon(v){if(v)mon=v;render()},wsel(v){wsel=v;render()},
 async saveWeek(){await archive(wsOf(today()),true);alert('চলতি সপ্তাহ সেভ হয়েছে।');render()},
 async delSess(id){if(!confirm('এই সেশন মুছবেন?'))return;D.sessions=D.sessions.filter(x=>x.id!==id);await sv('sessions');render()},
 wk(v){D.settings.weekly=Math.max(1,+v||65);sv('settings')},
 off(i,c){const o=D.settings.off.filter(x=>x!==i);if(c)o.push(i);D.settings.off=o;sv('settings')},
 sn(id,v){const s=D.settings.subjects.find(x=>x.id==id);if(v.trim())s.name=v.trim();sv('settings')},
 st(id,v){D.settings.subjects.find(x=>x.id==id).target=Math.max(1,+v||1);sv('settings')},
 sd(id,i,c){const s=D.settings.subjects.find(x=>x.id==id);s.days=s.days.filter(x=>x!==i);if(c)s.days.push(i);sv('settings')},
 async add(){const n=prompt('নতুন বিষয়ের নাম:');if(!n||!n.trim())return;D.settings.subjects.push({id:D.settings.next++,name:n.trim(),target:60,days:[0,1,2,3,4]});await sv('settings');render()},
 async del(id){if(D.timer&&D.timer.sid==id)return alert('এই বিষয়ের টাইমার চলছে, আগে Stop করুন।');if(!confirm('বিষয় মুছবেন? (আগের রেকর্ড থাকবে)'))return;
  D.settings.subjects=D.settings.subjects.filter(x=>x.id!=id);await sv('settings');render()},
 export(){const o={v:1,at:new Date().toISOString()};KEYS.slice(0,5).forEach(k=>o[k]=D[k]);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(o)],{type:'application/json'}));a.download='study-backup-'+today()+'.json';a.click()},
 async import(f){if(!f)return;let o;try{o=JSON.parse(await f.text())}catch(e){return alert('ফাইলটি ঠিক নয়।')}
  if(!o.settings||!Array.isArray(o.settings.subjects)||!Array.isArray(o.sessions))return alert('এটি বৈধ ব্যাকআপ ফাইল নয়।');
  if(!confirm('বর্তমান ডাটা প্রতিস্থাপিত হবে। (আগের ডাটা Restore Previous-এর জন্য রাখা হবে) এগিয়ে যাবেন?'))return;
  D.prev=JSON.parse(JSON.stringify(KEYS.slice(0,5).reduce((a,k)=>(a[k]=D[k],a),{})));
  KEYS.slice(0,5).forEach(k=>{if(o[k]!==undefined)D[k]=o[k]});D.archives=D.archives||{};D.alarmed=D.alarmed||{};
  await svAll();await autoArchive();alert('Import সম্পন্ন।');render()},
 async restore(){if(!D.prev||!confirm('আগের ডাটা ফিরিয়ে আনবেন?'))return;const p=D.prev;D.prev=null;KEYS.slice(0,5).forEach(k=>D[k]=p[k]);await svAll();render()},
 async resetAll(){if(!confirm('সব ডাটা মুছে যাবে!'))return;if(!confirm('শেষবার নিশ্চিত করুন। আগে Export করে রাখা ভালো।'))return;
  D.settings=DEF();D.sessions=[];D.archives={};D.timer=null;D.alarmed={};D.prev=null;await svAll();render()}
};

/* ---------- Init ---------- */
(async()=>{
 try{db=await open()}catch(e){document.body.innerHTML='<p style="padding:20px">IndexedDB চালু নেই — প্রাইভেট মোড বন্ধ করুন।</p>';return}
 for(const k of KEYS)D[k]=await dbget(k);
 D.settings=D.settings||DEF();D.sessions=D.sessions||[];D.archives=D.archives||{};D.alarmed=D.alarmed||{};D.prev=D.prev||null;
 await svAll();
 try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
 await autoArchive();route();window.onhashchange=route;
 document.addEventListener('click',unlock,{once:true});
 let n=0;setInterval(()=>{n++;checkAlarm();if(D.timer&&(view==='dashboard'||view==='timer'))render();if(n%60==0)autoArchive()},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){autoArchive();checkAlarm();if(view==='dashboard'||view==='timer')render()}});
 if('serviceWorker'in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});
})();
