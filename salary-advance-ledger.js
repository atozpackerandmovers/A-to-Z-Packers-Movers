(function(root){
 'use strict';
 function summarize(rows,{start,end,claimed=[],match=()=>true}){
  const used=new Set(claimed.map(String)),unique=new Map();
  for(const r of rows){const amount=Number(r.amount),date=String(r.date||'');if((r.module||r.collection)!=='advanceRequest'||String(r.approval_status||'').toLowerCase()!=='approved'||!r.id||used.has(String(r.id))||!match(r)||!Number.isFinite(amount)||amount<=0||!start||date<start||date>end)continue;unique.set(String(r.id),r);}
  const records=[...unique.values()];return{amount:Math.round(records.reduce((n,r)=>n+Number(r.amount),0)*100)/100,ids:records.map(r=>String(r.id))};
 }
 const api={summarize};root.AZPAdvanceLedger=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
