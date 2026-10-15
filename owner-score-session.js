import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import {getAuth,setPersistence,indexedDBLocalPersistence,onAuthStateChanged,updateCurrentUser,reload,signOut} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import './owner-score-session-core.js?v=20261015-persist1';
const cfg={apiKey:'AIzaSyC4I13JSUkhun5DgpgLlnyiimTzdPobT14',authDomain:'az-packers-quotation.firebaseapp.com',projectId:'az-packers-quotation',appId:'1:682004383688:web:b795a19579dba9a612a2fd'};
export async function ownerScoreSession(defaultAuth){
 const app=getApps().find(a=>a.name==='owner-fault-score')||initializeApp(cfg,'owner-fault-score');
 return AZPOwnerScoreSession.createSession({auth:getAuth(app),defaultAuth,setPersistence,persistence:indexedDBLocalPersistence,onAuthStateChanged,updateCurrentUser,reload,signOut,storage:localStorage,watchStorage:fn=>{const listener=e=>fn(e.key);window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);}});
}
