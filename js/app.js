/* Textbook Buddy - all the code in one file.
   Part 1 is shared by every page; parts 2-4 only run on their own page. */

/* ===== PART 1: shared (Firebase, saving, helpers) ===== */
/* Textbook Buddy - shared helpers + Firebase (Firestore) data layer, used by every page */

/* Your Firebase web config (safe to be public; the database rules protect the data) */
const FIREBASE_CONFIG={
  apiKey:"AIzaSyAfGxuGucjKUJrttA3b_OshZRAMywCSlYo",
  authDomain:"spbt-systems.firebaseapp.com",
  projectId:"spbt-systems",
  storageBucket:"spbt-systems.firebasestorage.app",
  messagingSenderId:"423891222884",
  appId:"1:423891222884:web:ee66fda15ad9ccec25fa71"
};

const $=s=>document.querySelector(s);
let S={classes:{},order:[],reg:{}};   // S.classes[name]={students,books}; S.reg[class][student][r|t]={b,d,g,by}
const L=(...x)=>x;
const ENG='Bahasa Inggeris',PJ='Pend. Jasmani & Kesihatan';
const STD={
 1:L('Bahasa Melayu','Matematik 1','Matematik 2','Sains','Pendidikan Islam','Pendidikan Moral',PJ,'Pendidikan Kesenian','Bahasa Arab',ENG,"Iqra' 1","Iqra' 2"),
 2:L('Bahasa Melayu Jilid 1','Bahasa Melayu Jilid 2','Matematik Jilid 1','Matematik Jilid 2','Sains','Pendidikan Islam','Pendidikan Moral',PJ,'Pendidikan Kesenian','Bahasa Arab',ENG),
 4:L('Bahasa Melayu','Matematik','Sains','Sejarah','Pendidikan Islam','Pendidikan Moral',PJ,'Pendidikan Kesenian','Reka Bentuk & Teknologi','Bahasa Arab',ENG),
 5:L('Bahasa Melayu','Matematik','Sains','Sejarah','Pendidikan Islam','Pendidikan Moral',PJ,'Pendidikan Muzik','Reka Bentuk & Teknologi','Bahasa Arab',ENG)
};
STD[3]=STD[2];STD[6]=STD[5];

const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const fmt=d=>d?d.split('-').reverse().join('/'):'';
const lines=t=>t.split('\n').map(x=>x.trim()).filter(Boolean);
const SYM={ok:'✓',miss:'✗',dmg:'🩹'},WORD={ok:'Present',miss:'Missing',dmg:'Damaged'},PH={r:'Receive',t:'Return'};
function toast(t){const m=$('#msg');m.textContent=t;m.classList.add('show');setTimeout(()=>m.classList.remove('show'),2200)}
const get=(c,st,p)=>(((S.reg[c]||{})[st]||{})[p])||{b:{},d:'',g:'',by:''};
function rec(c,st,p){const R=S.reg[c]||(S.reg[c]={});const s=R[st]||(R[st]={});return s[p]||(s[p]={b:{},d:'',g:'',by:''})}
const who=()=>{try{return localStorage.getItem('spbt-who')||''}catch(e){return ''}};
const setWho=v=>{try{localStorage.setItem('spbt-who',v)}catch(e){}};

/* Save a file: normal browser download (also works inside Claude's preview) */
async function saveFile(filename,blob){
 try{
  if(window.claude&&claude.use){const d=await claude.use('downloads');if(d){await d.save({filename,data:blob});return}}
 }catch(e){if(e&&e.code==='declined')return}
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

/* ---------- Firestore ---------- */
let DB=null,CODE='';
const school=()=>DB.collection('schools').doc(CODE);
const cid=n=>String(n).replace(/\//g,'-');
const rid=(c,st,p)=>encodeURIComponent(c+'|'+st+'|'+p);
function initFirebase(){
 if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
 DB=firebase.firestore();
 try{DB.enablePersistence({synchronizeTabs:true}).catch(()=>{})}catch(e){}
}
async function loadSetup(){
 const snap=await school().collection('classes').get(),arr=[];
 snap.forEach(d=>{const x=d.data();arr.push({n:x.name||d.id,o:x.ord==null?999:x.ord,s:x.students||[],b:x.books||[]})});
 arr.sort((a,b)=>a.o-b.o||a.n.localeCompare(b.n,undefined,{numeric:true}));
 S.classes={};S.order=arr.map(x=>x.n);arr.forEach(x=>S.classes[x.n]={students:x.s,books:x.b});
 return arr.length;
}
async function saveClass(n){
 const C=S.classes[n],i=S.order.indexOf(n);
 await school().collection('classes').doc(cid(n)).set({name:n,students:C.students,books:C.books,ord:i<0?S.order.length:i});
}
async function removeClass(n){await school().collection('classes').doc(cid(n)).delete()}
function buildRecs(snap){
 const R={};
 snap.forEach(d=>{const x=d.data(),b={};(x.bl||[]).forEach(e=>{b[e.k]={s:e.s||'',n:e.n||''}});
  (R[x.student]=R[x.student]||{})[x.p]={b,d:x.d||'',g:x.g||'',by:x.by||''}});
 return R;
}
async function loadRecs(c){const snap=await school().collection('records').where('cls','==',c).get();S.reg[c]=buildRecs(snap)}
function watchRecs(c,cb){
 return school().collection('records').where('cls','==',c).onSnapshot(snap=>{S.reg[c]=buildRecs(snap);cb()},()=>setSync('⚠️ live updates lost','bad'));
}

/* queued saving of one student's receive/return record */
const Q=new Map();let pend=0,qTimer=null;
function setSync(t,cls){const e=$('#sync');if(e){e.textContent=t;e.className='sync '+(cls||'')}}
function syncIdle(){if(!pend&&!Q.size)setSync(navigator.onLine===false?'📴 offline':'☁️ saved ✓','ok')}
function qs(c,st,p){
 Q.set(rid(c,st,p),{c,st,p});setSync(navigator.onLine===false?'📴 offline – will save when online':'⏳ saving…','');
 clearTimeout(qTimer);qTimer=setTimeout(flushQ,700);
}
async function flushQ(){
 clearTimeout(qTimer);const items=[...Q.values()];Q.clear();
 items.forEach(i=>{
  const d=get(i.c,i.st,i.p);
  const bl=Object.keys(d.b).filter(k=>d.b[k]&&(d.b[k].s||d.b[k].n)).map(k=>({k,s:d.b[k].s||'',n:d.b[k].n||''}));
  d.by=who();pend++;
  school().collection('records').doc(rid(i.c,i.st,i.p)).set({cls:i.c,student:i.st,p:i.p,d:d.d||'',bl,g:d.g||'',by:who(),at:firebase.firestore.FieldValue.serverTimestamp()})
   .then(()=>{pend--;syncIdle()})
   .catch(e=>{pend--;Q.set(rid(i.c,i.st,i.p),i);setSync('⚠️ not saved – tap to retry','bad')});
 });
}
async function settle(){await flushQ();try{await Promise.race([DB.waitForPendingWrites(),new Promise(r=>setTimeout(r,4000))])}catch(e){}}

/* ---------- built-in data name (teachers never see or type this) ---------- */
/* All the school's data is saved under this name inside the database.
   Change it only if you ever want a brand-new, empty register. */
const SCHOOL_CODE='spbt-zg49ee6he6yq58u4fb';
function gate(html){let g=$('#gate');if(!g){g=document.createElement('div');g.id='gate';document.body.appendChild(g)}g.innerHTML='<div class="card gate">'+html+'</div>';g.hidden=false}
async function seed(){
 const b=DB.batch();let o=0;S.classes={};S.order=[];
 for(let y=1;y<=6;y++)['Usaha','Maju'].forEach(k=>{const n=y+' '+k;S.classes[n]={students:[],books:[...STD[y]]};S.order.push(n);
  b.set(school().collection('classes').doc(cid(n)),{name:n,students:[],books:[...STD[y]],ord:o++})});
 await b.commit();
}
async function acquire(){
 CODE=SCHOOL_CODE;
 for(;;){
  try{
   if(await loadSetup()===0)await seed();   // first ever open: create the 12 classes automatically
   const g=$('#gate');if(g)g.hidden=true;return;
  }catch(e){
   await new Promise(r=>{gate(`<h2>Could not connect 😢</h2><p>${esc(e.code||e.message||e)}</p><p class="hint">Check the internet and try again. If it keeps happening, tell whoever set up the website.</p><button class="btn big" id="gRetry">Try again</button>`);$('#gRetry').onclick=()=>r()});
  }
 }
}

/* ---------- start-up ---------- */
const readyFns=[];const onReady=f=>readyFns.push(f);
async function boot(){
 const s=document.createElement('div');s.id='sync';s.className='sync';s.textContent='☁️ connecting…';s.onclick=()=>{if(Q.size||s.classList.contains('bad'))flushQ()};document.body.appendChild(s);
 addEventListener('offline',()=>setSync('📴 offline – saved on this device','bad'));
 addEventListener('online',()=>{setSync('⏳ reconnecting…','');setTimeout(syncIdle,2500)});
 addEventListener('beforeunload',e=>{if(Q.size){e.preventDefault();e.returnValue=''}});
 if(typeof firebase==='undefined'){gate('<h2>Could not load 😢</h2><p>The database tools did not load. Check the internet and reload.</p>');return}
 try{initFirebase()}catch(e){gate('<h2>Setup problem</h2><p>'+esc(e.message)+'</p>');return}
 await acquire();syncIdle();
 readyFns.forEach(f=>f());
}
setTimeout(boot,0);


/* ===== PART 2: Check books page ===== */
if($('#check')){
/* Check books page: receive/return ticks, notes, signatures */
/* CHECK */
let cur=null;
function drawPick(){
 $('#form').hidden=true;$('#pick').hidden=false;cur=null;
 const n=Object.keys(S.classes);
 $('#pick').innerHTML=n.length?'<h2>Which class are you checking? 🏫</h2><div class="chips">'+n.map(c=>`<button class="chip" data-c="${esc(c)}">${esc(c)}<small>${S.classes[c].students.length?S.classes[c].students.length+' students':'add names'}</small></button>`).join('')+'</div>'
 :'<div class="empty">No classes yet.<br><br><button class="btn" id="goSetup">Set up your first class</button></div>';
}
$('#pick').onclick=async e=>{
 const b=e.target.closest('[data-c]');if(b){cur={cls:b.dataset.c,p:'r'};$('#pick').hidden=true;$('#form').hidden=false;$('#fTitle').textContent='📖 '+cur.cls;$('#stu').innerHTML='<div class="empty">Loading… 🐻</div>';
  try{await loadRecs(cur.cls)}catch(err){toast('Could not load 😢 check internet')}
  drawCheck();scrollTo({top:0})}
 if(e.target.id==='goSetup')location.href='setup.html';
};
$('#fBack').onclick=drawPick;
$('#mode').onclick=e=>{const b=e.target.closest('button');if(b){cur.p=b.dataset.p;drawCheck()}};
function drawCheck(){
 const C=S.classes[cur.cls];
 $('#fTitle').textContent='📖 '+cur.cls;
 if(!C.students.length){$('#stu').innerHTML='<div class="empty">No student names in this class yet 🌷<br><br><button class="btn" id="addNames">Add student names</button></div>';return}
 document.querySelectorAll('#mode button').forEach(b=>b.classList.toggle('on',b.dataset.p===cur.p));
 $('#stu').innerHTML=C.students.map((s,i)=>{
  const d=get(cur.cls,s,cur.p);
  return `<details class="stu" data-st="${esc(s)}"><summary><span>${i+1}. ${esc(s)}</span><span class="cnt"></span></summary>`+
  C.books.map(b=>{const it=d.b[b]||{s:'',n:''};
   return `<div class="bk${it.s==='miss'||it.s==='dmg'?' has':''}" data-bk="${esc(b)}"><span>${esc(b)}</span><div class="seg">${['ok','miss','dmg'].map(v=>`<button data-v="${v}" class="${v}${it.s===v?' on':''}">${SYM[v]}</button>`).join('')}</div><input class="note" placeholder="Note (e.g. cover torn, lost page 20)" value="${esc(it.n)}"></div>`}).join('')+
  `<div class="ds"><b>Date</b><input type="date" class="dt" value="${esc(d.d)}"><button class="btn lav sm" data-sign>✍️ Sign</button><span class="sg">${d.g?`<img class="thumb" src="${d.g}" alt="signature">`:''}</span></div></details>`}).join('');
 document.querySelectorAll('details.stu').forEach(cnt);
}
function cnt(el){
 const st=el.dataset.st,d=get(cur.cls,st,cur.p),n=S.classes[cur.cls].books.length;
 const k=S.classes[cur.cls].books.filter(b=>d.b[b]&&d.b[b].s).length;
 const c=el.querySelector('.cnt');c.textContent=k+'/'+n+(d.g?' ✍️':'');c.classList.toggle('done',k===n&&!!d.g);
}
function stamp(d,el){if(!d.d){d.d=today();el.querySelector('.dt').value=d.d}}
function mark(el,row,v){
 const d=rec(cur.cls,el.dataset.st,cur.p),bk=row.dataset.bk,it=d.b[bk]||(d.b[bk]={s:'',n:''});
 it.s=it.s===v?'':v;if(!it.s&&!it.n)delete d.b[bk];
 stamp(d,el);qs(cur.cls,el.dataset.st,cur.p);
 row.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.v===it.s));
 row.classList.toggle('has',it.s==='miss'||it.s==='dmg');cnt(el);
}
$('#stu').onclick=e=>{
 if(e.target.id==='addNames'){location.href='setup.html?edit='+encodeURIComponent(cur.cls);return}
 const el=e.target.closest('details.stu');if(!el)return;
 const b=e.target.closest('.seg button');
 if(b)mark(el,b.closest('.bk'),b.dataset.v);
 if(e.target.closest('[data-sign]'))openSign(el);
};
$('#stu').oninput=e=>{
 const el=e.target.closest('details.stu');if(!el)return;
 const d=rec(cur.cls,el.dataset.st,cur.p);
 if(e.target.classList.contains('note')){
  const bk=e.target.closest('.bk').dataset.bk,it=d.b[bk]||(d.b[bk]={s:'',n:''});
  it.n=e.target.value;if(!it.s&&!it.n)delete d.b[bk];qs(cur.cls,el.dataset.st,cur.p);
 }
 if(e.target.classList.contains('dt')){d.d=e.target.value;qs(cur.cls,el.dataset.st,cur.p)}
};
$('#allOk').onclick=()=>{
 const C=S.classes[cur.cls];
 C.students.forEach(s=>{const d=rec(cur.cls,s,cur.p);C.books.forEach(b=>{if(!d.b[b]||!d.b[b].s){const it=d.b[b]||(d.b[b]={s:'',n:''});it.s='ok'}});if(!d.d)d.d=today()});
 C.students.forEach(s=>qs(cur.cls,s,cur.p));drawCheck();toast('Done — now change the exceptions ✗ 🩹');
};

/* SIGNATURE */
const cv=$('#sig'),cx=cv.getContext('2d');let drawing=false,dirty=false,target=null;
function fit(){const r=cv.getBoundingClientRect(),s=window.devicePixelRatio||1;cv.width=Math.max(1,r.width*s);cv.height=Math.max(1,r.height*s);cx.setTransform(s,0,0,s,0,0);cx.lineWidth=2.5;cx.lineCap='round';cx.strokeStyle='#222';dirty=false}
function pos(e){const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]}
cv.onpointerdown=e=>{drawing=true;dirty=true;cv.setPointerCapture(e.pointerId);const[x,y]=pos(e);cx.beginPath();cx.moveTo(x,y);cx.lineTo(x+.1,y+.1);cx.stroke()};
cv.onpointermove=e=>{if(!drawing)return;const[x,y]=pos(e);cx.lineTo(x,y);cx.stroke()};
cv.onpointerup=cv.onpointercancel=()=>{drawing=false};
function sigData(){const o=document.createElement('canvas');o.width=320;o.height=Math.max(1,Math.round(320*cv.height/cv.width));o.getContext('2d').drawImage(cv,0,0,o.width,o.height);return o.toDataURL('image/png')}
function openSign(el){target=el;$('#mName').textContent='✍️ '+el.dataset.st+' · '+PH[cur.p];$('#modal').hidden=false;fit()}
$('#mClr').onclick=fit;
$('#mCancel').onclick=()=>{$('#modal').hidden=true};
$('#mSave').onclick=()=>{
 if(!dirty){toast('Please sign first ✍️');return}
 const d=rec(cur.cls,target.dataset.st,cur.p);
 d.g=sigData();stamp(d,target);qs(cur.cls,target.dataset.st,cur.p);
 target.querySelector('.sg').innerHTML=`<img class="thumb" src="${d.g}" alt="signature">`;
 cnt(target);$('#modal').hidden=true;toast('Signed ✓');
};

$('#fWho').value=who();$('#fWho').oninput=e=>setWho(e.target.value);
$('#fRefresh').onclick=async()=>{await settle();try{await loadRecs(cur.cls);drawCheck();toast('Refreshed ✓')}catch(e){toast('Could not refresh 😢')}};
onReady(drawPick);
}


/* ===== PART 3: Register page ===== */
if($('#reg')){
/* Register page: table view, print, Excel export with signatures */
/* REGISTER */
function renderReg(){
 const n=Object.keys(S.classes),sel=$('#regC'),old=sel.value;
 sel.innerHTML=n.map(c=>`<option>${esc(c)}</option>`).join('');
 if(n.includes(old))sel.value=old;
 if(!n.length){$('#regBox').innerHTML='<div class="empty">No classes yet 🌷</div>';return}
 const c=sel.value,C=S.classes[c],nb=C.books.length,notes=[];
 const part=(st,p)=>{
  const d=get(c,st,p);
  const cells=C.books.map(b=>{const it=d.b[b]||{};if(it.n)notes.push(`${st} — ${b} (${PH[p]}): ${it.n}`);return `<td>${it.s?SYM[it.s]:''}</td>`}).join('');
  return cells+`<td>${fmt(d.d)}</td><td>${d.g?`<img src="${d.g}" alt="sign">`:''}</td>`;
 };
 const bh=C.books.map(b=>`<th>${esc(b)}</th>`).join('');
 $('#regBox').innerHTML=`<div class="printonly"><h2 style="margin:0">SPBT Textbook Register — ${esc(c)}</h2><small>Printed ${fmt(today())} · ✓ present · ✗ missing · 🩹 damaged</small></div>
 <div class="tbl"><table class="reg"><thead>
 <tr><th rowspan="2">NAME</th><th colspan="${nb}">RECEIVE</th><th rowspan="2">DATE</th><th rowspan="2">SIGN</th><th colspan="${nb}">RETURN</th><th rowspan="2">DATE</th><th rowspan="2">SIGN</th><th rowspan="2">ENTERED BY</th></tr>
 <tr>${bh}${bh}</tr></thead><tbody>${C.students.map((s,i)=>`<tr><td class="n">${i+1}. ${esc(s)}</td>${part(s,'r')}${part(s,'t')}<td>${esc([...new Set([get(c,s,'r').by,get(c,s,'t').by].filter(Boolean))].join(', '))}</td></tr>`).join('')}</tbody></table></div>
 ${notes.length?`<h2 style="font-size:16px;margin-top:14px">Notes</h2><ul style="margin:0;padding-left:20px;font-size:14px">${notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`;
}
let unsub=null,watching='';
function drawReg(){
 renderReg();
 const c=$('#regC').value;if(!c||c===watching)return;
 if(unsub)unsub();watching=c;unsub=watchRecs(c,renderReg);
}
$('#regC').onchange=drawReg;
$('#rPrint').onclick=()=>{try{window.print()}catch(e){toast('Printing is not available here')}};
$('#rCsv').onclick=async()=>{
 const c=$('#regC').value;if(!c)return;
 if(typeof ExcelJS==='undefined'){toast('Excel tool could not load. Check internet and reload');return}
 const C=S.classes[c],nb=C.books.length,wb=new ExcelJS.Workbook(),ws=wb.addWorksheet(c.replace(/[\\\/?*\[\]:]/g,'').slice(0,30)||'Class');
 const dR=2+nb,sR=3+nb,t0=4+nb,dT=4+2*nb,sT=5+2*nb,nC=6+2*nb;
 const bd={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
 const mid={vertical:'middle',horizontal:'center',wrapText:true};
 ws.getCell(1,1).value='NAME';ws.getCell(1,2).value='RECEIVE';ws.getCell(1,dR).value='DATE';ws.getCell(1,sR).value='SIGN';
 ws.getCell(1,t0).value='RETURN';ws.getCell(1,dT).value='DATE';ws.getCell(1,sT).value='SIGN';ws.getCell(1,nC).value='NOTES';
 C.books.forEach((b,i)=>{ws.getCell(2,2+i).value=b;ws.getCell(2,t0+i).value=b});
 if(nb>1){ws.mergeCells(1,2,1,1+nb);ws.mergeCells(1,t0,1,t0+nb-1)}
 [1,dR,sR,dT,sT,nC].forEach(k=>ws.mergeCells(1,k,2,k));
 for(let r=1;r<=2;r++)for(let k=1;k<=nC;k++){const x=ws.getCell(r,k);x.font={bold:true,color:{argb:'FF4D3D5C'}};x.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD0C4F7'}};x.alignment=mid;x.border=bd}
 ws.getRow(2).height=48;
 const note=(d,p,st)=>C.books.filter(b=>d.b[b]&&d.b[b].n).map(b=>b+' ('+p+'): '+d.b[b].n);
 C.students.forEach((st,i)=>{
  const r=3+i,row=ws.getRow(r);row.height=44;
  ws.getCell(r,1).value=(i+1)+'. '+st;const notes=[];
  [['r',2,dR,sR,'Receive'],['t',t0,dT,sT,'Return']].forEach(([p,c0,cd,cs,lab])=>{
   const d=get(c,st,p);
   C.books.forEach((b,j)=>{const it=d.b[b]||{};ws.getCell(r,c0+j).value=it.s?({ok:'✓',miss:'✗',dmg:'Damaged'})[it.s]:''});
   if(d.d){const x=ws.getCell(r,cd);x.value=new Date(d.d+'T00:00:00');x.numFmt='dd/mm/yyyy'}
   if(d.g){const id=wb.addImage({base64:d.g.split(',')[1],extension:'png'});ws.addImage(id,{tl:{col:cs-1+0.08,row:r-1+0.1},ext:{width:120,height:38}})}
   notes.push(...note(d,lab));
  });
  ws.getCell(r,nC).value=notes.join('; ');
  for(let k=1;k<=nC;k++){const x=ws.getCell(r,k);x.border=bd;x.alignment=k===1||k===nC?{vertical:'middle',wrapText:true}:mid}
 });
 ws.getColumn(1).width=30;
 for(let k=2;k<=nC;k++)ws.getColumn(k).width=(k===dR||k===dT)?14:(k===sR||k===sT)?20:(k===nC)?45:14;
 ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
 try{
  const buf=await wb.xlsx.writeBuffer();
  await saveFile('SPBT-'+c.replace(/\s+/g,'-')+'-'+today()+'.xlsx',new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 }catch(e){if(!e||e.code!=='declined')toast('Could not export')}
};
onReady(drawReg);
}


/* ===== PART 4: Setup page ===== */
if($('#setup')){
/* Setup page: add/edit classes and import from Excel/CSV */
/* SETUP */
function drawSetup(){
 const n=Object.keys(S.classes);
 {const sel=$('#impCls'),v=sel.value;sel.innerHTML='<option value="">(use the file\'s sheet name)</option>'+n.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');sel.value=n.includes(v)?v:''}
 $('#sList').innerHTML=n.length?n.map(c=>`<div class="item"><b>${esc(c)}</b><small>${S.classes[c].students.length} students · ${S.classes[c].books.length} books</small>
 <div class="acts"><button class="btn lav sm" data-e="${esc(c)}">Edit</button><button class="btn red sm" data-x="${esc(c)}">Delete</button></div></div>`).join(''):'<div class="empty">No classes yet. Add your first one above 🌷</div>';
}
$('#sGo').onclick=async()=>{
 const name=$('#sName').value.trim(),students=lines($('#sStu').value),books=lines($('#sBk').value);
 if(!name||!books.length){toast('Fill class name and books 🌸');return}
 S.classes[name]={students,books};if(!S.order.includes(name))S.order.push(name);
 try{await saveClass(name)}catch(e){toast('Could not save 😢 check internet');return}
 $('#sName').value=$('#sStu').value=$('#sBk').value='';
 toast('Class saved! 🎉');drawSetup();
};
$('#sList').onclick=async e=>{
 const ed=e.target.dataset.e,dx=e.target.dataset.x;
 if(ed)editClass(ed);
 if(dx&&confirm('Delete class '+dx+'? (Its saved ticks stay in the database.)')){try{await removeClass(dx);delete S.classes[dx];S.order=S.order.filter(x=>x!==dx);drawSetup();toast('Deleted')}catch(err){toast('Could not delete 😢')}}
};

/* IMPORT */
const norm=x=>String(x==null?'':x).trim().replace(/\s+/g,' ').toLowerCase();
const GENERIC=/^(students?|murid|nama|names?|books?|buku|textbooks?|sheet\d*|senarai|template|list)$/i;
function findClass(n){return Object.keys(S.classes).find(c=>norm(c)===norm(n))||null}
function ensureClass(n){let k=findClass(n);if(!k){const nm=String(n).trim().replace(/\s+/g,' '),y=parseInt(nm);S.classes[nm]={students:[],books:[...(STD[y]||[])]};S.order.push(nm);k=nm}return k}
function classesFor(v){
 const t=String(v||'').trim(),m=t.match(/^(?:tahun|year|t)?\s*([1-6])$/i);
 if(m)return Object.keys(S.classes).filter(c=>c.trim().startsWith(m[1]+' '));
 return[ensureClass(t)];
}
const uniqList=a=>[...new Set(a.map(x=>String(x).trim()).filter(Boolean))];
async function doImport(file){
 if(typeof XLSX==='undefined'){toast('Import tool could not load. Check internet and reload');return}
 let wb;
 try{
  wb=/\.csv$/i.test(file.name)?XLSX.read(await file.text(),{type:'string'}):XLSX.read(await file.arrayBuffer(),{type:'array'});
 }catch(e){toast('Could not read that file 😢');return}
 const forced=$('#impCls').value,stu={},bks={};
 const push=(o,k,v)=>{v=String(v==null?'':v).trim();if(k&&v)(o[k]=o[k]||[]).push(v)};
 wb.SheetNames.forEach(sn=>{
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:''}).filter(r=>r.some(x=>String(x).trim()));
  if(!rows.length)return;
  const h=rows[0].map(norm);
  const ci=h.findIndex(x=>/^(class|kelas)/.test(x)),ni=h.findIndex(x=>/^(name|nama|murid|student|pelajar)/.test(x)),bi=h.findIndex(x=>/^(book|buku|textbook|tajuk|title|subject|subjek|mata pelajaran)/.test(x));
  const fallback=forced||(GENERIC.test(sn.trim())?'':sn.trim());
  if(ni>-1||bi>-1){
   rows.slice(1).forEach(r=>{
    const cv=(ci>-1&&String(r[ci]).trim())||fallback;
    if(ni>-1)push(stu,cv,r[ni]);
    if(bi>-1)push(bks,cv,r[bi]);
   });
  }else if(fallback){
   rows.forEach(r=>push(stu,fallback,r[0]));
  }
 });
 let nS=0,nB=0;const touched=new Set();
 Object.keys(stu).forEach(raw=>{const k=ensureClass(raw),l=uniqList(stu[raw]);S.classes[k].students=l;nS+=l.length;touched.add(k)});
 Object.keys(bks).sort((a,b)=>(/^(?:tahun|year|t)?\s*[1-6]$/i.test(b.trim())?1:0)-(/^(?:tahun|year|t)?\s*[1-6]$/i.test(a.trim())?1:0)).forEach(raw=>{
  const l=uniqList(bks[raw]);classesFor(raw).forEach(k=>{S.classes[k].books=[...l];touched.add(k)});nB+=l.length;
 });
 if(!touched.size){$('#impMsg').textContent='⚠️ Nothing found. Check that the first row has the headings CLASS, NAME and/or BOOK.';toast('Nothing imported');return}
 try{await Promise.all([...touched].map(saveClass))}catch(e){toast('Could not save 😢 check internet');return}
 drawSetup();
 $('#impMsg').innerHTML='✅ Imported into <b>'+touched.size+'</b> class(es): '+[...touched].map(esc).join(', ')+'.<br>Student names read: <b>'+nS+'</b> · Book titles read: <b>'+nB+'</b>';
 toast('Import done 🎉');
}
$('#impFile').onchange=async e=>{const f=e.target.files[0];if(f)await doImport(f);e.target.value=''};
$('#impTpl').onclick=async()=>{
 if(typeof XLSX==='undefined'){toast('Tool could not load. Check internet and reload');return}
 const st=[['CLASS','NAME']],bk=[['CLASS','BOOK']];
 Object.keys(S.classes).forEach(c=>{S.classes[c].students.forEach(n=>st.push([c,n]));S.classes[c].books.forEach(b=>bk.push([c,b]))});
 if(st.length===1)st.push(['1 Usaha','Example Student Name']);
 const wb=XLSX.utils.book_new();
 [['Students',st],['Books',bk]].forEach(([n,a])=>{const ws=XLSX.utils.aoa_to_sheet(a);ws['!cols']=[{wch:16},{wch:44}];XLSX.utils.book_append_sheet(wb,ws,n)});
 try{
  const buf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  await saveFile('SPBT-import-template.xlsx',new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 }catch(e){if(!e||e.code!=='declined')toast('Could not download')}
};
function editClass(ed){const c=S.classes[ed];$('#sName').value=ed;$('#sStu').value=c.students.join('\n');$('#sBk').value=c.books.join('\n');scrollTo({top:0,behavior:'smooth'})}
onReady(()=>{drawSetup();const q=new URLSearchParams(location.search).get('edit');if(q&&S.classes[q])editClass(q)});
}
