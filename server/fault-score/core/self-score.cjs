'use strict';
const {createHash}=require('node:crypto');
const {STAFF}=require('./config.cjs');
const C=require('../relay/constants.cjs');
const {PROJECT_ID,DATABASE_ID}=require('./bindings.cjs');
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const LIMIT=50;
// Administrative configuration only. Never derive identity from a name, phone,
// client-supplied staffId, editable staff record or token custom claim.
function staffForSubject(subject,env=process.env){
 if(env.AZP_STAFF_SELF_SCORE_ENABLED!=='true')fail(503,'Staff score access is not enabled');
 let bindings;try{bindings=JSON.parse(env.AZP_STAFF_SCORE_UID_BINDINGS||'');}catch{fail(503,'Staff identity bindings unavailable');}
 if(!bindings||Array.isArray(bindings)||Object.keys(bindings).length!==STAFF.length||
  !STAFF.every(s=>Object.hasOwn(bindings,s.id)&&typeof bindings[s.id]==='string'&&/^[^\s/]{1,128}$/.test(bindings[s.id])&&bindings[s.id]!==C.OWNER_UID)||
  new Set(Object.values(bindings)).size!==STAFF.length)fail(503,'Staff identity bindings unavailable');
 const staff=STAFF.find(s=>bindings[s.id]===subject);if(!staff)fail(403,'Staff identity not mapped');return staff;
}
function createSelfReader({db,verifyBearer,env=process.env,now=Date.now}){
 return async token=>{
  let p;try{p=await verifyBearer(token);}catch{fail(401,'Authentication required');}
  if(!p||p.verified!==true||p.anonymous!==false||typeof p.subject!=='string')fail(401,'Authentication required');
  const staff=staffForSubject(p.subject,env);
  if(db?.projectId!==PROJECT_ID||db.databaseId!==DATABASE_ID||env.FIRESTORE_EMULATOR_HOST||env.GOOGLE_APPLICATION_CREDENTIALS)fail(503,'Staff score unavailable');
  const ref=db.doc('private_score_balances/'+createHash('sha256').update(JSON.stringify(staff.id)).digest('hex'));
  // Filter before reading and limiting: another employee's rows can never fill
  // this employee's history window. Requires the reviewed composite index.
  const query=db.collection('private_score_audit').where('value.staffId','==',staff.id).orderBy('recordedAt','desc').limit(LIMIT+1);
  return db.runTransaction(async tx=>{
   const balance=await tx.get(ref),audit=await tx.get(query),score=balance.exists?balance.data().value:undefined;
   if(!Number.isInteger(score)||score<0||score>100)fail(503,'Staff score unavailable');
   const rows=audit.docs.map(d=>d.data().value);
   const entries=rows.slice(0,LIMIT).map(r=>{
    if(r?.staffId!==staff.id||!['deduct','reverse'].includes(r.action)||!Number.isInteger(r.before)||!Number.isInteger(r.after)||r.before<0||r.before>100||r.after<0||r.after>100)fail(503,'Staff history unavailable');
    const time=r.action==='deduct'?r.appliedAt:r.at;if(!Number.isSafeInteger(time)||time<0||!Number.isFinite(new Date(time).getTime()))fail(503,'Staff history unavailable');
    return {kind:r.action,points:r.after-r.before,before:r.before,after:r.after,reason:typeof r.reason==='string'?r.reason.slice(0,4000):'',occurredAt:new Date(time).toISOString()};
   });
   return {staffName:staff.names[0],score,maximum:100,history:{entries,limit:LIMIT,hasMore:rows.length>LIMIT},checkedAt:new Date(now()).toISOString()};
  });
 };
}
module.exports={staffForSubject,createSelfReader};
