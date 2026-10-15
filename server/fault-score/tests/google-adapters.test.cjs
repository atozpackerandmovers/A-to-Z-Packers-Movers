'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../relay/constants.cjs'),{createGoogleAdapters}=require('../relay/google-adapters.cjs');
test('publisher uses only metadata identity and fixed Pub/Sub topic with byte-preserving envelope, never logs credentials',async()=>{
 const calls=[],envelope={raw:Buffer.from('synthetic\nraw bytes').toString('base64')};
 const a=createGoogleAdapters({fetchImpl:async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'error');if(url.endsWith('/token')){assert.equal(options.headers['Metadata-Flavor'],'Google');return Response.json({access_token:'synthetic-access',expires_in:300});}assert.equal(url,'https://pubsub.googleapis.com/v1/'+C.TOPIC+':publish');assert.equal(options.headers.Authorization,'Bearer synthetic-access');assert.deepEqual(JSON.parse(Buffer.from(JSON.parse(options.body).messages[0].data,'base64')),envelope);return Response.json({messageIds:['12']});}});
 const controller=new AbortController();assert.deepEqual(await a.publish(envelope,{signal:controller.signal}),{messageId:'12'});await a.publish(envelope,{signal:controller.signal});assert.equal(calls.filter(x=>x.url.endsWith('/token')).length,1);
});
test('owner forwarding never trusts caller URLs or IAM headers and keeps Firebase and service tokens separate',async()=>{
 const calls=[];const id='e30.'+Buffer.from(JSON.stringify({aud:C.CORE_URL,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
 const a=createGoogleAdapters({fetchImpl:async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'error');if(url.startsWith('http://metadata.google.internal/')){assert(url.includes('audience='+encodeURIComponent(C.CORE_URL)));return new Response(id);}assert.equal(url,C.CORE_URL+'/api/staff-score/readiness');assert.equal(options.headers.Authorization,'Bearer synthetic-firebase');assert.equal(options.headers['X-Serverless-Authorization'],'Bearer '+id);assert.equal(options.headers['X-Azp-Relay-Authorization'],'Bearer '+id);assert.equal(options.method,'GET');return Response.json({ready:false,checks:{slack:false},writesPerformed:false},{status:503});}});
 const result=await a.forward('/api/staff-score/readiness','synthetic-firebase');assert.equal(result.status,503);assert.equal(result.body.writesPerformed,false);
 for(const p of [C.WORKER_PATH,'https://evil.example','/api/staff-score?redirect=bad'])await assert.rejects(a.forward(p,'synthetic-firebase'));assert.equal(calls.length,2);
});
test('publisher refuses non-success, oversized response and missing publication acknowledgement',async()=>{
 for(const response of [new Response('denied',{status:403}),new Response('x'.repeat(9000)),Response.json({})]){
  const a=createGoogleAdapters({fetchImpl:async url=>url.endsWith('/token')?Response.json({access_token:'synthetic',expires_in:60}):response});await assert.rejects(a.publish({raw:'synthetic'},{signal:new AbortController().signal}));
 }
});
