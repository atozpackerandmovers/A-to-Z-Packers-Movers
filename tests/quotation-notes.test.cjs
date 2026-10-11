const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../quotation-notes.js'), 'utf8');
let clock=0, timerId=0, paints=0;
const timers=new Map(), elements=new Map(), drafts=new Map();
let cloudFetch;
const context = vm.createContext({window:{},AbortController,URLSearchParams,fetch:(...args)=>cloudFetch(...args),
 setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,at:clock+delay});return id;},
 clearTimeout(id){timers.delete(id);},
 localStorage:{setItem(k,v){drafts.set(k,v);},getItem(k){return drafts.get(k)||null;}},
 document:{readyState:'loading',addEventListener(){},querySelectorAll(){paints++;return [];},getElementById(id){return elements.get(id)||null;}}});
vm.runInContext(source.replace("  if(document.readyState==='loading')", `
  window.closeNotesEditor = closeEditor;
  window.saveTestNote = saveNote; documentRoot='https://example.test/documents';
  window.seedNotes = (quotes, planning) => { rows = quotes; plans = planning; ready = true; };
  if(document.readyState==='loading')`), context);
const w=context.window;
w.seedNotes([
 {__backendId:'first',quotation_number:'DUP',customer_notes:'First customer'},
 {__backendId:'second',quotation_number:'DUP',customer_notes:'Other customer'},
 {__backendId:'unique',quotation_number:'Q1',customer_notes:'After 10 AM\n<script>alert(1)</script>'}
],[{__backendId:'plan-one',planning_no:'PLN1',linked_backend_id:'unique'}]);
assert.equal(w.azpGetQuotationNotes({linked_quotation_no:'DUP'}),'','An ambiguous quotation number must never show another customer’s conditions');
assert.equal(w.azpGetQuotationNotes({linked_backend_id:'second',linked_quotation_no:'DUP'}),'Other customer');
assert.equal(w.azpGetQuotationNotes({module:'jobs',id:'PLAN_plan-one',job_id:'PLN1'}),w.azpGetQuotationNotes({linked_backend_id:'unique'}),'Older execution imports resolve their planning linkage');
assert.equal(w.azpGetQuotationNotes({linked_quotation_no:'Q1',quotation_notes:'Old snapshot'}),'After 10 AM\n<script>alert(1)</script>','Current quotation notes override stale planning snapshots');
assert.equal(w.azpGetQuotationNotes({quotation_notes:'Offline snapshot'}),'Offline snapshot');
assert.equal(w.azpQuotationNoteHTML({linked_backend_id:'unique'}),'After 10 AM<br>&lt;script&gt;alert(1)&lt;/script&gt;','Printed planning HTML escapes note content and preserves line breaks');
assert(!w.azpQuotationNotesMount({linked_backend_id:'"><script>'}).includes('<script>'));
// Continuous live-widget changes must not postpone the notes render indefinitely.
for(let i=0;i<20;i++){
 w.azpRefreshQuotationNotes();clock+=10;
 for(const [id,timer]of timers)if(timer.at<=clock){timers.delete(id);timer.fn();}
}
assert(paints>=1,'Customer note rendering must run while other widgets continuously update');
let closed=false;
elements.set('azp-note-dialog',{
 dataset:{saving:'yes',dirty:'yes',quoteId:'first'},
 querySelector(selector){return {value:selector==='textarea'?'My unsaved condition':'Staff'};},
 close(){closed=true;},remove(){elements.delete('azp-note-dialog');}
});
w.closeNotesEditor();
assert(closed,'Cancel / Close must work while a cloud save is pending');
assert.equal(JSON.parse(drafts.get('azp_customer_note_draft_v1_first')).text,'My unsaved condition','Closing preserves the customer instruction draft');
console.log('PASS: pending-save close and draft retention, live-widget refresh scheduling, customer note identity, legacy execution linkage, latest-note precedence and HTML escaping.');

(async()=>{
 let writes=0,current={fields:{customer_notes:{stringValue:'Old'},customer_notes_revision:{integerValue:'3'}},updateTime:'2026-10-11T00:00:00.000000Z'};
 cloudFetch=async(url,options)=>{
  if(options.method==='PATCH'){
   const params=new URLSearchParams(url.split('?')[1]);
   assert.equal(params.get('currentDocument.updateTime'),current.updateTime,'Server precondition prevents another staff update from being overwritten');
   assert.deepEqual(params.getAll('updateMask.fieldPaths').sort(),['customer_notes','customer_notes_by','customer_notes_revision','customer_notes_updated_at']);
   writes++;return {ok:true,json:async()=>({})};
  }
  return {ok:true,json:async()=>current};
 };
 const saved=await w.saveTestNote('exact-id','New','Staff',{text:'Old',revision:3});
 assert.equal(saved.customer_notes_revision,4);assert.equal(writes,1);
 current.fields.customer_notes_revision.integerValue='5';
 await assert.rejects(w.saveTestNote('exact-id','Other','Staff',{text:'Old',revision:3}),/Another person/);assert.equal(writes,1);
 current.fields.customer_notes={stringValue:'New'};current.fields.customer_notes_by={stringValue:'Staff'};
 await w.saveTestNote('exact-id','New','Staff',{text:'Old',revision:3});assert.equal(writes,1,'Retry confirms an acknowledged-on-server note without writing it twice');
 cloudFetch=(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{const error=Error('Aborted');error.name='AbortError';reject(error);}));
 const timed=w.saveTestNote('exact-id','New','Staff',{text:'Old',revision:3});
 for(const [id,timer]of timers)if(timer.at>=clock+12000){timers.delete(id);timer.fn();}
 await assert.rejects(timed,/Connection timed out/);
 console.log('PASS: field-only server save, conditional concurrency guard, lost-response retry and bounded network timeout.');
})().catch(error=>{console.error(error);process.exitCode=1;});
