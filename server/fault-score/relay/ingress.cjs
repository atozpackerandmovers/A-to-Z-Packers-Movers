'use strict';
const C=require('./constants.cjs'),{verifySlack,response}=require('./security.cjs');
const {STAFF}=require('../core/config.cjs'),{allowedEvent,validateActivation}=require('../core/activation.cjs');
const {createHash}=require('node:crypto');
function createIngress({secret,publish,env={},now=Date.now,budgetMs=C.ACK_BUDGET_MS,log=()=>{}}){
 if(typeof publish!=='function'||!Number.isInteger(budgetMs)||budgetMs<1||budgetMs>C.ACK_BUDGET_MS)throw Error('Invalid ingress binding');
 const activation=validateActivation({enabled:env.AZP_RELAY_ACCEPT_EVENTS==='true',notBefore:env.AZP_FAULT_NOT_BEFORE});
 return async req=>{
  if(req.method!=='POST'||req.path!=='/slack/events')return response(404,{error:'Not found'});
  let body;const admittedAt=now(),started=performance.now();try{body=verifySlack(req.rawBody,req.headers||{},secret,admittedAt);}catch(e){return response(e.status||401,{error:'Request rejected'});}
  if(body.type==='url_verification')return typeof body.challenge==='string'&&body.challenge.length>0&&body.challenge.length<=1024?response(200,{challenge:body.challenge}):response(400,{error:'Invalid challenge'});
  if(body.team_id!=='T0BQ4DD754J'||body.api_app_id!=='A0C8HU05JCD')return response(403,{error:'Forbidden'});
  const e=body.event,mapping=STAFF.find(s=>s.channelId===e?.channel);
  // Discard unrelated owner DMs and ordinary messages before durable storage.
  if(body.type!=='event_callback'||!e||e.type!=='message'||e.user!=='U0BQYQEMYNL'||!mapping||e.channel_type!=='im'||
    !Array.isArray(body.authorizations)||!body.authorizations.some(a=>a?.team_id==='T0BQ4DD754J'&&a.user_id==='U0BQYQEMYNL'&&a.is_bot===false)||
    ['subtype','bot_id','bot_profile','app_id','app_profile','workflow_id','metadata','edited','hidden','message','previous_message','forwarded','thread_ts'].some(k=>e[k])||
    e.attachments?.length||e.files?.length||typeof e.text!=='string'||e.text.length>4000||!/^Fault(?:\s|$)/.test(e.text)||
    /(^|\n)\s*>/.test(e.text)||/rich_text_quote|rich_text_preformatted/.test(JSON.stringify(e.blocks||[])))return response(200,{status:'ignored'});
  if(!activation.enabled)return response(503,{error:'Admission paused'});
  if(!allowedEvent(activation,e.ts,admittedAt))return response(200,{status:'ignored'});
  const key=createHash('sha256').update(JSON.stringify([body.team_id,e.channel,e.ts])).digest('hex');
  const envelope={version:1,admittedAt,key,raw:req.rawBody.toString('base64'),slackTimestamp:req.headers['x-slack-request-timestamp'],slackSignature:req.headers['x-slack-signature']};
  const controller=new AbortController();let timer;
  try{
   const result=await Promise.race([Promise.resolve().then(()=>publish(envelope,{signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Publish deadline'));},budgetMs);})]);
   if(performance.now()-started>=budgetMs||!result||typeof result.messageId!=='string'||!/^\d+$/.test(result.messageId))throw Error('No timely persistence receipt');
   log({event:'fault_queued',key});return response(200,{status:'queued'});
  }catch{log({event:'fault_publish_unconfirmed',key});return response(503,{error:'Persistence unavailable'});}
  finally{clearTimeout(timer);controller.abort();}
 };
}
module.exports={createIngress};
