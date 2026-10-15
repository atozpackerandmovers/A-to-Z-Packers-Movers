import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import {getAuth,setPersistence,inMemoryPersistence,signInWithEmailAndPassword,signOut,getIdToken,reload} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
// Existing public Firebase web configuration. No new credential or permission.
const firebaseConfig={apiKey:'AIzaSyC4I13JSUkhun5DgpgLlnyiimTzdPobT14',authDomain:'az-packers-quotation.firebaseapp.com',projectId:'az-packers-quotation',appId:'1:682004383688:web:b795a19579dba9a612a2fd'};
const auth=getAuth(initializeApp(firebaseConfig,'owner-fault-score'));
const el=id=>document.getElementById(id),names={INDOOR_STAFF_ZD9A1Z:'Sanju',INDOOR_STAFF_10HIAWK:'Ranjit',INDOOR_STAFF_1MJSC46:'Swagatika',INDOOR_STAFF_9JJREB:'Srinivas'};
let controller,busy=false;
function clear(){el('cards').replaceChildren();el('audit').replaceChildren();el('audit-note').textContent='';el('readiness').textContent='';el('readiness-section').hidden=true;}
function status(message){el('status').textContent=message;}
function sync(){const signed=!!auth.currentUser;el('login-section').hidden=signed;el('dashboard').hidden=!signed;for(const b of document.querySelectorAll('button'))b.disabled=busy||!controller;}
async function action(fn){if(busy)return;busy=true;sync();try{await fn();}catch{clear();status('Unable to complete this request. Check the service or sign in again. No scores were changed.');}finally{el('password').value='';busy=false;sync();}}
function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
async function refresh(){
 clear();const [scores,audit]=await Promise.all([controller.scores(),controller.audit()]);
 if(!Array.isArray(scores.staff)||scores.staff.length!==4||new Set(scores.staff.map(s=>s.staffId)).size!==4||scores.staff.some(s=>!names[s.staffId]||!Number.isInteger(s.score)||s.score<0||s.score>100)||!Array.isArray(audit.entries)||audit.entries.length>100)throw Error('Invalid data');
 for(const row of scores.staff){const card=text('div','');card.className='card';card.append(text('strong',names[row.staffId]));const score=text('div',String(row.score));score.className='score';score.append(text('small',' / 100'));card.append(score);el('cards').append(card);}
 el('audit-note').textContent=audit.hasMore?'Showing the latest 100 records. Earlier records remain stored.':audit.entries.length?'Newest records first.':'No Fault records to show.';
 for(const row of audit.entries){const li=document.createElement('li');li.append(text('strong',(names[row.staffId||row.dmStaffId]||'Staff record')+' � '+(row.action==='deduct'?'-2 points':row.action==='pending'?'Held for review':String(row.action||'Record'))));li.append(text('p',typeof row.reason==='string'&&row.reason?row.reason:'No additional text.'));try{const url=new URL(row.link);if(url.origin==='https://atozpackersandmovers.slack.com'&&/^\/archives\/D[A-Z0-9]+\/p\d+$/.test(url.pathname)){const link=text('a','Open original Slack message');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';li.append(link);}}catch{}el('audit').append(li);}
 status('Balances and recent records refreshed.');
}
try{await setPersistence(auth,inMemoryPersistence);controller=AZPOwnerScore.createOwnerScore({auth,apiBase:window.AZP_SCORE_CONFIG?.apiBase,signIn:signInWithEmailAndPassword,signOut,getIdToken,reload});status('Sign in with your verified owner account.');}catch{status('The score service has not been connected yet. Sign-in is disabled.');}
el('login').addEventListener('submit',event=>{event.preventDefault();action(async()=>{try{await controller.login(el('password').value);}finally{el('password').value='';}await refresh();});});
el('refresh').addEventListener('click',()=>action(refresh));
el('check').addEventListener('click',()=>action(async()=>{const r=await controller.readiness(),summary=AZPOwnerScore.readinessSummary(r);el('readiness-section').hidden=false;el('readiness').replaceChildren(...summary.lines.map(line=>text('p',line)));status(summary.ready?'Service checks passed.':'Some service checks need attention. No scores were changed.');}));
el('logout').addEventListener('click',()=>action(async()=>{await controller.logout();clear();status('Signed out.');}));
sync();
