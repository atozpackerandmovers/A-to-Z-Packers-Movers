(function(root){
 'use strict';
 const UID='88IIhxscilQqcT0XsHqRpE0JC0V2',EMAIL='manojgatibbi506@gmail.com',PROJECT='az-packers-quotation';
 function createOwnerScore({auth,apiBase,signIn,signOut,getIdToken,reload,fetchImpl=fetch}={}){
  let generation=0;
  if(auth?.app?.options?.projectId!==PROJECT)throw Error('Owner service is not configured.');
  // Endpoint comes only from reviewed deployment metadata, never URL/query/storage input.
  const base=typeof apiBase==='string'?apiBase.replace(/\/$/,''):'';
  if(!/^https:\/\/faultownergateway-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$/.test(base))throw Error('The score service has not been connected yet.');
  function current(){const u=auth.currentUser;if(!u||u.uid!==UID||u.email?.toLowerCase()!==EMAIL||u.emailVerified!==true||u.isAnonymous!==false||!u.providerData?.some(p=>p.providerId==='password'))throw Error('Sign in with the verified owner account.');return u;}
  async function request(path){
   const g=generation,u=current();await reload(u);current();const token=await getIdToken(u,true);
   if(g!==generation||u!==auth.currentUser)throw Error('Account changed. Sign in again.');
   const response=await fetchImpl(base+path,{method:'GET',headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
   const body=await response.json();if(g!==generation||u!==auth.currentUser)throw Error('Account changed. Sign in again.');
   if(!response.ok){if(response.status===401||response.status===403){generation++;await signOut(auth);throw Error('Owner authentication expired. Sign in again.');}if(path==='/api/staff-score/readiness'&&response.status===503&&body?.checks&&body.writesPerformed===false)return body;throw Error('The score service is not ready. No scores were changed.');}
   return body;
  }
  async function login(password){generation++;try{await signIn(auth,EMAIL,password);current();return await request('/api/staff-score/owner-session');}catch(e){generation++;await signOut(auth);throw e;}}
  async function logout(){generation++;await signOut(auth);}
  return {login,logout,scores:()=>request('/api/staff-score'),audit:()=>request('/api/staff-score/audit'),readiness:()=>request('/api/staff-score/readiness')};
 }
 const api={createOwnerScore};if(typeof module==='object'&&module.exports)module.exports=api;else root.AZPOwnerScore=api;
})(typeof globalThis==='object'?globalThis:this);
