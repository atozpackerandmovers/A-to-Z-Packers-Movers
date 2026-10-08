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
 const context={AZPSalaryOverview:require('../salary-overview.js'),document:{getElementById:id=>fields[id]},currentModule:'salaryFinalApproval',setTimeout:fn=>fn(),getStaffMasterRecord:()=>({role:'Worker'}),azpMasterRole:m=>m.role,getMonthRange:()=>({ym:'2026-09'}),getStaffJoinDate:()=> '2026-06-27',normName:v=>String(v).toLowerCase(),azpEsc:String,money:v=>String(v??0),buildSalaryFinalData:(name,role,month,vehicle,extra=0)=>({role,extra_bonus:Number(extra),total_salary_earned_before_paid:34000+Number(extra),paid_credit_amount:0,month_breakdown:[]})};
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
 const ctx={AZPAdvanceLedger:require('../salary-advance-ledger.js'),allData:[],AZP_SALARY_OPENING_DATE:'2026-09-28',AZP_SALARY_POLICY_EPOCH:'2026-09-28-fixed-monthly-v1',AZP_SALARY_FORMULA_VERSION:'FIXED_MONTHLY_V9_CARRY',azpAttJoinDate:s=>s.joining_date,azpSalaryIndiaToday:()=>today,parseDateForCalc:x=>x||'',azpSalaryAddDays:(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),azpSalaryLiveRecordId:s=>'live-'+s.id,normName:v=>String(v||'').toLowerCase(),azpSalaryDayCount:(a,b)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000+1,azpSalaryRound:n=>Math.round((Number(n||0)+Number.EPSILON)*100)/100,getStaffSalarySetting:()=>({monthly_salary:8000,per_day_salary:267}),azpAttSettings:()=>({}),azpAttDateEligible:()=>true,azpAttDayMap:()=>new Map(),azpAttDayData:()=>({status:'Present',r:{}}),azpSalaryOneTimeRows:()=>[]};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('    function azpSalaryRecordMatchesStaff('),source.indexOf('    function azpSalaryClaimedSourceIds(')),ctx);
 vm.runInContext(source.slice(source.indexOf('    function azpSalaryMonthList('),source.indexOf('    function azpSalarySavedAdjustment(')),ctx);return ctx;
}
const worker={id:'one',master_id:'one',joining_date:'2026-07-30',name:'One',role:'Worker'};
function balance(ctx,staff=worker){return ctx.buildLiveSalarySettlement(staff,ctx.azpSalaryLiveCycleStart(staff),ctx.azpSalaryIndiaToday());}
test('opening cycle stays anchored across month rollover and ignores disputed old paid rows',()=>{
 const ctx=salaryContext();ctx.allData=[{id:'old',module:'salaryFinalApproval',master_id:'one',payment_status:'Paid',settlement_locked:'Yes',paid_through_date:'2026-09-25'}];
 assert.equal(ctx.azpSalaryLiveCycleStart(worker),'2026-08-30');
 ctx.azpSalaryIndiaToday=()=> '2026-10-01';assert.equal(ctx.azpSalaryLiveCycleStart(worker),'2026-08-30');
 assert.equal(ctx.azpSalaryLiveCycleStart({...worker,joining_date:'2026-10-05'}),'2026-10-05');
 assert.equal(ctx.azpSalaryLiveCycleStart({...worker,joining_date:''}),'');
});
test('full cycles of 28,29,30,31 days earn exactly fixed monthly salary',()=>{
 const ctx=salaryContext();
 for(const [start,end,days] of [['2027-02-01','2027-02-28',28],['2028-02-01','2028-02-29',29],['2026-09-01','2026-09-30',30],['2026-08-01','2026-08-31',31]]){
  const calc=ctx.buildLiveSalarySettlement({...worker,joining_date:'2026-01-01'},start,end);assert.equal(calc.final_salary_payable,8000);assert.equal(calc.eligible_days,days);assert.equal(calc.attendance_reward_amount,0);
 }
});
test('Swagatika accrues exact fractions and retains prior month when new cycle starts',()=>{
 const ctx=salaryContext();assert.equal(balance(ctx).final_salary_payable,7741.94);
 ctx.azpSalaryIndiaToday=()=> '2026-09-29';assert.equal(balance(ctx).final_salary_payable,8000);
 ctx.azpSalaryIndiaToday=()=> '2026-09-30';assert.equal(balance(ctx).final_salary_payable,8266.67);
 ctx.azpSalaryIndiaToday=()=> '2026-10-29';assert.equal(balance(ctx).final_salary_payable,16000);
});
test('absence, half day and leave use exact cycle denominator',()=>{
 const ctx=salaryContext();const staff={...worker,joining_date:'2026-01-01'};
 ctx.azpAttDayData=(s,d)=>({status:d.endsWith('-01')?'Absent':d.endsWith('-02')?'Half Day':d.endsWith('-03')?'Leave':'Present',r:{}});
 let calc=ctx.buildLiveSalarySettlement(staff,'2027-02-01','2027-02-28');assert.equal(calc.final_salary_payable,7285.71);assert.equal(calc.salary_days,25.5);
 ctx.azpAttSettings=()=>({leave_salary_rule:'Paid'});calc=ctx.buildLiveSalarySettlement(staff,'2027-02-01','2027-02-28');assert.equal(calc.final_salary_payable,7571.43);
 ctx.azpAttDayData=()=>({status:'Absent',r:{}});assert.equal(ctx.buildLiveSalarySettlement(staff,'2027-02-01','2027-02-28').final_salary_payable,0);
});
test('manual payment affects only matching employee, persists across cycles, legacy advance ignored',()=>{
 const ctx=salaryContext('2026-09-30');ctx.allData=[{id:'live-one',module:'salaryFinalApproval',master_id:'one',manual_paid_amount:3000,manual_paid_cycle_start:'2026-08-30',salary_payment_policy:ctx.AZP_SALARY_POLICY_EPOCH}];
 assert.equal(balance(ctx).final_salary_payable,5266.67);
 assert.equal(balance(ctx,{...worker,id:'two',master_id:'two',name:'Two'}).final_salary_payable,8266.67);
 ctx.azpSalaryIndiaToday=()=> '2026-10-29';assert.equal(balance(ctx).final_salary_payable,13000);
 delete ctx.allData[0].salary_payment_policy;assert.equal(balance(ctx).final_salary_payable,16000);
});
test('explicit new settlement resets only paid employee through paid day',()=>{
 const ctx=salaryContext('2026-10-01');ctx.allData=[{id:'new-paid',module:'salaryFinalApproval',master_id:'one',payment_status:'Paid',settlement_locked:'Yes',paid_through_date:'2026-09-30',salary_payment_policy:ctx.AZP_SALARY_POLICY_EPOCH}];
 assert.equal(ctx.azpSalaryLiveCycleStart(worker),'2026-10-01');assert.equal(balance(ctx).final_salary_payable,266.67);
 assert.equal(ctx.azpSalaryLiveCycleStart({...worker,id:'two',master_id:'two'}),'2026-08-30');
});
test('month-end joining dates clamp correctly and never lose a day',()=>{
 const ctx=salaryContext();const staff={...worker,joining_date:'2026-01-31'};
 assert.equal(ctx.azpSalaryJoiningCycle(staff,'2027-02-28').start,'2027-02-28');assert.equal(ctx.azpSalaryJoiningCycle(staff,'2027-03-01').end,'2027-03-30');
 assert.equal(ctx.buildLiveSalarySettlement(staff,'2027-01-31','2027-03-30').final_salary_payable,16000);
});
test('attendance and final approval use the same carried salary calculation',()=>{
 const ctx=salaryContext();ctx.azpSalarySavedAdjustment=()=>0;ctx.buildSalaryFinalData=()=>({final_salary_payable:1234.56});assert.equal(ctx.azpAttendanceEarnedSalary(worker).final_salary_payable,1234.56);
 assert.equal((source.match(/liveSalary=azpAttendanceEarnedSalary\(staff\)/g)||[]).length,3);
});
test('auto-sync preserves explicit zero rather than stale duplicate adjustment',()=>{
 const expression=source.match(/const extra=Number\((old\?\.extra_bonus[^;]+)\);/)[1];
 for(const amount of [-25200,0,1500])assert.equal(vm.runInNewContext('Number('+expression+')',{old:{extra_bonus:amount},pendingDuplicates:[{extra_bonus:999}]}),amount);
});
test('Mark Paid atomically stores settlement and resets only the selected employee',async()=>{
 const ctx=salaryContext('2026-09-29'),other={id:'live-two',master_id:'two',module:'salaryFinalApproval',final_salary_payable:9000};
 ctx.allData=[{id:'live-one',master_id:'one',module:'salaryFinalApproval',payment_status:'Pending'},other];let writes=[],commits=0;
 Object.assign(ctx,{window:{},db:{},MAIN_COLLECTION:'records',currentModule:'attendance',azpSalaryStaffFromRecord:()=>worker,azpSalaryFinalCycleRecords:r=>[r],safeId:x=>x,serverTimestamp:()=>null,doc:(db,col,id)=>id,writeBatch:()=>({set:(id,data)=>writes.push({id,data}),commit:async()=>{commits++}}),azpInvalidateSalaryCache:()=>{},azpRenderTodaySalaryDue:()=>{},showToast:()=>{},money:String,console});
 vm.runInContext(source.slice(source.indexOf('    window._paySalaryFinal ='),source.indexOf('    window._approveReferral =')),ctx);
 await ctx.window._paySalaryFinal('live-one');assert.equal(commits,1);assert.equal(writes.length,2);
 const history=writes.find(x=>x.data.record_type==='Paid History').data;assert.equal(history.paid_amount,8000);assert.equal(history.paid_through_date,'2026-09-29');assert.equal(history.salary_payment_policy,ctx.AZP_SALARY_POLICY_EPOCH);
 assert.equal(balance(ctx).final_salary_payable,0);assert.equal(ctx.allData.find(x=>x.id==='live-two').final_salary_payable,9000);
 await ctx.window._paySalaryFinal('live-one');assert.equal(commits,1);
 ctx.azpSalaryIndiaToday=()=> '2026-09-30';assert.equal(balance(ctx).final_salary_payable,266.67);
});

test('approved requests deduct once and remain archived after settlement',()=>{const c=salaryContext('2026-10-08');c.allData=[{id:'adv1',module:'advanceRequest',master_id:'one',date:'2026-10-08',amount:1000,approval_status:'Approved'}];const r=balance(c);assert.equal(r.approved_advance_amount,1000);assert.equal(r.paid_credit_amount,1000);assert.equal(r.final_salary_payable,r.total_salary_earned_before_paid-1000);assert.equal(balance(c).paid_credit_amount,1000);c.allData.push({id:'paid',module:'salaryFinalApproval',master_id:'one',payment_status:'Paid',settlement_locked:'Yes',included_advance_request_ids:['adv1']});assert.equal(balance(c).approved_advance_amount,0);});
