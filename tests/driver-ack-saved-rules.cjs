// Focused offline evaluation of saved RTDB expressions, not a Firebase emulator.
// Payloads are emitted by the compiled Kotlin protocol tests, not duplicated builders.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'docs/driver-ack-protocol-20261016');
const rules=JSON.parse(fs.readFileSync(path.join(dir,'saved-protocol-rules.json'),'utf8'));
const fixturePaths=['app/build/protocol-wire-fixtures.json','build/protocol-wire-fixtures.json'].map(p=>path.join(root,'integrations/driver-android-ack',p));
const input=fixturePaths.find(p=>fs.existsSync(p));assert(input,'Run Android unit tests to generate real Kotlin protocol payloads first');
const fixtures=JSON.parse(fs.readFileSync(input,'utf8'));
const driver='DRIVER_MAHESH_001',uid='WoVSnY7tchXAVWFeP7UgJEuwlHu2',vehicle='VEHICLE_OD33AR8855';
const prefix=`gpsProduction/v1/drivers/${driver}`,id='OFFLINE_FIXTURE_001';
const ar=rules.acknowledgements.$commandId,cr=rules.commands.$commandId;
function get(t,p){return p.reduce((v,k)=>v?.[k],t)??null;}
function put(t,p,v){let n=t;for(const k of p.slice(0,-1))n=n[k]??={};n[p.at(-1)]=v;}
class Snap{
 constructor(t,p=[]){this.t=t;this.p=p;}
 val(){return get(this.t,this.p);}child(p){return new Snap(this.t,[...this.p,...p.split('/')]);}
 parent(){return new Snap(this.t,this.p.slice(0,-1));}exists(){return this.val()!==null;}
 hasChildren(k){return k.every(x=>this.child(x).exists());}isString(){return typeof this.val()==='string';}
 isNumber(){return typeof this.val()==='number'&&Number.isFinite(this.val());}
}
function check(expr,old,next,p,authUid){return typeof expr==='boolean'?expr:vm.runInNewContext(expr,{auth:{uid:authUid},data:new Snap(old,p),newData:new Snap(next,p),root:new Snap(old),$commandId:id},{timeout:100});}
function validate(old,updates,authUid=uid){
 const next=structuredClone(old);for(const [p,v]of Object.entries(updates))put(next,`${prefix}/${p}`.split('/'),structuredClone(v));
 const ap=`${prefix}/acknowledgements/${id}`.split('/'),cp=`${prefix}/commands/${id}`.split('/'),errors=[];
 for(const [label,e,p]of [['ack-write',ar['.write'],ap],['ack-validation',ar['.validate'],ap],['command-validation',cr['.validate'],cp],['command-status-write',cr.status['.write'],[...cp,'status']],['command-status-transition',cr.status['.validate'],[...cp,'status']]])if(!check(e,old,next,p,authUid))errors.push(label);
 for(const k of Object.keys(get(next,ap)||{})){const e=(ar[k]??ar.$other)['.validate'];if(e!==undefined&&!check(e,old,next,[...ap,k],authUid))errors.push('ack-child:'+k);}
 return{next,errors};
}
const results=[];
for(const [index,f]of fixtures.entries()){
 let old={};put(old,`${prefix}/commands/${id}`.split('/'),{commandId:id,type:f.type,driverId:driver,vehicleId:vehicle,issuedAtMs:1800000000000});
 for(const [step,u]of f.writes.entries()){
  const result=validate(old,u);assert.deepEqual(result.errors,[],`fixture ${index} step ${step}`);
  assert(validate(old,u,'WRONG_UID').errors.includes('ack-write'));
  const extra={...u,[`acknowledgements/${id}/trip_command_receiver_build`]:'NOT_ALLOWED'};
  assert(validate(old,extra).errors.includes('ack-child:trip_command_receiver_build'));
  results.push({fixture:index,type:f.type,step,status:get(result.next,`${prefix}/commands/${id}/status`.split('/')),accepted:true,wrongIdentityRejected:true,extraFieldRejected:true});
  old=result.next;
 }
 assert(validate(old,f.writes.at(-1)).errors.includes('command-status-transition'),'Blind terminal replay must remain forbidden');
}
fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(input,path.join(dir,'kotlin-wire-fixtures.json'));
const report={at:new Date().toISOString(),mode:'OFFLINE_SAVED_RULE_EXPRESSIONS_NOT_EMULATOR',realKotlinPayloads:true,acceptedTransitions:results.length,negativeAssertions:results.length*2+fixtures.length,productionWrites:0,results};
fs.writeFileSync(path.join(dir,'saved-rule-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
