const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('executions.html','utf8');
const start=source.indexOf('      let applySalaryDueDateDefault=');
const end=source.indexOf("        if(currentModule==='salarySettings'){",start);
const formCode=source.slice(start,end)+'},0);';
function open(extra){
 const fields={};
 for(const [key,value] of Object.entries({employee_name:'Test Worker',role:'Worker',month:'2026-09',salary_due_date:'2026-09-27',extra_bonus:String(extra),payment_status:'Pending',paid_amount:'',approval_status:'Pending'})) fields['field-'+key]={value,style:{},dataset:{},listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}};
 fields['salary-v2-preview']={innerHTML:''};fields['form-fields']={};
 const context={document:{getElementById:id=>fields[id]},currentModule:'salaryFinalApproval',setTimeout:fn=>fn(),getStaffMasterRecord:()=>({role:'Worker'}),azpMasterRole:m=>m.role,getMonthRange:()=>({ym:'2026-09'}),getStaffJoinDate:()=> '2026-06-27',normName:v=>String(v).toLowerCase(),azpEsc:String,money:v=>String(v??0),buildSalaryFinalData:(name,role,month,vehicle,extra=0)=>({role,extra_bonus:Number(extra),total_salary_earned_before_paid:34000+Number(extra),paid_credit_amount:0,month_breakdown:[]})};
 vm.runInNewContext(formCode,context);return fields;
}
test('reopening saved negative/positive/zero adjustment preserves it and renders preview',()=>{
 for(const amount of [-25200,1500,0]){const f=open(amount);assert.equal(Number(f['field-extra_bonus'].value),amount);assert.ok(f['salary-v2-preview'].innerHTML.includes(String(34000+amount)));f['field-month'].listeners.change();assert.equal(Number(f['field-extra_bonus'].value),amount);}
});
test('preview responds to adjustment input without resetting it',()=>{const f=open(0);f['field-extra_bonus'].value='-25200';f['field-extra_bonus'].listeners.input();assert.ok(f['salary-v2-preview'].innerHTML.includes('8800'));assert.equal(f['field-extra_bonus'].value,'-25200');});
test('attendance reads adjustment for only the matching live record',()=>{
 const helper=source.slice(source.indexOf('    function azpSalarySavedAdjustment('),source.indexOf('    function buildSalaryFinalData('));
 const ctx={allData:[{id:'live-one',extra_bonus:-25200},{id:'paid-one',extra_bonus:500}],azpSalaryLiveRecordId:s=>'live-'+s.id,azpSalaryCycleAdjustment:(s,n)=>Number(n||0)};vm.createContext(ctx);vm.runInContext(helper,ctx);assert.equal(ctx.azpSalarySavedAdjustment({id:'one'}),-25200);assert.equal(ctx.azpSalarySavedAdjustment({id:'two'}),0);
});
test('current cycle starts in the current month after earlier months were paid',()=>{
 const helper=source.slice(source.indexOf('    function azpSalaryLiveCycleStart('),source.indexOf('    function azpSalaryClaimedSourceIds('));
 const ctx={allData:[],azpAttJoinDate:s=>s.joining_date,azpSalaryIndiaToday:()=> '2026-09-27',azpSalaryPaidHistory:s=>s.paid||[],parseDateForCalc:x=>x||'',azpSalaryAddDays:(d,n)=>'2026-09-12',azpSalaryLiveRecordId:s=>'live-'+s.name};
 vm.createContext(ctx);vm.runInContext(helper,ctx);
 assert.equal(ctx.azpSalaryLiveCycleStart({name:'Sukadev',joining_date:'2026-06-27'}),'2026-09-01');
 assert.equal(ctx.azpSalaryLiveCycleStart({name:'New',joining_date:'2026-09-20'}),'2026-09-20');
 assert.equal(ctx.azpSalaryLiveCycleStart({name:'Paid',joining_date:'2026-06-27',paid:[{next_cycle_start_date:'2026-09-12'}]}),'2026-09-12');
 ctx.allData=[{id:'live-Sukadev',extra_bonus:-25200,company_remark:'Owner-authorized balance reconciliation on 2026-09-27'}];
 assert.equal(ctx.azpSalaryCycleAdjustment({name:'Sukadev',joining_date:'2026-06-27'},-25200),0);
 assert.equal(ctx.azpSalaryCycleAdjustment({name:'New',joining_date:'2026-09-20'},-500),-500);
});
test('auto-sync preserves explicit zero rather than stale duplicate adjustment',()=>{
 const expression=source.match(/const extra=Number\((old\?\.extra_bonus[^;]+)\);/)[1];
 for(const amount of [-25200,0,1500])assert.equal(vm.runInNewContext('Number('+expression+')',{old:{extra_bonus:amount},pendingDuplicates:[{extra_bonus:999}]}),amount);
});
