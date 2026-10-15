'use strict';
const assert=require('node:assert/strict'),{createHmac,createHash}=require('node:crypto');
const {createRuntime}=require('../core/runtime.cjs'),{STAFF}=require('../core/config.cjs'),{PROJECT_ID,DATABASE_ID,AUDIT_READ_LIMIT}=require('../core/bindings.cjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
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

function readinessFixture({defaultAllowed=false,seed=true}={}){
 const f=fixture({active:false,seed});let defaultReads=0;
 const defaultDb={projectId:PROJECT_ID,databaseId:'(default)',doc:path=>({get:async()=>{defaultReads++;assert.match(path,/^private_score_balances\/__fault_readiness_probe_/);if(defaultAllowed)return {exists:false};throw Object.assign(Error('private details'),{code:7});}})};
 const run=createRuntime({db:f.db,defaultDb,auth:f.auth,signingSecret:'synthetic-signing-secret',ownerToken:'synthetic-user-token',env:f.env,fetchImpl:f.fetchImpl,now:()=>1800000000000});
 return {...f,run,defaultReads:()=>defaultReads};
}

module.exports={fixture,readinessFixture};
