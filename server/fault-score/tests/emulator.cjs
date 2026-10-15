'use strict';
// Real loopback Firestore; all Google/Slack identities and queue envelopes are synthetic.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {Firestore}=require('firebase-admin/firestore'),{fixture}=require('./fixture.cjs'),{STAFF}=require('../core/config.cjs');
const C=require('../relay/constants.cjs'),{createIngress}=require('../relay/ingress.cjs'),{createCoreRouter}=require('../relay/core-router.cjs'),{createRuntime}=require('../core/runtime.cjs');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8087');assert.equal(process.env.GCLOUD_PROJECT,'demo-fault-relay');
const db=new Firestore({projectId:'demo-fault-relay',databaseId:'fault-score',host:'127.0.0.1:8087',ssl:false});
const ref=i=>db.doc('private_score_balances/'+createHash('sha256').update(JSON.stringify(STAFF[i].id)).digest('hex'));
(async()=>{
 // Clear only this test's bounded synthetic collections on the guarded loopback demo.
 for(const collection of ['private_score_balances','private_score_receipts','private_score_audit']){const rows=await db.collection(collection).get();assert(rows.size<=100,'Unexpected demo state');const batch=db.batch();for(const doc of rows.docs)batch.delete(doc.ref);if(rows.size)await batch.commit();}
 const f=fixture(),accepted=[];let time=1800000000000,failCommit=false;const facade={projectId:C.PROJECT,databaseId:'fault-score',doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:fn=>db.runTransaction(async tx=>{const r=await fn(tx);if(failCommit)throw Error('Synthetic aborted transaction');return r;})};
 const deps={db:facade,auth:f.auth,env:f.env,signingSecret:'synthetic-signing-secret',ownerToken:'synthetic-user-token',fetchImpl:f.fetchImpl,now:()=>time};
 const ingress=createIngress({secret:deps.signingSecret,env:{AZP_RELAY_ACCEPT_EVENTS:'true',AZP_FAULT_NOT_BEFORE:f.env.AZP_FAULT_NOT_BEFORE},now:()=>1800000000000,publish:async e=>{accepted.push(e);return {messageId:String(accepted.length)};}});
 const router=createCoreRouter({secret:deps.signingSecret,enabled:true,now:()=>time,ownerRuntime:createRuntime(deps),verifyGoogle:async()=>({email:C.PUSH_SA,email_verified:true,aud:C.CORE_URL,iss:'https://accounts.google.com',sub:'123456789',iat:Math.floor(time/1000),exp:Math.floor(time/1000)+3600}),runQueued:({rawBody,headers,admittedAt})=>createRuntime({...deps,signatureNow:()=>admittedAt})({method:'POST',path:'/api/staff-score/slack',rawBody,headers})});
 const delivery=i=>({method:'POST',path:C.WORKER_PATH,headers:{authorization:'Bearer synthetic-push'},rawBody:Buffer.from(JSON.stringify({subscription:C.SUBSCRIPTION,message:{messageId:String(i+1),publishTime:new Date(accepted[i].admittedAt).toISOString(),data:Buffer.from(JSON.stringify(accepted[i])).toString('base64')}}))});
 for(let i=0;i<4;i++){await ref(i).create({value:100});assert.equal((await ingress({...f.request(i),path:'/slack/events'})).status,200);}
 time+=600000;
 const results=await Promise.all(Array.from({length:10},()=>router(delivery(0))));assert(results.every(r=>r.status===204));assert.equal((await ref(0).get()).data().value,98);
 await router(delivery(0));assert.equal((await ref(0).get()).data().value,98);
 assert.equal((await db.collection('private_score_audit').get()).size,1);
 await ref(1).delete();assert.equal((await router(delivery(1))).status,503);assert.equal((await ref(1).get()).exists,false);assert.equal((await db.collection('private_score_audit').get()).size,1);
 await ref(1).create({value:100});assert.equal((await router(delivery(1))).status,204);assert.equal((await ref(1).get()).data().value,98);
 const historyKey=STAFF[3].channelId+'1800000000.000002',original=f.history.get(historyKey);f.history.delete(historyKey);assert.equal((await router(delivery(3))).status,503);assert.equal((await ref(3).get()).data().value,100);f.history.set(historyKey,original);
 failCommit=true;assert.equal((await router(delivery(3))).status,503);assert.equal((await ref(3).get()).data().value,100);failCommit=false;assert.equal((await router(delivery(3))).status,204);assert.equal((await ref(3).get()).data().value,98);assert.equal((await router(delivery(2))).status,204);assert.equal((await ref(2).get()).data().value,98);
 assert.equal((await db.collection('private_score_audit').get()).size,4);
 const defaultDb=new Firestore({projectId:'demo-fault-relay',host:'127.0.0.1:8087',ssl:false});assert.equal((await defaultDb.collection('private_score_balances').get()).size,0);await defaultDb.terminate();
 console.log('PASS actual loopback Firestore: 10 concurrent queued deliveries after 10-minute delay deduct once; lost-response replay is idempotent; missing balance and aborted commit return retryable failure without partial writes; repaired retry succeeds; all four mappings deduct exactly 2; demo default database untouched. Queue and identity are synthetic, not live Pub/Sub/IAM evidence.');
 await db.terminate();
})().catch(async e=>{console.error(e.message);await db.terminate();process.exitCode=1;});
