/* Pure route-result validation and saved-route presentation. No SDK, requests or writes. */
(function(root) {
  'use strict';
  const MAX_AGE_MS = 60000;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numeric = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? Number(v) : null;
  const stamp = v => numeric(v?.toMillis ? v.toMillis() : v?.seconds ? Number(v.seconds)*1000 : v);
  const ist = ms => new Intl.DateTimeFormat('en-IN', {timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(ms)+' IST';
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
      meters:numeric(record?.eta_remaining_distance_meters), location:String(record?.eta_current_location || 'Location unavailable')};
  }
  function evaluate(s, now = Date.now()) {
    const unavailable = reason => ({state:'UNAVAILABLE',reason,arrival:'Time unavailable',remaining:'Time unavailable',distance:'Distance unavailable'});
    if(s.stopped) return unavailable('Job completed or cancelled; ETA stopped.');
    if(s.reason) return unavailable(s.reason);
    if(!s.present) return unavailable('No route estimate received. Waiting for assigned GPS and destination.');
    if(!Number.isFinite(now) || !s.gpsMs || !s.routeMs || s.gpsMs>now || s.routeMs>now) return unavailable('GPS observation or route calculation time is missing or invalid.');
    if(now-s.gpsMs>MAX_AGE_MS) return unavailable('GPS report is stale; waiting for a fresh observation.');
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
    const s=snapshot(record,options),v=evaluate(s,options.nowMs ?? Date.now());
    return `<section data-azp-eta-view data-eta-snapshot="${esc(JSON.stringify(s))}" class="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3" style="overflow-wrap:anywhere"><p class="text-xs font-black uppercase text-blue-700">Estimated arrival</p><p data-eta-field="reason" role="status" class="text-xs font-bold mt-2">${esc(v.reason)}</p><div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm">${[['arrival','Arrival time'],['remaining','Time remaining'],['distance','Remaining road distance']].map(([key,label])=>`<div class="rounded-lg bg-white border p-2"><span class="block text-xs font-bold text-slate-500">${label}</span><b data-eta-field="${key}">${esc(v[key])}</b></div>`).join('')}</div><p class="text-xs mt-2">Customer tracking link: not connected.</p></section>`;
  }
  function tick(scope, now=Date.now(), reason='') {
    scope.querySelectorAll('[data-azp-eta-view]').forEach(el=>{
      let s; try{s=JSON.parse(el.dataset.etaSnapshot);}catch{return;}
      const v=evaluate(reason ? {...s,reason} : s, now);
      for(const key of ['reason','arrival','remaining','distance']) {const node=el.querySelector(`[data-eta-field="${key}"]`);if(node)node.textContent=v[key];}
    });
  }
  const api=Object.freeze({snapshot,evaluate,html,tick,routeTiming,MAX_AGE_MS});
  root.AzpEtaView=api;
  if(typeof module==='object' && module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
