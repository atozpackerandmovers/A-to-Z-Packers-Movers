(function(root){
 'use strict';
 const PROJECT='az-packers-quotation',OWNER='88IIhxscilQqcT0XsHqRpE0JC0V2';
 function createStaffScore({auth,apiBase,signIn,signOut,getIdToken,reload,fetchImpl=fetch}){
  let generation=0;
  if(auth?.app?.options?.projectId!==PROJECT||!/^https:\/\/faultownergateway-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$/.test(apiBase||''))throw Error('Staff score service is not connected.');
  function current(){const u=auth.currentUser;if(!u||!u.uid||u.uid===OWNER||u.emailVerified!==true||u.isAnonymous!==false||!u.providerData?.some(p=>p.providerId==='password'))throw Error('Use your own verified staff account.');return u;}
  async function mine(){
   const g=generation,u=current();await reload(u);current();const token=await getIdToken(u,true);
   if(g!==generation||u!==auth.currentUser)throw Error('Account changed. Sign in again.');
   const r=await fetchImpl(apiBase+'/api/staff-score/me',{method:'GET',headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
   const body=await r.json();if(g!==generation||u!==auth.currentUser)throw Error('Account changed. Sign in again.');
   if(!r.ok){if(r.status===401||r.status===403){generation++;await signOut(auth);throw Error(r.status===403?'Your account has not been linked to a staff score. Ask the owner to check your access.':'Your session expired. Please sign in again.');}throw Error('Your score is unavailable right now. Please try again later.');}
   if(!['Sanju','Ranjit','Swagatika','Srinivas'].includes(body.staffName)||!Number.isInteger(body.score)||body.score<0||body.score>100||body.maximum!==100||!Array.isArray(body.history?.entries)||body.history.entries.length>50||typeof body.history.hasMore!=='boolean'||!Number.isFinite(Date.parse(body.checkedAt)))throw Error('Your score could not be verified.');
   for(const row of body.history.entries)if(!['deduct','reverse'].includes(row.kind)||!Number.isInteger(row.points)||!Number.isInteger(row.before)||!Number.isInteger(row.after)||row.before<0||row.before>100||row.after<0||row.after>100||row.points!==row.after-row.before||typeof row.reason!=='string'||row.reason.length>4000||!Number.isFinite(Date.parse(row.occurredAt)))throw Error('Your history could not be verified.');
   return body;
  }
  async function login(email,password){generation++;try{await signIn(auth,email.trim(),password);current();return await mine();}catch(e){generation++;await signOut(auth);throw e;}}
  async function logout(){generation++;await signOut(auth);}
  return {login,mine,logout};
 }
 const api={createStaffScore};if(typeof module==='object'&&module.exports)module.exports=api;else root.AZPStaffScore=api;
})(typeof globalThis==='object'?globalThis:this);
