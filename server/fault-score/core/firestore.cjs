'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {PROJECT_ID,DATABASE_ID,AUDIT_READ_LIMIT}=require('./bindings.cjs');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Production-only adapter; the original emulator guard remains unchanged.
function createProductionStore({db,projectId,env=process.env,now=Date.now}={}){
 function assertBinding(){
  if(projectId!==PROJECT_ID||db?.projectId!==PROJECT_ID||db?.databaseId!==DATABASE_ID||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||env.GOOGLE_APPLICATION_CREDENTIALS||typeof db.runTransaction!=='function'||typeof db.collection!=='function'||typeof db.doc!=='function')throw Error('Approved production Firestore binding required');
 }
 assertBinding();
 const namespace='score';
 const root='private_'+namespace+'_';
 const tables=namespace==='score'?{Score:'balances',Receipt:'receipts',Cycle:'cycles',CycleArchive:'cycle_archives'}:{Task:'tasks',Work:'work',Publication:'publications',Operation:'operations'};
 const audits=db.collection(root+'audit');
 return {transaction:fn=>{
  assertBinding();
  return db.runTransaction(async native=>{
   const cache=new Map();let auditCache;
   // Discover reads by replaying the PURE synchronous domain callback. Writes remain
   // buffered. Native Firestore sees ALL reads before the first write.
   for(let pass=0;pass<512;pass++){
    const writes=new Map(),audit=[],tx={};
    for(const [name,table]of Object.entries(tables)){
     tx['get'+name]=key=>{
      if(typeof key!=='string'||!key)throw Error('Invalid private identity');
      const path=root+table+'/'+digest(key);
      if(writes.has(path))return structuredClone(writes.get(path).value);
      if(!cache.has(path))throw {needRead:path};
      return structuredClone(cache.get(path));
     };
     tx['set'+name]=(key,value)=>{
      if(typeof key!=='string'||!key)throw Error('Invalid private identity');
      const path=root+table+'/'+digest(key);writes.set(path,{value:structuredClone(value)});
     };
    }
    tx.appendAudit=value=>audit.push(structuredClone(value));
    tx.listAudit=()=>{if(auditCache===undefined)throw {needAudit:true};return structuredClone(auditCache);};
    try{
     const result=fn(tx);if(result&&typeof result.then==='function')throw Error('Synchronous domain callback required');
     for(const [path,{value}]of writes)native.set(db.doc(path),{value});
     for(const value of audit)native.create(audits.doc(randomUUID()),{value,recordedAt:now()});
     return result;
    }catch(e){
     if(e.needRead){const snap=await native.get(db.doc(e.needRead));cache.set(e.needRead,snap.exists?snap.data().value:undefined);continue;}
     // One extra row lets the owner API state explicitly when this window is truncated.
     if(e.needAudit){const snap=await native.get(audits.orderBy('recordedAt','desc').limit(AUDIT_READ_LIMIT+1));auditCache=snap.docs.map(d=>d.data().value);continue;}
     throw e;
    }
   }
   throw Error('Private transaction read limit exceeded');
 });}};
}
module.exports={createProductionStore};
