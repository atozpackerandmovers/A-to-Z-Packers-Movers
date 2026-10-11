const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../quotation-notes.js'), 'utf8');
let clock=0, timerId=0, paints=0;
const timers=new Map();
const context = vm.createContext({window:{},
 setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,at:clock+delay});return id;},
 clearTimeout(id){timers.delete(id);},
 document:{readyState:'loading',addEventListener(){},querySelectorAll(){paints++;return [];},getElementById(){return null;}}});
vm.runInContext(source.replace("  if(document.readyState==='loading')", `
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
console.log('PASS: live-widget refresh scheduling, customer note identity, legacy execution linkage, latest-note precedence and HTML escaping.');
