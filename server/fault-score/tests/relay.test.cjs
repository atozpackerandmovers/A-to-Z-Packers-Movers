'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHmac,generateKeyPairSync,createSign}=require('node:crypto');
const C=require('../relay/constants.cjs'),{fixture,readinessFixture}=require('./fixture.cjs');
const {createIngress}=require('../relay/ingress.cjs'),{createCoreRouter}=require('../relay/core-router.cjs'),{createOwnerGateway}=require('../relay/owner-gateway.cjs');
const {createRuntime}=require('../core/runtime.cjs'),{createFirebaseVerifier}=require('../core/domain/firebase-auth.cjs');
const {requireServiceIdentity}=require('../relay/security.cjs');
const T=1800000000000,SECRET='synthetic-signing-secret';
function claims(email,now=T){return {email,email_verified:true,aud:C.CORE_URL,iss:'https://accounts.google.com',sub:'123456789012345678901',iat:Math.floor(now/1000)-1,exp:Math.floor(now/1000)+3600};}
const google=async token=>{if(token==='push')return claims(C.PUSH_SA);if(token==='gateway')return claims(C.GATEWAY_SA);throw Error('Synthetic rejection');};
function request(f,...args){return {...f.request(...args),path:'/slack/events'};}
function push(envelope,id='1'){return {method:'POST',path:C.WORKER_PATH,headers:{authorization:'Bearer push'},rawBody:Buffer.from(JSON.stringify({subscription:C.SUBSCRIPTION,message:{messageId:id,publishTime:new Date(envelope.admittedAt).toISOString(),data:Buffer.from(JSON.stringify(envelope)).toString('base64')}}))};}
function core(f,{now=()=>T,enabled=true,verifyGoogle=google}={}){return createCoreRouter({secret:SECRET,enabled,now,verifyGoogle,ownerRuntime:f.run,runQueued:({rawBody,headers,admittedAt})=>createRuntime({db:f.db,defaultDb:f.defaultDb,auth:f.auth,ownerToken:'synthetic-user-token',signingSecret:SECRET,env:f.env,fetchImpl:f.fetchImpl,now,signatureNow:()=>admittedAt})({method:'POST',path:'/api/staff-score/slack',headers,rawBody})});}
function ingress(publish,patch={}){return createIngress({secret:SECRET,publish,now:()=>T,env:{AZP_RELAY_ACCEPT_EVENTS:'true',AZP_FAULT_NOT_BEFORE:'1800000000.000002'},...patch});}
async function envelope(f){let value;assert.equal((await ingress(async e=>{value=e;return {messageId:'1'};})(request(f))).status,200);return value;}

test('ingress accepts only a signature-authenticated Slack path, challenge needs no queue',async()=>{
 const f=fixture();let publications=0;const run=ingress(async()=>{publications++;return {messageId:'1'};});
 assert.equal((await run({...request(f),path:'/api/staff-score'})).status,404);
 assert.equal((await run({...request(f),method:'GET'})).status,404);
 assert.equal((await run({...request(f),headers:{}})).status,401);
 assert.equal((await run({...request(f),rawBody:Buffer.from('{}')})).status,401);
 assert.equal((await run({...request(f),rawBody:Buffer.alloc(65537)})).status,413);
 const challenge={...f.request(0,undefined,{}, {type:'url_verification',challenge:'synthetic-challenge'}),path:'/slack/events'};
 assert.deepEqual((await run(challenge)).body,{challenge:'synthetic-challenge'});assert.equal(publications,0);assert.equal(f.transactions(),0);
});
test('ingress rejects stale/replayed signatures and excludes unrelated DMs, nonowner, non-Fault, old events',async()=>{
 const f=fixture();let calls=0;const run=ingress(async()=>{calls++;return {messageId:'1'};});
 assert.equal((await ingress(async()=>{throw Error();},{now:()=>T+301000})(request(f))).status,401);
 for(const patch of [{channel:'DOTHER'},{user:'UOTHER'},{text:'ordinary message'},{text:'fault'},{text:' Fault'},{text:'Fault:'},{subtype:'message_changed'},{thread_ts:'1800000000.2'}])assert.equal((await run(request(f,0,undefined,patch))).body.status,'ignored');
 assert.equal((await run(request(f,0,'1799999999.000001'))).body.status,'ignored');
 assert.equal((await run(request(f,0,undefined,{}, {authorizations:{}}))).body.status,'ignored');
 assert.equal((await run(request(f,0,undefined,{}, {api_app_id:'OTHER'}))).status,403);assert.equal(calls,0);
});
test('admission defaults paused and refuses success until durable publish receipt',async()=>{
 const f=fixture();assert.equal((await ingress(async()=>({messageId:'1'}),{env:{}})(request(f))).status,503);
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let settled=false;
 const run=ingress(async()=>{entered();await gate;return {messageId:'123'};});const result=run(request(f)).then(r=>{settled=true;return r;});await started;assert.equal(settled,false);release();assert.equal((await result).status,200);
 for(const pub of [async()=>{throw Error('private token');},async()=>({}),async()=>({messageId:'not-a-receipt'})]){const r=await ingress(pub)(request(f));assert.equal(r.status,503);assert(!JSON.stringify(r).includes('private token'));}
});
test('publish deadline returns retryable failure without waiting for worker; late persistence is safe',async()=>{
 const f=fixture();let persisted,release;const late=new Promise(r=>release=r);const logs=[];
 const start=performance.now();const result=await ingress(async e=>{await late;persisted=e;return {messageId:'1'};},{budgetMs:30,log:x=>logs.push(x)})(request(f));
 assert.equal(result.status,503);assert(performance.now()-start<1500);release();await new Promise(r=>setImmediate(r));assert(persisted);
 const again=await envelope(f),worker=core(f);assert.equal((await worker(push(persisted,'1'))).status,204);assert.equal((await worker(push(again,'2'))).status,204);assert.equal(f.score(0),98);assert(!JSON.stringify(logs).includes('Fault checklist'));
});
test('local durable queue stand-in survives reconstruction, commit/lost-response redelivery deducts once',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'azp-relay-test-')),file=path.join(folder,'synthetic-queue.jsonl');
 try{const f=fixture();const publish=async e=>{fs.appendFileSync(file,JSON.stringify(e)+'\n');return {messageId:'1'};};assert.equal((await ingress(publish)(request(f))).status,200);assert.equal(f.score(0),100);
 const reconstructed=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse),worker=core(f);await worker(push(reconstructed[0])); // simulate lost HTTP response after commit
 assert.equal((await worker(push(reconstructed[0]))).status,204);assert.equal(f.score(0),98);assert.equal([...f.records.keys()].filter(x=>x.startsWith('private_score_audit/')).length,1);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('authenticated queue retries after five-minute Slack freshness window preserve event cutoff and dedup',async()=>{
 const f=fixture(),e=await envelope(f),later=T+600000;const worker=core(f,{now:()=>later});
 const all=await Promise.all(Array.from({length:20},(_,i)=>worker(push(e,String(i+1)))));assert(all.every(r=>r.status===204));assert.equal(f.score(0),98);
 const old=fixture();old.env.AZP_FAULT_NOT_BEFORE='1800000001.000000';assert.equal((await core(old,{now:()=>later})(push(e))).status,204);assert.equal(old.score(0),100);
});
test('queue identity, audience, envelope, original HMAC and age are checked before score work',async()=>{
 const f=fixture(),e=await envelope(f),run=core(f);assert.equal((await run({...push(e),headers:{authorization:'Bearer gateway'}})).status,403);
 assert.equal((await run({...push(e),headers:{authorization:'Bearer bad'}})).status,403);
 assert.equal((await core(f,{verifyGoogle:async()=>({...claims(C.PUSH_SA),aud:'https://evil.example'})})(push(e))).status,403);
 for(const patch of [{raw:Buffer.from('{}').toString('base64')},{slackSignature:'v0'},{admittedAt:T-301000},{admittedAt:T+60000},{key:'wrong'},{version:2}])assert.equal((await run(push({...e,...patch}))).status,503);
 const bad=push(e),b=JSON.parse(bad.rawBody);b.subscription='projects/other/subscriptions/wrong';bad.rawBody=Buffer.from(JSON.stringify(b));assert.equal((await run(bad)).status,503);
 assert.equal((await core(f,{now:()=>T+C.MAX_QUEUE_AGE_MS+1,verifyGoogle:async()=>claims(C.PUSH_SA,T+C.MAX_QUEUE_AGE_MS+1)})(push(e))).status,503);assert.equal(f.transactions(),0);
});
test('paused processing, missing balance, Slack outage and commit failure are never acknowledged',async()=>{
 const f=fixture(),e=await envelope(f);assert.equal((await core(f,{enabled:false})(push(e))).status,503);assert.equal(f.score(0),100);
 const missing=fixture({seed:false});missing.request();assert.equal((await core(missing)(push(e))).status,503);assert.equal(missing.records.size,0);
 f.override(()=>{throw Error('synthetic Slack outage');});assert.equal((await core(f)(push(e))).status,503);assert.equal(f.score(0),100);
 f.override(()=>null);f.setCommitGate(async()=>{throw Error('synthetic transaction outage');});assert.equal((await core(f)(push(e))).status,503);assert.equal(f.score(0),100);
 f.setCommitGate(async()=>{});assert.equal((await core(f)(push(e))).status,204);assert.equal(f.score(0),98);
});
test('all four mappings and conflict holds remain intact through admission and queue',async()=>{
 const f=fixture(),worker=core(f);for(let i=0;i<4;i++){let e;await ingress(async value=>{e=value;return {messageId:String(i+1)};})(request(f,i));assert.equal((await worker(push(e,String(i+1)))).status,204);assert.equal(f.score(i),98);}
 let held;await ingress(async e=>{held=e;return {messageId:'7'};})(request(f,0,'1800000000.000003',{text:'Fault Srinivas checklist'}));assert.equal((await worker(push(held,'7'))).status,204);assert.equal(f.score(0),98);assert.equal(f.score(3),98);assert([...f.records.values()].some(v=>v.value?.action==='pending'));
});
test('accepted event missing from Slack history retries instead of disappearing, then applies once when visible',async()=>{
 const f=fixture(),e=await envelope(f),saved=[...f.history.entries()];f.history.clear();const worker=core(f);
 assert.equal((await worker(push(e))).status,503);assert.equal(f.score(0),100);
 for(const [k,v]of saved)f.history.set(k,v);assert.equal((await worker(push(e))).status,204);assert.equal((await worker(push(e))).status,204);assert.equal(f.score(0),98);
});
test('owner gateway uses real Firebase verifier contract before forwarding; core rejects gateway on queue route',async()=>{
 const f=readinessFixture(),privateCore=core(f);const forwarded=[];
 const gateway=createOwnerGateway({verifyOwner:createFirebaseVerifier({auth:f.auth,projectId:C.PROJECT,allowedProviders:['password'],now:()=>T}),forward:async(path,token)=>{forwarded.push(path);return privateCore({method:'GET',path,headers:{authorization:'Bearer '+token,'x-azp-relay-authorization':'Bearer gateway'}});}});
 const req={method:'GET',path:'/api/staff-score/readiness',headers:{origin:C.OWNER_ORIGIN,authorization:'Bearer verified'}};
 assert.equal((await gateway({...req,headers:{authorization:'Bearer unverified'}})).status,401);assert.equal(forwarded.length,0);
 const result=await gateway(req);assert.equal(result.status,200);assert.equal(result.body.ready,true);assert.equal(result.body.writesPerformed,false);assert.equal(f.transactions(),0);
 for(const path of [C.WORKER_PATH,'/api/staff-score/slack','/api/staff-score/owner-deduct','https://evil.example'])assert.equal((await gateway({...req,path})).status,404);
 assert.equal((await gateway({...req,method:'POST'})).status,404);assert.equal((await gateway({...req,query:{url:'https://evil.example'}})).status,404);
 assert.equal((await privateCore({...req,headers:{authorization:'Bearer verified','x-azp-relay-authorization':'Bearer push'}})).status,403);
 assert.equal((await privateCore({method:'POST',path:'/api/staff-score/slack',headers:{}})).status,404);
});
test('missing opening balances make owner readiness fail without initialization',async()=>{
 const f=readinessFixture({seed:false}),r=await f.run({method:'GET',path:'/api/staff-score/readiness',headers:{authorization:'Bearer verified'}});assert.equal(r.status,503);assert.equal(r.body.ready,false);assert.equal(r.body.balances.missing,4);assert.equal(f.records.size,0);
});
test('disabled core admits only a tightly shaped authenticated read-only transport probe',async()=>{
 const f=fixture(),run=core(f,{enabled:false}),envelope={version:1,kind:'transport-probe',nonce:'probe-0123456789abcdef'};
 const make=e=>({method:'POST',path:C.WORKER_PATH,headers:{authorization:'Bearer push'},rawBody:Buffer.from(JSON.stringify({subscription:C.SUBSCRIPTION,message:{messageId:'91',publishTime:new Date(T).toISOString(),data:Buffer.from(JSON.stringify(e)).toString('base64')}}))});
 assert.equal((await run(make(envelope))).status,204);
 assert.equal((await run({...make(envelope),headers:{authorization:'Bearer gateway'}})).status,403);
 assert.equal((await run(make({...envelope,raw:'extra payload'}))).status,503);
 assert.equal(f.transactions(),0);assert.equal(f.calls.length,0);assert.equal(f.score(0),100);
});
test('gateway preflight is exact-origin/read-only and caller headers cannot create upstream access',async()=>{
 let auth=0,forward=0;const run=createOwnerGateway({verifyOwner:async()=>{auth++;return {subject:'OTHER'};},forward:async()=>{forward++;}});
 const preflight={method:'OPTIONS',path:'/api/staff-score/readiness',headers:{origin:C.OWNER_ORIGIN,'access-control-request-method':'GET','access-control-request-headers':'authorization'}};
 assert.equal((await run(preflight)).status,204);assert.equal(auth,0);
 assert.equal((await run({...preflight,headers:{...preflight.headers,'access-control-request-headers':'authorization,x-serverless-authorization'}})).status,403);
 assert.equal((await run({method:'GET',path:'/api/staff-score',headers:{authorization:'Bearer bad',origin:'https://evil.example'}})).status,403);assert.equal(auth,0);
 assert.equal((await run({method:'GET',path:'/api/staff-score',headers:{authorization:'Bearer other'}})).status,403);assert.equal(forward,0);
});
test('Google identity verification rejects forged JWT signatures, wrong issuer/audience/email and expired claims',async()=>{
 const {OAuth2Client}=require('google-auth-library'),oauth=new OAuth2Client();const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const n=Date.now();
 const sign=p=>{const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'local'})).toString('base64url'),b=Buffer.from(JSON.stringify(p)).toString('base64url');return h+'.'+b+'.'+createSign('RSA-SHA256').update(h+'.'+b).sign(privateKey).toString('base64url');};
 const verify=async(token,aud)=>(await oauth.verifySignedJwtWithCertsAsync(token,{local:publicKey.export({type:'spki',format:'pem'})},aud,['https://accounts.google.com'])).getPayload();
 const good=claims(C.PUSH_SA,n);await requireServiceIdentity(sign(good),C.PUSH_SA,verify,()=>n);
 for(const patch of [{email:C.GATEWAY_SA},{email_verified:false},{aud:'https://evil.example'},{iss:'https://evil.example'},{exp:Math.floor(n/1000)-1000}])await assert.rejects(requireServiceIdentity(sign({...good,...patch}),C.PUSH_SA,verify,()=>n));
 const jwt=sign(good),parts=jwt.split('.');parts[1]=Buffer.from(JSON.stringify({...good,email:C.GATEWAY_SA})).toString('base64url');await assert.rejects(requireServiceIdentity(parts.join('.'),C.PUSH_SA,verify,()=>n));
});
