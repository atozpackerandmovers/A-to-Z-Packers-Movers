/* Form adapted from atozpackersandmoverss/fuel_update1.html.
   Execution is authoritative; no local-storage balance or automatic WhatsApp sends. */
(function(){
  'use strict';
  const L=window.AZPFuelLedger,$=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let context=null,records=[],busy=false,requestId=crypto.randomUUID(),inFlight=null,draftKey='',restored=false;
  const fields=['vehicleSel','meterStart','meterEnd','partyLocation','litres','pricePerLitre','mileage','bossAmount','bossNote'];
  const post=(type,data={})=>parent.postMessage({type,...data},location.origin);
  function raw(){return {vehicle:$('vehicleSel').value,vehicle_manual:!!window.AZPFuelExtras?.isManualVehicle($('vehicleSel').value),start:$('meterStart').value,end:$('meterEnd').value,mileage:$('mileage').value,ppl:$('pricePerLitre').value,boss_amount:$('bossAmount').value,location:$('partyLocation').value.trim(),fuel_filled_litre:$('litres').value,survey:document.querySelector('input[name=sr]:checked')?.value==='yes'?'Yes':'No',note:$('bossNote').value.trim()};}
  function summary(){return L.summary(records);}
  function persist(){if(!draftKey)return;try{sessionStorage.setItem(draftKey,JSON.stringify({requestId,values:Object.fromEntries(fields.map(id=>[id,$(id).value])),survey:raw().survey,review:!$('review').hidden}));}catch(_){}}
  function restore(){if(restored||!draftKey)return;restored=true;try{const d=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(!d)return;requestId=/^[a-zA-Z0-9-]{16,80}$/.test(d.requestId)?d.requestId:requestId;fields.forEach(id=>{if(d.values?.[id]!==undefined)$(id).value=d.values[id];});$('srYes').checked=d.survey==='Yes';$('srNo').checked=d.survey!=='Yes';$('review').hidden=!d.review;}catch(_){}}
  function setBusy(value){busy=value;fields.forEach(id=>$(id).disabled=value);$('driverSel').disabled=true;['btnReview','btnReset','btnSave'].forEach(id=>$(id).disabled=value||!context);document.querySelectorAll('input[name=sr]').forEach(el=>el.disabled=value);$('btnSave').textContent=value?'Saving…':'Save Entry';}
  function refreshTotals(){
    const r=raw(),s=L.amount(r.start),e=L.amount(r.end),mil=L.amount(r.mileage),ppl=L.amount(r.ppl);
    const distance=s!==null&&e!==null&&e>s?L.round(e-s):0,consumption=mil>0&&ppl>0?L.round(distance/mil*ppl):0;
    $('outDistance').textContent=distance.toLocaleString('en-IN');$('outMileage').textContent=mil||'—';$('outPpl').textContent=(ppl||0).toFixed(2);
    $('outConsumption').textContent=L.money(consumption);$('outTotal').textContent=L.money(consumption);
    $('thumb').classList.toggle('show',$('srYes').checked);
    const prev=summary();
    try{const v=L.calculate(r),projected=L.round(prev.balance+v.difference_amount);$('projection').textContent=`Previous saved balance: ${L.signed(prev.balance)}\nThis entry: ${L.money(v.consumption)} fuel − ${L.money(v.boss_amount)} company paid = ${L.signed(v.difference_amount)}\nAfter saving: ${L.signed(projected)} — ${L.label(projected)}${prev.unknown?'\nOlder incomplete entries are excluded pending office review.':''}`;}
    catch(_){$('projection').textContent='Enter valid meter readings and the company payment (0 if none) to preview the balance.';}
    $('paymentPreview').textContent=$('projection').textContent;
  }
  function prefillMeter(){
    const rows=records.filter(r=>L.vehicle(r.vehicle_number||r.vehicle)===L.vehicle($('vehicleSel').value));
    const last=rows.find(r=>L.amount(r.meter_end??r.end)!==null);
    if(last){$('meterStart').value=last.meter_end??last.end;$('meterNote').textContent='Starting meter is suggested from your last saved entry for this vehicle. Check it before saving.';}
    else{$('meterStart').value='';$('meterNote').textContent='Enter the actual starting meter for this trip.';}
  }
  function render(){
    const s=summary();
    $('balance').innerHTML=`<div class="metric positive"><small>Driver को देना है</small><strong>${L.money(s.driverDue)}</strong><small>Company pays driver</small></div><div class="metric negative"><small>Company को वापस मिलना है</small><strong>${L.money(s.companyDue)}</strong><small>Driver returns unused advance</small></div><div class="metric"><small>Fuel cost (complete entries)</small><strong>${L.money(s.expense)}</strong></div><div class="metric"><small>Company paid (complete entries)</small><strong>${L.money(s.paid)}</strong></div><div class="metric wide"><small>Net saved balance</small><strong>${L.signed(s.balance)}</strong><small>${s.unknown?'Partial balance — office review pending':L.label(s.balance)} · ${s.count} reconciled entries${s.returned?' · Returned to company: '+L.money(s.returned):''}</small></div>`;
    $('reviewNote').innerHTML=s.unknown?`<div class="notice">${s.unknown} older/incomplete record(s) need office review. Their missing payment amounts are not assumed to be zero; the balance above is partial.</div>`:(!s.count?'<p class="muted">No saved fuel settlements yet. Records from the old external form are not automatically imported.</p>':'');
    $('history').innerHTML=records.length?records.map(r=>{const e=L.entry(r);return `<tr><td>${esc(r.date||'—')}<br>${esc(r.vehicle_number||r.vehicle||'—')}</td><td>${esc(r.meter_start??r.start??'—')} → ${esc(r.meter_end??r.end??r.meter_reading??'—')}<br>${esc(r.distance??r.km??'—')} KM</td><td>${e.expense===null?'—':L.money(e.expense)}</td><td>${e.paid===null?'Not recorded':L.money(e.paid)}</td><td>${e.known?L.signed(e.delta):'Needs office review'}${e.returned?'<br>Returned: '+L.money(e.returned):''}</td><td>${esc(r.remarks||r.location||r.party_location||'—')}</td></tr>`;}).join(''):'<tr><td colspan="6">No Execution fuel records for this driver.</td></tr>';
    refreshTotals();
  }
  window.addEventListener('message',e=>{
    if(e.source!==parent||e.origin!==location.origin)return;
    const d=e.data||{};
    if(d.type==='AZP_FUEL_CONTEXT'){
      if(!d.driver||!Array.isArray(d.records)||!Array.isArray(d.vehicles))return;
      const first=!context||context.driver!==d.driver;
      if(context&&context.driver!==d.driver){
        // Never carry another driver's unsaved money/meter draft across account switches.
        inFlight=null;busy=false;restored=false;requestId=crypto.randomUUID();
        fields.forEach(id=>$(id).value='');$('pricePerLitre').value='102';$('mileage').value='8';
        $('srYes').checked=false;$('srNo').checked=true;$('review').hidden=true;$('saveMessage').textContent='';
      }
      context=d;records=d.records;
      $('identity').textContent=d.driver+' — Driver';$('driverSel').innerHTML='<option>'+esc(d.driver)+'</option>';
      const previous=$('vehicleSel').value;$('vehicleSel').innerHTML=d.vehicles.map(v=>'<option>'+esc(v)+'</option>').join('');
      if(d.vehicles.includes(previous))$('vehicleSel').value=previous;
      window.AZPFuelExtras?.syncVehicles(d,previous);
      draftKey='azp_fuel_draft_v1:'+d.driver;restore();
      if(first&&!$('meterStart').value)prefillMeter();
      $('connection').textContent=d.vehicles.length?'Connected to Execution · '+d.driver:'No assigned vehicle found. Ask the office to assign your vehicle.';
      if(!busy)setBusy(false);$('btnReview').disabled=busy||!$('vehicleSel').value;render();
      if(document.dispatchEvent)document.dispatchEvent(new CustomEvent('azp-fuel-context',{detail:d}));
    }
    if(d.type==='AZP_FUEL_SAVE_RESULT'&&d.requestId===inFlight){
      setBusy(false);inFlight=null;
      if(!d.ok){$('saveMessage').textContent='Not saved: '+(d.error||'Please retry. Your draft is retained.');return;}
      if(d.record){records=[d.record,...records.filter(r=>r.id!==d.record.id)];}
      $('saveMessage').textContent='Saved to Execution. Entry: '+d.id;
      requestId=crypto.randomUUID();$('meterEnd').value='';$('partyLocation').value='';$('litres').value='';$('bossAmount').value='';$('bossNote').value='';
      prefillMeter();persist();render();
      if(document.dispatchEvent)document.dispatchEvent(new CustomEvent('azp-fuel-saved',{detail:d}));
    }
  });
  $('vehicleSel').addEventListener('change',()=>{prefillMeter();refreshTotals();persist();});
  document.addEventListener('input',()=>{refreshTotals();persist();});document.addEventListener('change',()=>{refreshTotals();persist();});
  $('btnReview').onclick=()=>{try{L.calculate({...raw(),boss_amount:raw().boss_amount||0});$('review').hidden=false;$('bossAmount').focus();refreshTotals();persist();}catch(e){alert(e.message);}};
  $('btnSave').onclick=()=>{
    if(busy||!context)return;
    try{L.calculate(raw());if(!raw().vehicle)throw Error('Select or add a vehicle.');const litres=L.amount(raw().fuel_filled_litre);if(raw().fuel_filled_litre!==''&&(litres===null||litres<0))throw Error('Fuel filled litres must be non-negative.');}
    catch(e){$('saveMessage').textContent=e.message;return;}
    persist();inFlight=requestId;setBusy(true);$('saveMessage').textContent='Saving to Execution…';post('AZP_FUEL_SAVE',{requestId,entry:raw()});
  };
  const resetDraft=(ask=true)=>{if(busy)return;if(ask&&!confirm('Clear this unsaved draft? Saved Execution records will remain.'))return;requestId=crypto.randomUUID();['meterEnd','partyLocation','litres','bossAmount','bossNote'].forEach(id=>$(id).value='');$('review').hidden=true;$('saveMessage').textContent='';prefillMeter();persist();refreshTotals();if(document.dispatchEvent)document.dispatchEvent(new CustomEvent('azp-fuel-reset'));};
  $('btnReset').onclick=()=>resetDraft();
  $('btnWA').onclick=()=>{if(!context)return;const s=summary();const msg=['A TO Z — Fuel Summary',context.driver,`Fuel (complete entries): ${L.money(s.expense)}`,`Company payments: ${L.money(s.paid)}`,`Returned to company: ${L.money(s.returned)}`,`Balance: ${L.signed(s.balance)} — ${L.label(s.balance)}`,s.unknown?`${s.unknown} incomplete record(s) excluded; office review required.`:''].filter(Boolean).join('\n');window.open('https://wa.me/919338888550?text='+encodeURIComponent(msg),'_blank','noopener');};
  $('btnPDF').onclick=()=>{
    if(!records.length)return alert('No saved entries to export.');
    const jsPDF=window.jspdf?.jsPDF;if(!jsPDF)return alert('PDF library could not load. Please try again.');
    const pdf=new jsPDF({unit:'pt',format:'a4',orientation:'landscape'}),s=summary();let y=36;
    const line=t=>{if(y>550){pdf.addPage();y=36;}pdf.text(t,32,y);y+=17;};
    pdf.setFontSize(16);line('A TO Z Packers & Movers - Fuel Report');pdf.setFontSize(10);line(context.driver+' | '+new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}));
    const rs=v=>'INR '+Number(v||0).toFixed(2);
    line('Complete entries - Fuel: '+rs(s.expense)+' | Company paid: '+rs(s.paid)+' | Returned: '+rs(s.returned));line('Balance: '+rs(s.balance)+' | '+(s.balance>0?'Pay driver':s.balance<0?'Return to company':'Settled'));
    if(s.unknown)line(s.unknown+' incomplete records excluded from balance; office review required.');
    y+=10;
    for(const r of records){const e=L.entry(r);const lines=pdf.splitTextToSize(`${r.date||'-'} | ${r.vehicle_number||r.vehicle||'-'} | Meter ${r.meter_start??r.start??'-'} to ${r.meter_end??r.end??'-'} | Fuel ${e.expense===null?'unknown':rs(e.expense)} | Paid ${e.paid===null?'unknown':rs(e.paid)} | Difference ${e.known?rs(e.delta):'Needs review'}`,770);for(const t of lines)line(t);y+=5;}
    pdf.save('Fuel_'+context.driver.replace(/[^a-z0-9]/gi,'_')+'.pdf');
  };
  window.AZPFuelForm={
    rotateDraftId:()=>{if(!busy){requestId=crypto.randomUUID();persist();}},
    getContext:()=>context,getRecords:()=>records,isBusy:()=>busy,readEntry:raw,
    getDraft:()=>({requestId,values:Object.fromEntries(fields.map(id=>[id,$(id).value])),survey:raw().survey}),
    loadDraft:d=>{if(busy)return false;requestId=d.requestId;fields.forEach(id=>{if(d.values?.[id]!==undefined)$(id).value=d.values[id]});$('srYes').checked=d.survey==='Yes';$('srNo').checked=d.survey!=='Yes';$('review').hidden=false;$('saveMessage').textContent='';refreshTotals();persist();return true;},
    refresh:()=>{refreshTotals();persist();},
    reset:()=>resetDraft(false)
  };
  for(let v=8;v<=18;v+=.5){const o=document.createElement('option');o.value=v;o.textContent=v+':1';$('mileage').append(o);}
  let lastHeight=0;new ResizeObserver(()=>{const height=Math.ceil(document.querySelector('main').getBoundingClientRect().height)+24;if(height!==lastHeight){lastHeight=height;post('AZP_FUEL_HEIGHT',{height});}}).observe(document.querySelector('main'));
  render();post('AZP_FUEL_READY');
  if(parent===window)$('connection').textContent='Open this form from the Driver App → Fuel section after signing in.';
})();
