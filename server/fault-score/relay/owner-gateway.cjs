'use strict';
const C=require('./constants.cjs'),{bearer,response}=require('./security.cjs'),{ownerCors}=require('../core/cors.cjs');
function createOwnerGateway({verifyOwner,forward}){
 return async req=>{
  if(!C.OWNER_PATHS.includes(req.path))return response(404,{error:'Not found'});
  const cors=ownerCors(req);if(cors.response)return cors.response;
  if(req.method!=='GET'||req.query&&Object.keys(req.query).length)return response(404,{error:'Not found'},cors.headers);
  const token=bearer(req.headers?.authorization);if(!token)return response(401,{error:'Authentication required'},cors.headers);
  let owner;try{owner=await verifyOwner(token);}catch{return response(401,{error:'Authentication required'},cors.headers);}
  if(owner?.subject!==C.OWNER_UID)return response(403,{error:'Forbidden'},cors.headers);
  try{const r=await forward(req.path,token);if(![200,401,403,503].includes(r.status))throw Error('Unexpected upstream response');return response(r.status,r.body,cors.headers);}
  catch{return response(503,{error:'Owner service unavailable'},cors.headers);}
 };
}
module.exports={createOwnerGateway};
