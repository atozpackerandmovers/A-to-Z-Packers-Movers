const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../integrations/gps-admin-transport-only');
const code=fs.readFileSync(path.join(dir,'app.v9.0.2-status-staging.js'),'utf8');
function harness(websocket=true,allowReads=false){
 const calls=[],nodes=new Map(),listeners=new Map(),events=new Map(),errors=new Map(),intervals=[];let changed;const clock={now:1800000000000};class TestDate extends Date{static now(){return clock.now}}
 const version=code.match(/const BUILD_VERSION = "([^"]+)"/)[1];
 function el(id){if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',disabled:false,value:'',style:{},classList:{add(){},remove(){},toggle(){}},removeAttribute(){},setAttribute(){},addEventListener:(e,fn)=>events.set(id+':'+e,fn)});return nodes.get(id)}
 const auth={currentUser:null,setPersistence:async()=>{},onAuthStateChanged:fn=>{changed=fn},signOut:async()=>{auth.currentUser=null;calls.push('signout')}};
 const db={INTERNAL:websocket?{forceWebSockets:()=>calls.push('websocket')}:{},goOnline:()=>calls.push('online'),goOffline:()=>calls.push('offline'),ref:p=>{calls.push('ref:'+p);return {on:(_e,fn,fail)=>{listeners.set(p,fn);errors.set(p,fail)},off(){},push:()=>({key:'fixture-command',set:async v=>calls.push('write:'+v.type)}),once:async()=>{if(allowReads)return {val:()=>!/fullRolloutApproved|resetEnabled/.test(p)};throw {code:'PERMISSION_DENIED',message:'Fixture denial'}},limitToLast(){return this},orderByKey(){return this}}}};
 const app={name:'[DEFAULT]',auth:()=>auth,database:()=>db};db.app=app;
 const c={console:{info(){},warn(){},error(){}},URL,Date:TestDate,Set,Map,Promise,location:{href:'https://fixture.invalid/',pathname:'/',search:'',hash:''},history:{replaceState(){}},navigator:{onLine:true},sessionStorage:{setItem(){}},
 document:{getElementById:el,querySelector:()=>({content:version}),querySelectorAll:s=>s==='[data-dashboard-build]'?[{dataset:{dashboardBuild:version}},{dataset:{dashboardBuild:version}}]:[],addEventListener(){},visibilityState:'visible'},
 setTimeout:()=>1,clearTimeout(){},setInterval:fn=>{intervals.push(fn);return 1},clearInterval(){},addEventListener(){},confirm:()=>false,
 firebase:{apps:[],database:{ServerValue:{TIMESTAMP:0}},initializeApp:config=>{app.options=config;return app},auth:{Auth:{Persistence:{SESSION:'session'}}}}};c.window=c;vm.createContext(c);vm.runInContext(code,c);
 const uid=code.match(/adminUid: "([^"]+)"/)[1];
 return {calls,nodes,listeners,events,errors,intervals,clock,c,async login(id=uid){await Promise.resolve();auth.currentUser={uid:id,email:'fixture@example.invalid'};await changed(auth.currentUser)}};
}
const mahesh='gpsProduction/v1/drivers/DRIVER_MAHESH_001/live';
const ajay='gpsProduction/v1/drivers/DRIVER_AJAY_001/live';
const acks='gpsProduction/v1/drivers/DRIVER_MAHESH_001/acknowledgements';
async function connected(allow=true){const h=harness(true,allow);await h.login();h.listeners.get('.info/connected')({val:()=>true});await new Promise(r=>setImmediate(r));return h}
function emit(h,p,v){h.listeners.get(p)({val:()=>v})}
test('Stored RUNNING becomes visibly stale with age in fleet and overview, retaining trip/accuracy',async()=>{
 const h=await connected();emit(h,mahesh,{status:'RUNNING',activeTripId:'TEST_TRIP_fixture',lastSyncAt:h.clock.now-69*86400000,accuracyMeters:13.9});
 assert.match(h.nodes.get('fleetCards').innerHTML,/STALE.*last reported RUNNING/);assert.match(h.nodes.get('fleetCards').innerHTML,/69d 0h ago/);
 assert.match(h.nodes.get('tripStatus').textContent,/STALE.*RUNNING/);assert.equal(h.nodes.get('tripId').textContent,'TEST_TRIP_fixture');assert.equal(h.nodes.get('accuracy').textContent,'13.9 m');assert.match(h.nodes.get('gpsStatus').textContent,/current GPS unverified/);
 assert.equal(h.calls.some(c=>c.startsWith('write:')),false);
});
test('Freshness boundary, missing/invalid/future clocks and old sync with recent update are conservative',()=>{
 const h=harness();const status=v=>h.c.fleetStatus(v);
 assert.equal(status({status:'RUNNING',lastSyncAt:h.clock.now-120000}),'RUNNING');
 assert.equal(status({status:'RUNNING',lastSyncAt:h.clock.now-120001}),'STALE');
 for(const v of [undefined,0,'invalid',h.clock.now+1])assert.equal(status({status:'STARTING',lastSyncAt:v}),'STALE');
 assert.equal(status({status:'RUNNING',lastSyncAt:h.clock.now-500000,lastUpdateAt:h.clock.now}),'STALE');
 assert.equal(status({status:'RUNNING',lastUpdateAt:h.clock.now}),'RUNNING');
});
test('A silent device ages to stale on display timer and a fresh snapshot recovers it',async()=>{
 const h=await connected();emit(h,mahesh,{status:'RUNNING',lastSyncAt:h.clock.now});assert.equal(h.nodes.get('tripStatus').textContent,'RUNNING');
 h.clock.now+=120001;h.intervals.forEach(fn=>fn());assert.match(h.nodes.get('tripStatus').textContent,/STALE/);
 emit(h,mahesh,{status:'RUNNING',lastSyncAt:h.clock.now});assert.equal(h.nodes.get('tripStatus').textContent,'RUNNING');
});
test('Live denial has exact path/code, clears affected display, preserves other driver and connected transport',async()=>{
 const h=await connected();emit(h,mahesh,{status:'RUNNING',lastSyncAt:h.clock.now});emit(h,ajay,{status:'RUNNING',lastSyncAt:h.clock.now,activeTripId:'ajay-fixture'});
 const connection=h.nodes.get('connectionText').textContent;h.errors.get(mahesh)({code:'PERMISSION_DENIED',message:'Fixture denial'});
 assert.equal(h.nodes.get('connectionText').textContent,connection);assert.equal(h.nodes.get('connectionDot').className,'ok');assert.match(h.nodes.get('dataReadStatus').textContent,/DRIVER_MAHESH_001\/live.*PERMISSION_DENIED/);
 assert.equal(h.nodes.get('tripStatus').textContent,'UNAVAILABLE');assert.match(h.nodes.get('fleetCards').innerHTML,/ajay-fixture/);
 emit(h,mahesh,{status:'RUNNING',lastSyncAt:h.clock.now});assert.doesNotMatch(h.nodes.get('dataReadStatus').textContent,/PERMISSION_DENIED/);assert.equal(h.nodes.get('tripStatus').textContent,'RUNNING');
});
test('Acknowledgement and approval errors do not relabel the transport; approval denial still blocks commands',async()=>{
 const h=await connected(false);assert.equal(h.nodes.get('connectionDot').className,'ok');assert.match(h.nodes.get('diagnosticRows').innerHTML,/PERMISSION_DENIED/);assert.equal(h.nodes.get('startCommand').disabled,true);
 h.errors.get(acks)({code:'PERMISSION_DENIED',message:'Fixture'});assert.match(h.nodes.get('ackRows').innerHTML,/Acknowledgements unavailable/);assert.equal(h.nodes.get('connectionDot').className,'ok');
 h.listeners.get('.info/connected')({val:()=>false});assert.equal(h.nodes.get('connectionDot').className,'bad');
});
test('No parent trip reads; history and route explicitly unavailable, including after reconnect',async()=>{
 const h=await connected();h.listeners.get('.info/connected')({val:()=>false});h.listeners.get('.info/connected')({val:()=>true});
 assert.equal(h.calls.some(c=>/\/trips(?:\/|$)/.test(c)),false);assert.match(h.nodes.get('tripRows').innerHTML,/History unavailable under current permissions/);assert.match(h.nodes.get('routeRows').innerHTML,/trip-list loading is suspended/);assert.equal(h.nodes.get('routeTripSelect').disabled,true);
});
test('Logout clears panel errors and detached listener callbacks cannot restore them',async()=>{
 const h=await connected();const fail=h.errors.get(mahesh);fail({code:'PERMISSION_DENIED'});await h.events.get('logout:click')();
 assert.doesNotMatch(h.nodes.get('dataReadStatus').textContent,/PERMISSION_DENIED/);fail({code:'PERMISSION_DENIED'});assert.doesNotMatch(h.nodes.get('dataReadStatus').textContent,/PERMISSION_DENIED/);
});
test('Command payload, gates, confirmation behavior and transport block remain byte-identical',()=>{
 const old=fs.readFileSync(path.join(dir,'app.v9.0.1-transport.js'),'utf8');
 function section(s,start,end){return s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)))}
 for(const [start,end] of [['async function sendCommand(type)','$("loginForm")'],['function pilotActive()','function renderLive('],['    if (!transportConfigured) {','    db.goOnline();'],['$("loginForm")','$("routeTripSelect").addEventListener']]){
  assert.equal(section(code,start,end),section(old,start,end));
 }
 assert.deepEqual([...code.matchAll(/\.(set|update|push|remove|transaction)\(/g)].map(x=>x[1]),[...old.matchAll(/\.(set|update|push|remove|transaction)\(/g)].map(x=>x[1]));
 const config=JSON.parse(fs.readFileSync(path.join(dir,'firebase.json'))).hosting;
 assert.equal(config.headers.flatMap(x=>x.headers).find(x=>x.key==='Content-Security-Policy').value,JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/gps-transport-only-release-20261016/hosting-version-config.json'))).headers.find(x=>x.glob==='**').headers['Content-Security-Policy']);
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');assert.match(html,/src="app.v9.0.2-status-staging.js"/);assert.ok(html.includes(code.match(/const BUILD_VERSION = "([^"]+)"/)[1]));
});
