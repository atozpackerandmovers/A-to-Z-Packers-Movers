# Driver / Execution attendance consistency

Reported issue: Driver Dashboard showed Present 1 while Office Attendance showed 0 for Ajay. The supplied screenshot highlights Vehicle GPS and does not establish the exact attendance date or record.

Verified code mismatch: Driver excluded pending staff absence/leave requests, but Office counted them. Office also read leaveApproval while Driver omitted those records; legacy attendance_date and timestamp fallbacks differed.

Both pages now load attendance-rules.js for approval effectiveness, date aliases, status and ordering. Approved leaveApproval entries feed Driver totals. Rejected and pending staff requests are excluded consistently. Driver Home labels its Present count with the current India-calendar month; Office retains its selected month. Existing employment eligibility and Fresh Start rules are preserved.

Tests exercise both page functions with Ajay fixtures: auto-present, pending absence, approval, rejection, restore, approved leave range and legacy date. No real attendance records were modified. Confirm the same month and joining/employment dates when comparing actual records.
