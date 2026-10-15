'use strict';const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});try{
 for(const width of [390,1200]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let connected=false,expired=false;
 const app='export const initializeApp=(options,name)=>({options,name});';
 const auth=`window.authCalls=[];window.currentAuth=null;export const getAuth=app=>(window.currentAuth={app,currentUser:null});export const inMemoryPersistence='memory';export const setPersistence=async(a,p)=>authCalls.push(p);export const signInWithEmailAndPassword=async(a,e,p)=>{if(p!=='synthetic')throw Error('bad');a.currentUser={uid:'88IIhxscilQqcT0XsHqRpE0JC0V2',email:'manojgatibbi506@gmail.com',emailVerified:true,isAnonymous:false,providerData:[{providerId:'password'}]};};export const signOut=async a=>{a.currentUser=null;};export const reload=async()=>{};export const getIdToken=async(u,force)=>{if(!force)throw Error('refresh required');return 'synthetic-id-token';};`;
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());let body,status=200,contentType='text/javascript';
  if(url.origin==='https://atozpackersmovers.in'){
   if(url.pathname==='/owner-score-config.js')body='window.AZP_SCORE_CONFIG={apiBase:'+(connected?'"https://faultownergateway-synthetic.a.run.app"':'null')+'};';
   else{assert(['owner-score.html','owner-score.js','owner-score-bootstrap.js'].includes(path.basename(url.pathname)));body=fs.readFileSync(path.join(__dirname,'..',path.basename(url.pathname)),'utf8');if(url.pathname.endsWith('.html'))contentType='text/html';}
  }else if(url.origin==='https://www.gstatic.com')body=url.pathname.endsWith('firebase-app.js')?app:auth;
  else if(url.origin==='https://faultownergateway-synthetic.a.run.app'){
   if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'https://atozpackersmovers.in','access-control-allow-methods':'GET','access-control-allow-headers':'authorization'}});return;}
   assert.equal(req.method(),'GET');assert.equal(req.headers().authorization,'Bearer synthetic-id-token');contentType='application/json';
   const staff=['INDOOR_STAFF_ZD9A1Z','INDOOR_STAFF_10HIAWK','INDOOR_STAFF_1MJSC46','INDOOR_STAFF_9JJREB'];
   if(expired){status=401;body=JSON.stringify({error:'Authentication required'});}
   else if(url.pathname.endsWith('/owner-session'))body=JSON.stringify({ownerVerified:true});
   else if(url.pathname.endsWith('/audit'))body=JSON.stringify({entries:[{staffId:staff[0],action:'pending',reason:'<img src=x onerror=alert(1)> Synthetic evidence',link:'javascript:alert(1)'},{staffId:staff[1],action:'deduct',reason:'Synthetic preview only',link:'https://atozpackersandmovers.slack.com/archives/D0C7SUYTH8X/p1800000000000001'}],hasMore:false});
   else if(url.pathname.endsWith('/readiness')){status=503;body=JSON.stringify({ready:false,checks:{slack:false},writesPerformed:false});}
   else body=JSON.stringify({staff:staff.map(staffId=>({staffId,score:100,maximum:100}))});
  }else throw Error('Unexpected external request');
  await route.fulfill({status,contentType,body,headers:{'access-control-allow-origin':'https://atozpackersmovers.in'}});
 });
 await page.goto('https://atozpackersmovers.in/owner-score.html');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('not been connected'));assert.equal(await page.isDisabled('#sign-in'),true);
 connected=true;await page.reload();await page.waitForFunction(()=>!document.getElementById('sign-in').disabled);assert.deepEqual(await page.evaluate(()=>authCalls),['memory']);assert.equal(await page.evaluate(()=>currentAuth.app.name),'owner-fault-score');
 await page.fill('#password','wrong');await page.click('#sign-in');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Unable'));assert.equal(await page.inputValue('#password'),'');
 await page.fill('#password','synthetic');await page.click('#sign-in');await page.waitForSelector('.card');assert.equal(await page.locator('.card').count(),4);assert.equal(await page.inputValue('#password'),'');assert.equal(await page.locator('#audit img').count(),0);assert.equal(await page.locator('#audit a').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.evaluate(()=>{const tag=document.createElement('p');tag.textContent='SYNTHETIC LOCAL PREVIEW — not live balances';tag.style.color='#854500';document.querySelector('header').append(tag);});
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'owner-readable-preview-'+width+'.png'),fullPage:true});
 await page.click('#check');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('checks need attention'));assert.match(await page.textContent('#readiness'),/Slack connection: needs attention/);
 expired=true;await page.click('#refresh');await page.waitForSelector('#login-section:visible');assert.equal(await page.locator('.card').count(),0);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS owner UI mobile/desktop: memory-only named auth, disconnected guard, password clearing, four cards, text-only evidence rendering, safe Slack links, failed readiness diagnostics, revoked-session signout, no overflow. All network synthetic.');
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
