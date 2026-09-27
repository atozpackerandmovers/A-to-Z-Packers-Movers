const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const L=require('../fuel-ledger.js');
const row=(id,cost,paid,driver='Somnath')=>({id,driver,fuel_cost:cost,boss_amount:paid});
test('positive is driver receivable; negative is company receivable, including expense zero',()=>{
 assert.equal(L.summary([row('1',3500,3000)]).driverDue,500);
 const s=L.summary([row('1',0,3000)]);assert.equal(s.companyDue,3000);assert.equal(s.driverDue,0);assert.equal(s.balance,-3000);
 assert.equal(L.summary([row('1',3000,3000)]).balance,0);
});
test('carry adds per-entry differences once and ignores stale cumulative carry',()=>{
 const a={...row('a',2000,3000),carryNew:1000},b={...row('b',1500,0),carryNew:-500};
 assert.equal(L.summary([a,b,a]).balance,500);
 assert.equal(L.summary([a,b,{...row('c',0,500)}]).balance,0);
 assert.equal(L.summary([a,{...row('d',0,0),company_returned:1000}]).balance,0);
});
test('unknown company payment is excluded; explicit zero is valid; driver groups never offset each other',()=>{
 const data=[row('a',1000,null),row('b',900,''),row('c',500,0),row('d',0,2000,'Mahesh')];
 const g=L.groups(data);assert.equal(g.find(x=>x.driver==='Somnath').unknown,2);
 assert.equal(g.reduce((s,x)=>s+x.driverDue,0),500);assert.equal(g.reduce((s,x)=>s+x.companyDue,0),2000);
 assert.equal(L.entry({...row('x',1000,0),driver:''}).known,false);
});
test('strict calculation rejects empty, non-finite, negative and backwards input',()=>{
 const valid={start:1000,end:1400,mileage:10,ppl:93,boss_amount:3000};
 assert.equal(L.calculate(valid).consumption,3720);assert.equal(L.calculate(valid).difference_amount,720);
 for(const [key,value] of [['start',''],['end',999],['end',Infinity],['mileage',0],['ppl',-5],['boss_amount',''],['boss_amount',-1]])assert.throws(()=>L.calculate({...valid,[key]:value}));
 assert.equal(L.calculate({...valid,boss_amount:0}).boss_amount,0);
});
function bridge(){
 const html=fs.readFileSync('driver.html','utf8');const code=html.slice(html.indexOf('    const fuelSaveRequests='),html.indexOf('    function fuel(){',html.indexOf('    const fuelSaveRequests=')));
 const messages=[],dbRows=new Map();let handler,writes=0;
 const sender={postMessage:m=>messages.push(m)};
 const ctx={window:{addEventListener:(_,fn)=>handler=fn},document:{getElementById:()=>({contentWindow:sender,style:{}})},location:{origin:'https://example.test'},currentUser:{name:'Somnath',role:'Driver'},AZPFuelLedger:L,fuelVehicleOptions:()=>['OD 02 BY 8855'],db:{},MAIN:'records',doc:(_,collection,id)=>id,serverTimestamp:()=>123,
 runTransaction:async(_,fn)=>fn({get:async id=>({exists:()=>dbRows.has(id),data:()=>dbRows.get(id)}),set:(id,data)=>{writes++;dbRows.set(id,data)}}),sendFuelContext:()=>{},Intl,Date};
 vm.runInNewContext(code,ctx);
 const data={type:'AZP_FUEL_SAVE',requestId:'test-request-123456789',entry:{start:1000,end:1400,mileage:10,ppl:93,boss_amount:3000,fuel_filled_litre:'',vehicle:'OD02BY8855',driver:'Attacker',consumption:999999}};
 return {ctx,messages,dbRows,data,send:(d=data,source=sender,origin='https://example.test')=>handler({data:d,source,origin}),writes:()=>writes};
}
test('bridge recomputes values and binds identity; retry is idempotent',async()=>{
 const b=bridge();await b.send();await b.send();assert.equal(b.writes(),1);const r=[...b.dbRows.values()][0];
 assert.equal(r.driver,'Somnath');assert.equal(r.fuel_cost,3720);assert.equal(r.difference_amount,720);assert.equal(b.messages.at(-1).ok,true);
 await b.send({...b.data,entry:{...b.data.entry,boss_amount:1000}});assert.equal(b.writes(),1);assert.equal(b.messages.at(-1).ok,false);
});
test('bridge rejects foreign source, origin, wrong role, vehicle and invalid amount',async()=>{
 const b=bridge();await b.send(b.data,{});await b.send(b.data,undefined,'https://bad.test');assert.equal(b.messages.length,0);
 for(const entry of [{...b.data.entry,vehicle:'OTHER'},{...b.data.entry,boss_amount:''}]){await b.send({...b.data,entry});assert.equal(b.messages.at(-1).ok,false);}
 b.ctx.currentUser.role='Worker';await b.send();assert.equal(b.messages.at(-1).ok,false);assert.equal(b.writes(),0);
});
test('failed database save sends failure and permits same draft retry',async()=>{
 const b=bridge(),ok=b.ctx.runTransaction;b.ctx.runTransaction=async()=>{throw Object.assign(Error('offline'),{code:'unavailable'});};
 await b.send();assert.equal(b.messages.at(-1).ok,false);assert.equal(b.writes(),0);b.ctx.runTransaction=ok;await b.send();assert.equal(b.writes(),1);assert.equal(b.messages.at(-1).ok,true);
});
function form(){
 const elements={},events={},sent=[],storage=new Map();let message;
 const el=id=>elements[id]||(elements[id]={value:'',checked:false,hidden:id==='review',style:{},disabled:false,textContent:'',classList:{toggle(){}},addEventListener:(event,fn)=>events[id+':'+event]=fn,append(o){if(!this.value)this.value=String(o.value)},focus(){},set innerHTML(v){this.html=v;if(id==='vehicleSel'){this.value=v.match(/<option>([^<]*)/)[1]||''}},get innerHTML(){return this.html||''}});
 const parent={postMessage:d=>sent.push(d)},origin='https://example.test';
 const ctx={window:{AZPFuelLedger:L,addEventListener:(_,fn)=>message=fn},parent,location:{origin},document:{getElementById:el,createElement:()=>({}),querySelector:q=>q.includes('sr')?{value:el('srYes').checked?'yes':'no'}:{getBoundingClientRect:()=>({height:500})},querySelectorAll:()=>[],addEventListener:(event,fn)=>events[event]=fn},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},crypto:{randomUUID:()=>require('crypto').randomUUID()},ResizeObserver:class{observe(){}},alert:()=>{},confirm:()=>true,Intl,Date};
 el('pricePerLitre').value='93';el('srNo').checked=true;
 vm.runInNewContext(fs.readFileSync('driver-fuel-form.js','utf8'),ctx);
 const receive=d=>message({source:parent,origin,data:d});
 return {el,events,sent,receive,context:{type:'AZP_FUEL_CONTEXT',driver:'Somnath',vehicles:['OD 02 BY 8855'],records:[]}};
}
test('form retains typed draft during live refresh, preserves failed save and clears only after success',()=>{
 const f=form();f.receive(f.context);f.el('meterStart').value='1000';f.el('meterEnd').value='1400';f.el('bossAmount').value='3000';f.events.input();
 f.receive({...f.context,records:[row('old',0,100)]});assert.equal(f.el('meterEnd').value,'1400');assert.equal(f.el('bossAmount').value,'3000');
 f.el('btnSave').onclick();const request=f.sent.at(-1);assert.equal(request.type,'AZP_FUEL_SAVE');assert.equal(f.el('btnSave').disabled,true);
 f.receive({type:'AZP_FUEL_SAVE_RESULT',requestId:request.requestId,ok:false,error:'offline'});assert.equal(f.el('meterEnd').value,'1400');assert.equal(f.el('btnSave').disabled,false);
 f.el('btnSave').onclick();assert.equal(f.sent.at(-1).requestId,request.requestId);
 f.receive({type:'AZP_FUEL_SAVE_RESULT',requestId:request.requestId,ok:true,id:'saved',record:{...row('saved',3720,3000),meter_end:1400,vehicle_number:'OD 02 BY 8855'}});
 assert.equal(f.el('meterEnd').value,'');assert.equal(f.el('bossAmount').value,'');assert.equal(f.el('meterStart').value,1400);assert.match(f.el('saveMessage').textContent,/Saved to Execution/);
});
