'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const dir=__dirname,headers=JSON.parse(fs.readFileSync(path.join(dir,'production-headers.json'),'utf8'));
const allowed=new Set(['index.html','test.css','test.js','config.js','pr71-transport.js','manifest.json']);
const port=Number(process.env.PORT||8765);
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end()}
 if(!allowed.has(name)){res.writeHead(404,headers);return res.end('Not found')}
 const body=fs.readFileSync(path.join(dir,name));
 res.writeHead(200,{...headers,'Cache-Control':'no-store','Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.json')?'application/json':'text/javascript; charset=utf-8'});
 res.end(req.method==='HEAD'?undefined:body);
});
server.listen(port,'127.0.0.1',()=>console.log('Read-only test server: http://127.0.0.1:'+port));
