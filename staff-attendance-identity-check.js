(function(root){
 'use strict';
 const PROJECT='az-packers-quotation',UID='4de4f20e-cbad-4654-aae6-c975b3a34db2',EMAIL='atozpackersandmovers8855@gmail.com';
 const ENDPOINT='https://faultownergateway-onqwi7to4a-el.a.run.app/api/attendance/staff-session-check';
 function createCheck({enabled=false,serverEnabled=false,auth,signIn,signOut,reload,getIdTokenResult,fetchImpl=globalThis.fetch,now=Date.now}={}){
  let generation=0,busy=false;
  const guard=()=>{if(!enabled)throw Error('disabled');if(auth?.app?.options?.projectId!==PROJECT)throw Error('wrong_project');};
  const current=()=>{const u=auth.currentUser;if(!u||u.uid!==UID||u.email?.toLowerCase()!==EMAIL||u.isAnonymous!==false||!u.providerData?.some(p=>p.providerId==='password'))throw Error('account_mismatch');return u;};
  const unchanged=(g,u)=>{if(g!==generation||auth.currentUser!==u)throw Error('session_changed');current();};
  async function inspect(g,server=false){const u=current();await reload(u);unchanged(g,u);if(u.emailVerified!==true)throw Error('email_unverified');const result=await getIdTokenResult(u,true);unchanged(g,u);const c=result?.claims,seconds=now()/1000;
   if(c?.sub!==UID||c.aud!==PROJECT||c.iss!=='https://securetoken.google.com/'+PROJECT||c.email?.toLowerCase()!==EMAIL||c.email_verified!==true||c.firebase?.sign_in_provider!=='password'||!Number.isInteger(c.auth_time)||c.auth_time<=0||c.auth_time>seconds+60||seconds-c.auth_time>300||!Number.isInteger(c.exp)||c.exp<=seconds)throw Error('fresh_session_required');
   if(server){
    if(!serverEnabled||typeof result.token!=='string'||!/^\S{1,8192}$/.test(result.token))throw Error('server_check_disabled_or_no_token');
    const response=await fetchImpl(ENDPOINT,{method:'GET',headers:{Authorization:'Bearer '+result.token},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});unchanged(g,u);
    if(response.status!==200)throw Error('server_check_failed');const body=await response.json();unchanged(g,u);
    if(body?.identityVerified!==true||body.mappingState!=='disabled'||body.mappingVersion!==1||body.attendanceAccessGranted!==false||body.writesPerformed!==false||typeof body.checkedAt!=='string'||!Number.isFinite(Date.parse(body.checkedAt))||Math.abs(Date.parse(body.checkedAt)-now())>60000)throw Error('server_check_unexpected_state');
    return{state:'server_login_checked',checkedAt:body.checkedAt,mappingState:'disabled',mappingVersion:1,attendanceAccess:'not_granted',writesPerformed:false};
   }
   return{state:'browser_login_checked',email:EMAIL,emailVerified:true,checkedAt:new Date(now()).toISOString(),serverAcceptance:'pending',attendanceAccess:'not_granted'};
  }
  return{async login(password){guard();if(busy)throw Error('busy');if(typeof password!=='string'||!password)throw Error('password_required');busy=true;const g=++generation;try{await signIn(auth,EMAIL,password);if(g!==generation)throw Error('session_changed');return await inspect(g);}catch(e){if(g===generation){generation++;await signOut(auth);}throw e;}finally{busy=false;}},async serverCheck(){guard();if(!serverEnabled)throw Error('server_check_disabled');if(busy)throw Error('busy');busy=true;const g=generation;try{return await inspect(g,true);}finally{busy=false;}},async logout(){guard();generation++;await signOut(auth);},invalidate(){generation++;}};
 }
 const api={createCheck};if(typeof module==='object'&&module.exports)module.exports=api;else root.AZPStaffIdentityCheck=api;
})(globalThis);