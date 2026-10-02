/* Shared attendance interpretation for Driver and Execution. */
(function(root){
  'use strict';
  const lower=v=>String(v||'').trim().toLowerCase();
  function effective(r){
    const approval=lower(r.company_approval||r.approval_status),source=lower(r.source_app||r.source),module=lower(r.module||r.collection);
    if(approval.includes('reject'))return false;
    if((approval.includes('pending')||approval.includes('discussion'))&&(module==='leaveapproval'||/staff|driver|worker/.test(source)))return false;
    return true;
  }
  const start=r=>r.leave_from||r.leave_from_date||r.leaveFrom||r.date||r.attendance_date;
  const end=r=>r.leave_to||r.leave_to_date||r.leaveTo||r.date||r.attendance_date||start(r);
  function time(r,index=0){const n=Number(r.updatedAtMs||r.createdAtMs||r.updated_at_ms||r.created_at_ms||0);if(n)return n;const stamp=r.updatedAt||r.createdAt;if(stamp?.toMillis)return stamp.toMillis();if(stamp?.seconds)return stamp.seconds*1000+Number(stamp.nanoseconds||0)/1e6;return index;}
  const status=r=>r.attendance_status||r.attendanceStatus||r.status||r.request_type||((r.module||r.collection)==='leaveApproval'?'Leave':'Present');
  const api={effective,start,end,time,status};root.AZPAttendanceRules=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
