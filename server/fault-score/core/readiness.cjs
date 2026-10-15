'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {PROJECT_ID,DATABASE_ID}=require('./bindings.cjs');
const {STAFF}=require('./config.cjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function checkReadiness({db,defaultDb,slack,activation,now=Date.now}){
 const start=now();
 const checks={slack:false,namedDatabaseRead:false,defaultDatabaseDenied:false};
 let balances={missing:0,valid:0,invalid:0},slackDetails;
 const results=await Promise.allSettled([
  slack.readiness().then(result=>{slackDetails=result;checks.slack=result.ready===true;}),
  (async()=>{
   if(db?.projectId!==PROJECT_ID||db.databaseId!==DATABASE_ID)throw Error('Binding');
   const snapshots=await Promise.all(STAFF.map(s=>db.doc('private_score_balances/'+hash(s.id)).get()));
   for(const snap of snapshots){if(!snap.exists)balances.missing++;else{const v=snap.data()?.value;if(Number.isInteger(v)&&v>=0&&v<=100)balances.valid++;else balances.invalid++;}}
   checks.namedDatabaseRead=true;
  })(),
  (async()=>{
   if(defaultDb?.projectId!==PROJECT_ID||defaultDb.databaseId!=='(default)')throw Error('Binding');
   // This non-hash ID is never produced by the score adapter. No document is written.
   try{await defaultDb.doc('private_score_balances/__fault_readiness_probe_'+randomUUID()).get();}
   catch(e){if(e.code===7||e.code==='permission-denied'||e.code==='PERMISSION_DENIED'){checks.defaultDatabaseDenied=true;return;}throw e;}
  })()
 ]);
 return {ready:Object.values(checks).every(Boolean)&&balances.invalid===0&&balances.valid===STAFF.length&&balances.missing===0,checks,balances,
  slack:slackDetails||{ready:false},checkFailures:results.filter(r=>r.status==='rejected').length,
  scoringEnabled:activation.enabled,elapsedMs:Math.max(0,now()-start),writesPerformed:false,
  limitations:['Saved token app identity requires dedicated-app signed challenge/event verification.','Owner readiness does not verify Pub/Sub IAM, dead-letter forwarding, or Slack cold-start acknowledgement latency; deployment probes remain required.']};
}
module.exports={checkReadiness};
