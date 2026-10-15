'use strict';
// Inject an EXISTING authorized Firebase Admin Auth instance; no credentials loaded here.
function createFirebaseVerifier({auth,projectId,allowedProviders,now=Date.now}={}){
  if(!auth||typeof auth.verifyIdToken!=='function'||typeof projectId!=='string'||!projectId||!Array.isArray(allowedProviders)||!allowedProviders.length||allowedProviders.includes('anonymous'))throw Error('Firebase owner verification is not configured');
  return async token=>{
    if(typeof token!=='string'||!token)throw Error('Invalid authentication');
    // Admin SDK validates cryptographic signature, issuer/audience and revocation.
    const c=await auth.verifyIdToken(token,true),seconds=Math.floor(now()/1000);
    if(!c||typeof c.uid!=='string'||!c.uid||c.sub!==c.uid||c.aud!==projectId||c.iss!==`https://securetoken.google.com/${projectId}`||
      !Number.isInteger(c.exp)||c.exp<=seconds||!Number.isInteger(c.iat)||c.iat>seconds+60||
      c.email_verified!==true||!allowedProviders.includes(c.firebase?.sign_in_provider))throw Error('Invalid authentication');
    return {subject:c.uid,verified:true,anonymous:false};
  };
}
module.exports={createFirebaseVerifier};
