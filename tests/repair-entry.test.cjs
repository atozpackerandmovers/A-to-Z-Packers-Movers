const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const R=require('../repair-entry.js');
const valid={vehicle_number:'OD 05 BD 8855',driver_name:'Mahesh',repair_date:'2026-09-28',garage_name:'Test Garage',garage_mobile:'9876543210',repair_status:'Breakdown',repair_type:'Brake',vehicle_km_reading:'12000',next_service_due_km:'15000',description:'Brake lining replaced',amount:'1250',bill_available:'No',remarks:'Garage did not provide bill'};
test('shared schema rejects every missing required field and bad amounts, date, mobile and meter',()=>{
 assert.deepEqual(R.validate(valid,{today:'2026-09-28'}),[]);
 for(const key of R.required)assert.ok(R.validate({...valid,[key]:''}).some(e=>e.key===key),key);
 for(const amount of ['0','-1','NaN','Infinity','1x'])assert.ok(R.validate({...valid,amount}).some(e=>e.key==='amount'));
 assert.ok(R.validate({...valid,repair_date:'2026-02-30'}).some(e=>e.key==='repair_date'));
 assert.ok(R.validate({...valid,garage_mobile:'123'}).some(e=>e.key==='garage_mobile'));
 assert.ok(R.validate({...valid,next_service_due_km:'100'}).some(e=>e.key==='next_service_due_km'));
});
test('bill photo required for photo path, reason required for no-bill manual path',()=>{
 assert.ok(R.validate({...valid,bill_available:'Yes'},{requirePhoto:true}).some(e=>e.key==='bill_url'));
 assert.deepEqual(R.validate({...valid,bill_available:'Yes'},{requirePhoto:true,hasPhoto:true}),[]);
 assert.ok(R.validate({...valid,remarks:''}).some(e=>e.key==='remarks'));
 assert.equal(R.safeUrl('javascript:alert(1)'),'');
});
test('OCR labelled suggestions omit unknown details and never invent approvals',()=>{
 const x=R.parseBill('ABC Motors\nDate: 28/09/2026\nMobile: 9876543210\nVehicle OD 05 BD 8855\nMeter reading: 12,000\nDescription: Brake lining\nSubtotal 1000\nGrand Total Rs 1,250.00');
 assert.equal(x.garage_name,'ABC Motors');assert.equal(x.repair_date,'2026-09-28');assert.equal(x.amount,'1250.00');assert.equal(x.vehicle_number,'OD05BD8855');assert.equal(x.garage_mobile,'9876543210');assert.equal(x.approved_by,undefined);
 assert.deepEqual(R.parseBill('unreadable handwritten receipt'),{});
 assert.equal(R.parseBill('Subtotal 999\nGST 18\nInvoice 1234').amount,undefined);
});
function bridge({uploadFails=false,writeFails=false}={}){
 const driver=fs.readFileSync('driver.html','utf8');let handler,uploads=0,writes=0;const records=new Map(),answers=[],frame={postMessage:()=>{}};
 const ctx={AZPRepair:R,Blob,crypto:require('node:crypto').webcrypto,Uint8Array,Date,Intl,Set,Map,JSON,location:{origin:'https://atozpackersmovers.in'},document:{getElementById:id=>id==='azpRepairFrame'?{contentWindow:frame,style:{}}:null},currentUser:{name:'Mahesh',role:'Driver'},window:{addEventListener:(t,h)=>{handler=h}},fuelVehicleOptions:()=>['OD 05 BD 8855'],myRecords:()=>[],sid:x=>x,db:{},app:{},MAIN:'records',doc:(db,c,id)=>id,getStorage:()=>({}),repairStorageRef:(s,p)=>p,repairUploadBytes:async()=>{uploads++;if(uploadFails)throw Error('storage denied')},repairDownloadURL:async()=> 'https://example.com/bill.jpg',serverTimestamp:()=>null,
 runTransaction:async(db,fn)=>fn({get:async id=>({exists:()=>records.has(id),data:()=>records.get(id)}),set:(id,p)=>{if(writeFails)throw Error('offline');writes++;records.set(id,p)}})};
 vm.createContext(ctx);vm.runInContext(driver.slice(driver.indexOf('    const repairSaveRequests='),driver.indexOf('    function repairing(){')),ctx);
 frame.postMessage=x=>answers.push(x);return {ctx,records,answers,get uploads(){return uploads},get writes(){return writes},send:async(entry=valid,photo=null,id='11111111-2222-3333-4444-555555555555',origin=ctx.location.origin)=>handler({origin,source:frame,data:{type:'AZP_REPAIR_SAVE',requestId:id,entry,photo,confirmed:true}})};
}
test('driver save maps one record to Execution with fixed identity and pending office approval; retries idempotent',async()=>{
 const b=bridge();await b.send({...valid,driver_name:'Someone Else',approved_by:'Manoj Kumar Swain',approval_status:'Approved'});assert.equal(b.writes,1);const r=[...b.records.values()][0];assert.equal(r.module,'repairing');assert.equal(r.collection,'repairing');assert.equal(r.driver_name,'Mahesh');assert.equal(r.approved_by,'');assert.equal(r.approval_status,'Pending');assert.equal(r.amount,1250);
 await b.send(valid);assert.equal(b.writes,1);
 await b.send({...valid,amount:'999'});assert.equal(b.writes,1);assert.ok(b.answers.some(x=>x.ok===false));
});
test('missing data, wrong vehicle and untrusted origin never upload or save',async()=>{
 for(const entry of [{...valid,garage_name:''},{...valid,amount:'0'},{...valid,vehicle_number:'OD 02 BY 8855'}]){const b=bridge();await b.send(entry);assert.equal(b.writes,0);assert.equal(b.uploads,0);assert.equal(b.answers[0].ok,false)}
 const b=bridge();await b.send(valid,null,undefined,'https://untrusted.example');assert.equal(b.writes,0);assert.equal(b.answers.length,0);
 assert.equal(R.acceptMessage({origin:'a',source:{}},{},'a'),false);
});
test('photo upload failure cannot create an incomplete bill record; successful photo persists URL',async()=>{
 const photo=new Blob(['test'],{type:'image/jpeg'}),entry={...valid,bill_available:'Yes'};
 const bad=bridge({uploadFails:true});await bad.send(entry,photo);assert.equal(bad.writes,0);assert.equal(bad.answers[0].ok,false);
 const good=bridge();await good.send(entry,photo);assert.equal(good.writes,1);assert.equal([...good.records.values()][0].bill_url,'https://example.com/bill.jpg');await good.send(entry,photo);assert.equal(good.uploads,1);
 const offline=bridge({writeFails:true});await offline.send(valid);assert.equal(offline.writes,0);assert.equal(offline.answers[0].ok,false);
});
test('Driver and Execution share contract; old zero-cost repair shortcut removed',()=>{
 const d=fs.readFileSync('driver.html','utf8'),e=fs.readFileSync('executions.html','utf8');assert.ok(!d.includes("submitSimple('repairing'"));assert.ok(e.includes('fields:AZPRepair.fields'));assert.ok(e.includes('AZPRepair.validate(data'));assert.ok(e.includes('Open Garage Bill'));assert.ok(d.includes("if(document.getElementById('azpRepairFrame')){sendRepairContext();return;}"));
});
test('all modified HTML scripts parse',()=>{
 for(const file of ['driver.html','executions.html','driver-repair-form.html'])for(const match of fs.readFileSync(file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!match[2].trim()||/application\/ld\+json/.test(match[1]))continue;if(/type=["']module/.test(match[1]))new vm.SourceTextModule(match[2]);else new vm.Script(match[2]);}
});
