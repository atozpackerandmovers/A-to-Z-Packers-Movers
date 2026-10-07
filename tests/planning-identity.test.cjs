const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
for (const file of ['ai-quotations.html', 'ai.quotations.html', 'quotation-test-4.html']) {
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8');
  for (const [, attrs, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!code.trim() || /application\/ld\+json/.test(attrs)) continue;
    if (/type=["']module/.test(attrs)) new vm.SourceTextModule(code);
    else new vm.Script(code);
  }
  const merge = html.match(/function mergePlanningSheets\(remoteData = \[\]\) \{[\s\S]*?\n    \}/)[0];
  const context = vm.createContext({ getLocalPlanningSheetsFallback: () => [{ planning_no: 'PLN1', __backendId: 'PLN1', customer_name: 'Customer' }] });
  vm.runInContext(merge, context);
  const rows = vm.runInContext(`mergePlanningSheets([
    {planning_no:'PLN1',__backendId:'firebase-id',total_price:100},
    {planning_no:'PLN2',__backendId:'another-id',customer_name:'Customer'},
    {__backendId:'_setup'}
  ])`, context);
  assert.equal(rows.length, 2, `${file}: local/cloud copies collapse and separate jobs survive`);
  assert.equal(rows.find(r => r.planning_no === 'PLN1').__backendId, 'firebase-id');
  assert.equal(rows.find(r => r.planning_no === 'PLN1').customer_name, 'Customer');
  assert(!html.includes("await savePlanningRecord('planning_form_submit')"), `${file}: no duplicate capture save`);
}
console.log('Planning identity and all quotation script checks passed.');
