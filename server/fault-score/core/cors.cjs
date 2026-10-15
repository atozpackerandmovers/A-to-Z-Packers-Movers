'use strict';
const OWNER_ORIGIN='https://atozpackersmovers.in';
 const OWNER_PATHS=new Set(['/api/staff-score','/api/staff-score/audit','/api/staff-score/owner-session','/api/staff-score/readiness','/api/staff-score/me']);
function ownerCors({method,path,headers={}}){
 const base={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(!OWNER_PATHS.has(path))return {headers:base};
 const origin=headers.origin;
 if(origin&&origin!==OWNER_ORIGIN)return {response:{status:403,headers:{...base,Vary:'Origin'},body:{error:'Forbidden'}}};
 const h=origin?{...base,Vary:'Origin','Access-Control-Allow-Origin':OWNER_ORIGIN}:base;
 if(method==='OPTIONS'){
  const requested=(headers['access-control-request-headers']||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  if(origin!==OWNER_ORIGIN||headers['access-control-request-method']!=='GET'||requested.some(x=>x!=='authorization'))return {response:{status:403,headers:h,body:{error:'Forbidden'}}};
  return {response:{status:204,headers:{...h,'Access-Control-Allow-Methods':'GET','Access-Control-Allow-Headers':'Authorization','Access-Control-Max-Age':'300',Vary:'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'},body:null}};
 }
 return {headers:h};
}
module.exports={ownerCors,OWNER_ORIGIN};
