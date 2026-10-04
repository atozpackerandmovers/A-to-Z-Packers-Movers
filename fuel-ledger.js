/* Shared fuel settlement rules for Driver and Execution. Amounts are rupees. */
(function (root) {
  'use strict';
  const present = v => v !== null && v !== undefined && String(v).trim() !== '';
  const amount = v => present(v) && Number.isFinite(Number(v)) ? Number(v) : null;
  const round = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const name = v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const vehicle = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const driver = r => String(r.driver || r.driver_name || r.employee_name || '').trim();
  const unique = rows => [...new Map(rows.map((r,i) => [r.id || r.request_id || 'row-'+i, r])).values()];
  function entry(r) {
    const expense = amount(present(r.fuel_cost) ? r.fuel_cost : r.consumption);
    const paid = amount(r.boss_amount);
    const returned = amount(r.company_returned) ?? 0;
    // Old purchase records have no verified company-payment amount. Never infer zero.
    const known = !!driver(r) && expense !== null && paid !== null && expense >= 0 && paid >= 0 && returned >= 0;
    return {expense, paid, returned, known, delta:known ? round(expense-paid+returned) : null};
  }
  function summary(rows) {
    let expense=0, paid=0, returned=0, unknown=0, count=0;
    for (const r of unique(rows)) {
      const e=entry(r); if(!e.known){unknown++;continue;}
      expense+=e.expense;paid+=e.paid;returned+=e.returned;count++;
    }
    const balance=round(expense-paid+returned);
    return {expense:round(expense),paid:round(paid),returned:round(returned),balance,driverDue:Math.max(0,balance),companyDue:Math.max(0,-balance),unknown,count};
  }
  function groups(rows) {
    const map=new Map();
    for(const r of unique(rows)){const d=driver(r)||'Unassigned';const key=name(d);if(!map.has(key))map.set(key,{driver:d,rows:[]});map.get(key).rows.push(r);}
    return [...map.values()].map(g=>({...g,...summary(g.rows)})).sort((a,b)=>a.driver.localeCompare(b.driver));
  }
  const money=v=>'₹'+Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const signed=v=>(v>0?'+':v<0?'−':'')+money(Math.abs(v));
  const label=v=>v>0?'Driver को देना है / Pay driver':v<0?'Company को वापस मिलना है / Return to company':'Settled / बराबर';
  function calculate(v) {
    const start=amount(v.start),end=amount(v.end),mileage=amount(v.mileage),ppl=amount(v.ppl),paid=amount(v.boss_amount);
    if(start===null||start<0||end===null||end<=start)throw Error('Ending meter must be greater than starting meter.');
    if(mileage===null||mileage<=0||ppl===null||ppl<=0)throw Error('Enter a valid mileage and price per litre.');
    if(paid===null||paid<0)throw Error('Enter company money received for this entry (0 if none).');
    const distance=round(end-start),consumption=round(distance/mileage*ppl);
    if(!Number.isFinite(consumption)||consumption>10000000)throw Error('Please check the meter readings and fuel amount.');
    return {start,end,mileage,ppl,distance,consumption,boss_amount:round(paid),difference_amount:round(consumption-paid)};
  }
  function latestMeter(rows,v){return rows.filter(r=>vehicle(r.vehicle_number||r.vehicle)===vehicle(v)&&amount(r.meter_end??r.end??r.meter_reading)!==null).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(Number(b.updatedAtMs||b.createdAtMs||0)-Number(a.updatedAtMs||a.createdAtMs||0))||(amount(b.meter_end??b.end??b.meter_reading)-amount(a.meter_end??a.end??a.meter_reading)))[0]||null;}
  const api={present,amount,round,name,vehicle,driver,unique,entry,summary,groups,money,signed,label,calculate,latestMeter};
  root.AZPFuelLedger=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
