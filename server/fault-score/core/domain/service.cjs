'use strict';
const {createHmac,createHash,timingSafeEqual}=require('node:crypto');
const {validateActivation,allowedEvent}=require('../activation.cjs');
const {ensureCycle,cycleAt}=require('../cycles.cjs');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const id=v=>typeof v==='string'&&v.length>0;
// This module is inert until private configuration AND trusted adapters are supplied.
function createService(config,adapters){
  const c=structuredClone(config||{}),a=adapters||{};
  const mediated=c.ingress?.mode==='owner-mediated';
  if(c.enabled===false||c.kind==='private-local-draft'||!id(c.ownerSubject)||!id(c.workspaceId)||!id(c.ownerUserId)||(!mediated&&!id(c.signingSecret))||
    !Array.isArray(c.dmMappings)||!c.dmMappings.length||
    !c.dmMappings.every(m=>id(m.channelId)&&m.channelId.startsWith('D')&&id(m.staffId))||
    new Set(c.dmMappings.map(m=>m.channelId)).size!==c.dmMappings.length||
    (!mediated&&c.ingress?.mode!=='owner-user-events')||c.ingress.authorizedUserId!==c.ownerUserId||
    !Array.isArray(c.adminSubjects)||!c.adminSubjects.length||!c.adminSubjects.every(id)||
    !c.adminSubjects.includes(c.ownerSubject)||
    !Array.isArray(c.staff)||!c.staff.length||
    !c.staff.every(s=>id(s.id)&&((mediated||c.ownerOnlyRead===true)?(s.subject==null||id(s.subject)):id(s.subject))&&id(s.slackUserId)&&Array.isArray(s.names)&&s.names.length&&s.names.every(id))||
    new Set(c.staff.map(s=>s.id)).size!==c.staff.length||
    new Set(c.staff.filter(s=>s.subject!=null).map(s=>s.subject)).size!==c.staff.filter(s=>s.subject!=null).length||
    new Set(c.staff.map(s=>s.slackUserId)).size!==c.staff.length||
    !/^https:\/\/[a-z0-9-]+\.slack\.com$/.test(c.workspaceUrl||'')||
    c.dmMappings.some(m=>!c.staff.some(s=>s.id===m.staffId))||
    (!mediated&&(typeof a.verifyOriginal!=='function'||typeof a.verifyDm!=='function'))||typeof a.transaction!=='function'||typeof a.verifyBearer!=='function')fail('Score service is not configured',503);
  const now=a.now||Date.now;
  // Only the private authenticated queue router supplies admission time. Event cutoff,
  // future-event checks and audit timestamps continue to use the real processing clock.
  const signatureNow=a.signatureNow||now;
  const activation=validateActivation(c.activation);
  if(typeof c.slackAppId!=='string'||!/^A[A-Z0-9]+$/.test(c.slackAppId))fail('Dedicated Slack app identity required',503);
  const eventKey=(team,channel,ts)=>createHash('sha256').update(JSON.stringify([team,channel,ts])).digest('hex');
  async function principal(token){
    if(!id(token))fail('Authentication required',401);
    let p;try{p=await a.verifyBearer(token);}catch{fail('Authentication required',401);}
    // Adapter must validate issuer, audience, expiry and signature; anonymous tokens prohibited.
    if(!p||!id(p.subject)||p.verified!==true||p.anonymous!==false)fail('Authentication required',401);
    return p.subject;
  }
  async function admin(token){const sub=await principal(token);if(!c.adminSubjects.includes(sub))fail('Forbidden',403);return sub;}
  function authenticate(raw,headers){
    if(!Buffer.isBuffer(raw)||raw.length>65536)fail('Invalid request');
    const ts=headers['x-slack-request-timestamp'],sig=headers['x-slack-signature'];
    if(typeof ts!=='string'||!/^\d{10,12}$/.test(ts)||Math.abs(Math.floor(signatureNow()/1000)-Number(ts))>300||typeof sig!=='string'||!/^v0=[a-f0-9]{64}$/.test(sig))fail('Invalid Slack authentication',401);
    const expected=Buffer.from('v0='+createHmac('sha256',c.signingSecret).update('v0:'+ts+':').update(raw).digest('hex'));
    if(!timingSafeEqual(expected,Buffer.from(sig)))fail('Invalid Slack authentication',401);
    try{return JSON.parse(raw.toString('utf8'));}catch{fail('Invalid JSON');}
  }
  function apply(tx,receipt,staffId,actor){
    if(c.cycleRolloverEnabled===true){
      const cycle=ensureCycle(tx,staffId,now()),eventCycle=cycleAt(staffId,Math.floor(Number(receipt.ts)*1000));
      if(eventCycle.start>cycle.start)fail('Future-cycle event; retry after boundary',503);
      if(eventCycle.start<cycle.start){const held={...receipt,status:'pending',holdReason:'previous-cycle-delivery',eventCycleStart:eventCycle.start};tx.setReceipt(receipt.key,held);tx.appendAudit({...held,action:'pending'});return {status:'pending'};}
      receipt={...receipt,scoreCycleStart:cycle.start};
    }
    const before=tx.getScore(staffId);
    if(before==null)fail('Authoritative balance unavailable',409);
    if(!Number.isInteger(before)||before<0||before>100)fail('Invalid stored score',503);
    if(before<2)fail('Insufficient balance for a two-point deduction',409);
    const after=before-2;
    tx.setScore(staffId,after);
    const next={...receipt,status:'applied',staffId,before,after,actor,appliedAt:now()};
    tx.setReceipt(receipt.key,next);
    tx.appendAudit({...next,action:'deduct',requestedPoints:2,actualPoints:before-after});
    return {status:'applied'};
  }
  async function slack(raw,headers){
    if(mediated)fail('Signed Slack ingress is disabled in mediated mode',403);
    const b=authenticate(raw,headers);
    if(b.type==='url_verification'){if(!id(b.challenge))fail('Invalid challenge');return {challenge:b.challenge};}
    if(b.team_id!==c.workspaceId||b.api_app_id!==c.slackAppId)fail('Workspace/app forbidden',403);
    if(!allowedEvent(activation,b.event?.ts,now()))return {status:activation.enabled?'ignored':'inactive'};
    const e=b.event;
    // Signed bot subscriptions cannot establish access to the owner's human DMs.
    if(!Array.isArray(b.authorizations)||!b.authorizations.some(x=>x.team_id===c.workspaceId&&x.user_id===c.ownerUserId&&x.is_bot===false))return {status:'ignored'};
    const mapping=c.dmMappings.find(m=>m.channelId===e?.channel);

    // Only a signed original human message. All subtypes (edit, bot, share etc.) rejected.
    if(b.type!=='event_callback'||!e||e.type!=='message'||e.subtype||e.bot_id||e.bot_profile||e.app_id||e.app_profile||e.workflow_id||e.metadata||
      e.user!==c.ownerUserId||!mapping||e.channel_type!=='im'||
      e.team&&e.team!==c.workspaceId||e.edited||e.hidden||e.message||e.previous_message||
      e.attachments?.length||e.files?.length||e.forwarded||e.thread_ts||
      typeof e.text!=='string'||!/^Fault(?:\s|$)/.test(e.text)||
      typeof e.ts!=='string'||!/^\d+\.\d+$/.test(e.ts)||e.text.length>4000)return {status:'ignored'};
    // Slack rich text can contain quoted/forwarded content not apparent in plain text.
    if(/(^|\n)\s*>/.test(e.text)||JSON.stringify(e.blocks||[]).includes('rich_text_quote')||
      JSON.stringify(e.blocks||[]).includes('rich_text_preformatted'))return {status:'ignored'};
    const provenance=await a.verifyOriginal({workspaceId:c.workspaceId,channelId:e.channel,ts:e.ts,authorId:e.user,event:e});
    if(!provenance||provenance.verified!==true||provenance.original!==true||provenance.human!==true||
      provenance.appMediated!==false||provenance.source!=='slack-user-event')return {status:'ignored'};
    const staff=c.staff.find(s=>s.id===mapping.staffId);
    const dm=await a.verifyDm({workspaceId:c.workspaceId,channelId:e.channel});
    // Trusted adapter must fetch/verify conversation type, exact members and human profiles.
    if(!dm||dm.verified!==true||dm.workspaceId!==c.workspaceId||dm.channelId!==e.channel||
      dm.isIm!==true||dm.isMpim!==false||!Array.isArray(dm.members)||dm.members.length!==2||
      new Set(dm.members.map(x=>x.id)).size!==2||dm.members.some(x=>x.isBot!==false||x.isApp!==false)||
      !dm.members.some(x=>x.id===c.ownerUserId)||!dm.members.some(x=>x.id===staff.slackUserId))return {status:'ignored'};
    const mentions=[...new Set([...e.text.matchAll(/<@([A-Z0-9]+)>/g)].map(m=>m[1]))];
    // The verified DM selects the employee. Optional prose is evidence, never a routing override.
    // Preserve it literally rather than requiring a reason catalogue or guessing a reason.
    const reason=e.text.replace(/^Fault\s*/, '').trim();
    const identified=new Set();
    // Exact private name aliases; ambiguous aliases identify multiple staff and HOLD.
    for(const s of c.staff)for(const name of s.names){
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const re=new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','giu');
      if(re.test(reason))identified.add(s.id);
    }
    const conflict=mentions.some(x=>x!==staff.slackUserId)||identified.size>1||[...identified].some(x=>x!==staff.id);
    // Conflicting known names, ambiguous aliases and unresolved explicit mentions HOLD.
    // Free text does not select a different employee. A bare Fault needs no invented reason.
    const hold=conflict;
    const key=eventKey(c.workspaceId,e.channel,e.ts);
    const receipt={key,workspace:c.workspaceId,channel:e.channel,ts:e.ts,author:e.user,
      dmStaffId:staff.id,reason,originalText:e.text,link:c.workspaceUrl+'/archives/'+e.channel+'/p'+e.ts.replace('.',''),receivedAt:now(),status:'pending'};
    return a.transaction(tx=>{
      if(tx.getReceipt(key))return {status:'duplicate'};
      // The verified canonical DM mapping supplies the target; names are never guessed.
      if(hold){tx.setReceipt(key,receipt);tx.appendAudit({...receipt,action:'pending'});return {status:'pending'};}
      return apply(tx,receipt,staff.id,c.ownerUserId);
    });
  }
  async function score(token){
    const sub=await principal(token),staff=c.staff.find(s=>s.subject===sub);
    if(!staff)fail('Staff identity not mapped',403);
    return a.transaction(tx=>{const stored=tx.getScore(staff.id);if(stored==null)fail('Authoritative balance unavailable',409);const value=stored;if(!Number.isInteger(value)||value<0||value>100)fail('Invalid stored score',503);return {score:value,maximum:100};});
  }
  async function audit(token){await admin(token);return a.transaction(tx=>tx.listAudit());}
  async function resolve(token,key,staffId,reason){
    const actor=await admin(token);if(actor!==c.ownerSubject)fail('Owner clarification required',403);
    if(!c.staff.some(s=>s.id===staffId)||!id(reason)||reason.length>1000)fail('Explicit staff and clarification reason required');
    return a.transaction(tx=>{const r=tx.getReceipt(key);if(!r)fail('Unknown event',404);if(r.status!=='pending')return {status:'duplicate'};if(r.dmStaffId!==staffId)fail('Clarification must match approved DM staff',403);return apply(tx,{...r,reason:r.reason||reason,clarification:reason},staffId,actor);});
  }
  async function reverse(token,key,reason){
    const actor=await admin(token);if(!id(reason)||reason.length>1000)fail('Reversal reason required');
    return a.transaction(tx=>{const r=tx.getReceipt(key);if(!r)fail('Unknown event',404);if(r.status==='reversed')return {status:'duplicate'};if(r.status!=='applied')fail('Event is not applied');
      const before=tx.getScore(r.staffId);if(!Number.isInteger(before)||before<0||before>100)fail('Invalid stored score',503);
      const after=Math.min(100,before+(r.before-r.after));tx.setScore(r.staffId,after);
      tx.setReceipt(key,{...r,status:'reversed'});tx.appendAudit({key,staffId:r.staffId,action:'reverse',actor,reason,before,after,at:now()});return {status:'reversed'};});
  }
  async function owner(token){
    const sub=await principal(token);if(sub!==c.ownerSubject)fail('Owner approval required',403);return sub;
  }
  function mediatedEvent(p){
    if(!mediated)fail('Owner-mediated mode is not configured',403);
    if(!p||p.workspace!==c.workspaceId||p.author!==c.ownerUserId||
      typeof p.ts!=='string'||!/^\d+\.\d+$/.test(p.ts))fail('Invalid confirmed event');
    const mapping=c.dmMappings.find(m=>m.channelId===p.channel&&m.staffId===p.staffId);
    if(!mapping)fail('Event does not match approved DM staff',403);
    return {key:eventKey(p.workspace,p.channel,p.ts),staffId:mapping.staffId,
      workspace:p.workspace,channel:p.channel,ts:p.ts,author:p.author,
      link:c.workspaceUrl+'/archives/'+p.channel+'/p'+p.ts.replace('.','')};
  }
  async function ownerReview(token,p){
    await owner(token);const event=mediatedEvent(p);
    return a.transaction(tx=>{
      const value=tx.getScore(event.staffId),receipt=tx.getReceipt(event.key);
      if(!Number.isInteger(value)||value<0||value>100)fail('Authoritative balance unavailable',409);
      if(receipt&&receipt.staffId&&receipt.staffId!==event.staffId)fail('Receipt identity mismatch',409);
      return {staffId:event.staffId,score:value,maximum:100,eventKey:event.key,
        eventStatus:receipt?.status||'not-recorded',source:event.link};
    });
  }
  async function ownerDeduct(token,p){
    const actor=await owner(token),event=mediatedEvent(p);
    // This is an explicit authenticated owner attestation, NOT automatic Slack ingestion.
    if(p.ownerConfirmed!==true||typeof p.originalText!=='string'||
      !/^Fault(?:\s|$)/.test(p.originalText)||p.originalText.length>4000||
      !id(p.reason)||!p.reason.trim()||p.reason.length>1000||
      !Number.isInteger(p.expectedScore)||p.expectedScore<2||p.expectedScore>100||
      p.eventKey!==event.key)fail('Owner review and explicit confirmation required');
    return a.transaction(tx=>{
      const receipt=tx.getReceipt(event.key);
      // Keep original receipts, including pending/reversed; never overwrite or reapply.
      if(receipt)return {status:'duplicate',eventStatus:receipt.status};
      const current=tx.getScore(event.staffId);
      if(!Number.isInteger(current)||current<0||current>100)fail('Authoritative balance unavailable',409);
      if(current!==p.expectedScore)fail('Balance changed; review again',409);
      return apply(tx,{...event,status:'confirmed',reason:p.reason.trim(),originalText:p.originalText,
        provenance:'authenticated-owner-confirmation',confirmedBy:actor,confirmedAt:now(),receivedAt:now()},event.staffId,actor);
    });
  }
  async function ownerScores(token){await owner(token);return a.transaction(tx=>({staff:c.staff.map(s=>{const score=tx.getScore(s.id);if(!Number.isInteger(score)||score<0||score>100)fail('Authoritative balance unavailable',409);return {staffId:s.id,score,maximum:100};})}));}
  async function ownerSession(token){await owner(token);return {ownerVerified:true};}
  return {slack,score,audit,resolve,reverse,ownerReview,ownerDeduct,ownerSession,ownerScores};

}
module.exports={createService};
