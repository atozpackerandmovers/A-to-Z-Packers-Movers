const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','executions.html'),'utf8');
const source=html.match(/<script type="module" id="azp-production-gps-monitor-v100-js">([\s\S]*?)<\/script>/)[1];

// Run only the isolated GPS block. Firebase, DOM, dialogs and timers are inert
// test doubles: these tests never log in, contact a database or write records.
function harness(options={}){
  const nodes=new Map(),reads=[],dialogs=[],saved=[],calls={signIn:0,signOut:0,writes:0,resets:0};
  let authNext,authError,loginResolve,fuelResolve;
  function element(){return {value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,style:{},dataset:{},classList:{contains:()=>false,add:()=>{}},focus(){this.focused=true},scrollIntoView(){},querySelector:s=>nodes.get(s.slice(1))||null,querySelectorAll:()=>[],appendChild(el){nodes.set(el.id,el)},reset(){calls.resets++;for(const id of ['azp-pgm-email','azp-pgm-password'])nodes.get(id).value=''}}}
  for(const id of ['mod-gps','azp-pgm-connection','azp-pgm-account','azp-pgm-auth','azp-pgm-auth-msg','azp-pgm-auth-form','azp-pgm-email','azp-pgm-password','azp-pgm-login','azp-pgm-auth-cancel','azp-pgm-switch','azp-pgm-logout','azp-pgm-retry','azp-pgm-cards','azp-pgm-litres','azp-pgm-price','azp-pgm-total','azp-pgm-driver','azp-pgm-form','azp-pgm-fuel-balances','azp-pgm-preview','azp-pgm-save','azp-pgm-odo','azp-pgm-msg'])nodes.set(id,element());
  const ctx={console,Date,Map,Set,Number,String,Array,Math,Intl,
    document:{getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],addEventListener:()=>{},createElement:()=>element()},
    window:{addEventListener:()=>{}},setInterval:()=>1,setTimeout:()=>1,
    getApps:()=>[{}],getApp:()=>({}),initializeApp:()=>({}),getDatabase:()=>({}),getFirestore:()=>({}),getAuth:()=>({}),
    ref:(_,p)=>p,onValue:(p,next,error)=>{if(options.throwPath===p)throw {code:'database/unavailable'};const r={path:p,next,error,active:true};reads.push(r);return()=>{r.active=false}},
    onAuthStateChanged:(_,next,error)=>{authNext=next;authError=error},
    signInWithEmailAndPassword:async()=>{calls.signIn++;if(options.deferLogin)await new Promise(resolve=>loginResolve=resolve);if(options.loginError)throw {code:options.loginError};const user={uid:api.adminUid,email:'admin@example.test'};if(!options.suppressLoginObserver)authNext(user);return {user}},
    signOut:async()=>{calls.signOut++;if(options.logoutError)throw {code:options.logoutError};authNext(null)},
    confirm:message=>{dialogs.push(message);return options.confirm!==false},alert:()=>{},
    setDoc:async(ref,value)=>{calls.writes++;if(!options.allowMockFuelWrites)throw Error('Unexpected write in GPS auth test');if(options.deferFuelWrite)await new Promise(resolve=>fuelResolve=resolve);if(options.writeError)throw {code:options.writeError};saved.push({ref,value})},doc:(_,collection,id)=>({collection,id}),serverTimestamp:()=>null,
  };
  vm.createContext(ctx);
  vm.runInContext(source.replace(/^import .*;\s*$/gm,'')+(options.realFuel?'':'\npgmRenderFuelBalances=()=>{};')+`
    globalThis.api={adminUid:PGM_ADMIN_UID,drivers:PGM_DRIVERS,start:pgmStart,stop:pgmStopReads,retry:pgmRetryReads,switchAccount:pgmSwitchAccount,cancel:pgmCancelAccountChange,login:pgmLogin,logout:pgmLogout,ensure:pgmEnsure,render:pgmRenderCards,text:pgmConnectionText,card:pgmCard,parseNumber:pgmNum,acceptFuel:pgmAcceptFuelRows,fuelSnapshot:pgmFuelSnapshot,fuelCard:pgmFuelCard,saveFuel:pgmSave,zeroFuel:pgmZeroFuel,get user(){return pgmUser},get data(){return pgmState},get readStatus(){return pgmReadStatus},get busy(){return pgmAuthBusy}};`,ctx);
  const api=ctx.api;
  const snap=value=>({exists:()=>value!==null,val:()=>value});
  function current(p){const r=reads.findLast(r=>r.path===p&&r.active);assert.ok(r,'Active listener for '+p);return r}
  function emit(p,value){current(p).next(snap(value))}
  function fail(p,code='PERMISSION_DENIED'){current(p).error({code})}
  function signInAdmin(){authNext({uid:api.adminUid,email:'admin@example.test'})}
  function allReady({missingLive=false,old=false}={}){
    emit('.info/connected',true);
    for(const d of api.drivers){emit(`gpsProduction/v1/drivers/${d.id}/profile`,{driverName:d.name,vehicleNumber:d.vehicle});emit(`gpsProduction/v1/drivers/${d.id}/live`,missingLive?null:{lastSyncAt:Date.now()-(old?86400000:1000),latitude:20,longitude:85,speedMps:1,distanceMeters:100,accuracyMeters:5,status:'RUNNING'})}
  }
  function loginEvent(){return {preventDefault(){},target:nodes.get('azp-pgm-auth-form')}}
  return {api,nodes,reads,calls,dialogs,saved,auth:authNext,authError,emit,fail,current,signInAdmin,allReady,loginEvent,snap,finishLogin:()=>loginResolve(),finishFuelWrite:()=>fuelResolve()};
}

test('auth initialization and signed-out states cannot subscribe or claim GPS sync',()=>{
  const h=harness();h.api.start();assert.equal(h.reads.length,0);assert.match(h.api.text(),/login check/);
  h.auth(null);h.api.start();assert.equal(h.reads.length,0);assert.match(h.api.text(),/login required/);assert.equal(h.nodes.get('azp-pgm-auth').style.display,'block');assert.equal(h.calls.signOut,0);
});

test('wrong account is visible and recoverable without any all-driver reads or automatic sign-out',()=>{
  const h=harness();h.auth({uid:'not-the-admin',email:'driver@example.test'});
  assert.equal(h.reads.length,0);assert.match(h.api.text(),/Production Admin account/);assert.equal(h.nodes.get('azp-pgm-account').textContent,'GPS account: driver@example.test');assert.equal(h.nodes.get('azp-pgm-auth').style.display,'block');assert.equal(h.nodes.get('azp-pgm-switch').hidden,false);assert.equal(h.calls.signOut,0);
  assert.match(h.api.card(h.api.drivers[0]),/ADMIN LOGIN REQUIRED/);
});

test('admin subscribes only to connection info and the six leaf reads; repeated start has no duplicates',()=>{
  const h=harness();h.signInAdmin();h.api.start();h.api.start();assert.equal(h.reads.length,7);
  assert.equal(h.reads.filter(r=>r.path==='.info/connected').length,1);
  assert.equal(h.reads.filter(r=>/^gpsProduction\/v1\/drivers\/DRIVER_(MAHESH|AJAY|SOMNATH)_001\/(profile|live)$/.test(r.path)).length,6);
  assert.equal(h.calls.writes,0);assert.doesNotMatch(h.api.text(),/access confirmed|Live Data Synced/);
});

test('connected transport is not reported as completed reads; success waits for all six callbacks',()=>{
  const h=harness();h.signInAdmin();h.emit('.info/connected',true);assert.match(h.api.text(),/0\/6/);
  h.emit('gpsProduction/v1/drivers/DRIVER_MAHESH_001/profile',{});assert.match(h.api.text(),/1\/6/);
  h.allReady();assert.match(h.api.text(),/access confirmed.*6\/6/);assert.equal(h.nodes.get('azp-pgm-auth').style.display,'none');
});

test('empty live nodes remain unavailable rather than fabricated GPS success',()=>{
  const h=harness();h.signInAdmin();h.allReady({missingLive:true});assert.match(h.api.text(),/Live GPS data missing: Mahesh, Ajay, Somnath/);
  assert.match(h.api.card(h.api.drivers[0]),/GPS UNAVAILABLE/);assert.doesNotMatch(h.api.card(h.api.drivers[0]),/GPS LIVE/);
});

test('successful reads of stale data do not claim fresh live GPS',()=>{
  const h=harness();h.signInAdmin();h.allReady({old:true});assert.match(h.api.text(),/GPS freshness/);assert.match(h.api.card(h.api.drivers[0]),/GPS STALE/);assert.doesNotMatch(h.api.card(h.api.drivers[0]),/GPS LIVE/);
});

test('permission denied clears the failed snapshot, exposes login recovery, and never signs out automatically',()=>{
  const h=harness();h.signInAdmin();h.allReady();h.fail('gpsProduction/v1/drivers/DRIVER_MAHESH_001/live');
  assert.equal(h.api.data.get('DRIVER_MAHESH_001').live,null);assert.match(h.api.text(),/Mahesh live: PERMISSION_DENIED/);assert.equal(h.nodes.get('azp-pgm-auth').style.display,'block');assert.match(h.api.card(h.api.drivers[0]),/GPS ACCESS DENIED/);assert.equal(h.calls.signOut,0);
});

test('disconnected transport cannot leave a card claiming GPS LIVE; reconnection restores ready data',()=>{
  const h=harness();h.signInAdmin();h.allReady();assert.match(h.api.card(h.api.drivers[0]),/GPS LIVE/);
  h.emit('.info/connected',false);assert.match(h.api.text(),/disconnected/);assert.match(h.api.card(h.api.drivers[0]),/GPS DISCONNECTED/);assert.doesNotMatch(h.api.card(h.api.drivers[0]),/GPS LIVE/);
  h.emit('.info/connected',true);assert.match(h.api.card(h.api.drivers[0]),/GPS LIVE/);
});

test('account changes unsubscribe all listeners, clear snapshots/errors and ignore queued old callbacks',()=>{
  const h=harness();h.signInAdmin();h.allReady();const old=h.current('gpsProduction/v1/drivers/DRIVER_AJAY_001/live');
  h.auth({uid:'other-user',email:'other@example.test'});assert.equal(h.reads.filter(r=>r.active).length,0);for(const v of h.api.data.values()){assert.equal(v.profile,null);assert.equal(v.live,null)}
  old.next(h.snap({lastSyncAt:Date.now(),latitude:1,longitude:2}));old.error({code:'PERMISSION_DENIED'});assert.equal(h.api.data.get('DRIVER_AJAY_001').live,null);assert.doesNotMatch(h.api.text(),/PERMISSION_DENIED/);
});

test('explicit retry cleans the previous generation and restores exactly one subscription set',()=>{
  const h=harness();h.signInAdmin();const old=h.current('gpsProduction/v1/drivers/DRIVER_AJAY_001/live');h.fail(old.path);h.api.retry();h.api.retry();
  assert.equal(h.reads.filter(r=>r.active).length,7);assert.equal(h.api.readStatus.get('Ajay live'),'pending');old.error({code:'PERMISSION_DENIED'});assert.doesNotMatch(h.api.text(),/PERMISSION_DENIED/);h.allReady();assert.match(h.api.text(),/access confirmed/);assert.equal(h.calls.signOut,0);assert.equal(h.calls.writes,0);
});

test('switch and cancel leave the current session intact and clear only the password field',()=>{
  const h=harness();h.signInAdmin();h.allReady();h.api.switchAccount();assert.equal(h.nodes.get('azp-pgm-auth').style.display,'block');assert.equal(h.nodes.get('azp-pgm-email').focused,true);
  h.nodes.get('azp-pgm-password').value='test-only-placeholder';h.nodes.get('azp-pgm-email').value='other@example.test';h.api.cancel();assert.equal(h.nodes.get('azp-pgm-password').value,'');assert.equal(h.nodes.get('azp-pgm-email').value,'other@example.test');assert.equal(h.nodes.get('azp-pgm-auth').style.display,'none');assert.equal(h.calls.signOut,0);assert.equal(h.reads.filter(r=>r.active).length,7);
});

test('cancelled account replacement never invokes Firebase sign-in',async()=>{
  const h=harness({confirm:false});h.signInAdmin();h.nodes.get('azp-pgm-email').value='other@example.test';await h.api.login(h.loginEvent());assert.equal(h.calls.signIn,0);assert.equal(h.calls.signOut,0);assert.match(h.dialogs[0],/Driver Portal/);
});

test('failed sign-in retains the existing account and makes another attempt possible without retaining password',async()=>{
  const h=harness({loginError:'auth/invalid-credential'});h.auth({uid:'wrong-user',email:'wrong@example.test'});h.nodes.get('azp-pgm-email').value='admin@example.test';h.nodes.get('azp-pgm-password').value='test-only-placeholder';await h.api.login(h.loginEvent());
  assert.equal(h.api.user.uid,'wrong-user');assert.equal(h.nodes.get('azp-pgm-password').value,'');assert.match(h.nodes.get('azp-pgm-auth-msg').textContent,/auth\/invalid-credential/);assert.equal(h.nodes.get('azp-pgm-login').disabled,false);assert.equal(h.calls.signOut,0);
});

test('successful account replacement resets the form and starts protected reads',async()=>{
  const h=harness();h.auth({uid:'wrong-user',email:'wrong@example.test'});h.nodes.get('azp-pgm-email').value='admin@example.test';await h.api.login(h.loginEvent());assert.equal(h.api.user.uid,h.api.adminUid);assert.equal(h.calls.resets,1);assert.equal(h.reads.filter(r=>r.active).length,7);assert.equal(h.calls.signOut,0);assert.equal(h.calls.writes,0);
});

test('same-UID reauthentication restarts denied reads even without an auth observer event',async()=>{
  const h=harness({suppressLoginObserver:true});h.signInAdmin();h.allReady();const old=h.current('gpsProduction/v1/drivers/DRIVER_AJAY_001/live');h.fail(old.path);
  h.nodes.get('azp-pgm-email').value='admin@example.test';await h.api.login(h.loginEvent());assert.equal(h.calls.signIn,1);assert.equal(old.active,false);assert.equal(h.api.readStatus.get('Ajay live'),'pending');assert.doesNotMatch(h.api.text(),/PERMISSION_DENIED/);assert.equal(h.reads.filter(r=>r.active).length,7);h.allReady();assert.match(h.api.text(),/access confirmed/);
});

test('repeated login clicks and account controls are inert while a sign-in is pending',async()=>{
  const h=harness({deferLogin:true});h.auth(null);h.nodes.get('azp-pgm-email').value='admin@example.test';const first=h.api.login(h.loginEvent());await h.api.login(h.loginEvent());h.api.switchAccount();h.api.cancel();h.api.retry();await h.api.logout();assert.equal(h.calls.signIn,1);assert.equal(h.api.busy,true);h.finishLogin();await first;assert.equal(h.api.busy,false);assert.equal(h.calls.signOut,0);
});

test('logout requires explicit confirmation and clears only the GPS session data after success',async()=>{
  const cancelled=harness({confirm:false});cancelled.signInAdmin();await cancelled.api.logout();assert.equal(cancelled.calls.signOut,0);assert.equal(cancelled.reads.filter(r=>r.active).length,7);
  const h=harness();h.signInAdmin();h.allReady();await h.api.logout();assert.equal(h.calls.signOut,1);assert.equal(h.api.user,null);assert.equal(h.reads.filter(r=>r.active).length,0);assert.match(h.dialogs[0],/Driver Portal/);assert.equal(h.calls.writes,0);assert.equal(h.nodes.get('azp-pgm-auth').style.display,'block');
});

test('failed logout keeps the session and exposes an error without losing recovery controls',async()=>{
  const h=harness({logoutError:'auth/network-request-failed'});h.signInAdmin();await h.api.logout();assert.equal(h.api.user.uid,h.api.adminUid);assert.equal(h.reads.filter(r=>r.active).length,7);assert.equal(h.nodes.get('azp-pgm-auth').style.display,'block');assert.match(h.nodes.get('azp-pgm-auth-msg').textContent,/Disconnect failed/);assert.equal(h.api.busy,false);
});

test('auth observer failure and synchronous listener failures remain visible without stale live cards',()=>{
  const h=harness();h.signInAdmin();h.allReady();h.authError({code:'auth/network-request-failed'});assert.equal(h.reads.filter(r=>r.active).length,0);assert.match(h.api.text(),/GPS login check failed/);assert.equal(h.api.data.get('DRIVER_MAHESH_001').live,null);
  const bad=harness({throwPath:'.info/connected'});bad.signInAdmin();assert.match(bad.api.text(),/Connection: database\/unavailable/);assert.doesNotMatch(bad.api.card(bad.api.drivers[0]),/GPS LIVE/);
});

test('rendered account identity uses textContent, and repeated mounting wires controls only once',()=>{
  const h=harness();h.auth({uid:'wrong-user',email:'<img src=x onerror=alert(1)>@example.test'});assert.equal(h.nodes.get('azp-pgm-account').innerHTML,'');assert.match(h.nodes.get('azp-pgm-account').textContent,/<img/);
  h.api.ensure();h.api.ensure();assert.equal(h.nodes.get('azp-pgm-switch').onclick,h.api.switchAccount);assert.equal(h.nodes.get('azp-pgm-logout').onclick,h.api.logout);assert.equal(h.nodes.get('azp-pgm-retry').onclick,h.api.retry);assert.equal(h.nodes.get('azp-pgm-auth-cancel').onclick,h.api.cancel);assert.equal(h.calls.writes,0);
});

test('GPS monitor remains read-only for RTDB and contains no automatic sign-out path',()=>{
  assert.match(source,/import \{getDatabase,ref,onValue\}/);assert.doesNotMatch(source,/\b(?:set|update|remove|push|runTransaction)\(ref\(pgmDb/);
  assert.equal((source.match(/await signOut\(pgmAuth\)/g)||[]).length,1);assert.match(source,/async function pgmLogout\(\)[\s\S]*?if\(!confirm\([\s\S]*?await signOut\(pgmAuth\)/);
  assert.match(source,/Execution data sync aur GPS connection alag hain/);
});

function fuelFixture(options={}){
  const h=harness({realFuel:true,allowMockFuelWrites:true,...options});h.signInAdmin();h.allReady();const d=h.api.drivers[0];
  h.nodes.get('azp-pgm-driver').value=d.id;h.nodes.get('azp-pgm-litres').value='5';h.nodes.get('azp-pgm-price').value='100';
  h.api.acceptFuel([{id:'fixture-fill',module:'fuel',entry_type:'Live Vehicle GPS Fuel Entry',vehicle_number:d.vehicle,driver_id:d.id,fuel_balance_after_litre:20,gps_distance_km_at_fill:0,gps_trip_id:'fixture-trip',average_price_per_litre:100,updatedAtMs:Date.now()}]);
  const live={lastSyncAt:Date.now(),distanceMeters:130000,activeTripId:'fixture-trip',latitude:20,longitude:85};
  h.emit(`gpsProduction/v1/drivers/${d.id}/live`,live);
  return {...h,d,live,event:{preventDefault(){},target:h.nodes.get('azp-pgm-form')}};
}

test('missing numeric GPS fields remain unknown while a real zero distance is preserved',()=>{
  const h=harness();for(const v of [null,undefined,'',' '])assert.equal(h.api.parseNumber(v,0,1000),null);
  for(const v of [0,'0'])assert.equal(h.api.parseNumber(v,0,1000),0);
});

test('retry cannot inflate the displayed fuel balance or save/reset a false zero baseline',async()=>{
  const h=fuelFixture();assert.equal(h.api.fuelSnapshot(h.d).remaining,10);assert.match(h.api.fuelCard(h.d),/10\.00 L/);
  h.api.retry();assert.equal(h.api.fuelSnapshot(h.d).gpsReady,false);assert.equal(h.api.fuelSnapshot(h.d).x.distance,null);assert.match(h.api.fuelCard(h.d),/— L/);assert.doesNotMatch(h.api.fuelCard(h.d),/20\.00 L/);assert.equal(h.nodes.get('azp-pgm-save').disabled,true);
  await h.api.saveFuel(h.event);await h.api.zeroFuel(h.d.id,h.nodes.get('azp-pgm-save'));assert.equal(h.calls.writes,0);assert.match(h.nodes.get('azp-pgm-msg').textContent,/GPS distance verify/);
  h.allReady();h.emit(`gpsProduction/v1/drivers/${h.d.id}/live`,h.live);assert.equal(h.nodes.get('azp-pgm-save').disabled,false);await h.api.saveFuel(h.event);
  assert.equal(h.calls.writes,1);const record=h.saved[0].value;assert.equal(record.fuel_balance_before_litre,10);assert.equal(record.fuel_balance_after_litre,15);assert.equal(record.gps_distance_km_at_fill,130);assert.equal(record.gps_trip_id,'fixture-trip');assert.equal(h.saved[0].ref.collection,'azpExecutionRecords');
});

test('disconnection, denied live reads and account replacement pause GPS-dependent fuel actions',async()=>{
  for(const transition of [h=>h.emit('.info/connected',false),h=>h.fail(`gpsProduction/v1/drivers/${h.d.id}/live`),h=>h.auth({uid:'other-user',email:'other@example.test'})]){
    const h=fuelFixture();transition(h);assert.equal(h.nodes.get('azp-pgm-save').disabled,true);assert.equal(h.api.fuelSnapshot(h.d).gpsReady,false);await h.api.saveFuel(h.event);await h.api.zeroFuel(h.d.id,h.nodes.get('azp-pgm-save'));assert.equal(h.calls.writes,0);
  }
});

test('ready reads without an actual distance cannot save fuel; explicit zero keeps existing behavior',async()=>{
  const h=fuelFixture(),p=`gpsProduction/v1/drivers/${h.d.id}/live`;
  h.emit(p,{lastSyncAt:Date.now(),activeTripId:'fixture-trip'});assert.equal(h.nodes.get('azp-pgm-save').disabled,true);await h.api.saveFuel(h.event);assert.equal(h.calls.writes,0);
  h.emit(p,{lastSyncAt:Date.now(),activeTripId:'fixture-trip',distanceMeters:0});assert.equal(h.api.fuelSnapshot(h.d).gpsReady,true);assert.equal(h.nodes.get('azp-pgm-save').disabled,false);await h.api.saveFuel(h.event);assert.equal(h.calls.writes,1);assert.equal(h.saved[0].value.gps_distance_km_at_fill,0);
});

test('in-flight fuel save cannot be duplicated or re-enabled by GPS re-render during recovery',async()=>{
  const h=fuelFixture({deferFuelWrite:true});const pending=h.api.saveFuel(h.event);assert.equal(h.calls.writes,1);assert.equal(h.nodes.get('azp-pgm-save').disabled,true);
  h.api.render();assert.equal(h.nodes.get('azp-pgm-save').disabled,true);h.api.retry();await h.api.saveFuel(h.event);assert.equal(h.calls.writes,1);h.finishFuelWrite();await pending;assert.equal(h.nodes.get('azp-pgm-save').disabled,true);
});
