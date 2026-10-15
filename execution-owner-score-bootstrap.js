import {getApp} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,getIdToken,reload} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import {ownerScoreSession} from './owner-score-session.js?v=20261015-persist1';
// Share the isolated persistent owner session; preserve Execution/GPS auth.
const root=document.getElementById('execution-owner-score'),status=root.querySelector('[data-score-status]'),cards=root.querySelector('[data-score-cards]');
let widget,unsubscribe,timer,session;
function render(result){
 if(result.state==='loading'&&cards.childElementCount)return;
 cards.replaceChildren();root.dataset.scoreState=result.code||result.state;status.hidden=result.state==='ready';status.textContent=result.message||'';
 if(result.state==='ready')for(const row of result.rows){const card=document.createElement('div'),name=document.createElement('span'),score=document.createElement('strong');card.className='execution-score-card';name.textContent=row.name;score.textContent=String(row.score);card.append(name,score);cards.append(card);}
}
try{
 session=await ownerScoreSession(getAuth(getApp()));widget=AZPExecutionOwnerScore.createWidget({auth:session.view,apiBase:window.AZP_SCORE_CONFIG?.apiBase,getIdToken,reload,render});
 unsubscribe=session.subscribe(()=>{widget.reset();if(!document.hidden)widget.refresh();});
 timer=setInterval(()=>{if(!document.hidden&&!document.getElementById('mod-dashboard').classList.contains('hidden'))widget.refresh();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)widget.refresh();});
 document.addEventListener('click',event=>{if(event.target.closest('[data-module="dashboard"]'))widget.refresh();});
 window.addEventListener('pageshow',event=>{if(event.persisted)widget.refresh();});
 window.addEventListener('pagehide',event=>{widget.reset();if(!event.persisted){clearInterval(timer);unsubscribe?.();widget.dispose();session.dispose();}});
}catch{render({state:'unavailable',message:'Owner sign-in storage is unavailable in this browser. Staff scores remain protected.'});}
