'use strict';
const C=require('./constants.cjs'),S=require('./security.cjs'),{createHash}=require('node:crypto');
function createCoreRouter({ownerRuntime,runQueued,verifyGoogle,secret,enabled=false,now=Date.now,log=()=>{}}){
 return async req=>{
  if(req.path===C.WORKER_PATH&&req.method==='POST'){
   try{await S.requireServiceIdentity(S.bearer(req.headers?.authorization),C.PUSH_SA,verifyGoogle,now);}catch{return S.response(403,{error:'Forbidden'});}
   let envelope,key;
   try{
    if(!Buffer.isBuffer(req.rawBody)||req.rawBody.length>C.MAX_PUSH)S.fail(413);
    const push=JSON.parse(req.rawBody.toString('utf8'));if(push.subscription!==C.SUBSCRIPTION||!/^\d+$/.test(push.message?.messageId||''))S.fail(400);
    const published=Date.parse(push.message.publishTime);envelope=JSON.parse(S.base64(push.message.data,100000).toString('utf8'));
    // Explicit, read-only transport probe: operator publishes through existing topic IAM.
    // Public Slack ingress cannot emit this envelope type. No score adapter is called.
    if(envelope.kind==='transport-probe'){
     if(envelope.version!==1||typeof envelope.nonce!=='string'||!/^probe-[a-f0-9]{16}$/.test(envelope.nonce)||Object.keys(envelope).sort().join(',')!=='kind,nonce,version'||!Number.isFinite(published)||Math.abs(now()-published)>300000)S.fail(400);
     log({event:'fault_transport_probe',nonce:envelope.nonce});return S.response(204,null);
    }
    if(!enabled)return S.response(503,{error:'Processing paused'});
    if(envelope.version!==1||!Number.isSafeInteger(envelope.admittedAt)||!Number.isFinite(published)||envelope.admittedAt>now()+5000||published>now()+5000||published-envelope.admittedAt>60000||envelope.admittedAt-published>5000||now()-envelope.admittedAt>C.MAX_QUEUE_AGE_MS)S.fail(400);
    const raw=S.base64(envelope.raw,C.MAX_RAW),headers={'x-slack-request-timestamp':envelope.slackTimestamp,'x-slack-signature':envelope.slackSignature};
    const body=S.verifySlack(raw,headers,secret,envelope.admittedAt);key=createHash('sha256').update(JSON.stringify([body.team_id,body.event?.channel,body.event?.ts])).digest('hex');
    if(key!==envelope.key||body.type!=='event_callback')S.fail(400);
    const result=await runQueued({rawBody:raw,headers,admittedAt:envelope.admittedAt});
    if(result.status!==200||!['applied','duplicate','ignored','pending'].includes(result.body?.status))throw Error('No terminal commit/result');
    log({event:'fault_processed',key,outcome:result.body.status});return S.response(204,null);
   }catch{log({event:'fault_processing_failed',...(key?{key}:{})});return S.response(503,{error:'Retry required'});}
  }
  if(req.method==='GET'&&C.OWNER_PATHS.includes(req.path)){
   try{await S.requireServiceIdentity(S.bearer(req.headers?.['x-azp-relay-authorization']),C.GATEWAY_SA,verifyGoogle,now);}catch{return S.response(403,{error:'Forbidden'});}
   return ownerRuntime(req);
  }
  return S.response(404,{error:'Not found'});
 };
}
module.exports={createCoreRouter};
