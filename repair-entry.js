/* Shared Driver/Execution repair field contract. No financial or approval values are inferred silently. */
(function(root){
'use strict';
const fields=[['job_id','Job ID (optional)','text'],['vehicle_number','Vehicle No.','masterSelect','vehicleMaster'],['driver_name','Driver Name','masterSelect','driverMaster'],['repair_date','Repair Date','date'],['garage_name','Garage Name','text'],['garage_mobile','Garage Mobile Number','tel'],['repair_status','Repair Status','select',['Emergency','Routine Service','Breakdown']],['repair_type','Repair Type','select',['Engine','Tyre','Battery','Brake','Clutch','Electrical','AC','Body Work','Other']],['vehicle_km_reading','Vehicle KM Reading','number'],['next_service_due_km','Next Service Due KM (optional)','number'],['description','Repair / Work Description','textarea'],['amount','Bill Amount (₹)','number'],['bill_available','Bill Available','select',['Yes','No']],['bill_url','Bill Photo URL','url'],['approved_by','Approved By (office only)','select',['Manoj Kumar Swain','Office Staff']],['approval_status','Office Review','select',['Pending','Approved','Rejected']],['remarks','Remarks / Reason if no bill','textarea']];
const required=['vehicle_number','driver_name','repair_date','garage_name','garage_mobile','repair_status','repair_type','vehicle_km_reading','description','amount','bill_available'];
const office=['approved_by','approval_status','bill_url'];
const text=v=>String(v??'').trim();
const vehicle=v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const number=v=>text(v)!==''&&/^\d+(?:\.\d+)?$/.test(text(v))&&Number.isFinite(Number(v))?Number(v):null;
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
function validate(r,{hasPhoto=false,requirePhoto=false,today=''}={}){
 const errors=[];for(const key of required)if(!text(r[key]))errors.push({key,message:fields.find(f=>f[0]===key)[1]+' भरना ज़रूरी है।'});
 const add=(key,message)=>{if(!errors.some(e=>e.key===key))errors.push({key,message});};
 if(text(r.vehicle_number)&&!/^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(vehicle(r.vehicle_number)))add('vehicle_number','Valid vehicle registration number भरें।');
 if(text(r.repair_date)&&(!validDate(r.repair_date)||(today&&r.repair_date>today)))add('repair_date','Valid repair date भरें; future date स्वीकार नहीं है।');
 if(text(r.garage_mobile)&&! /^(?:91)?[6-9]\d{9}$/.test(text(r.garage_mobile).replace(/[+\s()-]/g,'')))add('garage_mobile','Garage का सही 10-digit mobile number भरें।');
 for(const key of ['repair_status','repair_type','bill_available'])if(text(r[key])&&!fields.find(f=>f[0]===key)[3].includes(r[key]))add(key,'Valid '+fields.find(f=>f[0]===key)[1]+' चुनें।');
 if(number(r.amount)===null||number(r.amount)<=0)add('amount','Actual bill amount 0 से अधिक भरें।');
 if(number(r.vehicle_km_reading)===null)add('vehicle_km_reading','Actual vehicle meter reading भरें (0 या अधिक)।');
 if(text(r.next_service_due_km)&&(number(r.next_service_due_km)===null||number(r.next_service_due_km)<=number(r.vehicle_km_reading)))add('next_service_due_km','Next service KM current meter से अधिक होना चाहिए।');
 if(r.bill_available==='No'&&text(r.remarks).length<3)add('remarks','बिल नहीं है तो कारण लिखें।');
 if(r.bill_available==='Yes'&&requirePhoto&&!hasPhoto&&!safeUrl(r.bill_url))add('bill_url','Bill की photo capture/upload करें।');
 return errors;
}
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch(_){return '';}}
function normalize(input,driver){const r={};for(const [key] of fields)if(!office.includes(key))r[key]=text(input[key]).slice(0,key==='description'||key==='remarks'?2000:200);r.driver_name=driver;r.vehicle_number=vehicle(r.vehicle_number);r.amount=number(r.amount);r.vehicle_km_reading=number(r.vehicle_km_reading);r.next_service_due_km=text(r.next_service_due_km)?number(r.next_service_due_km):'';return r;}
function parseBill(raw){
 const t=text(raw),lines=t.split(/\r?\n/).map(text).filter(Boolean),r={};
 const v=t.toUpperCase().match(/\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{0,3}[ -]?\d{4}\b/);if(v)r.vehicle_number=vehicle(v[0]);
 const phone=t.match(/(?:mobile|mob|phone|contact|tel)\s*[:.\-]?\s*((?:\+?91[ -]?)?[6-9][\d -]{8,13}\d)/i);if(phone){const n=phone[1].replace(/\D/g,'');if(/^(91)?[6-9]\d{9}$/.test(n))r.garage_mobile=n.slice(-10);}
 const garage=lines.find(l=>/(garage|motors|automobiles|workshop|service centre|service center)/i.test(l)&&l.length<160);if(garage)r.garage_name=garage;
 const dates=t.match(/(?:date\s*[:.\-]?\s*)(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/i);if(dates){const d=`${dates[3]}-${dates[2].padStart(2,'0')}-${dates[1].padStart(2,'0')}`;if(validDate(d))r.repair_date=d;}
 const totals=lines.filter(l=>/(grand\s*total|net\s*(?:amount|payable)|total\s*(?:amount|payable)|amount\s*due)/i.test(l));
 if(totals.length){const match=totals.at(-1).match(/(?:₹|INR|Rs\.?\s*)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?\s*$/i);if(match&&Number(match[1].replace(/,/g,''))>0)r.amount=match[1].replace(/,/g,'');}
 const km=t.match(/(?:odometer|meter\s*reading|vehicle\s*km|km\s*reading)\s*[:.\-]?\s*([\d,]+(?:\.\d+)?)/i);if(km)r.vehicle_km_reading=km[1].replace(/,/g,'');
 const desc=lines.find(l=>/^(?:description|work done|repair work)\s*[:\-]/i.test(l));if(desc)r.description=desc.replace(/^[^:\-]+[:\-]\s*/,'');
 return r;
}
function acceptMessage(event,frame,origin){return event.origin===origin&&event.source===frame;}
const api={fields,required,office,validate,normalize,parseBill,vehicle,safeUrl,acceptMessage};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.AZPRepair=api;
})(typeof window==='undefined'?globalThis:window);
