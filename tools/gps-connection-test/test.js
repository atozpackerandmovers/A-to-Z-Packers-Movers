'use strict';
const evidence=window.gpsConnectionEvidence={candidateCommit:'c81ccd15c64c6a328f4996999ca62b23585dfee3',startedAt:new Date().toISOString(),origin:location.origin,userAgent:navigator.userAgent,auth:'NOT LOADED / NOT AUTHENTICATED',allowedRead:'.info/connected',businessReads:0,applicationWrites:0,transport:null,connectionEvents:[],cspViolations:[],errors:[]};
const cleanUrl=value=>{try{const u=new URL(value);return u.origin+u.pathname}catch{return String(value)}};
function render(){document.getElementById('evidence').textContent=JSON.stringify(evidence,null,2)}
function noteError(message){evidence.errors.push({at:new Date().toISOString(),message:String(message)});render()}
window.addEventListener('securitypolicyviolation',e=>{evidence.cspViolations.push({at:new Date().toISOString(),directive:e.effectiveDirective,blocked:cleanUrl(e.blockedURI)});render()});
window.addEventListener('error',e=>noteError(e.message||'Resource loading error'));
window.addEventListener('unhandledrejection',e=>noteError(e.reason?.code||e.reason?.message||'Unhandled rejection'));
document.getElementById('origin').textContent='Isolated test origin: '+location.origin;
render();
try{
 if(!window.firebase)throw Error('Firebase SDK failed to load. Inspect Network/CSP; do not relax CSP.');
 const app=firebase.initializeApp(window.PR71_FIREBASE_CONFIG);
 const db=app.database();
 evidence.transport=window.configurePr71Transport(db);
 // The only application ref created is SDK connection metadata. No Auth module
 // is loaded and no database business data/command path is ever referenced.
 db.goOnline();
 const connected=db.ref('.info/connected');
 connected.on('value',snapshot=>{
  const value=snapshot.val()===true;
  evidence.connectionEvents.push({at:new Date().toISOString(),connected:value});
  document.getElementById('status').textContent=value?'CONNECTED — transport evidence only':'NOT CONNECTED';
  console.info('PR71 transport .info/connected',value);render();
 },err=>noteError(err?.code||err?.message||'Connection listener error'));
 document.getElementById('offline').disabled=false;
 document.getElementById('online').disabled=false;
 document.getElementById('offline').onclick=()=>db.goOffline();
 document.getElementById('online').onclick=()=>db.goOnline();
 window.addEventListener('pagehide',()=>{connected.off();db.goOffline()},{once:true});
 setTimeout(()=>{if(!evidence.connectionEvents.some(e=>e.connected)){document.getElementById('status').textContent='NO CONNECTED EVENT AFTER 30 SECONDS';render()}},30000);
}catch(err){document.getElementById('status').textContent='TEST FAILED TO INITIALIZE';noteError(err?.code||err?.message||'Initialization error')}
