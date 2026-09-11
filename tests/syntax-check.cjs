const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
let failures=0;
for(const file of ['quotation-test-4.html','task.html','executions.html','driver.html']){
 const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');let count=0;
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(/\bsrc\s*=/.test(match[1])||/application\/ld\+json/.test(match[1]))continue;
  count++;
  try {if(/type\s*=\s*["']module["']/.test(match[1]))new vm.SourceTextModule(match[2],{identifier:file+':'+count});else new vm.Script(match[2],{filename:file+':'+count});}
  catch(error){failures++;console.error(file+' script '+count+': '+error.message);}
 }
 console.log(file+': parsed '+count+' inline scripts');
}
process.exitCode=failures?1:0;
