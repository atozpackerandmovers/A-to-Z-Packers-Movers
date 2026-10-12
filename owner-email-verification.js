/* Email verification only. This controller never grants dashboard authority. */
(function(root){
 'use strict';
 function createOwnerVerification({auth,ownerUid,ownerEmail,projectId,signIn,signOut,sendEmailVerification,reload,getIdToken,now=Date.now,storage}={}){
  let generation=0,busy=false,until=0;
  const key='azp-owner-verification-resend:'+projectId+':'+ownerUid;
  function failure(message,code){return Object.assign(Error(message),{code});}
  function reset(){generation++;}
  function current(){
   const u=auth?.currentUser;
   if(!ownerUid||!ownerEmail||!projectId||auth?.app?.options?.projectId!==projectId||!u||u.uid!==ownerUid||u.email?.toLowerCase()!==ownerEmail.toLowerCase()||u.isAnonymous!==false||!u.providerData?.some(p=>p.providerId==='password'))throw failure('Sign in with the configured owner account.','owner/account-mismatch');
   return u;
  }
  function unchanged(g,u){if(g!==generation||auth.currentUser!==u)throw failure('Account changed. Sign in again.','owner/account-changed');current();}
  function remaining(){try{until=Math.max(until,Number(storage?.getItem(key))||0);}catch(_){}return Math.max(0,Math.ceil((until-now())/1000));}
  function throttle(){until=now()+60000;try{storage?.setItem(key,String(until));}catch(_){} }
  async function login(email,password){
   if(busy)throw failure('Another request is in progress.','owner/busy');
   reset();const g=generation;busy=true;
   try{await signIn(auth,email,password);const u=current();unchanged(g,u);return {verificationRequired:u.emailVerified!==true};}
   catch(e){if(g===generation){reset();await signOut(auth);}throw e;}finally{busy=false;}
  }
  async function send(){
   const u=current(),g=generation;
   if(u.emailVerified===true)return {alreadyVerified:true};
   if(busy)throw failure('Another request is in progress.','owner/busy');
   if(remaining())throw failure('Wait before sending another email.','owner/throttled');
   busy=true;throttle();
   try{await sendEmailVerification(u);unchanged(g,u);return {sent:true};}finally{busy=false;}
  }
  async function refresh(){
   const u=current(),g=generation;
   if(busy)throw failure('Another request is in progress.','owner/busy');
   busy=true;
   try{await reload(u);unchanged(g,u);await getIdToken(u,true);unchanged(g,u);return {emailVerified:u.emailVerified===true};}finally{busy=false;}
  }
  return {login,send,refresh,reset,remaining};
 }
 root.AZPOwnerEmailVerification={createOwnerVerification};
 if(typeof module!=='undefined')module.exports={createOwnerVerification};
})(globalThis);
