(function(root){
 'use strict';
 const PROJECT='az-packers-quotation',UID='4de4f20e-cbad-4654-aae6-c975b3a34db2',EMAIL='atozpackersandmovers8855@gmail.com';
 function createCheck({enabled=false,auth,signIn,signOut,reload,getIdTokenResult,now=Date.now}={}){
  let generation=0,busy=false;
  const guard=()=>{if(!enabled)throw Error('disabled');if(auth?.app?.options?.projectId!==PROJECT)throw Error('wrong_project');};
  const current=()=>{const u=auth.currentUser;if(!u||u.uid!==UID||u.email?.toLowerCase()!==EMAIL||u.isAnonymous!==false||!u.providerData?.some(p=>p.providerId==='password'))throw Error('account_mismatch');return u;};
  const unchanged=(g,u)=>{if(g!==generation||auth.currentUser!==u)throw Error('session_changed');current();};
  async function inspect(g){const u=current();await reload(u);unchanged(g,u);if(u.emailVerified!==true)throw Error('email_unverified');const result=await getIdTokenResult(u,true);unchanged(g,u);const c=result?.claims,seconds=now()/1000;
   if(c?.sub!==UID||c.aud!==PROJECT||c.iss!=='https://securetoken.google.com/'+PROJECT||c.email?.toLowerCase()!==EMAIL||c.email_verified!==true||c.firebase?.sign_in_provider!=='password'||!Number.isInteger(c.auth_time)||c.auth_time<=0||c.auth_time>seconds+60||seconds-c.auth_time>300||!Number.isInteger(c.exp)||c.exp<=seconds)throw Error('fresh_session_required');
   return{state:'browser_login_checked',email:EMAIL,emailVerified:true,checkedAt:new Date(now()).toISOString(),serverAcceptance:'pending',attendanceAccess:'not_granted'};
  }
  return{async login(password){guard();if(busy)throw Error('busy');if(typeof password!=='string'||!password)throw Error('password_required');busy=true;const g=++generation;try{await signIn(auth,EMAIL,password);if(g!==generation)throw Error('session_changed');return await inspect(g);}catch(e){if(g===generation){generation++;await signOut(auth);}throw e;}finally{busy=false;}},async logout(){guard();generation++;await signOut(auth);},invalidate(){generation++;}};
 }
 const api={createCheck};if(typeof module==='object'&&module.exports)module.exports=api;else root.AZPStaffIdentityCheck=api;
})(globalThis);
