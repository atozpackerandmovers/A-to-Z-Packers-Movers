const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const quote=read('quotation-test-4.html');
function quoteHarness(options={}){
  const calls={save:[],item:[],inventory:[],pdf:[],toast:[],reset:0};
  const button={dataset:{},innerHTML:'Save',classList:{add(){},remove(){}}};
  const form={dataset:{},querySelector:()=>button,addEventListener:(_event,fn)=>{calls.submit=fn;}};
  let n=0;
  const context={console:{error(){},warn(){}},document:{getElementById:()=>form},validateAmountInputs:()=>true,
    getFormData:()=>({quotation_number:'Q-'+(++n),created_at:new Date(2026,8,11,0,0,n).toISOString(),customer_name:'Staging Customer'}),
    currentPreviewData:null,quotations:[],mergeQuotations:a=>a,syncHistoryFromSources(){if(options.historyError)throw new Error('History unavailable');},renderHistory(){},
    showToast:m=>calls.toast.push(m),resetForm(){calls.reset++;delete form.__azpSaveIdentity;},
    downloadPDF:async(_prepare,data)=>{calls.pdf.push(data);if(options.pdfError)throw new Error('PDF unavailable');return true;}};
  context.window={__azpPendingInventoryRemovalAfterSave:'inventory-original',
    saveQuotationToFirebase:async data=>{calls.save.push(data);return options.save?options.save(data):'quote-doc';},
    saveItemListToFirebase:async data=>{calls.item.push(data);},
    __azpRemovePendingInventoryAfterQuote:async id=>calls.inventory.push(id),
    azpQuotationSmsIntegration:{quotationSent(){if(options.smsError)throw new Error('SMS unavailable');}}};
  vm.runInNewContext(quote.slice(quote.indexOf("    document.getElementById('quotation-form').addEventListener('submit'"),quote.indexOf('    // Toast notification')),context);
  return {calls,form,context,submit:()=>calls.submit({preventDefault(){},currentTarget:form,submitter:button})};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('one in-flight submission creates one quotation and one linked Item List',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);const h=quoteHarness({save:()=>pending});
  const first=h.submit();await h.submit();assert.equal(h.calls.save.length,1);assert.equal(h.calls.item.length,0);
  resolve('quote-1');await first;await flush();assert.equal(h.calls.item.length,1);assert.equal(h.calls.item[0].linked_quotation_id,'quote-1');
});
test('failed Firestore save preserves form and retry identity; no side effects',async()=>{
  let fail=true;const h=quoteHarness({save:async()=>{if(fail)throw new Error('permission-denied');return 'quote-1';}});
  await h.submit();await flush();assert.equal(h.calls.reset,0);assert.equal(h.calls.item.length,0);assert.equal(h.calls.inventory.length,0);
  fail=false;await h.submit();await flush();assert.equal(h.calls.save[0].quotation_number,h.calls.save[1].quotation_number);assert.equal(h.calls.save[0].created_at,h.calls.save[1].created_at);
});
test('synchronous SMS failure cannot suppress Item List, inventory or PDF',async()=>{
  const h=quoteHarness({smsError:true});await h.submit();await flush();assert.equal(h.calls.item.length,1);assert.equal(h.calls.inventory.length,1);assert.equal(h.calls.pdf.length,1);assert.equal(h.calls.reset,1);
  assert.ok(!h.calls.toast.some(m=>m.includes('Quotation not saved')));
});
test('PDF and History failures cannot misreport a successful save',async()=>{
  const h=quoteHarness({pdfError:true,historyError:true});await h.submit();await flush();assert.equal(h.calls.item.length,1);assert.equal(h.calls.reset,1);assert.ok(!h.calls.toast.some(m=>m.includes('Quotation not saved')));
});
test('inventory cleanup uses the submitted selection, not a newly selected record',async()=>{
  let resolve;const h=quoteHarness({save:()=>new Promise(r=>resolve=r)});const pending=h.submit();h.context.window.__azpPendingInventoryRemovalAfterSave='another-inventory';resolve('quote-1');await pending;await flush();assert.deepEqual(h.calls.inventory,['inventory-original']);
});
const execution=read('executions.html');
const repairContext={money:n=>'₹'+n};
vm.runInNewContext(execution.slice(execution.indexOf('    function repairingFields('),execution.indexOf('    function repairingDetailsHtml(')),repairContext);
test('Repairing search finds driver, formatted vehicle number, fault type and description',()=>{
  const row={driver_name:'Somnath',vehicle_number:'OD 05 AB 1234',repair_type:'Brake',description:'Rear wheel vibration'};
  for(const q of ['somnath','OD05AB1234','brake','wheel vibration'])assert.ok(repairContext.repairingMatches(row,q),q);
  assert.equal(repairContext.repairingMatches(row,'Ajay'),false);
});
test('legacy repairing meter is preserved and missing initial meter is explicit',()=>{
  const row={vehicle_km_reading:12500};const before=JSON.stringify(row);const fields=repairContext.repairingFields(row);
  assert.equal(fields.find(f=>f[0]==='Initial Meter Reading')[1],'Not recorded');assert.equal(fields.find(f=>f[0]==='Vehicle KM Reading')[1],'12500');assert.equal(JSON.stringify(row),before);
  assert.equal(repairContext.repairingFields({initial_meter_reading:0}).find(f=>f[0]==='Initial Meter Reading')[1],'0');
});
test('Repairing schema retains Vehicle KM and adds the separate initial field',()=>{
  const schema=execution.split('\n').find(l=>l.includes("repairing:{label:'Repairing'"));assert.match(schema,/initial_meter_reading/);assert.match(schema,/vehicle_km_reading/);
});
const driver=read('driver.html');
test('ETA refreshes after a minute with fresh stationary GPS, and when delivery changes',async()=>{
  let now=100000,calls=0;const job={job_id:'STAGE-JOB',to_location:'Destination A',status:'Assigned'};
  const context={Date:{now:()=>now},currentUser:{name:'Ajay',role:'Driver'},nameKey:s=>s,
    azpEtaBusy:false,azpEtaRetryAfter:0,azpEtaFailureCount:0,azpEtaLastGpsSignature:'',azpEtaLastRouteAt:0,AZP_ETA_REFRESH_MS:60000,AZP_ETA_MAX_BACKOFF_MS:300000,
    azpEtaLivePoint:()=>({lat:20.46,lng:85.88}),myJobs:()=>[job],azpEtaDriverOwnsJob:()=>true,azpEtaStatusDone:()=>false,azpEtaJobStatus:j=>j.status,azpEtaJobKey:j=>j.job_id,azpNavigationCoordinates:()=>null,
    azpEtaUpdateJob:async()=>{calls++;return true;}};
  vm.runInNewContext(driver.slice(driver.indexOf('    function azpEtaRouteSignature('),driver.indexOf('    const azpEtaStatusDone=')),context);
  vm.runInNewContext(driver.slice(driver.indexOf('    async function azpEtaPoll('),driver.indexOf('    setInterval(azpEtaSecondTick')),context);
  await context.azpEtaPoll();assert.equal(calls,1);now+=10000;await context.azpEtaPoll();assert.equal(calls,1);now+=60000;await context.azpEtaPoll();assert.equal(calls,2);job.to_location='Destination B';await context.azpEtaPoll();assert.equal(calls,3);
});
const tasks=read('task.html');
function deletionHarness({denied=false,collision=false,offline=false}={}){
  const deleted=[],sets=[];let commits=0;
  const ref=collection=>id=>({path:collection+'/'+id,get:async()=>({exists:collection==='azpExecutionRecords',data:()=>({module:collision?'jobs':'taskManagement',id:'T1'})})});
  const context={window:{},firebaseReady:true,navigator:{onLine:!offline},deletionRef:id=>({path:'azpExecutionRecords/TASK_DELETED_'+id}),deletionMarker:id=>({deletedTaskId:id}),
    fbDb:{collection:collection=>({doc:ref(collection),where:()=>({get:async()=>{if(denied)throw new Error('permission-denied');return {forEach(){}};}})}),batch:()=>({delete:r=>deleted.push(r.path),set:r=>sets.push(r.path),commit:async()=>{commits++;}})}};
  const start=tasks.lastIndexOf('  window.firebaseDeleteTask = async function (id)');
  vm.runInNewContext(tasks.slice(start,tasks.indexOf('  function confirmTaskDeletion',start)),context);
  return {run:()=>context.window.firebaseDeleteTask('T1'),deleted,sets,commits:()=>commits};
}
test('task deletion targets exact task paths with an atomic deletion marker',async()=>{
  const h=deletionHarness();await h.run();assert.deepEqual(h.deleted,['taskMaster/T1','staffTasks/T1','azpExecutionRecords/TASK_T1']);assert.deepEqual(h.sets,['azpExecutionRecords/TASK_DELETED_T1']);assert.equal(h.commits(),1);
});
test('offline, denied reads and non-task ID collisions perform no delete',async()=>{
  for(const options of [{offline:true},{denied:true},{collision:true}]){const h=deletionHarness(options);await assert.rejects(h.run());assert.equal(h.commits(),0);assert.equal(h.deleted.length,0);}
});
