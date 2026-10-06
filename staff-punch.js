/* Office self-service punches, stored in the existing Execution attendance ledger. */
(function(root){
  'use strict';
  const R=root.AZPAttendanceRules||(typeof require==='function'?require('./attendance-rules.js'):null);
  const norm=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const alias=v=>{const n=norm(v);return /^(swagatika|swagathika|swagatka|sagatika)(mam|maam|madam)?$/.test(n)?'swagatika':/^sanju(mam|maam|madam|ofc|office)?$/.test(n)?'sanju':n;};
  const moduleOf=r=>r.module||r.collection;
  const nameOf=r=>String(r.indoor_staff_name||r.employee_name||r.staff_name||r.name||'').trim();
  function india(ms=Date.now()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)),p=t=>parts.find(x=>x.type===t).value;return {date:`${p('year')}-${p('month')}-${p('day')}`,time:`${p('hour')}:${p('minute')}`};}
  function resolveMaster(rows,user){if(!['swagatika','sanju'].includes(alias(user?.name)))return null;const matches=rows.filter(r=>moduleOf(r)==='indoorStaffMaster'&&alias(nameOf(r))===alias(user.name));if(matches.length!==1)throw Error('Office must link this login to exactly one Indoor Staff Master record.');const m=matches[0];if(user.phone&&m.mobile&&String(user.phone).replace(/\D/g,'').slice(-10)!==String(m.mobile).replace(/\D/g,'').slice(-10))throw Error('Login mobile does not match Indoor Staff Master.');return m;}
  function eligible(master,date){if(!master)throw Error('Indoor Staff Master is required.');if(/inactive|suspend|black/.test(norm(master.status||'Active')))throw Error('Punching is available only for active staff.');const join=String(master.reactivation_date||master.joining_date||master.join_date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(join)||date<join)throw Error('Office must set a valid Joining Date before punching.');}
  function own(r,m){return r.master_id?String(r.master_id)===String(m.id):alias(r.employee_name||r.staff_name)===alias(nameOf(m))&&(!r.role||r.role==='Indoor Staff');}
  function dayRows(rows,m,date){return rows.filter(r=>['attendance','leaveApproval'].includes(moduleOf(r))&&own(r,m)&&R.effective(r)&&R.start(r)<=date&&R.end(r)>=date).sort((a,b)=>R.time(a)-R.time(b));}
  function target(rows,m,now){const open=rows.filter(r=>moduleOf(r)==='attendance'&&own(r,m)&&(r.punch_in||r.check_in)&&!(r.punch_out||r.check_out)).sort((a,b)=>R.time(b)-R.time(a))[0];if(open)return open;return dayRows(rows,m,india(now).date).filter(r=>moduleOf(r)==='attendance').at(-1)||null;}
  const minutes=t=>{const m=String(t||'').match(/^(\d{2}):(\d{2})$/);return m?+m[1]*60+ +m[2]:null;};
  const SHIFTS=[{id:'morning',label:'Morning',start:'10:00',end:'14:30'},{id:'evening',label:'Evening',start:'18:00',end:'22:00'}];
  function sessions(r={}){
    if(Array.isArray(r.punch_sessions))return r.punch_sessions.map(x=>({...x}));
    if(!(r.punch_in||r.check_in))return [];
    const pin=r.punch_in||r.check_in,pout=r.punch_out||r.check_out||'',shift=SHIFTS[minutes(pin)>=18*60?1:0];
    return [{shift_id:shift.id,label:shift.label,scheduled_start:shift.start,scheduled_end:shift.end,punch_in:pin,punch_out:pout,punch_in_date:r.punch_in_date||r.date,punch_out_date:r.punch_out_date||(pout?r.date:''),punch_in_at_ms:Number(r.punch_in_at_ms)||Date.parse(`${r.date}T${pin}:00+05:30`),punch_out_at_ms:Number(r.punch_out_at_ms)||(pout?Date.parse(`${r.punch_out_date||r.date}T${pout}:00+05:30`):0),working_minutes:pout?Number(r.working_minutes||0):0,late_minutes:Math.max(0,minutes(pin)-minutes(shift.start)),early_exit_minutes:pout&&(!r.punch_out_date||r.punch_out_date===r.date)?Math.max(0,minutes(shift.end)-minutes(pout)):0,legacy:true}];
  }
  function shiftState(r={},now=Date.now(),requested=''){
    const list=sessions(r),open=list.find(x=>x.punch_in&&!x.punch_out);
    const key=open?.shift_id||requested||(minutes(india(now).time)>=14*60+30?'evening':'morning');
    const shift=SHIFTS.find(x=>x.id===key);if(!shift)throw Error('Select Morning or Evening shift.');
    return {shift,list,session:list.find(x=>x.shift_id===key)||{},open};
  }
  function patch(action,old,m,now,settings={},effectiveRows=[],requested=''){
    const stamp=india(now),date=old.date||stamp.date;eligible(m,stamp.date);
    if(effectiveRows.some(r=>!['present','restorepresent',''].includes(norm(R.status(r)))))throw Error('Office has marked this day Half Day, Absent or Leave. Ask Office to review it before punching.');
    const {shift,list,session,open}=shiftState(old,now,requested),hasIn=!!session.punch_in,hasOut=!!session.punch_out;
    if(action==='in'&&(open||hasIn||hasOut))throw Error(open?'Already punched in. Punch Out first.':'This shift is already complete.');
    if(action==='out'&&(!hasIn||hasOut))throw Error(hasOut?'Already punched out.':'Punch In first.');
    if(action!=='in'&&action!=='out')throw Error('Invalid punch action.');
    const item={...session,shift_id:shift.id,label:shift.label,scheduled_start:shift.start,scheduled_end:shift.end};
    if(action==='in'){
      if(date!==stamp.date)throw Error('Close the previous shift first.');
      if(list.some(x=>Number(x.punch_out_at_ms)>now))throw Error('Punch time must be after the previous shift.');
      Object.assign(item,{punch_in:stamp.time,punch_in_date:date,punch_in_at_ms:now,punch_out:'',punch_out_date:'',punch_out_at_ms:0,working_minutes:0,late_minutes:Math.max(0,minutes(stamp.time)-minutes(shift.start)),early_exit_minutes:0});
    }else{
      const from=Number(item.punch_in_at_ms);if(!Number.isFinite(from)||!from||now<from)throw Error('Punch Out must be after Punch In.');
      Object.assign(item,{punch_out:stamp.time,punch_out_date:stamp.date,punch_out_at_ms:now,working_minutes:Math.floor((now-from)/60000),early_exit_minutes:stamp.date===date?Math.max(0,minutes(shift.end)-minutes(stamp.time)):0});
    }
    const updated=list.filter(x=>x.shift_id!==shift.id).concat(item).sort((a,b)=>a.punch_in_at_ms-b.punch_in_at_ms),first=updated[0],last=updated.at(-1),isOpen=updated.some(x=>x.punch_in&&!x.punch_out),late=updated.reduce((n,x)=>n+Number(x.late_minutes||0),0),early=updated.reduce((n,x)=>n+Number(x.early_exit_minutes||0),0);
    return {module:'attendance',collection:'attendance',employee_name:nameOf(m),staff_name:nameOf(m),role:'Indoor Staff',master_id:m.id,master_module:'indoorStaffMaster',date,leave_from_date:date,leave_to_date:date,attendance_status:'Present',status:'Present',approval_status:'Approved',company_approval:'Approved',salary_day_value:1,source_app:'staffPortalPunch',record_type:'officePunch',updatedAtMs:now,punch_schedule:'office-split-v1',scheduled_working_minutes:510,punch_sessions:updated,punch_in:first.punch_in,check_in:first.punch_in,punch_in_date:first.punch_in_date,punch_in_at_ms:first.punch_in_at_ms,punch_out:isOpen?'':last.punch_out,check_out:isOpen?'':last.punch_out,punch_out_date:isOpen?'':last.punch_out_date,punch_out_at_ms:isOpen?0:last.punch_out_at_ms,working_minutes:updated.reduce((n,x)=>n+Number(x.working_minutes||0),0),office_presence:isOpen?'In Office':'Left Office',late:late?'Yes':'No',early_exit:early?'Yes':'No',late_minutes:late,early_exit_minutes:early};
  }
  const api={alias,india,resolveMaster,eligible,dayRows,target,patch,SHIFTS,sessions,shiftState};root.AZPStaffPunch=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(!root.document)return;
  let rows=[],user=null,db=null,busy=false,synced=false,message='',selectedShift='';
  const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(){
    const dash=document.getElementById('dash');let box=document.getElementById('office-punch');
    if(!dash||!user||!['swagatika','sanju'].includes(alias(user.name))){box?.remove();return;}
    if(!box){box=document.createElement('section');box.id='office-punch';box.className='panel';dash.prepend(box);}
    let m,r,error='';try{if(synced){m=resolveMaster(rows,user);eligible(m,india().date);r=target(rows,m,Date.now());}}catch(e){error=e.message;}
    const state=shiftState(r||{},Date.now(),selectedShift),pin=state.session.punch_in,pout=state.session.punch_out,disabled=busy||!synced||!!error;
    box.innerHTML=`<div class="punch-head"><div><h2>Office Attendance</h2><p>${esc(india().date)} · India time</p></div><span class="punch-badge">${esc(r?.office_presence||(pin?(pout?'Left Office':'In Office'):'Not punched in'))}</span></div><label class="punch-note" for="office-punch-shift">Select shift</label><select id="office-punch-shift" class="punch-select" ${busy||state.open?'disabled':''}>${SHIFTS.map(x=>`<option value="${x.id}" ${x.id===state.shift.id?'selected':''}>${x.label} · ${x.start}–${x.end}</option>`).join('')}</select><div class="punch-times"><div><span>Punch In</span><strong>${esc(pin||'—')}</strong></div><div><span>Punch Out</span><strong>${esc(pout||'—')}</strong></div><div><span>Working Hours</span><strong>${pout?`${Math.floor((state.session.working_minutes||0)/60)}h ${(state.session.working_minutes||0)%60}m`:pin?'In progress':'—'}</strong></div></div>${r?.date&&r.date!==india().date?`<p class="punch-note">Open shift from ${esc(r.date)}. Punch Out closes that shift first.</p>`:''}<div class="punch-actions"><button id="office-punch-in" class="btn green" ${disabled||pin?'disabled':''}>Punch In</button><button id="office-punch-out" class="btn" ${disabled||!pin||pout?'disabled':''}>Punch Out</button></div>${state.list.length?`<div class="punch-shifts">${SHIFTS.map(x=>{const v=state.list.find(y=>y.shift_id===x.id);return `<p><b>${x.label} (${x.start}–${x.end})</b><br>In ${esc(v?.punch_in||'—')} · Out ${esc(v?.punch_out||'—')} · Late ${Number(v?.late_minutes||0)}m · Early Exit ${Number(v?.early_exit_minutes||0)}m</p>`;}).join('')}<p><b>Daily hours: ${Math.floor((r?.working_minutes||0)/60)}h ${(r?.working_minutes||0)%60}m</b> · Scheduled: 8h 30m. Break excluded.</p></div>`:''}<p class="punch-note">Punch In marks Present. Punch Out records departure and hours; the day stays Present. Office reviews Half Day / Absent separately.</p><p id="office-punch-message" role="status">${esc(error||message||(!synced?'Connecting to Execution attendance…':'Saved punches appear in Execution → Attendance → your name → Daily Attendance.'))}</p>`;
    box.querySelector('#office-punch-shift').onchange=e=>{selectedShift=e.target.value;render();};box.querySelector('#office-punch-in').onclick=()=>save('in');box.querySelector('#office-punch-out').onclick=()=>save('out');
  }
  async function save(action){
    if(busy||!synced||!db||!user)return;const identity=user,requested=document.getElementById('office-punch-shift')?.value;busy=true;message='Saving to Execution attendance…';render();
    try{
      if(!navigator.onLine)throw Error('Internet is required. No punch has been saved; reconnect and retry.');
      const m=resolveMaster(rows,identity),now=Date.now(),existing=target(rows,m,now),date=existing?.date||india(now).date;
      const relevant=dayRows(rows,m,date),id=existing?.id||('ATT_'+nameOf(m)+'_'+date).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,90),col=db.collection('azpExecutionRecords'),ref=col.doc(id);
      const settings=rows.filter(r=>moduleOf(r)==='attendanceSettings').sort((a,b)=>R.time(b)-R.time(a))[0]||{};
      const result=await db.runTransaction(async tx=>{
        const masterDoc=await tx.get(col.doc(m.id)),dayDoc=await tx.get(ref),others=[];
        for(const r of relevant){if(r.id!==id){const doc=await tx.get(col.doc(r.id));if(doc.exists)others.push({id:doc.id,...doc.data()});}}
        if(user!==identity||Date.now()-now>60000)throw Error('Login or punch time changed. Retry from your own dashboard.');
        if(!masterDoc.exists)throw Error('Indoor Staff Master no longer exists.');
        const fresh={...masterDoc.data(),id:masterDoc.id};resolveMaster([fresh],identity);
        const old=dayDoc.exists?dayDoc.data():{};
        if(dayDoc.exists&&(!own(old,fresh)||moduleOf(old)!=='attendance'))throw Error('Attendance record identity does not match. Ask Office to review.');
        const data=patch(action,old,fresh,now,settings,[...others,...(dayDoc.exists?[old]:[])],requested);
        const stamp=firebase.firestore.FieldValue.serverTimestamp();tx.set(ref,{...data,updatedAt:stamp,[action==='in'?'punch_in_at':'punch_out_at']:stamp,...(!dayDoc.exists?{createdAt:stamp,createdAtMs:now}:{})},{merge:true});return {id,...old,...data};
      });
      rows=rows.filter(r=>r.id!==id).concat(result);selectedShift='';message=action==='in'?'Punch In saved — Present, In Office.':'Punch Out saved — Left Office; attendance remains Present.';
    }catch(e){message='Not saved: '+(e.message||'Please retry.');}finally{busy=false;render();}
  }
  api.sync=(data,person,database)=>{rows=data;user=person;db=database;synced=true;render();};
  api.connect=person=>{user=person;synced=false;message='';selectedShift='';render();};
  api.reset=()=>{user=null;rows=[];synced=false;message='';selectedShift='';render();};
  api.fail=()=>{synced=false;message='Attendance connection failed. Reconnect before punching.';render();};
  setInterval(()=>{if(user&&!busy)render();},60000);
})(globalThis);
