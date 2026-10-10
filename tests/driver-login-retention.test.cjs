const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('driver.html','utf8');
const start=source.indexOf('const refresh=()=>{rebuildFirebaseRows();');
const end=source.indexOf('\n      if(executionRows.length',start);
const refreshCode=source.slice(start,end);
function refresh(master){
 const removed=[];const saved={role:'Driver',name:'Example',authOk:true};
 const context={saved,currentUser:null,currentTab:'dashboard',executionRows:[],planningRows:[],
 rebuildFirebaseRows(){},status(){},window:{refreshNames(){}},staffMasterRecord:()=>master,
 staffMasterIsActive:m=>m.status==='Active',localStorage:{setItem(){},removeItem:k=>removed.push(k)},
 document:{getElementById:()=>({classList:{add(){},remove(){}}})},buildNav(){},prodAuth:{currentUser:null},
 syncCurrentUserFromMaster(){},render(){},applyFuelResetCommands(){}};
 vm.createContext(context);vm.runInContext(refreshCode+'refresh();',context);
 return {context,removed};
}
test('partial/cache snapshot preserves saved login until master arrives',()=>{
 const {context,removed}=refresh(null);assert.deepEqual(removed,[]);assert.equal(context.currentUser,null);
});
test('active master restores saved portal login',()=>{
 const {context,removed}=refresh({status:'Active'});assert.equal(context.currentUser.name,'Example');assert.deepEqual(removed,[]);
});
test('explicitly disabled master still clears saved portal login',()=>{
 assert.deepEqual(refresh({status:'Disabled'}).removed,['azp_staff_login']);
});
for(const name of ['logout','azpProdLogout'])test(name+' cancellation retains session',async()=>{
 const begin=source.indexOf('window.'+name+'=async()=>{');
 const finish=source.indexOf(';\n',begin);
 let signedOut=0,removed=0,reloaded=0;
 const context={window:{},confirm:()=>false,localStorage:{removeItem(){removed++;}},
 firebaseSignOut:async()=>{signedOut++;},prodAuth:{},location:{reload(){reloaded++;}},toast(){}};
 vm.createContext(context);vm.runInContext(source.slice(begin,finish+1),context);
 await context.window[name]();assert.equal(signedOut,0);assert.equal(removed,0);assert.equal(reloaded,0);
});
