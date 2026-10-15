(function(root){
 'use strict';
 const UID='88IIhxscilQqcT0XsHqRpE0JC0V2',EMAIL='manojgatibbi506@gmail.com',PROJECT='az-packers-quotation';
 const STAFF=[['INDOOR_STAFF_ZD9A1Z','Sanju'],['INDOOR_STAFF_10HIAWK','Ranjit'],['INDOOR_STAFF_1MJSC46','Swagatika'],['INDOOR_STAFF_9JJREB','Srinivas']];
 function createWidget({auth,apiBase,getIdToken,reload,fetchImpl=fetch,render}){
  if(auth?.app?.options?.projectId!==PROJECT||apiBase!=='https://faultownergateway-onqwi7to4a-el.a.run.app')throw Error('Score service unavailable');
  let generation=0,active=null,disposed=false;
  const candidate=u=>!!u&&u.uid===UID&&u.email?.toLowerCase()===EMAIL&&u.isAnonymous===false&&u.providerData?.some(p=>p.providerId==='password');
  const owner=u=>candidate(u)&&u.emailVerified===true;
  const current=(g,u)=>!disposed&&g===generation&&u===auth.currentUser;
  const same=(g,u)=>current(g,u)&&owner(auth.currentUser);
  function sessionStatus(){
   const u=auth.currentUser;
   if(!u)return {state:'unavailable',code:'no-session',message:'No active score-owner session. Sign in on the Owner Score page in this browser; Execution will connect automatically and retain the session until you sign out.'};
   if(u.isAnonymous)return {state:'unavailable',code:'guest-session',message:'Execution has a guest session. A verified owner sign-in is required to read staff scores.'};
   if(!candidate(u))return {state:'unavailable',code:'different-account',message:'Execution is signed in to a different account. Staff scores require the verified owner account.'};
   if(!u.emailVerified)return {state:'unavailable',code:'verification-required',message:'Owner account found, but email verification is not confirmed. Complete owner email verification before scores can load.'};
   return {state:'loading',code:'checking-owner',message:'Checking owner session.'};
  }
  function reset(){generation++;active?.abort();active=null;if(!disposed)render(sessionStatus());}
  async function refresh(){
   if(disposed||active)return;
   // Refresh the exact owner candidate before trusting persisted verification state.
   const user=auth.currentUser;if(!candidate(user)){reset();return;}
   const g=generation,request=new AbortController();active=request;const timeout=setTimeout(()=>request.abort(),15000);
   render({state:'loading',message:'Loading staff scores…'});
   try{
    await reload(user);if(!current(g,user))return;if(!owner(user)){render(sessionStatus());return;}
    const token=await getIdToken(user,true);if(!same(g,user))return;
    const response=await fetchImpl(apiBase+'/api/staff-score',{method:'GET',headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error',signal:request.signal});
    if(!same(g,user))return;
    if(response.status===401||response.status===403){render({state:'unavailable',code:'owner-rejected',message:'Owner session expired or was rejected by the score service. Your Execution session has not been signed out.'});return;}
    if(!response.ok)throw Error('Unavailable');const body=await response.json();if(!same(g,user))return;
    if(!Array.isArray(body.staff)||body.staff.length!==4||new Set(body.staff.map(r=>r.staffId)).size!==4)throw Error('Invalid scores');
    const rows=STAFF.map(([id,name])=>{const row=body.staff.find(r=>r.staffId===id);if(!row||!Number.isInteger(row.score)||row.score<0||row.score>100||row.maximum!==100)throw Error('Invalid score');return {name,score:row.score};});
    render({state:'ready',rows});
   }catch(error){if(current(g,user))render({state:'unavailable',code:'owner-check-failed',message:['auth/user-token-expired','auth/invalid-user-token','auth/user-disabled','auth/user-not-found'].includes(error?.code)?'Owner sign-in has expired. Sign in again through Execution’s existing GPS login.':'Owner session could not be checked. Staff scores remain hidden; no scores were changed.'});}
   finally{clearTimeout(timeout);if(active===request)active=null;if(!disposed&&g===generation&&!candidate(auth.currentUser))reset();}
  }
  function dispose(){reset();disposed=true;}
  return {refresh,reset,dispose};
 }
 const api={createWidget};if(typeof module==='object'&&module.exports)module.exports=api;else root.AZPExecutionOwnerScore=api;
})(typeof globalThis==='object'?globalThis:this);
