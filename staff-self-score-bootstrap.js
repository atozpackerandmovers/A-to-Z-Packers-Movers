import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import {getAuth,setPersistence,inMemoryPersistence,signInWithEmailAndPassword,signOut,getIdToken,reload,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
const firebaseConfig={apiKey:'AIzaSyC4I13JSUkhun5DgpgLlnyiimTzdPobT14',authDomain:'az-packers-quotation.firebaseapp.com',projectId:'az-packers-quotation',appId:'1:682004383688:web:b795a19579dba9a612a2fd'};
// Separate from the legacy anonymous staff dashboard and the owner's session.
const auth=getAuth(initializeApp(firebaseConfig,'staff-self-score'));
const el=id=>document.getElementById(id),text=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
let controller,busy=false,loaded=false;
function clear(){loaded=false;for(const id of ['staff-name','score','checked-at','history-note','history'])el(id).replaceChildren();}
function status(s){el('status').textContent=s;}
function sync(){el('dashboard').hidden=!loaded;el('login-section').hidden=loaded;for(const b of document.querySelectorAll('button'))b.disabled=busy||!controller;}
function render(data){
 clear();el('staff-name').textContent=data.staffName;el('score').append(document.createTextNode(String(data.score)));const max=text('span',' / 100');max.className='maximum';el('score').append(max);
 el('checked-at').textContent='Last checked: '+new Date(data.checkedAt).toLocaleString();
 el('history-note').textContent=data.history.hasMore?'Showing your latest 50 changes. Earlier records remain stored.':data.history.entries.length?'Newest changes first.':'No score changes to show.';
 for(const r of data.history.entries){const li=document.createElement('li');li.append(text('strong',(r.points>0?'+':'')+r.points+' points · '+r.before+' → '+r.after));li.append(text('p',r.reason||'No additional reason was recorded.'));const time=text('time',new Date(r.occurredAt).toLocaleString());time.dateTime=r.occurredAt;li.append(time);el('history').append(li);}
 loaded=true;status('Your score is up to date.');
}
async function action(fn){if(busy)return;busy=true;status('Please wait.');sync();try{await fn();}catch(e){clear();status(e?.message||'Your score is unavailable. Please try again.');}finally{el('password').value='';busy=false;sync();}}
try{await setPersistence(auth,inMemoryPersistence);controller=AZPStaffScore.createStaffScore({auth,apiBase:window.AZP_SCORE_CONFIG?.apiBase,signIn:signInWithEmailAndPassword,signOut,getIdToken,reload});onAuthStateChanged(auth,()=>{clear();sync();});status('Sign in with your own verified staff account.');}catch{status('Staff score access is not connected yet. Please ask the owner.');}
el('login').addEventListener('submit',e=>{e.preventDefault();action(async()=>{let data;try{data=await controller.login(el('email').value,el('password').value);}finally{el('password').value='';}render(data);});});
el('refresh').addEventListener('click',()=>action(async()=>{clear();sync();render(await controller.mine());}));
el('logout').addEventListener('click',()=>action(async()=>{clear();await controller.logout();status('Signed out.');}));
sync();
