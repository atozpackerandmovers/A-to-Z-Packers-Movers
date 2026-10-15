'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {CALENDARS,cycleAt,adoptCycles,ensureCycle,rolloverAll}=require('../core/cycles.cjs');
const {createProductionStore}=require('../core/firestore.cjs'),{createRuntime}=require('../core/runtime.cjs');
const {fixture}=require('./fixture.cjs'),{config}=require('../core/config.cjs');
const {createCoreRouter}=require('../relay/core-router.cjs'),C=require('../relay/constants.cjs');
const IDs=Object.keys(CALENDARS),date=s=>Date.parse(s+'T00:00:00+05:30'),ADOPT=date('2026-10-15');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const path=(table,key)=>'private_score_'+table+'/'+hash(key);
function setup(){const f=fixture(),store=createProductionStore({db:f.db,projectId:C.PROJECT,env:{}});return {...f,store};}
const archives=f=>[...f.records].filter(([p])=>p.startsWith('private_score_cycle_archives/')).map(([,v])=>v.value);
async function arm(f){await f.store.transaction(tx=>adoptCycles(tx,ADOPT));await rolloverAll({...f.store,now:()=>ADOPT});}
function runFault(f,now,ts=now,i=0){const request=f.request(i,(ts/1000).toFixed(6));return createRuntime({db:f.db,auth:f.auth,fetchImpl:f.fetchImpl,signingSecret:'synthetic-signing-secret',ownerToken:'synthetic-user-token',env:{...f.env,AZP_FAULT_NOT_BEFORE:'1792063487.000000',AZP_SCORE_CYCLE_ROLLOVER_ENABLED:'true'},now:()=>now,signatureNow:()=>1800000000000})(request);}
test('verified four monthly boundaries use IST midnight and clamp short months',()=>{
 assert.deepEqual(IDs.map(id=>cycleAt(id,ADOPT).next),['2026-10-27','2026-11-01','2026-10-30','2026-11-01']);
 assert.equal(cycleAt(IDs[0],date('2026-10-27')-1).start,'2026-09-27');
 assert.equal(cycleAt(IDs[0],date('2026-10-27')).start,'2026-10-27');
 assert.equal(cycleAt(IDs[2],date('2027-02-28')).next,'2027-03-30');
 assert.equal(cycleAt(IDs[2],date('2028-02-28')).next,'2028-02-29');
 assert.equal(cycleAt(IDs[2],date('2028-02-29')).end,'2028-03-29');
 assert.throws(()=>cycleAt('OTHER',ADOPT));assert.throws(()=>cycleAt(IDs[0],date('2026-08-26')));
});
test('feature defaults disabled; adoption and arming preserve all current deductions and prior history',async()=>{
 assert.equal(config({AZP_SLACK_WORKSPACE_URL:'https://synthetic.slack.com'},'secret').cycleRolloverEnabled,false);
 const f=setup();f.records.set(path('balances',IDs[0]),{value:78});f.records.set('private_score_audit/original',{value:{action:'deduct',before:80,after:78}});
 const before=structuredClone([...f.records]);await arm(f);await arm(f);
 for(const [p,v]of before)assert.deepEqual(f.records.get(p),v);assert.equal(archives(f).length,0);
 assert(IDs.every(id=>f.records.get(path('cycles',id)).value.armed===true));
});
test('unarmed migration crossing boundary fails atomically without wiping deductions',async()=>{
 const f=setup();await f.store.transaction(tx=>adoptCycles(tx,ADOPT));f.records.set(path('balances',IDs[0]),{value:96});
 const before=structuredClone([...f.records]);await assert.rejects(rolloverAll({...f.store,now:()=>date('2026-11-01')}),/before arming/);assert.deepEqual([...f.records],before);
});
test('only due employees reset; repeated and missed runs preserve immutable archives',async()=>{
 const f=setup();for(const id of IDs)f.records.set(path('balances',id),{value:94});await arm(f);
 await rolloverAll({...f.store,now:()=>date('2026-10-27')});assert.deepEqual(IDs.map(id=>f.records.get(path('balances',id)).value),[100,94,94,94]);
 const first=structuredClone(archives(f));await rolloverAll({...f.store,now:()=>date('2026-10-27')});assert.deepEqual(archives(f),first);
 await rolloverAll({...f.store,now:()=>date('2027-01-02')});assert.equal(archives(f).length,12);assert(IDs.every(id=>f.records.get(path('balances',id)).value===100));
 assert.equal(archives(f).filter(a=>a.before===94).length,4);assert.equal(archives(f).filter(a=>a.before===100).length,8);assert.deepEqual(archives(f)[0],first[0]);
});
test('invalid employee state and commit failure roll back every employee reset',async()=>{
 const f=setup();await arm(f);f.records.set(path('balances',IDs[3]),{value:null});const before=structuredClone([...f.records]);
 await assert.rejects(rolloverAll({...f.store,now:()=>date('2026-11-01')}));assert.deepEqual([...f.records],before);
 f.records.set(path('balances',IDs[3]),{value:98});const valid=structuredClone([...f.records]);f.setCommitGate(async()=>{throw Error('simulated commit failure');});
 await assert.rejects(rolloverAll({...f.store,now:()=>date('2026-11-01')}));assert.deepEqual([...f.records],valid);
});
test('concurrent new-cycle Fault, scheduler and duplicate delivery deduct exactly once',async()=>{
 for(const schedulerFirst of [false,true]){
  const f=setup();f.records.set(path('balances',IDs[0]),{value:86});await arm(f);const now=date('2026-10-27');
  const jobs=Array.from({length:12},(_,i)=>()=>i%2?runFault(f,now):rolloverAll({...f.store,now:()=>now}));if(schedulerFirst)jobs.reverse();await Promise.all(jobs.map(j=>j()));
  assert.equal(f.score(0),98);assert.equal(archives(f).length,1);assert.equal(archives(f)[0].before,86);
  const second=await runFault(f,now+1000);assert.equal(second.body.status,'applied');assert.equal(f.score(0),96);
  await rolloverAll({...f.store,now:()=>now+2000});assert.equal(f.score(0),96);
  assert.equal([...f.records].filter(([p])=>p.startsWith('private_score_audit/')).length,2);
 }
});
test('late prior-cycle Fault is held without historical deduction; future-cycle delivery retries',async()=>{
 const f=setup();await arm(f);const boundary=date('2026-10-27');
 const before=structuredClone([...f.records]);assert.equal((await runFault(f,boundary-1000,boundary)).status,503);assert.deepEqual([...f.records],before);
 const late=await runFault(f,boundary+1000,boundary-1000);assert.equal(late.body.status,'pending');assert.equal(f.score(0),100);
 const held=[...f.records].find(([p])=>p.startsWith('private_score_receipts/'))[1].value;assert.equal(held.holdReason,'previous-cycle-delivery');
 assert.equal((await runFault(f,boundary+2000,boundary-1000)).body.status,'duplicate');assert.equal(archives(f).length,1);
});
test('native transaction conflict retries recompute reset and Fault from committed balances',async()=>{
 const f=setup();await arm(f);let retries=0;
 // Optimistic native-transaction stand-in: concurrent snapshots, read-version
 // validation, aborted attempt writes discarded, callback retried from fresh data.
 f.db.runTransaction=async fn=>{
  for(let attempt=0;attempt<50;attempt++){
   const snapshot=structuredClone(f.records),reads=new Set(),writes=new Map();let writing=false;
   const result=await fn({get:async ref=>{assert.equal(writing,false,'all native reads precede writes');reads.add(ref.path);return {exists:snapshot.has(ref.path),data:()=>snapshot.get(ref.path)};},set:(ref,v)=>{writing=true;writes.set(ref.path,v);},create:(ref,v)=>{writing=true;assert(!snapshot.has(ref.path));writes.set(ref.path,v);}});
   await new Promise(resolve=>setImmediate(resolve));
   if([...reads].some(p=>JSON.stringify(snapshot.get(p))!==JSON.stringify(f.records.get(p)))){retries++;continue;}
   for(const [p,v]of writes)f.records.set(p,v);return result;
  }
  throw Error('retry limit');
 };
 const now=date('2026-10-27');const results=await Promise.all([rolloverAll({...f.store,now:()=>now}),...Array.from({length:8},()=>runFault(f,now)),runFault(f,now+1000)]);
 assert(retries>0);assert.equal(results.filter(r=>r.body?.status==='applied').length,2);assert.equal(f.score(0),96);assert.equal(archives(f).length,1);
 assert.equal([...f.records].filter(([p])=>p.startsWith('private_score_audit/')).length,2);
});
test('archive conflict and backward clock fail closed',async()=>{
 const f=setup();await arm(f);const start=cycleAt(IDs[0],ADOPT).start;f.records.set(path('cycle_archives',JSON.stringify([IDs[0],start])),{value:{preserve:'existing'}});
 const before=structuredClone([...f.records]);await assert.rejects(f.store.transaction(tx=>ensureCycle(tx,IDs[0],date('2026-10-27'))),/conflicts/);assert.deepEqual([...f.records],before);
 await assert.rejects(f.store.transaction(tx=>ensureCycle(tx,IDs[0],date('2026-09-26'))),/backwards/);
});
test('scheduler envelope requires existing push identity, exact fields, fresh queue message and enabled worker',async()=>{
 let calls=0;const now=ADOPT,verifyGoogle=async token=>({email:token==='push'?C.PUSH_SA:C.GATEWAY_SA,email_verified:true,aud:C.CORE_URL,iss:'https://accounts.google.com',sub:'123456789012345678901',iat:now/1000-1,exp:now/1000+3600});
 const make=patch=>createCoreRouter({enabled:true,now:()=>now,verifyGoogle,runCycleRollover:async()=>{calls++;},...patch});
 const req=(envelope={kind:'cycle-rollover',version:1},token='push',published=now)=>({method:'POST',path:C.WORKER_PATH,headers:{authorization:'Bearer '+token},rawBody:Buffer.from(JSON.stringify({subscription:C.SUBSCRIPTION,message:{messageId:'1',publishTime:new Date(published).toISOString(),data:Buffer.from(JSON.stringify(envelope)).toString('base64')}}))});
 assert.equal((await make()(req())).status,204);assert.equal(calls,1);
 assert.equal((await make()(req(undefined,'gateway'))).status,403);
 for(const r of [req({kind:'cycle-rollover',version:1,staffId:IDs[0]}),req({kind:'cycle-rollover',version:2}),req(undefined,'push',now-8*86400000)])assert.equal((await make()(r)).status,503);
 assert.equal((await make({enabled:false})(req())).status,503);assert.equal((await make({runCycleRollover:async()=>{throw Error('disabled');}})(req())).status,503);assert.equal(calls,1);
});
