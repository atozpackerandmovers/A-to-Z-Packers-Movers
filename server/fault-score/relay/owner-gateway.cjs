'use strict';
const C=require('./constants.cjs'),{bearer,response}=require('./security.cjs'),{ownerCors}=require('../core/cors.cjs');
const {staffForSubject}=require('../core/self-score.cjs');
function createOwnerGateway({verifyOwner,forward,env=process.env}){
 return async req=>{
  if(!C.OWNER_PATHS.includes(req.path)&&req.path!==C.SELF_PATH)return response(404,{error:'Not found'});
  const cors=ownerCors(req);if(cors.response)return cors.response;
  if(req.method!=='GET'||req.query&&Object.keys(req.query).length)return response(404,{error:'Not found'},cors.headers);
  const token=bearer(req.headers?.authorization);if(!token)return response(401,{error:'Authentication required'},cors.headers);
  let owner;try{owner=await verifyOwner(token);}catch{return response(401,{error:'Authentication required'},cors.headers);}
  if(req.path===C.SELF_PATH){try{if(owner?.verified!==true||owner?.anonymous!==false)throw Object.assign(Error(),{status:401});staffForSubject(owner.subject,env);}catch(e){return response(e.status===401?401:e.status===403?403:503,{error:e.status===401?'Authentication required':e.status===403?'Forbidden':'Staff score access unavailable'},cors.headers);}}
  else if(owner?.subject!==C.OWNER_UID)return response(403,{error:'Forbidden'},cors.headers);
  try{const r=await forward(req.path,token);if(![200,401,403,503].includes(r.status))throw Error('Unexpected upstream response');return response(r.status,r.body,cors.headers);}
  catch{return response(503,{error:'Owner service unavailable'},cors.headers);}
 };
}
module.exports={createOwnerGateway};
