'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHmac,createHash}=require('node:crypto');
const {createRuntime}=require('../core/runtime.cjs'),{STAFF}=require('../core/config.cjs'),{createProductionStore}=require('../core/firestore.cjs'),{timestamp}=require('../core/activation.cjs');
const {PROJECT_ID,DATABASE_ID,AUDIT_READ_LIMIT}=require('../core/bindings.cjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('missing enablement is disabled and activation without an exact cutoff is rejected',()=>{
 const {config}=require('../core/config.cjs');const env={AZP_SLACK_WORKSPACE_URL:'https://synthetic.slack.com'};
 assert.equal(config(env,'mock').activation.enabled,false);
 assert.throws(()=>config({...env,AZP_FAULT_ENABLED:'true'},'mock'));
});
function fixture({active=true,seed=true}={}){
 const records=new Map(),calls=[],history=new Map(),auditReads=[];let count=0,tail=Promise.resolve(),override=()=>null,commitGate=async()=>{};
 const collection=(path,order,cap)=>({path,doc:id=>({path:path+'/'+id}),orderBy:(field,direction)=>collection(path,{field,direction},cap),limit:n=>collection(path,order,n),order,cap});
 const db={projectId:PROJECT_ID,databaseId:DATABASE_ID,doc:path=>({path,get:async()=>({exists:records.has(path),data:()=>records.get(path)})}),collection,runTransaction:fn=>{
  const p=tail.then(async()=>{count++;const writes=new Map();const value=await fn({get:async ref=>{
   if(ref.path.includes('/'))return {exists:records.has(ref.path),data:()=>records.get(ref.path)};
   assert.deepEqual(ref.order,{field:'recordedAt',direction:'desc'});assert.equal(ref.cap,AUDIT_READ_LIMIT+1);
   const rows=[...records].filter(([p])=>p.startsWith(ref.path+'/')).sort((a,b)=>b[1].recordedAt-a[1].recordedAt).slice(0,ref.cap);auditReads.push(rows.length);
   return {docs:rows.map(([,v])=>({data:()=>v}))};
  },set:(ref,value)=>writes.set(ref.path,value),create:(ref,value)=>{if(records.has(ref.path))throw Error('collision');writes.set(ref.path,value);}});await commitGate();for(const [k,v]of writes)records.set(k,v);return value;});tail=p.catch(()=>{});return p;
 }};
 if(seed)for(const s of STAFF)records.set('private_score_balances/'+hash(s.id),{value:100});
 const auth={verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token==='bad')throw Error('bad');return {uid:'88IIhxscilQqcT0XsHqRpE0JC0V2',sub:'88IIhxscilQqcT0XsHqRpE0JC0V2',aud:db.projectId,iss:'https://securetoken.google.com/'+db.projectId,iat:1800000000,exp:1800000100,email_verified:token!=='unverified',firebase:{sign_in_provider:'password'}};}};
 const fetchImpl=async(url,options)=>{
  const method=url.split('/').pop(),params=Object.fromEntries(new URLSearchParams(options.body));calls.push({method,params});assert.equal(options.headers.Authorization,'Bearer synthetic-user-token');assert.equal(options.redirect,'error');
  const custom=override(method,params);if(custom)return custom;
  let body={ok:true};if(method==='auth.test')Object.assign(body,{team_id:'T0BQ4DD754J',user_id:'U0BQYQEMYNL',url:'https://synthetic-workspace.slack.com/'});
  else if(method==='users.info')body.user={id:params.user,team_id:'T0BQ4DD754J',is_bot:false,is_app_user:false,deleted:false};
  else if(method==='conversations.info')body.channel={id:params.channel,is_im:true,is_mpim:false,user:STAFF.find(s=>s.channelId===params.channel)?.slackUserId,context_team_id:'T0BQ4DD754J'};
  else if(method==='conversations.history'){assert.equal(params.oldest,params.latest);assert.equal(params.inclusive,'true');assert.equal(params.limit,'1');body.messages=history.has(params.channel+params.latest)?[history.get(params.channel+params.latest)]:[];}
  else throw Error('Unexpected Slack method');
  return {ok:true,status:200,headers:{get:name=>name==='x-oauth-scopes'?'im:history,im:read,users:read':null},json:async()=>body};
 };
 const env={AZP_FAULT_ENABLED:active?'true':'false',AZP_FAULT_NOT_BEFORE:'1800000000.000002',AZP_SLACK_WORKSPACE_URL:'https://synthetic-workspace.slack.com'};
 const run=createRuntime({db,auth,signingSecret:'synthetic-signing-secret',ownerToken:'synthetic-user-token',env,fetchImpl,now:()=>1800000000000});
 function request(i=0,ts='1800000000.000002',patch={},bodyPatch={}){
  const event={type:'message',channel_type:'im',channel:STAFF[i].channelId,user:'U0BQYQEMYNL',text:'Fault checklist missing',ts,...patch};
  history.set(event.channel+event.ts,{...event});
  const rawBody=Buffer.from(JSON.stringify({type:'event_callback',team_id:'T0BQ4DD754J',api_app_id:'A0C8HU05JCD',authorizations:[{team_id:'T0BQ4DD754J',user_id:'U0BQYQEMYNL',is_bot:false}],event,...bodyPatch}));
  return {method:'POST',path:'/api/staff-score/slack',rawBody,headers:{'x-slack-request-timestamp':'1800000000','x-slack-signature':'v0='+createHmac('sha256','synthetic-signing-secret').update('v0:1800000000:').update(rawBody).digest('hex')}};
 }
 return {records,calls,history,db,auth,fetchImpl,run,request,env,auditReads,transactions:()=>count,override:fn=>{override=fn;},setCommitGate:fn=>{commitGate=fn;},score:i=>records.get('private_score_balances/'+hash(STAFF[i].id))?.value};
}

test('exact-origin preflight needs no auth, Slack or database access; hostile origins and methods fail',async()=>{
 const f=fixture(),base={method:'OPTIONS',path:'/api/staff-score/readiness',headers:{origin:'https://atozpackersmovers.in','access-control-request-method':'GET','access-control-request-headers':'Authorization'}};
 const ok=await f.run(base);assert.equal(ok.status,204);assert.equal(ok.headers['Access-Control-Allow-Origin'],base.headers.origin);assert.equal(ok.headers['Access-Control-Allow-Credentials'],undefined);
 for(const patch of [{origin:'https://evil.example'},{origin:'https://atozpackersmovers.in.evil.example'},{'access-control-request-method':'POST'},{'access-control-request-headers':'authorization,x-evil'}])assert.equal((await f.run({...base,headers:{...base.headers,...patch}})).status,403);
 const denied=await f.run({method:'GET',path:'/api/staff-score',headers:{origin:'https://evil.example',authorization:'Bearer verified'}});assert.equal(denied.status,403);assert.equal(denied.headers['Access-Control-Allow-Origin'],undefined);assert.equal(f.calls.length,0);assert.equal(f.transactions(),0);
 const auth=await f.run({method:'GET',path:'/api/staff-score',headers:{origin:base.headers.origin}});assert.equal(auth.status,401);assert.equal(auth.headers['Access-Control-Allow-Origin'],base.headers.origin);
});
function readinessFixture({defaultAllowed=false,seed=true}={}){
 const f=fixture({active:false,seed});let defaultReads=0;
 const defaultDb={projectId:PROJECT_ID,databaseId:'(default)',doc:path=>({get:async()=>{defaultReads++;assert.match(path,/^private_score_balances\/__fault_readiness_probe_/);if(defaultAllowed)return {exists:false};throw Object.assign(Error('private details'),{code:7});}})};
 const run=createRuntime({db:f.db,defaultDb,auth:f.auth,signingSecret:'synthetic-signing-secret',ownerToken:'synthetic-user-token',env:f.env,fetchImpl:f.fetchImpl,now:()=>1800000000000});
 return {...f,run,defaultReads:()=>defaultReads};
}
const readinessRequest=token=>({method:'GET',path:'/api/staff-score/readiness',headers:{authorization:'Bearer '+token,origin:'https://atozpackersmovers.in'}});
test('readiness denies unverified owner before probes and passes exact identity, scope, DM and database checks without writes',async()=>{
 const f=readinessFixture({seed:false});assert.equal((await f.run(readinessRequest('unverified'))).status,401);assert.equal(f.calls.length,0);assert.equal(f.defaultReads(),0);
 const result=await f.run(readinessRequest('verified'));assert.equal(result.status,503);assert.equal(result.body.ready,false);assert.deepEqual(result.body.balances,{missing:4,valid:0,invalid:0});assert.equal(result.body.slack.verifiedDmCount,4);assert.equal(result.body.scoringEnabled,false);assert.equal(result.body.writesPerformed,false);assert.equal(f.records.size,0);assert.equal(f.transactions(),0);assert.equal(f.calls.length,10);assert(!JSON.stringify(result).includes('synthetic-user-token'));
});
test('readiness fails closed on default-database access, invalid balance, missing scopes, wrong workspace URL and Slack failure',async()=>{
 const accessible=readinessFixture({defaultAllowed:true});assert.equal((await accessible.run(readinessRequest('verified'))).status,503);
 const invalid=readinessFixture();invalid.records.set('private_score_balances/'+hash(STAFF[0].id),{value:null});assert.equal((await invalid.run(readinessRequest('verified'))).status,503);
 for(const body of [{ok:true,team_id:'T0BQ4DD754J',user_id:'U0BQYQEMYNL',url:'https://wrong.slack.com/'},{ok:false}]){
  const f=readinessFixture();f.override(m=>m==='auth.test'?{ok:true,status:200,headers:{get:()=>null},json:async()=>body}:null);const r=await f.run(readinessRequest('verified'));assert.equal(r.status,503);assert.equal(f.transactions(),0);assert.equal(r.body.writesPerformed,false);
 }
});
test('success acknowledgement waits for commit; replay after a lost response does not deduct again',async()=>{
 const f=fixture();let entered,release;const enteredPromise=new Promise(r=>entered=r),gate=new Promise(r=>release=r);f.setCommitGate(async()=>{entered();await gate;});
 let settled=false;const request=f.request(),pending=f.run(request).then(r=>{settled=true;return r;});await enteredPromise;assert.equal(settled,false);assert.equal(f.score(0),100);release();assert.equal((await pending).body.status,'applied');assert.equal(f.score(0),98);
 assert.equal((await f.run(request)).body.status,'duplicate');assert.equal(f.score(0),98);
});
test('initializer creates exactly four absent balances once, preserves existing values and rolls back invalid state',async()=>{
 const {initializeAbsentBalances,CONFIRMATION}=require('./support/initialize-fault-balances.cjs');
 const f=fixture({active:false,seed:false}),options={db:f.db,auth:f.auth,ownerIdToken:'verified',confirmation:CONFIRMATION,env:f.env,now:()=>1800000000000};
 const outcomes=await Promise.all(Array.from({length:5},()=>initializeAbsentBalances(options)));assert.equal(outcomes.reduce((n,r)=>n+r.created.length,0),4);assert.equal(f.records.size,4);assert(STAFF.every((_,i)=>f.score(i)===100));
 f.records.set('private_score_balances/'+hash(STAFF[0].id),{value:78});assert.equal((await initializeAbsentBalances(options)).created.length,0);assert.equal(f.score(0),78);
 const bad=fixture({active:false,seed:false});bad.records.set('private_score_balances/'+hash(STAFF[2].id),{value:null});await assert.rejects(initializeAbsentBalances({...options,db:bad.db,auth:bad.auth}),/invalid/);assert.equal(bad.records.size,1);
 for(const patch of [{confirmation:'yes'},{ownerIdToken:'unverified'},{env:{...f.env,AZP_FAULT_ENABLED:'true'}},{db:{...f.db,databaseId:'(default)'}}])await assert.rejects(initializeAbsentBalances({...options,...patch}));
});
test('production guard rejects wrong project, emulator environment and file credentials',()=>{
 const f=fixture();for(const options of [{projectId:'demo-test',env:{}},{projectId:'az-packers-quotation',env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8087'}},{projectId:'az-packers-quotation',env:{FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'}},{projectId:'az-packers-quotation',env:{GOOGLE_APPLICATION_CREDENTIALS:'key.json'}}])assert.throws(()=>createProductionStore({db:f.db,...options}));
});

test('database guard rejects default, wrong and missing database before any access',async()=>{
 const f=fixture();for(const databaseId of ['(default)','other',undefined,'']){
  const db={...f.db,databaseId,collection:()=>{throw Error('Database accessed before guard');}};
  assert.throws(()=>createProductionStore({db,projectId:PROJECT_ID,env:{}}),/Approved production Firestore binding required/);
 }
 const store=createProductionStore({db:f.db,projectId:PROJECT_ID,env:{}});f.db.databaseId='(default)';
 assert.throws(()=>store.transaction(()=>{}),/Approved production Firestore binding required/);assert.equal(f.transactions(),0);
});

test('owner audit window reads at most 101 rows, returns newest 100 and explicitly reports truncation',async()=>{
 const f=fixture();for(let i=0;i<150;i++)f.records.set('private_score_audit/a'+i,{value:{key:'event'+i},recordedAt:i});
 const request=token=>({method:'GET',path:'/api/staff-score/audit',headers:{authorization:'Bearer '+token}});
 assert.equal((await f.run(request('unverified'))).status,401);assert.equal(f.auditReads.length,0);
 const result=await f.run(request('verified'));assert.equal(result.status,200);assert.equal(result.body.entries.length,100);
 assert.equal(result.body.entries[0].key,'event149');assert.equal(result.body.entries[99].key,'event50');
 assert.equal(result.body.hasMore,true);assert.equal(result.body.limit,100);assert.equal(result.body.order,'newest-first');assert.deepEqual(f.auditReads,[101]);
 const empty=fixture();const emptyResult=await empty.run(request('verified'));assert.deepEqual(emptyResult.body,{entries:[],limit:100,hasMore:false,order:'newest-first'});
 for(let i=0;i<100;i++)empty.records.set('private_score_audit/a'+i,{value:{key:'event'+i},recordedAt:i});
 const full=await empty.run(request('verified'));assert.equal(full.body.entries.length,100);assert.equal(full.body.hasMore,false);
});
test('disabled by default: signed challenge works but events cannot call Slack or Firestore',async()=>{
 const f=fixture({active:false});assert.equal((await f.run(f.request())).body.status,'inactive');const challenge=f.request(0,undefined,{}, {type:'url_verification',challenge:'synthetic-challenge'});assert.deepEqual((await f.run(challenge)).body,{challenge:'synthetic-challenge'});assert.equal(f.calls.length,0);assert.equal(f.transactions(),0);
});
test('cutoff uses exact decimals: older event ignored, boundary accepted, future event ignored',async()=>{
 const f=fixture();assert(timestamp('1800000000.000000000001')<timestamp('1800000000.000000000002'));
 assert.equal((await f.run(f.request(0,'1800000000.000001999999'))).body.status,'ignored');assert.equal(f.calls.length,0);
 assert.equal((await f.run(f.request())).body.status,'applied');assert.equal(f.score(0),98);
 assert.equal((await f.run(f.request(0,'1800000100.000000'))).body.status,'ignored');assert.equal(f.score(0),98);
});
test('all four verified mappings deduct exactly two and isolate balances, including Srinivas',async()=>{
 const f=fixture();for(let i=0;i<4;i++){assert.equal((await f.run(f.request(i))).body.status,'applied');assert.equal(f.score(i),98);}
 assert.equal(f.calls.filter(x=>x.method==='auth.test').length,4);
 assert.equal(STAFF[3].id,'INDOOR_STAFF_9JJREB');assert.equal(STAFF[3].channelId,'D0C8QBP090U');assert.equal(STAFF[3].slackUserId,'U0C859SS1LP');
});
test('twenty concurrent Slack retries produce one deduction and one audit',async()=>{
 const f=fixture(),r=f.request(3);const all=await Promise.all(Array.from({length:20},()=>f.run(r)));assert.equal(all.filter(r=>r.body.status==='applied').length,1);assert.equal(all.filter(r=>r.body.status==='duplicate').length,19);assert.equal(f.score(3),98);assert.equal([...f.records.keys()].filter(x=>x.startsWith('private_score_audit/')).length,1);
});
test('Srinivas name conflicts hold privately without deducting or redirecting another balance',async()=>{
 const f=fixture();assert.equal((await f.run(f.request(0,undefined,{text:'Fault Srinivas checklist'}))).body.status,'pending');
 assert.equal(f.score(0),100);assert.equal(f.score(3),100);
 assert.equal((await f.run(f.request(3,undefined,{text:'Fault Srinivas checklist'}))).body.status,'applied');assert.equal(f.score(3),98);assert.equal(f.score(0),100);
});
test('wrong app, owner, DM and tampered signature cannot make a Slack API call or write',async()=>{
 const f=fixture();for(const r of [f.request(0,undefined,{}, {api_app_id:'AOTHER'}),f.request(0,undefined,{user:'UOTHER'}),f.request(0,undefined,{channel:'DOTHER'}),{...f.request(),headers:{}}]){const response=await f.run(r);assert.notEqual(response.body.status,'applied');}assert.equal(f.calls.length,0);assert.equal(f.transactions(),0);
});
test('history text/author/edit mismatch and bot or wrong-peer identities fail closed',async()=>{
 for(const change of [{text:'Fault different'},{user:'UOTHER'},{edited:{ts:'1'}},{bot_id:'BOTHER'}]){const f=fixture(),r=f.request();Object.assign(f.history.get(STAFF[0].channelId+'1800000000.000002'),change);assert.equal((await f.run(r)).body.status,'ignored');assert.equal(f.transactions(),0);}
 for(const method of ['auth.test','users.info','conversations.info']){const f=fixture();f.override(m=>m===method?{ok:true,status:200,json:async()=>({ok:true,team_id:'OTHER',user:{id:'OTHER',is_bot:true},channel:{id:'OTHER',is_im:false}})}:null);assert.equal((await f.run(f.request())).body.status,'ignored');assert.equal(f.transactions(),0);}
});
test('Slack 429/timeout failures return retryable unavailable and never deduct',async()=>{
 const f=fixture();f.override(m=>m==='conversations.history'?{ok:false,status:429,headers:{get:()=> '60'}}:null);assert.equal((await f.run(f.request())).status,503);assert.equal(f.transactions(),0);
 const g=fixture();g.override(()=>{throw Error('network token must not leak');});const response=await g.run(g.request());assert.equal(response.status,503);assert.equal(JSON.stringify(response).includes('token must not leak'),false);assert.equal(g.transactions(),0);
});
test('no automatic opening balances; low balance causes no partial receipt or audit',async()=>{
 const f=fixture({seed:false});assert.equal((await f.run(f.request())).status,409);assert.equal(f.records.size,0);
 const g=fixture();g.records.set('private_score_balances/'+hash(STAFF[0].id),{value:1});assert.equal((await g.run(g.request())).status,409);assert.equal(g.records.size,4);assert.equal(g.score(0),1);
});
test('owner readback requires verified-email bearer; all manual mutation routes are absent',async()=>{
 const f=fixture();for(const token of ['bad','unverified'])assert.equal((await f.run({method:'GET',path:'/api/staff-score',headers:{authorization:'Bearer '+token}})).status,401);
 const ok=await f.run({method:'GET',path:'/api/staff-score',headers:{authorization:'Bearer verified'}});assert.equal(ok.status,200);assert.equal(ok.body.staff.length,4);assert.equal(ok.body.staff.every(x=>x.score===100),true);
 for(const route of ['reverse','resolve','owner-deduct','owner-review'])assert.equal((await f.run({method:'POST',path:'/api/staff-score/'+route,headers:{authorization:'Bearer verified'}})).status,404);
});
