'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
const C=require('./constants.cjs');
function fail(status=401){throw Object.assign(Error('Request rejected'),{status});}
function verifySlack(raw,headers,secret,at){
 if(!Buffer.isBuffer(raw)||raw.length>C.MAX_RAW)fail(413);
 const ts=headers['x-slack-request-timestamp'],sig=headers['x-slack-signature'];
 if(typeof secret!=='string'||!secret)fail(503);
 if(typeof ts!=='string'||!/^\d{10,12}$/.test(ts)||!Number.isFinite(at)||Math.abs(at/1000-Number(ts))>300||typeof sig!=='string'||!/^v0=[a-f0-9]{64}$/.test(sig))fail();
 const expected='v0='+createHmac('sha256',secret).update('v0:'+ts+':').update(raw).digest('hex');
 if(!timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))fail();
 let body;try{body=JSON.parse(raw.toString('utf8'));}catch{fail(400);}
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400);return body;
}
function base64(value,max){if(typeof value!=='string'||!value||value.length>Math.ceil(max/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail(400);const b=Buffer.from(value,'base64');if(b.length>max||b.toString('base64')!==value)fail(400);return b;}
async function requireServiceIdentity(token,email,verifyGoogle,now=Date.now){
 if(typeof token!=='string'||!token||token.length>8192)fail();
 let c;try{c=await verifyGoogle(token,C.CORE_URL);}catch{fail();}
 if(!c||c.email!==email||c.email_verified!==true||c.aud!==C.CORE_URL||!['https://accounts.google.com','accounts.google.com'].includes(c.iss)||typeof c.sub!=='string'||!/^\d+$/.test(c.sub)||!Number.isInteger(c.exp)||c.exp<=now()/1000||!Number.isInteger(c.iat)||c.iat>now()/1000+60)fail(403);
 return c;
}
function bearer(header){return typeof header==='string'?/^Bearer (\S+)$/.exec(header)?.[1]:undefined;}
const response=(status,body,headers={})=>({status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers},body});
module.exports={fail,verifySlack,base64,requireServiceIdentity,bearer,response};
