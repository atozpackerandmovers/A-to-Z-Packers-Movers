const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../quotation-notes.js'), 'utf8');
const context = vm.createContext({window:{},document:{readyState:'loading',addEventListener(){}}});
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
console.log('PASS: customer note identity, legacy execution linkage, latest-note precedence and HTML escaping.');
