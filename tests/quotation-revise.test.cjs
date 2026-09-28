// Run: node --experimental-vm-modules tests/quotation-revise.test.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../quotation-test-4.html'),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
let parsed=0;
for(const [,attr,body] of scripts){
 if(!body.trim()||/application\/ld\+json/.test(attr))continue;
 if(/type=["']module/.test(attr))new vm.SourceTextModule(body);else new vm.Script(body);
 parsed++;
}
const crm=scripts.find(x=>x[2].includes('let azpQuotesV9 = []'))[2].replace(/^import .*;\s*$/gm,'');
const elements={vehicle_type:{value:'Mini'},electrification_required:{value:'no'},valid_till:{value:'2026-10-27'}};
const writes=[];let promptValue='',confirmValue=true;
const context=vm.createContext({console,Intl,Date,setTimeout(){},window:{},document:{getElementById:id=>elements[id]||null,querySelector:()=>null,addEventListener(){}},
 getApps:()=>[{}],getApp:()=>({}),getFirestore:()=>({}),serverTimestamp:()=>({server:true}),
 doc:(_db,collection,id)=>({collection,id}),setDoc:async(ref,data,options)=>writes.push({ref,data,options}),
 alert:()=>{},prompt:()=>promptValue,confirm:()=>confirmValue,azpSearchMatch:()=>true});
vm.runInContext(crm,context);
const run=code=>vm.runInContext(code,context);
const ids=type=>JSON.parse(run(`JSON.stringify(rowsBy('${type}').map(r=>r.quotationId))`));
run(`azpQuotesV9 = [
 normalizeQuote('orig-doc',{quotation_number:'ORIGINAL',customer_name:'Same Customer',party_mobile:'9999999999',total_amount:10000}),
 normalizeQuote('rev-doc',{quotation_number:'REV1',originalQuotationId:'ORIGINAL',isRevision:true,total_amount:12000}),
 normalizeQuote('rev2-doc',{quotation_number:'REV2',originalQuotationId:'ORIGINAL',isRevision:true,status:'confirmed',total_amount:13000}),
 normalizeQuote('other-doc',{quotation_number:'OTHER',customer_name:'Same Customer',party_mobile:'9999999999'}),
 normalizeQuote('confirmed-doc',{quotation_number:'CONFIRMED',status:'confirmed'})
]; azpPrioritiesV9=[normalizePriority('ORIGINAL',{}),normalizePriority('REV1',{})];`);
assert.deepEqual(ids('followup').sort(),['ORIGINAL','OTHER']);
assert.deepEqual(ids('revise').sort(),['REV1','REV2']);
assert.deepEqual(ids('priority'),['ORIGINAL']);
assert.deepEqual(ids('confirmed'),['CONFIRMED']);
assert.match(run("card(findRecord('REV1'),'revise')"),/Original: ORIGINAL/);
assert.doesNotMatch(run("card(findRecord('REV1'),'revise')"),/>Follow<|>Clear<|Priority NO/);
// A repeat save keeps the lineage in the new document and never writes the original.
(async()=>{
 run('installSaveWrapper()');
 await context.window.saveQuotationToFirebase({quotation_number:'REV3',isRevision:true,originalQuotationId:'ORIGINAL',originalQuotationDocId:'orig-doc',revisedFromQuotationId:'REV2',total_amount:15000});
 assert.equal(writes.length,1);assert.notEqual(writes[0].ref.id,'orig-doc');
 assert.equal(writes[0].data.originalQuotationId,'ORIGINAL');assert.equal(writes[0].data.revisedFromQuotationId,'REV2');assert.equal(writes[0].data.total_amount,15000);
 // Linking never accepts itself, a missing quote, another revision, or a root with children.
 for(const [target,original] of [['OTHER','OTHER'],['OTHER','MISSING'],['OTHER','REV1'],['ORIGINAL','OTHER']]){
   promptValue=original;await context.window.azpV9LinkRevision(target);assert.equal(writes.length,1);
 }
 promptValue='ORIGINAL';confirmValue=false;await context.window.azpV9LinkRevision('OTHER');assert.equal(writes.length,1);
 // Use lightweight rendering stubs after the write to verify the selected section.
 run('renderV9 = function(){}');confirmValue=true;
 await context.window.azpV9LinkRevision('OTHER');
 assert.equal(writes.length,2);assert.equal(writes[1].ref.id,'other-doc');assert.equal(writes[1].data.originalQuotationId,'ORIGINAL');
 assert.equal(run('azpActiveTabV9'),'revise');assert.deepEqual(ids('followup'),['ORIGINAL']);
 // Check lineage through the actual form-context functions with a minimal DOM.
 const classic=scripts.find(x=>x[2].includes('let quotationRevisionContext = null'))[2];
 const formCode=classic.slice(classic.indexOf('let quotationRevisionContext = null'),classic.indexOf('    let ',classic.indexOf('function setQuotationRevision')));
 const fc=vm.createContext({document:{getElementById:()=>({remove(){},prepend(){}}),createElement:()=>({appendChild(){}})},resetForm(){},showView(){}});
 vm.runInContext(formCode,fc);
 vm.runInContext(`setQuotationRevision({quotation_number:'REV2',__backendId:'rev2-doc',originalQuotationId:'ORIGINAL',originalQuotationDocId:'orig-doc'})`,fc);
 assert.equal(vm.runInContext('quotationRevisionContext.originalQuotationId',fc),'ORIGINAL');
 assert.equal(vm.runInContext('quotationRevisionContext.revisedFromQuotationId',fc),'REV2');
 vm.runInContext('clearQuotationRevision()',fc);assert.equal(vm.runInContext('quotationRevisionContext',fc),null);
 // Reproduce navigation through the Firebase wrapper: it must forward the
 // keepRevision argument or opening the form silently drops the lineage.
 fc.document.querySelectorAll=()=>[];
 fc.document.getElementById=()=>({remove(){},prepend(){},classList:{remove(){}}});
 vm.runInContext('window = this',fc);
 const navigation=classic.slice(classic.indexOf('function showView('),classic.indexOf('function azpNormalizeSearchText'));
 vm.runInContext(navigation,fc);
 const firebaseScript=scripts.find(x=>x[2].includes('const originalShowView = window.showView'))[2];
 vm.runInContext(firebaseScript.slice(firebaseScript.lastIndexOf('  if (window.showView)')),fc);
 vm.runInContext(`setQuotationRevision({quotation_number:'ORIGINAL',__backendId:'orig-doc'}); showView('form',true)`,fc);
 assert.equal(vm.runInContext('quotationRevisionContext?.originalQuotationId',fc),'ORIGINAL', 'Opening a revision must preserve its original quotation link');
 vm.runInContext(`showView('form')`,fc);
 assert.equal(vm.runInContext('quotationRevisionContext',fc),null,'A new quotation must clear revision context');
 console.log(`PASS: ${parsed} inline scripts parse; revision separation, original preservation, lineage, save and linking guards.`);
})().catch(e=>{console.error(e);process.exitCode=1});
