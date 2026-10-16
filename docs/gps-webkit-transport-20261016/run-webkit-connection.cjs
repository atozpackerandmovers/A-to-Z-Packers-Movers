'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {webkit}=require('C:/Users/manoj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const dir=path.resolve('staging-repo/tools/gps-connection-test'),out=path.resolve('evidence/webkit-connection');fs.mkdirSync(out,{recursive:true});
const report={startedAt:new Date().toISOString(),engine:'Installed Playwright WebKit',playwright:'1.62.1',candidate:'c81ccd15c64c6a328f4996999ca62b23585dfee3',packageCommit:'60084e76caa9c9e703e3886e2ab3b590d0867224',auth:'No Auth module / no credentials / clean isolated context',requests:[],console:[],pageErrors:[],websockets:[],phases:[]};
const clean=v=>{try{const u=new URL(v);return u.origin+u.pathname}catch{return String(v)}};
const stamp=()=>new Date().toISOString();let browser,context,server;
async function snapshot(page,label){const e=await page.evaluate(()=>window.gpsConnectionEvidence);report.phases.push({label,at:stamp(),evidence:e});fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(report,null,2));return e}
(async()=>{
 server=spawn(process.execPath,[path.join(dir,'serve.cjs')],{env:{...process.env,PORT:'18766'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Test server exited '+code)))});
 browser=await webkit.launch({headless:true});report.browserVersion=browser.version();
 context=await browser.newContext({viewport:{width:1280,height:1000},bypassCSP:false,ignoreHTTPSErrors:false});
 const page=await context.newPage();
 page.on('request',r=>report.requests.push({at:stamp(),url:clean(r.url()),method:r.method(),resourceType:r.resourceType()}));
 page.on('requestfailed',r=>report.console.push({at:stamp(),type:'requestfailed',url:clean(r.url()),error:r.failure()?.errorText}));
 page.on('console',m=>report.console.push({at:stamp(),type:m.type(),text:m.text().replace(/https?:\/\/[^\s)]+/g,clean)}));
 page.on('pageerror',e=>report.pageErrors.push({at:stamp(),message:e.message}));
 page.on('websocket',ws=>{
  const record={at:stamp(),url:clean(ws.url()),framesSent:0,framesReceived:0,outgoingActions:[],socketErrors:[]};report.websockets.push(record);
  ws.on('framesent',event=>{record.framesSent++;try{const m=JSON.parse(String(event.payload));if(m.d?.a)record.outgoingActions.push(m.d.a)}catch{}});
  ws.on('framereceived',()=>record.framesReceived++);
  ws.on('socketerror',e=>record.socketErrors.push(String(e).replace(/wss?:\/\/[^\s)]+/g,clean)));
  ws.on('close',()=>record.closedAt=stamp());
 });
 const response=await page.goto('http://127.0.0.1:18766/',{waitUntil:'load',timeout:30000});
 report.documentStatus=response.status();report.csp=response.headers()['content-security-policy'];
 assert.equal(report.csp,JSON.parse(fs.readFileSync(path.join(dir,'production-headers.json')))['Content-Security-Policy']);
 await page.waitForFunction(()=>window.gpsConnectionEvidence?.connectionEvents.some(e=>e.connected),null,{timeout:35000});
 await snapshot(page,'initial-connected');
 await page.getByRole('button',{name:'Disconnect test socket',exact:true}).click();
 await page.waitForFunction(()=>window.gpsConnectionEvidence.connectionEvents.at(-1)?.connected===false,null,{timeout:10000});
 await snapshot(page,'test-socket-disconnected');
 await page.getByRole('button',{name:'Reconnect test socket',exact:true}).click();
 await page.waitForFunction(()=>window.gpsConnectionEvidence.connectionEvents.at(-1)?.connected===true,null,{timeout:35000});
 await snapshot(page,'test-socket-reconnected');
 await page.reload({waitUntil:'load'});
 await page.waitForFunction(()=>window.gpsConnectionEvidence?.connectionEvents.some(e=>e.connected),null,{timeout:35000});
 await snapshot(page,'reload-connected');
 // WebKit's Playwright screenshot helper injects a body{} style to sync animations.
 // Keep CSP intact: omit screenshot instrumentation from this measured run.
 await page.waitForTimeout(1000);
 await snapshot(page,'final-observation');
 report.screenshot='Omitted: Playwright WebKit screenshot helper injects an inline style blocked by the unchanged CSP. Earlier diagnostic capture retained separately.';
 report.longPollRequests=report.requests.filter(r=>/\/\.lp(?:$|\/)/.test(new URL(r.url).pathname));
 report.cspViolationCount=report.phases.reduce((n,p)=>n+p.evidence.cspViolations.length,0);
 report.databaseMutationActions=report.websockets.flatMap(w=>w.outgoingActions).filter(a=>['p','m','o','om','oc'].includes(a));
 assert.equal(report.longPollRequests.length,0);assert.equal(report.cspViolationCount,0);assert.equal(report.pageErrors.length,0);assert.equal(report.databaseMutationActions.length,0);
 assert.equal(report.console.filter(e=>e.type==='error'||e.type==='requestfailed').length,0);
 assert.ok(report.websockets.some(w=>w.framesReceived>0));
 report.result='PASS real WebKit RTDB transport initial/reconnect/reload';
})().catch(async e=>{report.result='BLOCKED_OR_FAILED';report.error=e.message;if(context){const page=context.pages()[0];if(page)try{await snapshot(page,'failure');await page.screenshot({path:path.join(out,'failure.png'),fullPage:true})}catch{}}process.exitCode=1}).finally(async()=>{
 try{await context?.close();await browser?.close()}finally{server?.kill();report.finishedAt=stamp();fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,error:report.error,browserVersion:report.browserVersion,phases:report.phases.map(p=>p.label),websockets:report.websockets.length,longPollRequests:report.longPollRequests?.length,cspViolations:report.cspViolationCount,databaseMutationActions:report.databaseMutationActions?.length,evidence:path.join(out,'browser-evidence.json')},null,2))}
});
