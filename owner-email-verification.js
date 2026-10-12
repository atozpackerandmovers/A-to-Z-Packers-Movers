/* Owner-triggered email migration only. This controller never grants dashboard authority. */
(function(root){
 'use strict';
 function createOwnerVerification({auth,ownerUid,ownerEmail,newOwnerEmail,projectId,signIn,signOut,reauthenticateWithCredential,emailCredential,verifyBeforeUpdateEmail,reload,getIdToken,now=Date.now,storage}={}){
  let generation=0,busy=false,until=0;
  const key='azp-owner-verification-resend:'+projectId+':'+ownerUid;
  function failure(message,code){return Object.assign(Error(message),{code});}
  function reset(){generation++;}
  function current(){
   const u=auth?.currentUser;
   const emails=[ownerEmail,newOwnerEmail].filter(Boolean).map(e=>e.toLowerCase());
   if(!ownerUid||!ownerEmail||!newOwnerEmail||ownerEmail===newOwnerEmail||!projectId||auth?.app?.options?.projectId!==projectId||!u||u.uid!==ownerUid||!emails.includes(u.email?.toLowerCase())||u.isAnonymous!==false||!u.providerData?.some(p=>p.providerId==='password'))throw failure('Sign in with the configured owner account.','owner/account-mismatch');
   return u;
  }
  function unchanged(g,u){if(g!==generation||auth.currentUser!==u)throw failure('Account changed. Sign in again.','owner/account-changed');current();}
  function remaining(){try{until=Math.max(until,Number(storage?.getItem(key))||0);}catch(_){}return Math.max(0,Math.ceil((until-now())/1000));}
  function throttle(){until=now()+60000;try{storage?.setItem(key,String(until));}catch(_){} }
  async function login(email,password){
   if(busy)throw failure('Another request is in progress.','owner/busy');
   reset();const g=generation;busy=true;
   try{await signIn(auth,email,password);const u=current();unchanged(g,u);return state(u);}
   catch(e){if(g===generation){reset();await signOut(auth);}throw e;}finally{busy=false;}
  }
  function state(u){return {email:u.email,emailVerified:u.emailVerified===true,migrationComplete:u.email?.toLowerCase()===newOwnerEmail.toLowerCase()&&u.emailVerified===true};}
  async function requestEmailChange(password,confirmed){
   const u=current(),g=generation;
   if(confirmed!==true||typeof password!=='string'||!password)throw failure('Confirm the exact email change and your current password.','owner/confirmation-required');
   if(u.email?.toLowerCase()!==ownerEmail.toLowerCase())throw failure('Login email has already changed. Check verification status.','owner/already-changed');
   if(busy)throw failure('Another request is in progress.','owner/busy');
   if(remaining())throw failure('Wait before sending another email.','owner/throttled');
   if(typeof reauthenticateWithCredential!=='function'||typeof emailCredential!=='function'||typeof verifyBeforeUpdateEmail!=='function')throw failure('Secure email migration is not configured.','owner/not-configured');
   busy=true;
   try{
    await reauthenticateWithCredential(u,emailCredential(ownerEmail,password));unchanged(g,u);
    await reload(u);unchanged(g,u);
    if(u.email?.toLowerCase()!==ownerEmail.toLowerCase())throw failure('Login email has already changed. Check verification status.','owner/already-changed');
    await getIdToken(u,true);unchanged(g,u);throttle();
    await verifyBeforeUpdateEmail(u,newOwnerEmail);unchanged(g,u);
    return {sent:true,targetEmail:newOwnerEmail};
   }finally{busy=false;}
  }
  async function refresh(){
   const u=current(),g=generation;
   if(busy)throw failure('Another request is in progress.','owner/busy');
   busy=true;
   try{await reload(u);unchanged(g,u);await getIdToken(u,true);unchanged(g,u);return state(u);}finally{busy=false;}
  }
  return {login,requestEmailChange,refresh,reset,remaining};
 }
 root.AZPOwnerEmailVerification={createOwnerVerification};
 if(typeof module!=='undefined')module.exports={createOwnerVerification};
})(globalThis);
