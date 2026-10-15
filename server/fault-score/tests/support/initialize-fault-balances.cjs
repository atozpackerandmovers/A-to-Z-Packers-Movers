'use strict';
// Inert library: no CLI, credential discovery, startup writes or HTTP route.
const {createHash}=require('node:crypto');
const {PROJECT_ID,DATABASE_ID}=require('../../core/bindings.cjs');
const {STAFF}=require('../../core/config.cjs');
const {createFirebaseVerifier}=require('../../core/domain/firebase-auth.cjs');
const CONFIRMATION='INITIALIZE_FOUR_ABSENT_FAULT_BALANCES_TO_100';
async function initializeAbsentBalances({db,auth,ownerIdToken,confirmation,env=process.env,now=Date.now}={}){
 if(confirmation!==CONFIRMATION||env.AZP_FAULT_ENABLED==='true'||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||env.GOOGLE_APPLICATION_CREDENTIALS||db?.projectId!==PROJECT_ID||db.databaseId!==DATABASE_ID)throw Error('Approved disabled initialization binding and confirmation required');
 const principal=await createFirebaseVerifier({auth,projectId:PROJECT_ID,allowedProviders:['password'],now})(ownerIdToken);
 if(principal.subject!=='88IIhxscilQqcT0XsHqRpE0JC0V2')throw Error('Authenticated owner required');
 const refs=STAFF.map(s=>db.doc('private_score_balances/'+createHash('sha256').update(JSON.stringify(s.id)).digest('hex')));
 return db.runTransaction(async tx=>{
  const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
  for(const snap of snapshots)if(snap.exists){const v=snap.data()?.value;if(!Number.isInteger(v)||v<0||v>100)throw Error('Existing balance invalid; no initialization performed');}
  const created=[],preserved=[];
  for(let i=0;i<refs.length;i++)if(snapshots[i].exists)preserved.push(STAFF[i].id);else{tx.create(refs[i],{value:100});created.push(STAFF[i].id);}
  return {created,preserved,openingScore:100};
 });
}
module.exports={initializeAbsentBalances,CONFIRMATION};
