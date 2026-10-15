'use strict';
const C=require('./constants.cjs');
async function boundedJson(response,max){
 if(!response.ok)throw Error('Upstream unavailable');
 let length=0;const parts=[];for await(const chunk of response.body){length+=chunk.length;if(length>max)throw Error('Upstream response too large');parts.push(Buffer.from(chunk));}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function createGoogleAdapters({fetchImpl=fetch,now=Date.now}={}){
 const metadata='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';let accessCache,idCache;
 async function metadataGet(suffix,signal){return fetchImpl(metadata+suffix,{headers:{'Metadata-Flavor':'Google'},redirect:'error',signal});}
 async function access(signal){if(accessCache?.until>now()+30000)return accessCache.token;const r=await metadataGet('token',signal),b=await boundedJson(r,8192);if(typeof b.access_token!=='string'||!Number.isFinite(b.expires_in)||b.expires_in<=0)throw Error('Metadata unavailable');accessCache={token:b.access_token,until:now()+Math.min(b.expires_in,300)*1000};return accessCache.token;}
 async function identity(signal){if(idCache?.until>now()+30000)return idCache.token;const r=await metadataGet('identity?audience='+encodeURIComponent(C.CORE_URL)+'&format=full',signal);if(!r.ok)throw Error('Metadata unavailable');const token=await r.text();if(token.length>8192)throw Error('Metadata unavailable');const claims=JSON.parse(Buffer.from(token.split('.')[1]||'','base64url').toString());if(claims.aud!==C.CORE_URL||!Number.isInteger(claims.exp)||claims.exp*1000<=now())throw Error('Metadata unavailable');idCache={token,until:Math.min(claims.exp*1000,now()+300000)};return token;}
 return {
  publish:async(envelope,{signal})=>{const token=await access(signal);const r=await fetchImpl('https://pubsub.googleapis.com/v1/'+C.TOPIC+':publish',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messages:[{data:Buffer.from(JSON.stringify(envelope)).toString('base64')}]}),redirect:'error',signal});const b=await boundedJson(r,8192);if(b.messageIds?.length!==1)throw Error('Persistence unconfirmed');return {messageId:b.messageIds[0]};},
  forward:async(path,firebaseToken)=>{if(!C.OWNER_PATHS.includes(path)&&path!==C.SELF_PATH)throw Error('Forbidden route');const signal=AbortSignal.timeout(10000),id=await identity(signal);const r=await fetchImpl(C.CORE_URL+path,{method:'GET',headers:{Authorization:'Bearer '+firebaseToken,'X-Serverless-Authorization':'Bearer '+id,'X-Azp-Relay-Authorization':'Bearer '+id},redirect:'error',signal});if(![200,401,403,503].includes(r.status))throw Error('Upstream unavailable');const body=await boundedJson({ok:true,body:r.body},1048576);return {status:r.status,body};}
 };
}
module.exports={createGoogleAdapters,boundedJson};
