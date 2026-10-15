'use strict';
// Framework-neutral handler. No server starts, storage connects or credentials load here.
// Host must collect the UNMODIFIED raw Slack request bytes, enforce TLS and body limits.
function createHandler(service){
  return async ({method,path,headers={},rawBody=Buffer.alloc(0)})=>{
    const h={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
    const token=/^Bearer (.+)$/.exec(headers.authorization||'')?.[1];
    try{
      let body;
      if(method==='POST'&&path==='/api/staff-score/slack')body=await service.slack(rawBody,headers);
      else if(method==='GET'&&path==='/api/staff-score/owner-session')body=await service.ownerSession(token);
      else if(method==='GET'&&path==='/api/staff-score')body=await service.score(token);
      else if(method==='GET'&&path==='/api/staff-score/audit')body=await service.audit(token);
      else if(method==='POST'&&['/api/staff-score/resolve','/api/staff-score/reverse','/api/staff-score/owner-review','/api/staff-score/owner-deduct'].includes(path)){
        if(rawBody.length>4096)throw Object.assign(Error(),{status:413});
        const p=JSON.parse(rawBody.toString('utf8'));
        if(path.endsWith('/owner-review'))body=await service.ownerReview(token,p);
        else if(path.endsWith('/owner-deduct'))body=await service.ownerDeduct(token,p);
        else body=path.endsWith('/resolve')?await service.resolve(token,p.key,p.staffId,p.reason):await service.reverse(token,p.key,p.reason);
      }else return {status:404,headers:h,body:{error:'Not found'}};
      return {status:200,headers:h,body};
    }catch(e){return {status:e.status||500,headers:h,body:{error:e.status===401?'Authentication required':e.status===403?'Forbidden':'Score request unavailable'}};}
  };
}
module.exports={createHandler};
