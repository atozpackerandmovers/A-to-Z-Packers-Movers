/* Video-reference features: GPS photo output, session drafts, WhatsApp and monthly PDF.
   Photos stay on the device; only the explicit user Share action passes them onward. */
(function(root){
  'use strict';
  function phone(value){let n=String(value||'').replace(/\D/g,'');if(n.length===10)n='91'+n;if(!/^\d{11,15}$/.test(n))throw Error('Enter a valid WhatsApp number including country code.');return n;}
  const indiaDate=ts=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));
  const monthRows=(rows,month)=>rows.filter(r=>String(r.date||indiaDate(r.ts)).slice(0,7)===month);
  function stampLines(r,ts){return ['A TO Z Packers & Movers — Fuel Report',`Driver: ${r.driver} | Vehicle: ${r.vehicle}`,`Meter: ${r.start} → ${r.end} | Distance: ${r.distance} KM`,`Mileage: ${r.mileage}:1 | Price: INR ${Number(r.ppl).toFixed(2)} | Fuel: INR ${Number(r.consumption).toFixed(2)}`,`Company paid: ${r.boss_amount===null||r.boss_amount===undefined||String(r.boss_amount).trim()===''?'Not recorded':'INR '+Number(r.boss_amount).toFixed(2)}`,`Difference (Fuel - Company): ${r.boss_amount===null||r.boss_amount===undefined||String(r.boss_amount).trim()===''?'Needs review':'INR '+(Number(r.consumption)-Number(r.boss_amount)).toFixed(2)}`,`Location: ${r.location||'—'}`,`Report generated: ${new Date(ts).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST`];}
  function validatePhoto(file){if(!file||!/^image\//.test(file.type||''))throw Error('Choose an image file.');if(file.size>20*1024*1024)throw Error('Please use an image smaller than 20 MB.');return file;}
  function settlementLines(r,ledger){
    const e=ledger.entry(r);
    if(!e.known)return ['Company paid: Not recorded','Settlement: Needs office review'];
    return [`Company paid: ${ledger.money(e.paid)}`,`Difference (Fuel − Company paid + Returned): ${ledger.signed(e.delta)} — ${ledger.label(e.delta)}`];
  }
  const api={phone,indiaDate,monthRows,stampLines,validatePhoto,settlementLines};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(!root.document)return;
  const L=root.AZPFuelLedger,F=root.AZPFuelForm,$=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let owner='',queue=[],extraVehicles=[],initialMeters={},photo=null,photoUrl='',photoVersion=0;
  const key=()=> 'azp_fuel_video_session:'+owner;
  const defaults=()=>{queue=[];extraVehicles=[];initialMeters={};$('boss1').value='+919338888550';$('boss2').value='';};
  function persist(){if(!owner)return;try{sessionStorage.setItem(key(),JSON.stringify({queue,extraVehicles,initialMeters,boss1:$('boss1').value,boss2:$('boss2').value}));}catch(_){$('shareStatus').textContent='Session draft storage is full. Keep this page open until your entries are saved.';}}
  function switchOwner(name){
    if(name===owner)return;clearPhoto();owner=name;defaults();
    try{const old=JSON.parse(sessionStorage.getItem(key())||'null');if(old){queue=Array.isArray(old.queue)?old.queue:[];extraVehicles=Array.isArray(old.extraVehicles)?old.extraVehicles:[];initialMeters=old.initialMeters||{};$('boss1').value=old.boss1||'+919338888550';$('boss2').value=old.boss2||'';}}catch(_){}
    $('vehicleNew').value='';$('initMeterInput').value='';$('shareStatus').textContent='';$('shareLinks').innerHTML='';renderSession();
  }
  function addOptions(context,previous){
    switchOwner(context.driver);
    const select=$('vehicleSel'),vals=[...context.vehicles,...extraVehicles];
    const distinct=[...new Map(vals.map(v=>[L.vehicle(v),v])).values()];select.innerHTML=distinct.map(v=>'<option>'+esc(v)+'</option>').join('');
    if(distinct.includes(previous))select.value=previous;
  }
  root.AZPFuelExtras={syncVehicles:addOptions,isManualVehicle:v=>extraVehicles.some(x=>L.vehicle(x)===L.vehicle(v))};
  function entry(){
    const c=F.getContext();if(!c)throw Error('Wait for your Driver login to connect.');const r=F.readEntry();if(!r.vehicle)throw Error('Select or add a vehicle.');
    const calc=L.calculate(r);return {...r,...calc,start:calc.start,end:calc.end,mileage:calc.mileage,ppl:calc.ppl,consumption:calc.consumption,distance:calc.distance,driver:c.driver};
  }
  function renderSession(){
    $('sessionRows').innerHTML=queue.length?queue.map((q,i)=>`<tr><td>${i+1}</td><td>${esc(q.entry.driver)}</td><td>${esc(q.entry.vehicle)}</td><td>${q.entry.start}</td><td>${q.entry.end}</td><td>${q.entry.distance}</td><td>${q.entry.mileage}</td><td>${L.money(q.entry.consumption)}<br>${esc(settlementLines(q.entry,L).join(' | '))}</td><td>${q.savedId?'Saved to Execution':`<button class="btn-blue tiny" data-load="${i}">Review / Save</button>`}<button class="btn-red tiny" data-remove="${i}">Remove from Session</button></td></tr>`).join(''):'<tr><td colspan="9">No session entries yet.</td></tr>';
  }
  document.addEventListener('azp-fuel-context',e=>{switchOwner(e.detail.driver);renderSession();updateInitial();});
  document.addEventListener('azp-fuel-saved',e=>{const q=queue.find(x=>x.draft.requestId===e.detail.requestId);if(q){q.savedId=e.detail.id;const r=e.detail.record;if(r)q.entry={...q.entry,driver:r.driver,vehicle:r.vehicle_number,start:r.meter_start,end:r.meter_end,distance:r.distance,mileage:r.mileage,ppl:r.price_per_litre,consumption:r.fuel_cost,boss_amount:r.boss_amount,difference_amount:r.difference_amount,note:r.remarks};persist();renderSession();}updateInitial();});
  document.addEventListener('azp-fuel-reset',clearPhoto);
  $('boss1').addEventListener('change',persist);$('boss2').addEventListener('change',persist);
  $('btnAdd').onclick=()=>{try{const e=entry();let draft=F.getDraft(),old=queue.find(q=>q.draft.requestId===draft.requestId);if(old&&!old.savedId&&JSON.stringify(old.draft.values)!==JSON.stringify(draft.values)){F.rotateDraftId();draft=F.getDraft();old=null;}if(old?.savedId)throw Error('This session entry is already saved. Start a new draft.');const item={draft,entry:e,ts:Date.now(),date:indiaDate(Date.now())};if(old)Object.assign(old,item);else queue.push(item);persist();renderSession();$('shareStatus').textContent='Added to this session. Use Review & Save to Execution to save permanently.';}catch(e){alert(e.message);}};
  $('sessionRows').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||F.isBusy())return;
    if(b.dataset.load!==undefined){const q=queue[Number(b.dataset.load)];if(q&&!q.savedId){clearPhoto();F.loadDraft(q.draft);$('bossAmount').focus();}}
    if(b.dataset.remove!==undefined){queue.splice(Number(b.dataset.remove),1);persist();renderSession();}
  });
  $('addVehicle').onclick=()=>{
    if(!F.getContext()||F.isBusy())return;const v=$('vehicleNew').value.trim().toUpperCase();
    if(!/^[A-Z0-9 -]{6,20}$/.test(v)||!/[A-Z]/.test(v)||!/[0-9]/.test(v))return alert('Enter the vehicle registration number, e.g. OD 05 BD 8855.');
    if(![...F.getContext().vehicles,...extraVehicles].some(x=>L.vehicle(x)===L.vehicle(v)))extraVehicles.push(v);
    addOptions(F.getContext(),v);$('vehicleSel').value=[...F.getContext().vehicles,...extraVehicles].find(x=>L.vehicle(x)===L.vehicle(v));$('vehicleNew').value='';persist();$('vehicleSel').dispatchEvent(new Event('change',{bubbles:true}));$('btnReview').disabled=false;
    $('connection').textContent='Connected to Execution · '+owner;
  };
  function updateInitial(){
    const v=L.vehicle($('vehicleSel').value),last=F.getRecords().find(r=>L.vehicle(r.vehicle_number||r.vehicle)===v&&L.amount(r.meter_end??r.end)!==null),initial=initialMeters[v];
    $('setInitMeterBtn').disabled=!!last||initial!==undefined||!v;
    $('initialNote').textContent=last?'A previous ending meter is available for this vehicle.':initial!==undefined?'Initial meter set: '+initial:'Set initial meter when starting with a vehicle.';
    if(!last&&initial!==undefined&&!$('meterStart').value){$('meterStart').value=initial;F.refresh();}
  }
  $('setInitMeterBtn').onclick=()=>{if(F.isBusy())return;const v=L.vehicle($('vehicleSel').value),n=L.amount($('initMeterInput').value);if(!v||n===null||n<0)return alert('Select a vehicle and enter a valid initial meter.');if(initialMeters[v]!==undefined)return;initialMeters[v]=n;$('meterStart').value=n;$('initMeterInput').value='';persist();F.refresh();updateInitial();};
  $('vehicleSel').addEventListener('change',updateInitial);
  $('btnRestartSession').onclick=()=>{if(F.isBusy())return;if(!confirm('Start a new session? Session drafts will be cleared. Saved Execution entries remain.'))return;queue=[];persist();renderSession();F.reset();};
  function clearPhoto(keepInputs=false){photoVersion++;photo=null;if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl='';$('gpsPreview').removeAttribute('src');$('photoPanel').hidden=true;if(keepInputs!==true){$('gpsSnap').value='';$('gpsCamera').value='';}$('gpsApprove').checked=false;$('photoStatus').textContent='Photo is shared separately using WhatsApp or downloaded. It is not uploaded by Save Entry.';}
  async function selectPhoto(file){
    clearPhoto(true);if(!file)return;const version=photoVersion;let pendingUrl='';
    try{
      validatePhoto(file);const url=URL.createObjectURL(file),img=new Image();pendingUrl=url;
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Cannot read this image. Please choose a JPEG or PNG photo.'));img.src=url;});
      if(version!==photoVersion){URL.revokeObjectURL(url);return;}
      if(img.naturalWidth*img.naturalHeight>60000000){URL.revokeObjectURL(url);throw Error('Photo resolution is too large. Please use a smaller screenshot.');}
      photo={file,img};photoUrl=url;$('gpsPreview').src=url;$('photoPanel').hidden=false;$('photoStatus').textContent='Photo ready. Confirm it is clear, then share or download the stamped report. Save Entry saves fuel amounts only.';
    }catch(e){if(pendingUrl)URL.revokeObjectURL(pendingUrl);if(version===photoVersion)$('photoStatus').textContent=e.message;}
  }
  $('gpsSnap').addEventListener('change',e=>selectPhoto(e.target.files?.[0]));$('gpsCamera').addEventListener('change',e=>selectPhoto(e.target.files?.[0]));$('removePhoto').onclick=clearPhoto;
  async function stampedFile(rec){
    if(!photo)throw Error('Choose a GPS camera photo first.');if(!$('gpsApprove').checked)throw Error('Please confirm the GPS screenshot is clear.');
    const {img}=photo,W=Math.min(1600,img.naturalWidth),H=Math.round(img.naturalHeight*W/img.naturalWidth),font=Math.max(14,Math.round(W*.017)),pad=Math.max(12,Math.round(W*.016)),lineH=Math.ceil(font*1.5);
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo output is unavailable in this browser.');canvas.width=W;
    ctx.font=`bold ${font}px Arial`;const lines=[];
    for(const text of stampLines(rec,Date.now())){let line='';for(const word of text.split(' ')){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>W-pad*2){lines.push(line);line=word;}else line=next;}lines.push(line);}
    canvas.height=H+pad*2+lines.length*lineH;ctx.fillStyle='#fff';ctx.fillRect(0,0,W,canvas.height);ctx.drawImage(img,0,0,W,H);ctx.fillStyle='#0f172a';ctx.font=`bold ${font}px Arial`;ctx.textBaseline='top';lines.forEach((line,i)=>ctx.fillText(line,pad,H+pad+i*lineH,W-pad*2));
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob)throw Error('Could not create the stamped photo.');
    return new File([blob],'Fuel_'+indiaDate(Date.now())+'_'+Date.now()+'.jpg',{type:'image/jpeg'});
  }
  function download(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  $('downloadPhoto').onclick=async()=>{try{download(await stampedFile(entry()));$('photoStatus').textContent='Stamped photo downloaded. Attach it to your WhatsApp report.';}catch(e){$('photoStatus').textContent=e.message;}};
  function primaryText(r){
    const previous=L.summary(F.getRecords()),projected=L.round(previous.balance+r.difference_amount);
    return ['A TO Z — Fuel Report',`Driver: ${r.driver}`,`Vehicle: ${r.vehicle}`,`Location: ${r.location||'—'}`,`Meter: ${r.start} → ${r.end}`,`Distance: ${r.distance} KM | Mileage: ${r.mileage}:1`,`Price/litre: ${L.money(r.ppl)}`,`Fuel consumption: ${L.money(r.consumption)}`,...settlementLines(r,L),`Previous saved balance: ${L.signed(previous.balance)}`,`After saving this draft: ${L.signed(projected)} — ${L.label(projected)}`,previous.unknown?'Older incomplete entries excluded; balance is partial.':'',`Survey & Material Report: ${r.survey}`,r.note?`Payment / trip note: ${r.note}`:'','Draft report — use Save Entry to save this payment in Execution.'].filter(Boolean).join('\n');
  }
  function shareLinks(text,both=false){
    const numbers=[phone($('boss1').value)];if(both&&$('boss2').value.trim())numbers.push(phone($('boss2').value));
    $('shareLinks').innerHTML=[...new Set(numbers)].map((n,i)=>`<a href="https://wa.me/${n}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Open WhatsApp — Boss #${i+1}</a>`).join('');
    return numbers;
  }
  function openText(text,both=false){const nums=shareLinks(text,both);window.open('https://wa.me/'+nums[0]+'?text='+encodeURIComponent(text),'_blank','noopener');$('shareStatus').textContent=both&&nums.length>1?'WhatsApp report prepared. Use the Boss #2 link to share the second copy.':'WhatsApp report prepared. If no window opened, use the link below.';}
  $('btnSend').onclick=async()=>{
    try{
      const r=entry(),text=primaryText(r);phone($('boss1').value);
      if(!photo){openText(text);return;}
      const file=await stampedFile(r);
      if(navigator.share&&navigator.canShare?.({files:[file]})){
        try{await navigator.share({files:[file],text,title:'Fuel Report'});$('shareStatus').textContent='Share sheet completed. Confirm delivery in WhatsApp.';return;}catch(e){if(e.name==='AbortError'){$('shareStatus').textContent='Sharing cancelled. Your photo and draft are retained.';return;}}
      }
      download(file);shareLinks(text);$('shareStatus').textContent='Stamped photo downloaded. Open WhatsApp using the link below and attach the downloaded photo.';
    }catch(e){$('shareStatus').textContent=e.message;}
  };
  $('btnSessionWA').onclick=()=>{try{if(!queue.length)throw Error('No session entries yet.');openText(['A TO Z — Session Fuel Report',...queue.map((q,i)=>`${i+1}. ${q.entry.driver} | ${q.entry.vehicle} | ${q.entry.distance} KM | ${L.money(q.entry.consumption)} | ${settlementLines(q.entry,L).join(' | ')} | ${q.savedId?'Saved':'Draft — not saved'}`)].join('\n'));}catch(e){alert(e.message);}};
  $('sessionMonth').value=indiaDate(Date.now()).slice(0,7);
  $('btnMonthPDF').onclick=()=>{
    const rows=monthRows(queue,$('sessionMonth').value);if(!rows.length)return alert('No session entries for this month.');
    const jsPDF=window.jspdf?.jsPDF;if(!jsPDF)return alert('PDF library could not load. Please retry.');const pdf=new jsPDF({unit:'pt',format:'a4',orientation:'landscape'});let y=36;
    const line=text=>{for(const t of pdf.splitTextToSize(text,770)){if(y>550){pdf.addPage();y=36;}pdf.text(t,32,y);y+=17;}};
    pdf.setFontSize(15);line('A TO Z - Monthly Session Fuel Report');pdf.setFontSize(10);line(owner+' | '+$('sessionMonth').value);line('Session drafts are not payments or saved ledger entries.');
    rows.forEach((q,i)=>line(`${i+1}. ${q.date} | ${q.entry.vehicle} | Meter ${q.entry.start} - ${q.entry.end} | ${q.entry.distance} KM | Mileage ${q.entry.mileage} | INR ${q.entry.consumption.toFixed(2)} | ${settlementLines(q.entry,L).join(' | ').replaceAll('₹','INR ').replaceAll('−','-').replace(/ — .*/,m=>m.includes('Pay driver')?' - Pay driver':m.includes('Return to company')?' - Return to company':' - Settled')} | ${q.savedId?'Saved':'Draft'}`));
    line('Total fuel consumption: INR '+L.round(rows.reduce((s,q)=>s+q.entry.consumption,0)).toFixed(2));pdf.save('Fuel_Session_'+$('sessionMonth').value+'.pdf');
  };
  $('btnWA').onclick=()=>{try{const rows=F.getRecords(),s=L.summary(rows);if(!rows.length)throw Error('No saved records to share.');openText(['A TO Z — Saved Fuel Records',owner,...rows.map((r,i)=>{const e=L.entry(r);return `${i+1}. ${r.date||'—'} | ${r.vehicle_number||r.vehicle||'—'} | Fuel ${e.expense===null?'unknown':L.money(e.expense)} | Company paid ${e.paid===null?'unknown':L.money(e.paid)} | ${e.known?L.signed(e.delta):'Needs review'}`;}),`Balance: ${L.signed(s.balance)} — ${L.label(s.balance)}`,s.unknown?`${s.unknown} incomplete entries excluded. Balance is partial.`:''].filter(Boolean).join('\n'),true);}catch(e){alert(e.message);}};
  const context=F.getContext();if(context){addOptions(context,$('vehicleSel').value);updateInitial();}
  renderSession();parent.postMessage({type:'AZP_FUEL_READY'},location.origin);
})(globalThis);
