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
function salaryContext(today='2026-09-28'){
 const ctx={allData:[],azpAttJoinDate:s=>s.joining_date,azpSalaryIndiaToday:()=>today,azpSalaryPaidHistory:s=>s.paid||[],parseDateForCalc:x=>x||'',azpSalaryAddDays:(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),azpSalaryLiveRecordId:s=>'live-'+s.name};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('    function azpSalaryJoiningCycle('),source.indexOf('    function azpSalaryClaimedSourceIds(')),ctx);return ctx;
}
test('joining anniversary boundaries and paid-through exclude already settled days',()=>{
 const ctx=salaryContext();
 for(const [join,expected] of [['2026-06-27','2026-09-27'],['2026-08-28','2026-09-28'],['2026-07-30','2026-08-30'],['2026-09-05','2026-09-05']])assert.equal(ctx.azpSalaryLiveCycleStart({joining_date:join}),expected);
 assert.equal(ctx.azpSalaryLiveCycleStart({joining_date:'2026-07-22',paid:[{paid_through_date:'2026-09-25',paid_date:'2026-09-20'}]}),'2026-09-26');
 assert.equal(ctx.azpSalaryLiveCycleStart({joining_date:'2026-06-27',paid:[{paid_through_date:'2026-09-11'}]}),'2026-09-27');
 assert.equal(salaryContext('2027-02-28').azpSalaryJoiningCycle({joining_date:'2026-01-31'}).start,'2027-02-28');
 assert.equal(salaryContext('2027-03-01').azpSalaryJoiningCycle({joining_date:'2026-01-31'}).end,'2027-03-30');
 assert.equal(ctx.azpSalaryLiveCycleStart({joining_date:''}),'');
});
test('only current-cycle manual payments reduce salary',()=>{
 const ctx=salaryContext();
 assert.equal(ctx.azpSalaryCreditInCycle({manual_paid_cycle_start:'2026-09-01',manual_paid_date:'2026-09-12'},'2026-09-27'),false);
 assert.equal(ctx.azpSalaryCreditInCycle({manual_paid_cycle_start:'2026-09-01',manual_paid_date:'2026-09-27'},'2026-09-27'),true);
 assert.equal(ctx.azpSalaryCreditInCycle({manual_paid_cycle_start:'2026-09-27'},'2026-09-27'),true);
});
test('running salary respects attendance across calendar boundaries and zero earnings',()=>{
 const ctx=salaryContext();Object.assign(ctx,{AZP_SALARY_FORMULA_VERSION:'test',normName:v=>String(v||'').toLowerCase(),getStaffSalarySetting:()=>({monthly_salary:12000,per_day_salary:400}),azpAttSettings:()=>({}),azpAttDateEligible:()=>true,azpAttDayMap:()=>new Map(),azpAttDayData:(s,d)=>({status:d==='2026-09-01'?'Absent':'Present',r:{}}),azpSalaryOneTimeRows:()=>[],azpSalaryManualPaidCredit:()=>0});
 vm.runInContext(source.slice(source.indexOf('    function getMonthRange('),source.indexOf('    function normName(')),ctx);
 vm.runInContext(source.slice(source.indexOf('    function azpSalaryMonthList('),source.indexOf('    function azpSalarySavedAdjustment(')),ctx);
 const staff={id:'one',joining_date:'2026-07-30',name:'Test',role:'Worker'};
 let calc=ctx.buildLiveSalarySettlement(staff,'2026-08-30','2026-09-28');assert.equal(calc.eligible_days,30);assert.equal(calc.absent_days,1);assert.equal(calc.final_salary_payable,11600);assert.equal(calc.attendance_reward_amount,0);
 calc=ctx.buildLiveSalarySettlement(staff,'2026-09-01','2026-09-01');assert.equal(calc.final_salary_payable,0);
 calc=ctx.buildLiveSalarySettlement({...staff,joining_date:'2026-09-27'},'2026-09-27','2026-09-28');assert.equal(calc.final_salary_payable,800);
 ctx.azpAttDayData=()=>({status:'Present',r:{}});calc=ctx.buildLiveSalarySettlement(staff,'2026-08-30','2026-09-29');assert.equal(calc.salary_gross,12000);assert.equal(calc.attendance_reward_amount,400);assert.equal(calc.final_salary_payable,12400);
 assert.equal(ctx.getMonthRange('2026-09').start,'2026-09-01');assert.equal(ctx.getMonthRange('2026-09').end,'2026-09-30');
});
test('auto-sync preserves explicit zero rather than stale duplicate adjustment',()=>{
 const expression=source.match(/const extra=Number\((old\?\.extra_bonus[^;]+)\);/)[1];
 for(const amount of [-25200,0,1500])assert.equal(vm.runInNewContext('Number('+expression+')',{old:{extra_bonus:amount},pendingDuplicates:[{extra_bonus:999}]}),amount);
});
