'use strict';
// Fixed Slack API origin. Tokens and message bodies are never logged or put in URLs.
function createSlackAdapters({token,workspaceId,workspaceUrl,ownerUserId,mappings,fetchImpl=fetch,timeoutMs=1800}={}){
 if(typeof token!=='string'||!token||!workspaceId||!ownerUserId||!Array.isArray(mappings)||mappings.length!==4||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>2500)throw Error('Slack verification is not configured');
 const approved=new Map(mappings.map(m=>[m.channelId,m.slackUserId]));
 if(approved.size!==4)throw Error('Duplicate Slack DM mapping');
 let grantedScopes;
 async function call(method,params={}){
  let response;
  try{response=await fetchImpl('https://slack.com/api/'+method,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString(),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});}catch{throw Object.assign(Error('Slack verification unavailable'),{status:503});}
  if(response.status===429)throw Object.assign(Error('Slack verification rate limited'),{status:503,retryAfter:Math.min(3600,Math.max(1,Number(response.headers.get('retry-after'))||60))});
  if(!response.ok)throw Object.assign(Error('Slack verification unavailable'),{status:503});
  if(method==='auth.test'){const value=response.headers?.get('x-oauth-scopes');grantedScopes=typeof value==='string'?new Set(value.split(',').map(x=>x.trim())):undefined;}
  let body;try{body=await response.json();}catch{throw Object.assign(Error('Slack response invalid'),{status:503});}
  if(body.ok!==true)throw Object.assign(Error('Slack verification denied'),{status:503});
  return body;
 }
 // Create a fresh adapter per HTTP request; these promises never survive a request.
 let identityPromise;const dmPromises=new Map(),humanPromises=new Map();
 function identityRecord(){return identityPromise ||= call('auth.test');}
 async function identity(){const x=await identityRecord();return x.team_id===workspaceId&&x.user_id===ownerUserId&&!x.bot_id;}
 function human(id){if(!humanPromises.has(id))humanPromises.set(id,call('users.info',{user:id}).then(r=>{const x=r.user;return x?.id===id&&x.team_id===workspaceId&&x.deleted!==true&&x.is_bot===false&&x.is_app_user===false;}));return humanPromises.get(id);}
 async function fetchDm({workspaceId:team,channelId}){
  const peer=approved.get(channelId);if(team!==workspaceId||!peer)return {verified:false};
  const [ownerOk,info,ownerHuman,peerHuman]=await Promise.all([identity(),call('conversations.info',{channel:channelId}),human(ownerUserId),human(peer)]);
  const c=info.channel;
  if(!ownerOk||!ownerHuman||!peerHuman||c?.id!==channelId||c.is_im!==true||c.is_mpim===true||c.user!==peer||c.is_user_deleted===true||c.is_ext_shared===true||c.is_shared===true||c.is_org_shared===true||(c.context_team_id&&c.context_team_id!==workspaceId))return {verified:false};
  // An IM viewed through the authenticated owner's user token has the owner and c.user.
  return {verified:true,workspaceId,channelId,isIm:true,isMpim:false,members:[ownerUserId,peer].map(id=>({id,isBot:false,isApp:false}))};
 }
 function verifyDm(input){const key=JSON.stringify(input);if(!dmPromises.has(key))dmPromises.set(key,fetchDm(input));return dmPromises.get(key);}
 async function verifyOriginal({workspaceId:team,channelId,ts,authorId,event}){
  if(team!==workspaceId||!approved.has(channelId)||authorId!==ownerUserId||event?.user!==ownerUserId||event?.ts!==ts)return {verified:false};
  const [ownerOk,dm,history]=await Promise.all([identity(),verifyDm({workspaceId:team,channelId}),call('conversations.history',{channel:channelId,oldest:ts,latest:ts,inclusive:'true',limit:'1',include_all_metadata:'true'})]);
  const messages=history.messages;
  // A newly delivered event may not yet be available to history. Do not acknowledge
  // it as ignored and lose the durable event; retry, then quarantine on exhaustion.
  if(!Array.isArray(messages)||messages.length===0)throw Object.assign(Error('Original message verification unavailable'),{status:503});
  const m=messages.length===1?messages[0]:null;
  if(!ownerOk||dm.verified!==true||!m||m.type!=='message'||m.ts!==ts||m.user!==ownerUserId||m.text!==event.text||
   ['subtype','bot_id','bot_profile','app_id','app_profile','workflow_id','metadata','edited','hidden','message','previous_message','forwarded','thread_ts'].some(k=>m[k])||
   m.attachments?.length||m.files?.length||JSON.stringify(m.blocks||[])!==JSON.stringify(event.blocks||[])||/(^|\n)\s*>/.test(m.text)||/rich_text_quote|rich_text_preformatted/.test(JSON.stringify(m.blocks||[])))return {verified:false};
  return {verified:true,original:true,human:true,appMediated:false,source:'slack-user-event'};
 }
 async function readiness(){
  const [x,identityMatches,dms]=await Promise.all([identityRecord(),identity(),Promise.all(mappings.map(m=>verifyDm({workspaceId,channelId:m.channelId})))]);
  const required=['im:history','im:read','users:read'];
  const scopesVerified=!!grantedScopes&&required.every(s=>grantedScopes.has(s));
  const workspaceUrlMatches=typeof x.url==='string'&&x.url.replace(/\/$/,'')===workspaceUrl;
  return {ready:identityMatches&&workspaceUrlMatches&&scopesVerified&&dms.every(d=>d.verified===true),identityMatches,workspaceUrlMatches,scopesVerified,verifiedDmCount:dms.filter(d=>d.verified===true).length,expectedDmCount:4};
 }
 return {verifyOriginal,verifyDm,readiness};
}
module.exports={createSlackAdapters};
