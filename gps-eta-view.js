/* Pure route-result validation and saved-route presentation. No SDK, requests or writes. */
(function(root) {
  'use strict';
  const MAX_AGE_MS = 60000;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numeric = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? Number(v) : null;
  const stamp = v => numeric(v?.toMillis ? v.toMillis() : v?.seconds ? Number(v.seconds)*1000 : v);
  const ist = ms => new Intl.DateTimeFormat('en-IN', {timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(ms)+' IST';
  // Fingerprint existing delivery inputs only, for error attribution; never selects a route or job stage.
  function deliveryKey(job){
    const fields=['to_location','delivery_address','deliveryAddress','delivery_latitude','deliveryLatitude','delivery_lat','deliveryLat','to_latitude','toLatitude','to_lat','toLat','delivery_longitude','deliveryLongitude','delivery_lng','deliveryLng','delivery_lon','deliveryLon','to_longitude','toLongitude','to_lng','toLng','to_lon','toLon','delivery_coordinates','deliveryCoordinates','to_coordinates','toCoordinates','delivery_location','to_location_geo','toLocationGeo'];
    return JSON.stringify(fields.map(k=>job?.[k]??null));
  }
  function failure(error,phase='route') {
    const raw=String(error?.code||'').toLowerCase().replaceAll('_','-').replace(/^functions\//,''),message=String(error?.message||'');
    const known=['unauthenticated','permission-denied','not-found','invalid-argument','deadline-exceeded','resource-exhausted','unavailable','internal'];
    const code=known.includes(raw)?raw:/timed out/i.test(message)?'deadline-exceeded':/Job, login or GPS changed/i.test(message)?'input-changed':/valid distance and travel time/i.test(message)?'invalid-result':'unknown';
    return {code,phase};
  }
  function errorReason(error) {
    if(!error)return '';
    const code=error.code||'unknown';
    if(error.phase==='gps')return 'GPS read failed ('+code+'). Check the existing GPS sign-in and access.';
    if(error.phase==='save')return 'Route calculated, but saving ETA failed ('+code+'). Check Execution access and connection.';
    const reasons={'not-found':'No driving route was found. Check the current GPS point and the displayed target address.', 'invalid-argument':'Route addresses were rejected. Check the displayed target address.', 'deadline-exceeded':'Route request timed out.', 'input-changed':'Job, login or GPS changed during calculation. Waiting for current inputs.', 'invalid-result':'Route service did not return a valid distance and travel time.', 'unauthenticated':'Route sign-in is unavailable. Check the existing GPS session.', 'permission-denied':'Route access was denied.', 'resource-exhausted':'Route quota is temporarily unavailable.', 'unavailable':'Route service or connection is unavailable.', 'internal':'Route service failed. Check the existing route-function logs.', 'unknown':'Route calculation failed. Check the existing route-function logs.'};
    return (reasons[code]||reasons.unknown)+' ('+code+')';
  }
  function routeTiming(result, requestedAtMs) {
    const meters=result?.distanceMeters!=null?numeric(result.distanceMeters):numeric(result?.distanceKm)===null?null:numeric(result.distanceKm)*1000;
    const raw=result?.durationSeconds??result?.duration;
    const seconds=numeric(typeof raw==='string'?raw.trim().replace(/s$/i,''):raw);
    const arrivalMs=requestedAtMs+seconds*1000;
    if(!Number.isSafeInteger(requestedAtMs)||requestedAtMs<=0||meters===null||meters<=0||seconds===null||seconds<=0||!Number.isFinite(new Date(arrivalMs).getTime()))throw Error('Route service has not supplied a valid distance and travel time.');
    return {distanceMeters:meters,durationSeconds:seconds,requestedAtMs,arrivalMs};
  }
  function snapshot(record, options = {}) {
    return {present:!!record, stopped:!!options.stopped, reason:options.reason || '',
      gpsMs:stamp(record?.eta_gps_timestamp_ms), routeMs:stamp(record?.eta_updated_at_ms ?? record?.updatedAtMs ?? record?.updated_at_ms),
      arrivalIso:String(record?.eta_arrival_iso || ''), seconds:numeric(record?.eta_duration_seconds),
      meters:numeric(record?.eta_remaining_distance_meters), destination:String(record?.eta_destination||'Destination not recorded'), location:String(record?.eta_current_location || 'Location unavailable')};
  }
  function savedDetails(s,now=Date.now()) {
    if(!s.present||s.stopped||!Number.isFinite(now)||!s.gpsMs||!s.routeMs||s.gpsMs>now||s.routeMs>now||s.seconds===null||s.seconds<0||s.meters===null||s.meters<0||(s.meters>0&&s.seconds===0))return null;
    const arrival=s.arrivalIso?Date.parse(s.arrivalIso):s.routeMs+s.seconds*1000;
    if(!Number.isFinite(arrival)||!Number.isFinite(new Date(arrival).getTime())||Math.abs(arrival-(s.routeMs+s.seconds*1000))>5000)return null;
    const age=ms=>{const seconds=Math.floor((now-ms)/1000);return seconds<60?seconds+' sec ago':Math.floor(seconds/60)+' min '+seconds%60+' sec ago'};
    return {savedArrival:ist(arrival),savedRoute:ist(s.routeMs)+' ('+age(s.routeMs)+')',savedGps:ist(s.gpsMs)+' ('+age(s.gpsMs)+')',savedDistance:(s.meters/1000).toLocaleString('en-IN',{maximumFractionDigits:1})+' KM at calculation',savedDestination:s.destination};
  }
  function evaluate(s, now = Date.now()) {
    const unavailable = reason => ({state:'UNAVAILABLE',reason,arrival:'Time unavailable',remaining:'Time unavailable',distance:'Distance unavailable'});
    if(s.stopped) return unavailable('Job completed or cancelled; ETA stopped.');
    if(s.reason) return unavailable(s.reason);
    if(!s.present) return unavailable('No route estimate received. Waiting for assigned GPS and destination.');
    if(!Number.isFinite(now) || !s.gpsMs || !s.routeMs || s.gpsMs>now || s.routeMs>now) return unavailable('GPS observation or route calculation time is missing or invalid.');
    if(now-s.gpsMs>MAX_AGE_MS) return unavailable('The GPS sample used for this estimate is stale; waiting for a newer route estimate.');
    if(now-s.routeMs>MAX_AGE_MS) return unavailable('Route estimate is stale; recalculation required.');
    if(s.seconds===null || s.seconds<0 || s.meters===null || s.meters<0 || (s.meters>0 && s.seconds===0)) return unavailable('Route service has not supplied a valid distance and travel time.');
    // Numeric legacy records need no optional display strings. Never use now + duration:
    // rendering or a new GPS report must not move an existing arrival later.
    const arrival = s.arrivalIso ? Date.parse(s.arrivalIso) : s.routeMs+s.seconds*1000;
    if(!Number.isFinite(arrival) || !Number.isFinite(new Date(arrival).getTime()) || Math.abs(arrival-(s.routeMs+s.seconds*1000))>5000) return unavailable('Arrival and route travel time disagree; recalculation required.');
    if(arrival<now) return unavailable('Expected arrival has passed; awaiting a new route or confirmed arrival.');
    const seconds=Math.ceil((arrival-now)/1000),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),sec=seconds%60;
    return {state:'SAVED_ESTIMATE',reason:'Saved road-route estimate; actual arrival may change.',arrival:ist(arrival),
      remaining:[h,m,sec].map(n=>String(n).padStart(2,'0')).join(':'),distance:(s.meters/1000).toLocaleString('en-IN',{maximumFractionDigits:1})+' KM'};
  }
  function html(record, options = {}) {
    const s=snapshot(record,options),now=options.nowMs??Date.now(),v=evaluate(s,now),saved=v.state==='UNAVAILABLE'?savedDetails(s,now):null;
    return `<section data-azp-eta-view data-eta-snapshot="${esc(JSON.stringify(s))}" class="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3" style="overflow-wrap:anywhere"><p class="text-xs font-black uppercase text-blue-700">Estimated arrival</p><p data-eta-field="reason" role="status" class="text-xs font-bold mt-2">${esc(v.reason)}</p><div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm">${[['arrival','Arrival time'],['remaining','Time remaining'],['distance','Remaining road distance']].map(([key,label])=>`<div class="rounded-lg bg-white border p-2"><span class="block text-xs font-bold text-slate-500">${label}</span><b data-eta-field="${key}">${esc(v[key])}</b></div>`).join('')}</div><aside data-eta-saved ${saved?'':'hidden'} class="mt-3 border-t pt-2 text-sm"><p class="font-bold">Last saved estimate — not live</p>${[['savedDestination','Saved target'],['savedArrival','Previously estimated arrival'],['savedRoute','Route calculated'],['savedGps','GPS sample used'],['savedDistance','Road distance then']].map(([key,label])=>`<p><span>${label}: </span><span data-eta-field="${key}">${esc(saved?.[key]||'')}</span></p>`).join('')}<p>Historical information only. A fresh heartbeat does not refresh this route or confirm arrival.</p></aside><p class="text-xs mt-2">Customer tracking link: not connected.</p></section>`;
  }
  function tick(scope, now=Date.now(), reason) {
    scope.querySelectorAll('[data-azp-eta-view]').forEach(el=>{
      let s; try{s=JSON.parse(el.dataset.etaSnapshot);}catch{return;}
      const v=evaluate(reason!==undefined ? {...s,reason:reason||''} : s, now);
      const saved=v.state==='UNAVAILABLE'?savedDetails(s,now):null,history=el.querySelector('[data-eta-saved]');if(history)history.hidden=!saved;
      for(const key of ['savedDestination','savedArrival','savedRoute','savedGps','savedDistance']){const node=el.querySelector(`[data-eta-field="${key}"]`);if(node)node.textContent=saved?.[key]||'';}
      for(const key of ['reason','arrival','remaining','distance']) {const node=el.querySelector(`[data-eta-field="${key}"]`);if(node)node.textContent=v[key];}
    });
  }
  const api=Object.freeze({snapshot,evaluate,html,tick,routeTiming,MAX_AGE_MS,deliveryKey,failure,errorReason,savedDetails});
  root.AzpEtaView=api;
  if(typeof module==='object' && module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
