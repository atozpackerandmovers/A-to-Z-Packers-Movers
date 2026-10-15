(function(root){
 'use strict';
 const KEY='azp-owner-score-signout-v1';
 const eligible=u=>!!u&&u.uid==='88IIhxscilQqcT0XsHqRpE0JC0V2'&&u.email?.toLowerCase()==='manojgatibbi506@gmail.com'&&u.isAnonymous===false&&u.providerData?.some(p=>p.providerId==='password');
 async function createSession({auth,defaultAuth,setPersistence,persistence,onAuthStateChanged,updateCurrentUser,reload,signOut,storage,watchStorage}){
  // SDK-managed persistence only. Our one storage value is a sign-out preference,
  // never an identity, credential, token, password or cached balance.
  let blocked=storage.getItem(KEY)==='signed-out',disposed=false,adopting=null,attempted=false;
  const listeners=new Set(),emit=()=>{if(!disposed)for(const fn of listeners)fn();};
  await auth.authStateReady();await setPersistence(auth,persistence);
  const view={app:auth.app,get currentUser(){return blocked||storage.getItem(KEY)==='signed-out'?null:auth.currentUser;}};
  function adopt(){
   if(adopting)return adopting;
   if(disposed||blocked||storage.getItem(KEY)==='signed-out'||attempted||auth.currentUser||!eligible(defaultAuth?.currentUser))return;
   attempted=true;const user=defaultAuth.currentUser;
   adopting=(async()=>{try{await reload(user);if(disposed||blocked||storage.getItem(KEY)==='signed-out'||user!==defaultAuth.currentUser||!eligible(user)||user.emailVerified!==true||auth.currentUser)return;
    // Firebase copies the already-authenticated same-project user; no password or
    // raw token is read, extracted or manually transferred by this code.
    await updateCurrentUser(auth,user);if(blocked||storage.getItem(KEY)==='signed-out')await signOut(auth);
   }catch{emit();}finally{adopting=null;emit();}})();return adopting;
  }
  const stops=[onAuthStateChanged(auth,()=>{emit();adopt();})];
  if(defaultAuth){await defaultAuth.authStateReady();stops.push(onAuthStateChanged(defaultAuth,()=>{emit();adopt();}));}
  const stopStorage=watchStorage(key=>{if(key===KEY||key===null){blocked=storage.getItem(KEY)==='signed-out';emit();}});
  await adopt();
  return {auth,view,subscribe(fn){listeners.add(fn);fn();return()=>listeners.delete(fn);},
   signedIn(){storage.removeItem(KEY);blocked=false;emit();},
   async logout(){storage.setItem(KEY,'signed-out');blocked=true;emit();await signOut(auth);},
   dispose(){disposed=true;stops.forEach(fn=>fn());stopStorage();listeners.clear();}
  };
 }
 const api={createSession,KEY};if(typeof module==='object'&&module.exports)module.exports=api;else root.AZPOwnerScoreSession=api;
})(typeof globalThis==='object'?globalThis:this);
