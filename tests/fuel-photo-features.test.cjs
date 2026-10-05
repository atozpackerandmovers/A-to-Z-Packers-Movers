const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../driver-fuel-features.js');
test('WhatsApp numbers are validated and only digits enter outbound URL',()=>{
 assert.equal(F.phone('+91 93388 88550'),'919338888550');assert.equal(F.phone('9338888550'),'919338888550');
 assert.throws(()=>F.phone('javascript:alert(1)'));assert.throws(()=>F.phone('123'));
});
test('photo validation rejects unsupported and oversized files before decoding',()=>{
 assert.equal(F.validatePhoto({type:'image/jpeg',size:1000}).size,1000);
 assert.throws(()=>F.validatePhoto({type:'text/html',size:100}));assert.throws(()=>F.validatePhoto({type:'image/png',size:21*1024*1024}));
});
test('monthly session report uses India dates at UTC month boundaries',()=>{
 const stamp=Date.parse('2026-09-30T19:00:00Z');assert.equal(F.indiaDate(stamp),'2026-10-01');
 const rows=[{ts:stamp},{ts:Date.parse('2026-09-30T17:00:00Z')},{date:'2026-10-02',ts:0}];
 assert.equal(F.monthRows(rows,'2026-10').length,2);assert.equal(F.monthRows(rows,'2026-09').length,1);
});
test('photo stamp describes report-generation time and exact fuel values, without inventing GPS coordinates',()=>{
 const rows=F.stampLines({driver:'Somnath',vehicle:'OD 02 BY 8855',start:1000,end:1400,distance:400,mileage:10,ppl:93,consumption:3720,location:'Cuttack'},Date.parse('2026-09-28T00:00:00Z'));
 assert.ok(rows.some(x=>x.includes('INR 3720.00')));assert.ok(rows.some(x=>x.startsWith('Report generated:')));assert.ok(rows.some(x=>x.includes('Cuttack')));assert.ok(!rows.some(x=>/latitude|longitude|captured at/i.test(x)));
});
test('reports use verified company payment and label both settlement directions',()=>{
 const L=require('../fuel-ledger.js');
 const r={driver:'Test',consumption:3720,boss_amount:3000};
 assert.match(F.settlementLines(r,L).join('\n'),/3,000.00/);
 assert.match(F.settlementLines(r,L).join('\n'),/720.00.*Pay driver/);
 assert.match(F.settlementLines({...r,boss_amount:4000},L).join('\n'),/280.00.*Return to company/);
 assert.match(F.settlementLines({...r,boss_amount:0},L).join('\n'),/3,720.00.*Pay driver/);
 assert.match(F.settlementLines({...r,boss_amount:undefined},L).join('\n'),/Not recorded/);
 const stamp=F.stampLines({...r,vehicle:'OD 02 BY 8855',ppl:93},Date.now()).join('\n');
 assert.match(stamp,/Company paid: INR 3000.00/);assert.match(stamp,/Difference.*INR 720.00/);
});
test('photo share hands captured image and text together to mobile share sheet',async()=>{
 const file={name:'camera.jpg',type:'image/jpeg'};let payload;
 assert.equal(await F.sharePhotoReport({canShare:({files})=>files[0]===file,share:async p=>{payload=p;}},file,'Saved fuel report'),'shared');
 assert.equal(payload.files[0],file);assert.equal(payload.text,'Saved fuel report');
 assert.equal(await F.sharePhotoReport({},file,'report'),'unsupported');
 assert.equal(await F.sharePhotoReport({canShare:()=>true,share:async()=>{throw Object.assign(Error(),{name:'AbortError'})}},file,'report'),'cancelled');
 assert.equal(await F.sharePhotoReport({canShare:()=>true,share:async()=>{throw Error('Permission denied')}},file,'report'),'failed');
});
