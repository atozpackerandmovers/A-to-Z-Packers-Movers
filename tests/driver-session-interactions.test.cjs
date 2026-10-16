const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(process.env.DRIVER_SOURCE||path.join(__dirname,'../driver.html'),'utf8');
const script=source.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*?;\s*$/gm,'');
const user={role:'Driver',name:'Ajay',authOk:true,firebaseUid:'fixture-driver'};
const master={id:'fixture-master',module:'driverMaster',driver_name:'Ajay',status:'Active',joining_date:'2026-10-01'};
function harness(storage=new Map([['azp_staff_login',JSON.stringify(user)]])){
 const nodes=new Map(),snapshots=new Map(),errors=[],writes=[],gps=[],timers=[];
 let authChanged,confirmed=false,signouts=0,reloads=0;
 function element(id){if(!nodes.has(id)){const classes=new Set();nodes.set(id,{id,value:'',textContent:'',innerHTML:'',style:{},dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(){}},addEventListener(){},querySelector:()=>element(id+'-child'),querySelectorAll:()=>[],appendChild(){},remove(){},setAttribute(){},getAttribute(){return null;}});}return nodes.get(id);}
 const auth={currentUser:null};
 const unexpected=()=>{throw Error('Unexpected production operation');};
 const c={console:{log(){},warn(){},error(...a){errors.push(a.map(String).join(' '));}},Date,Map,Set,URL,URLSearchParams,Intl,JSON,Math,Promise,Number,String,Array,Object,RegExp,
  document:{getElementById:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>element('created'),body:element('body')},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),get length(){return storage.size},key:i=>[...storage.keys()][i]},
  location:{reload(){reloads++},href:'https://fixture.invalid/driver.html',search:''},navigator:{onLine:true,geolocation:{clearWatch(){}}},confirm:()=>confirmed,alert(){},
  setTimeout:(f)=>{timers.push(f);return timers.length},clearTimeout(){},setInterval:()=>1,clearInterval(){},lucide:{createIcons(){}},fetch:unexpected,
  getApps:()=>[],initializeApp:()=>({}),getApp:()=>({}),getFirestore:()=>({}),getDatabase:()=>({}),getAuth:()=>auth,
  browserLocalPersistence:'LOCAL',setPersistence:async()=>{},onAuthStateChanged:(_a,fn)=>{authChanged=fn},firebaseSignOut:async()=>{signouts++;auth.currentUser=null;authChanged(null)},
  signInWithEmailAndPassword:unexpected,collection:(_d,name)=>name,query:x=>x,doc:(_d,...p)=>p.join('/'),serverTimestamp:()=>0,
  onSnapshot:(name,fn,err)=>{snapshots.set(name,{fn,err});return()=>{}},getDocs:unexpected,setDoc:async(...a)=>writes.push(a),deleteDoc:unexpected,runTransaction:unexpected,writeBatch:unexpected,
  rtdbRef:(_d,p)=>p,onValue:(p,fn)=>{const entry={p,fn,stopped:false};gps.push(entry);return()=>{entry.stopped=true}},
  getStorage:()=>({}),repairStorageRef:unexpected,repairUploadBytes:unexpected,repairDownloadURL:unexpected,getFunctions:()=>({}),httpsCallable:()=>unexpected,
  AZPFuelLedger:require('../fuel-ledger.js'),AZPVehicleDocsStore:{create:()=>({})},AZPAttendanceRules:require('../attendance-rules.js')};
 c.window=c;c.addEventListener=()=>{};
 vm.createContext(c);vm.runInContext(script+'\nwindow.testState=()=>({currentUser,currentTab,azpProdLive});',c);
 const emit=(rows,collection='azpExecutionRecords')=>snapshots.get(collection).fn({docs:rows.map(r=>({id:r.id,data:()=>r}))});
 return {c,storage,nodes,errors,writes,gps,emit,networkError(){snapshots.get('azpExecutionRecords').err({code:'unavailable'})},auth(u={uid:'fixture-driver'}){auth.currentUser=u;authChanged(u)},confirm(v){confirmed=v},get signouts(){return signouts},get reloads(){return reloads}};
}
test('whole module: partial snapshots wait; active arrival renders; loss and recovery retain login',()=>{
 const h=harness();h.emit([]);assert.ok(h.storage.has('azp_staff_login'));assert.equal(h.c.testState().currentUser,null);
 assert.match(h.nodes.get('content').innerHTML,/Waiting for staff data/);assert.doesNotMatch(h.nodes.get('content').innerHTML,/Suspended/);
 h.auth();assert.equal(h.c.testState().currentUser,null);assert.equal(h.gps.length,0);
 h.emit([master]);assert.equal(h.c.testState().currentUser.name,'Ajay');assert.doesNotMatch(h.nodes.get('content').innerHTML,/Waiting for staff data|Login Suspended/);
 assert.equal(h.gps.length,2);h.emit([]);assert.equal(h.c.testState().currentUser,null);assert.ok(h.gps.every(x=>x.stopped));
 assert.ok(h.storage.has('azp_staff_login'));h.emit([master]);assert.equal(h.c.testState().currentUser.name,'Ajay');assert.equal(h.gps.length,4);
 h.gps[1].fn({exists:()=>true,val:()=>({stale:true})});assert.equal(h.c.testState().azpProdLive,null);
 assert.deepEqual(h.errors,[]);assert.deepEqual(h.writes,[]);
});
test('whole module: saved identity survives new runtime/reload and restart with partial cached master data',()=>{
 const h=harness();h.emit([master]);h.emit([]);
 for(let i=0;i<2;i++){const reopened=harness(h.storage);reopened.auth();assert.equal(reopened.c.testState().currentUser,null);assert.ok(reopened.storage.has('azp_staff_login'));reopened.emit([master]);assert.equal(reopened.c.testState().currentUser.name,'Ajay');assert.deepEqual(reopened.errors,[]);reopened.emit([]);}
});
for(const revoked of [{status:'Inactive'},{status:'Active',login_status:'Revoked'},{status:'Active',login_disabled:true},{status:'Active',enabled:false}])test('whole module: explicit revocation blocks both restore paths '+JSON.stringify(revoked),()=>{
 const h=harness();h.auth();h.emit([master]);const oldCallbacks=h.gps.slice();h.emit([{...master,...revoked}]);
 assert.equal(h.c.testState().currentUser,null);assert.equal(h.storage.has('azp_staff_login'),false);assert.match(h.nodes.get('content').innerHTML,/Login Suspended/);assert.ok(h.gps.every(x=>x.stopped));
 for(const listener of oldCallbacks)listener.fn({exists:()=>true,val:()=>({uid:'fixture-driver'})});
 h.auth();h.emit([master]);assert.equal(h.c.testState().currentUser,null);assert.equal(h.storage.has('azp_staff_login'),false);assert.deepEqual(h.writes,[]);
});
test('whole module: a linked staff member cannot be replaced by a similar name',()=>{
 const h=harness();h.emit([master]);h.emit([{...master,id:'other-master',driver_name:'Ajaya'}]);assert.equal(h.c.testState().currentUser,null);assert.ok(h.storage.has('azp_staff_login'));
});
test('whole module: temporary network error retains login and recovers; explicit score suspension still blocks',()=>{
 const h=harness();h.emit([master]);h.networkError();assert.ok(h.storage.has('azp_staff_login'));assert.equal(h.c.testState().currentUser.name,'Ajay');
 h.emit([master]);assert.equal(h.c.testState().currentUser.name,'Ajay');
 h.emit([master,{id:'level',module:'blackWhiteLevel',driver_name:'Ajay',status:'Suspended',login_disabled:'Yes'}]);
 assert.equal(h.storage.has('azp_staff_login'),false);assert.equal(h.c.testState().currentUser,null);assert.match(h.nodes.get('content').innerHTML,/Login Suspended/);assert.deepEqual(h.writes,[]);
});
test('whole module: Firebase matching UID cannot bypass an inactive cached master',()=>{
 const storage=new Map([['azp_staff_login',JSON.stringify(user)],['azp_staff_portal_live_cache_v1',JSON.stringify({executionRows:[{...master,status:'Inactive'}],planningRows:[]})]]);
 const h=harness(storage);h.auth();assert.equal(h.c.testState().currentUser,null);assert.equal(storage.has('azp_staff_login'),false);assert.equal(h.gps.length,0);
});
test('whole module: logout cancel/confirm, late snapshot, and auth callbacks never resurrect login',async()=>{
 const h=harness();h.emit([master]);h.auth();await h.c.logout();assert.ok(h.storage.has('azp_staff_login'));assert.equal(h.signouts,0);
 h.confirm(true);await h.c.logout();h.emit([master]);h.auth();assert.equal(h.storage.has('azp_staff_login'),false);assert.equal(h.c.testState().currentUser,null);assert.equal(h.signouts,1);assert.equal(h.reloads,1);assert.deepEqual(h.writes,[]);
});
test('whole module: GPS disconnect cancel/confirm retains portal, stops only GPS subscription',async()=>{
 const h=harness();h.emit([master]);h.auth();await h.c.azpProdLogout();assert.equal(h.signouts,0);assert.ok(h.gps.every(x=>!x.stopped));
 h.confirm(true);await h.c.azpProdLogout();assert.equal(h.signouts,1);assert.ok(h.gps.every(x=>x.stopped));assert.ok(h.storage.has('azp_staff_login'));assert.equal(h.c.testState().currentUser.name,'Ajay');assert.deepEqual(h.writes,[]);
});
test('whole module: legacy Stop GPS cancel has no side effects; confirm writes only to fixture',async()=>{
 const h=harness();h.emit([master]);await h.c.azpStopLiveGps();assert.deepEqual(h.writes,[]);
 h.confirm(true);await h.c.azpStopLiveGps();assert.equal(h.writes.length,1);assert.equal(h.writes[0][1].tracking_status,'Stopped');assert.ok(h.storage.has('azp_staff_login'));
});
test('login-only revocation preserves the pre-existing attendance status policy',()=>{
 const h=harness();const record={...master,login_status:'Revoked',login_disabled:true};
 assert.equal(h.c.staffMasterIsActive(record),true);h.emit([record]);assert.equal(h.c.testState().currentUser,null);assert.equal(h.storage.has('azp_staff_login'),false);
});
