(function(root){
 'use strict';
 const UID='88IIhxscilQqcT0XsHqRpE0JC0V2',EMAIL='manojgatibbi506@gmail.com',PROJECT='az-packers-quotation';
 const STAFF=[['INDOOR_STAFF_ZD9A1Z','Sanju'],['INDOOR_STAFF_10HIAWK','Ranjit'],['INDOOR_STAFF_1MJSC46','Swagatika'],['INDOOR_STAFF_9JJREB','Srinivas']];
 function createWidget({auth,apiBase,getIdToken,reload,fetchImpl=fetch,render}){
  if(auth?.app?.options?.projectId!==PROJECT||apiBase!=='https://faultownergateway-onqwi7to4a-el.a.run.app')throw Error('Score service unavailable');
  let generation=0,active=null,disposed=false;
  const owner=u=>!!u&&u.uid===UID&&u.email?.toLowerCase()===EMAIL&&u.emailVerified===true&&u.isAnonymous===false&&u.providerData?.some(p=>p.providerId==='password');
  const same=(g,u)=>!disposed&&g===generation&&u===auth.currentUser&&owner(auth.currentUser);
  function reset(){generation++;active?.abort();active=null;if(!disposed)render({state:'unavailable',message:'Owner session required.'});}
  async function refresh(){
   if(disposed||active)return;
   const user=auth.currentUser;if(!owner(user)){reset();return;}
   const g=generation,request=new AbortController();active=request;const timeout=setTimeout(()=>request.abort(),15000);
   render({state:'loading',message:'Loading staff scores…'});
   try{
    await reload(user);if(!same(g,user))return;
    const token=await getIdToken(user);if(!same(g,user))return;
    const response=await fetchImpl(apiBase+'/api/staff-score',{method:'GET',headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error',signal:request.signal});
    if(!same(g,user))return;
    if(response.status===401||response.status===403){render({state:'unavailable',message:'Owner session expired or unavailable.'});return;}
    if(!response.ok)throw Error('Unavailable');const body=await response.json();if(!same(g,user))return;
    if(!Array.isArray(body.staff)||body.staff.length!==4||new Set(body.staff.map(r=>r.staffId)).size!==4)throw Error('Invalid scores');
    const rows=STAFF.map(([id,name])=>{const row=body.staff.find(r=>r.staffId===id);if(!row||!Number.isInteger(row.score)||row.score<0||row.score>100||row.maximum!==100)throw Error('Invalid score');return {name,score:row.score};});
    render({state:'ready',rows});
   }catch{if(same(g,user))render({state:'unavailable',message:'Staff scores temporarily unavailable.'});}
   finally{clearTimeout(timeout);if(active===request)active=null;if(!disposed&&g===generation&&!owner(auth.currentUser))reset();}
  }
  function dispose(){reset();disposed=true;}
  return {refresh,reset,dispose};
 }
 const api={createWidget};if(typeof module==='object'&&module.exports)module.exports=api;else root.AZPExecutionOwnerScore=api;
})(typeof globalThis==='object'?globalThis:this);
