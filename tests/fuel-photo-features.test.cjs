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
