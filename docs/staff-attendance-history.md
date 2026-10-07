# Staff attendance and punch history

Staff App staff.html now has Attendance & Punch History (हाज़िरी और पंच रिकॉर्ड)
opened by Attendance History next to Scheduled in the task filter row, for every
logged-in staff member. It opens a separate dialog; no history cards occupy the
task dashboard. Close, Escape or clicking the backdrop returns to tasks.
The existing azpExecutionRecords realtime snapshot powers this read-only report.
There is no second attendance database or client-only saved history.

Resolve the logged-in staff against Driver, Worker or Indoor Staff Master, with
exact normalized name/known Sanju and Swagatika aliases, role disambiguation and
mobile matching when supplied. Ambiguous identities show an error. Login/logout
resets report state; a read failure hides potentially stale report results.

Choose month and All/Punched/Absent/Leave/Half Day/Present filter. Eligible days
follow master joining/inactive/reactivation dates and employment periods. Latest
company-effective attendance/approved leave follows shared attendance-rules.js.
Pending/rejected requests are visible separately and do not change day totals.
Existing company default Present is explicitly Auto Present, with no punch proof.

Day details show each saved shift pair, hours, Late/Early Exit minutes, absence
reason, approval, source, record reference and last updated India timestamp. Punch
counts are individual events; a split day contributes 2 In/2 Out and 1 Present.
If Office later creates another effective absence record, retain the last saved
same-day punch evidence with its separate reference. No timestamps are invented.

This report reflects current saved records, including company corrections. It is
not an immutable event audit trail and does not rewrite any attendance/salary data.
It shares existing Staff App authentication and Firestore access permissions.

Validation covers both role types and office aliases, record ownership, duplicate
masters, four punches, absences, approval decisions, leave ranges, employment gaps,
future dates, text escaping, auto-present distinction and separate proof records.
Real Staff App browser checks used mocked Firebase, exercised both office logins,
month/filter UI, live punch refresh and account isolation; no production writes.
