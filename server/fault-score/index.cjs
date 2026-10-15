'use strict';
// Review candidate only. Three entry points deploy as three separate IAM identities.
const {onRequest}=require('firebase-functions/v2/https'),{defineSecret}=require('firebase-functions/params');
const {initializeApp,getApps}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const {OAuth2Client}=require('google-auth-library'),C=require('./relay/constants.cjs');
const {createGoogleAdapters}=require('./relay/google-adapters.cjs'),{createIngress}=require('./relay/ingress.cjs'),{createOwnerGateway}=require('./relay/owner-gateway.cjs'),{createCoreRouter}=require('./relay/core-router.cjs');
const {createRuntime}=require('./core/runtime.cjs'),{createFirebaseVerifier}=require('./core/domain/firebase-auth.cjs');
const signing=defineSecret('AZP_FAULT_SLACK_SIGNING_SECRET'),owner=defineSecret('AZP_FAULT_SLACK_OWNER_USER_TOKEN');
const common={region:'asia-south1',minInstances:0,maxInstances:1,cpu:1,memory:'256MiB',timeoutSeconds:15};
function guard(){if(process.env.GCLOUD_PROJECT!==C.PROJECT||process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Runtime binding unavailable');}
function app(name){return getApps().find(a=>a.name===name)||initializeApp({projectId:C.PROJECT},name);}
function safeLog(value){console.info(JSON.stringify(value));}
function wrap(factory){let handler;return async(req,res)=>{try{guard();handler ||= factory();const r=await handler({method:req.method,path:req.path,query:req.query,headers:req.headers,rawBody:Buffer.isBuffer(req.rawBody)?req.rawBody:Buffer.alloc(0)});for(const [k,v]of Object.entries(r.headers||{}))res.set(k,v);if(r.status===204)return res.status(204).send();return res.status(r.status).json(r.body);}catch{return res.status(503).set('Cache-Control','no-store').json({error:'Service unavailable'});}};}
exports.faultIngress=onRequest({...common,concurrency:20,invoker:'public',serviceAccount:C.INGRESS_SA,secrets:[signing]},wrap(()=>createIngress({secret:signing.value(),publish:createGoogleAdapters().publish,env:process.env,log:safeLog})));
exports.faultOwnerGateway=onRequest({...common,concurrency:10,invoker:'public',serviceAccount:C.GATEWAY_SA},wrap(()=>createOwnerGateway({verifyOwner:createFirebaseVerifier({auth:getAuth(app('fault-owner-gateway')),projectId:C.PROJECT,allowedProviders:['password']}),forward:createGoogleAdapters().forward})));
exports.staffScore=onRequest({...common,concurrency:10,invoker:'private',serviceAccount:'azp-fault-runtime@az-packers-quotation.iam.gserviceaccount.com',secrets:[signing,owner]},wrap(()=>{
 const a=app('fault-score'),deps={db:getFirestore(a,'fault-score'),defaultDb:getFirestore(a),auth:getAuth(a),signingSecret:signing.value(),ownerToken:owner.value(),env:process.env};
 const oauth=new OAuth2Client();return createCoreRouter({secret:deps.signingSecret,enabled:process.env.AZP_FAULT_ENABLED==='true',ownerRuntime:createRuntime(deps),verifyGoogle:async(token,audience)=>(await oauth.verifyIdToken({idToken:token,audience})).getPayload(),runQueued:({rawBody,headers,admittedAt})=>createRuntime({...deps,signatureNow:()=>admittedAt})({method:'POST',path:'/api/staff-score/slack',rawBody,headers}),log:safeLog});
}));
