const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../integrations/gps-admin-transport-only');
const code=fs.readFileSync(path.join(dir,'app.v9.0.1-transport.js'),'utf8');
function harness(websocket=true,allowReads=false){
 const calls=[],nodes=new Map(),listeners=new Map(),events=new Map();let changed;
 const version=code.match(/const BUILD_VERSION = "([^"]+)"/)[1];
 function el(id){if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',disabled:false,value:'',style:{},classList:{add(){},remove(){},toggle(){}},removeAttribute(){},setAttribute(){},addEventListener:(e,fn)=>events.set(id+':'+e,fn)});return nodes.get(id)}
 const auth={currentUser:null,setPersistence:async()=>{},onAuthStateChanged:fn=>{changed=fn},signOut:async()=>{auth.currentUser=null;calls.push('signout')}};
 const db={INTERNAL:websocket?{forceWebSockets:()=>calls.push('websocket')}:{},goOnline:()=>calls.push('online'),goOffline:()=>calls.push('offline'),ref:p=>{calls.push('ref:'+p);return {on:(_e,fn)=>listeners.set(p,fn),off(){},push:()=>({key:'fixture-command',set:async v=>calls.push('write:'+v.type)}),once:async()=>{if(allowReads)return {val:()=>!/fullRolloutApproved|resetEnabled/.test(p)};throw {code:'PERMISSION_DENIED',message:'Fixture denial'}},limitToLast(){return this},orderByKey(){return this}}}};
 const app={name:'[DEFAULT]',auth:()=>auth,database:()=>db};db.app=app;
 const c={console:{info(){},warn(){},error(){}},URL,Date,Set,Map,Promise,location:{href:'https://fixture.invalid/',pathname:'/',search:'',hash:''},history:{replaceState(){}},navigator:{onLine:true},sessionStorage:{setItem(){}},
 document:{getElementById:el,querySelector:()=>({content:version}),querySelectorAll:s=>s==='[data-dashboard-build]'?[{dataset:{dashboardBuild:version}},{dataset:{dashboardBuild:version}}]:[],addEventListener(){},visibilityState:'visible'},
 setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(){},confirm:()=>false,
 firebase:{apps:[],database:{ServerValue:{TIMESTAMP:0}},initializeApp:config=>{app.options=config;return app},auth:{Auth:{Persistence:{SESSION:'session'}}}}};c.window=c;vm.createContext(c);vm.runInContext(code,c);
 const uid=code.match(/adminUid: "([^"]+)"/)[1];
 return {calls,nodes,listeners,events,c,async login(id=uid){await Promise.resolve();auth.currentUser={uid:id,email:'fixture@example.invalid'};await changed(auth.currentUser)}};
}
test('Admin full script: WebSocket configured before goOnline/ref; no long-poll fallback; unrelated account denied',async()=>{
 const h=harness();assert.deepEqual(h.calls,[]);await h.login('fixture-not-admin');assert.deepEqual(h.calls,['signout']);h.calls.length=0;await h.login();
 assert.deepEqual(h.calls.slice(0,3),['websocket','online','ref:.info/connected']);assert.equal(h.calls.filter(x=>x==='websocket').length,1);
 h.listeners.get('.info/connected')({val:()=>false});assert.equal(h.nodes.get('stopCommand').disabled,true);assert.equal(h.nodes.get('resetCommand').disabled,true);
});
test('Admin full script: missing transport support fails closed before any network listener',async()=>{
 const h=harness(false);await h.login();assert.equal(h.calls.some(x=>x==='online'||x.startsWith('ref:')),false);assert.match(h.nodes.get('sdkStatus').textContent,/WebSocket transport is unavailable/);
});
test('Admin full script: fixture permission denial blocks command gates after connection',async()=>{
 const h=harness();await h.login();h.listeners.get('.info/connected')({val:()=>true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.nodes.get('startCommand').disabled,true);assert.equal(h.nodes.get('stopCommand').disabled,true);assert.equal(h.nodes.get('resetCommand').disabled,true);assert.match(h.nodes.get('connectionText').textContent,/PERMISSION_DENIED/);
});
test('Full Admin connected session reads approvals/live data without any command write',async()=>{
 const h=harness(true,true);await h.login();h.listeners.get('.info/connected')({val:()=>true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.calls.some(x=>x.startsWith('write:')),false);
 assert.ok(h.calls.some(x=>x.endsWith('/DRIVER_MAHESH_001/live')));
 assert.ok(h.calls.some(x=>x.endsWith('/DRIVER_AJAY_001/live')));
 assert.equal(h.nodes.get('resetCommand').disabled,true);
 h.listeners.get('.info/connected')({val:()=>false});assert.equal(h.nodes.get('startCommand').disabled,true);assert.equal(h.nodes.get('stopCommand').disabled,true);
 h.listeners.get('.info/connected')({val:()=>true});await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.some(x=>x.startsWith('write:')),false);
});
test('Transport-only release preserves every original app behavior outside transport and build identifier',()=>{
 const original=fs.readFileSync(path.join(dir,'app.v9.0.0.js'),'utf8');
 const normalize=s=>s.replace(/const BUILD_VERSION = "[^"]+";/,'const BUILD_VERSION = "BUILD";').replace(/    if \(!transportConfigured\) \{[\s\S]*?    db.goOnline\(\);/,'TRANSPORT_BLOCK');
 assert.equal(normalize(code),normalize(original));
 const config=JSON.parse(fs.readFileSync(path.join(dir,'firebase.json'))).hosting;
 assert.equal(config.site,'az-packers-quotation');assert.equal(config.public,'.');
 assert.ok(fs.existsSync(path.join(dir,'app.v9.0.1-transport.js')), 'Retain deployed immutable transport asset');
 assert.doesNotMatch(code,/forceLongPolling/);
 assert.match(code,/auth.setPersistence\(firebase.auth.Auth.Persistence.SESSION\)/);
});
