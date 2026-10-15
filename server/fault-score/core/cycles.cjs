'use strict';
const POLICY='owner-approved-score-calendar-ist-v2';
// Verified exact master IDs and matching joining-date aliases, 2026-10-15.
// Never derive boundaries from paid-through or the live accrual-end field.
const CALENDARS=Object.freeze({INDOOR_STAFF_ZD9A1Z:'2026-08-27',INDOOR_STAFF_10HIAWK:'2026-10-01',INDOOR_STAFF_1MJSC46:'2026-07-30',INDOOR_STAFF_9JJREB:'2026-10-01'});
// Owner approved Swagatika's score reset on the 28th, after her due date on
// the 27th. This score-only calendar does not change her July 30 joining date.
const RESET_DAYS=Object.freeze({INDOOR_STAFF_ZD9A1Z:27,INDOOR_STAFF_10HIAWK:1,INDOOR_STAFF_1MJSC46:28,INDOOR_STAFF_9JJREB:1});
const fail=message=>{throw Object.assign(Error(message),{status:503});};
const dayMs=86400000,format=d=>d.toISOString().slice(0,10),midnight=iso=>Date.parse(iso+'T00:00:00+05:30');
function indiaDate(now){if(!Number.isSafeInteger(now))fail('Invalid cycle clock');return format(new Date(now+19800000));}
function anniversary(year,month,day){const d=new Date(Date.UTC(year,month,1)),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();return format(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),Math.min(day,last))));}
function cycleAt(staffId,now){
 const join=CALENDARS[staffId];if(!join)fail('Unapproved score calendar');const today=indiaDate(now);if(today<join)fail('Cycle precedes joining date');
 const [y,m]=today.split('-').map(Number),day=RESET_DAYS[staffId],offset=anniversary(y,m-1,day)>today?-1:0,anchor=anniversary(y,m-1+offset,day),start=anchor<join?join:anchor,next=anniversary(y,m+offset,day);
 return {start,next,end:format(new Date(Date.parse(next+'T00:00:00Z')-dayMs)),nextAt:midnight(next)};
}
function validScore(value){if(!Number.isInteger(value)||value<0||value>100)fail('Authoritative balance unavailable');return value;}
function validateMeta(meta,staffId){if(!meta||meta.policy!==POLICY||meta.joiningDate!==CALENDARS[staffId]||meta.resetDay!==RESET_DAYS[staffId]||meta.staffId!==staffId||typeof meta.armed!=='boolean'||!Number.isSafeInteger(meta.adoptedAt)||meta.start!==cycleAt(staffId,meta.currentAt).start)fail('Cycle metadata unavailable or changed');}
// Operator-only preparation helper; not exposed by any HTTP/queue route.
// Run while cycle mode is disabled, then arm before any recorded boundary.
function adoptCycles(tx,now){
 const result=[];for(const staffId of Object.keys(CALENDARS)){const score=validScore(tx.getScore(staffId)),existing=tx.getCycle(staffId);if(existing){validateMeta(existing,staffId);result.push({staffId,status:'already-adopted',score});continue;}const c=cycleAt(staffId,now);tx.setCycle(staffId,{policy:POLICY,staffId,joiningDate:CALENDARS[staffId],resetDay:RESET_DAYS[staffId],start:c.start,currentAt:now,adoptedAt:now,adoptedScore:score,armed:false});result.push({staffId,status:'adopted',score,armBefore:c.next});}return result;
}
function ensureCycle(tx,staffId,now){
 const target=cycleAt(staffId,now);let meta=tx.getCycle(staffId);validateMeta(meta,staffId);let score=validScore(tx.getScore(staffId));
 if(target.start<meta.start)fail('Cycle clock moved backwards');
 // Fail closed if migration was not verified/armed before its first boundary:
 // old code might have applied current-cycle deductions during the gap.
 if(!meta.armed&&target.start!==meta.start)fail('Migration crossed boundary before arming; review required');
 if(!meta.armed){meta={...meta,armed:true,armedAt:now};tx.setCycle(staffId,meta);}
 let count=0;
 while(meta.start<target.start){
  if(++count>1200)fail('Cycle catch-up exceeds review bound');const prior=cycleAt(staffId,meta.currentAt),key=JSON.stringify([staffId,prior.start]);
  if(tx.getCycleArchive(key)!==undefined)fail('Existing cycle archive conflicts with metadata');
  tx.setCycleArchive(key,{policy:POLICY,staffId,resetDay:RESET_DAYS[staffId],cycleStart:prior.start,cycleEnd:prior.end,action:'cycle-reset',before:score,after:100,effectiveAt:prior.nextAt,processedAt:now,reason:'New owner-approved score cycle; payment status is irrelevant'});
  score=100;meta={...meta,start:prior.next,currentAt:prior.nextAt,lastResetAt:now};
 }
 if(count){tx.setScore(staffId,score);tx.setCycle(staffId,meta);}
 return {start:meta.start,resets:count,score};
}
async function rolloverAll({transaction,now=Date.now}){const at=now();return transaction(tx=>Object.keys(CALENDARS).map(staffId=>({staffId,...ensureCycle(tx,staffId,at)})));}
module.exports={POLICY,CALENDARS,RESET_DAYS,cycleAt,adoptCycles,ensureCycle,rolloverAll};
