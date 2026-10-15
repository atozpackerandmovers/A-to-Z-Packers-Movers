'use strict';
const {createService}=require('./domain/service.cjs'),{createHandler}=require('./domain/http.cjs');
const {createFirebaseVerifier}=require('./domain/firebase-auth.cjs'),{createSlackAdapters}=require('./slack.cjs');
const {createProductionStore}=require('./firestore.cjs'),{config,STAFF}=require('./config.cjs');
const {PROJECT_ID,AUDIT_READ_LIMIT}=require('./bindings.cjs');
const {ownerCors}=require('./cors.cjs'),{checkReadiness}=require('./readiness.cjs');
const {createSelfReader}=require('./self-score.cjs');
function createRuntime({db,defaultDb,auth,signingSecret,ownerToken,env=process.env,fetchImpl=fetch,now=Date.now,signatureNow=now}={}){
 const c=config(env,signingSecret),store=createProductionStore({db,projectId:PROJECT_ID,env,now});
 const verifyBearer=createFirebaseVerifier({auth,projectId:PROJECT_ID,allowedProviders:['password'],now});
 if(typeof ownerToken!=='string'||!ownerToken)throw Error('Secure Slack user binding required');
 return async request=>{
  const cors=ownerCors(request);if(cors.response)return cors.response;
  if(request.path==='/api/staff-score/me'){
   if(request.method!=='GET'||request.query&&Object.keys(request.query).length)return {status:404,headers:cors.headers,body:{error:'Not found'}};
   try{const body=await createSelfReader({db,verifyBearer,env,now})(/^Bearer (.+)$/.exec(request.headers?.authorization||'')?.[1]);return {status:200,headers:cors.headers,body};}
   catch(e){const status=e.status===401?401:e.status===403?403:503;return {status,headers:cors.headers,body:{error:status===401?'Authentication required':status===403?'Forbidden':'Staff score access unavailable'}};}
  }
  // Request-scoped promises batch provenance/DM checks without caching authorization between deliveries.
  const slack=createSlackAdapters({token:ownerToken,workspaceId:c.workspaceId,workspaceUrl:c.workspaceUrl,ownerUserId:c.ownerUserId,mappings:STAFF,fetchImpl});
  const service=createService(c,{...store,...slack,verifyBearer,now,signatureNow});
  if(request.method==='GET'&&request.path==='/api/staff-score/readiness'){
   try{await service.ownerSession(/^Bearer (.+)$/.exec(request.headers?.authorization||'')?.[1]);
    const body=await checkReadiness({db,defaultDb,slack,activation:c.activation,now});
    return {status:body.ready?200:503,headers:cors.headers,body};
   }catch(e){return {status:e.status===401?401:e.status===403?403:503,headers:cors.headers,body:{error:e.status===401?'Authentication required':e.status===403?'Forbidden':'Readiness unavailable'}};}
  }
  // Only automatic signed Fault mutations. Manual mutation routes are not exposed by this deployment.
  const allowed=(request.method==='POST'&&request.path==='/api/staff-score/slack')||
   (request.method==='GET'&&['/api/staff-score/owner-session','/api/staff-score','/api/staff-score/audit'].includes(request.path));
  if(!allowed)return {status:404,headers:{'Cache-Control':'no-store'},body:{error:'Not found'}};
  const result=await createHandler({...service,score:service.ownerScores,audit:async token=>{
   const rows=await service.audit(token);
   return {entries:rows.slice(0,AUDIT_READ_LIMIT),limit:AUDIT_READ_LIMIT,hasMore:rows.length>AUDIT_READ_LIMIT,order:'newest-first'};
  }})(request);return {...result,headers:{...result.headers,...cors.headers}};
 };
}
module.exports={createRuntime};
