# Office Punch In / Punch Out

Available in staff.html for Swagatika (also Sagatika) and Sanju / Sanju Mam.
Each login must match exactly one active Indoor Staff Master with a valid joining
date. If supplied, the login mobile must match the master mobile. Existing Staff
App login and Firebase permissions are retained; this does not introduce a new
identity authentication system.

## Formula and recommended policy

- Punch In: Present, 1 salary day, In Office. Save India date/time.
- Punch Out: Left Office, keep Present and 1 salary day. It is departure, not an
  absence. Working minutes = floor((out timestamp − in timestamp) / 60,000).
- Late: Punch In later than Company Rules → Office Start (default 09:00).
- Early Exit: same-day Punch Out before Office End (default 18:00).
- Fine, paid overtime, Half Day and Absent remain company decisions. No automatic
  salary deduction or overtime payment is introduced. Existing no-record
  auto-present behavior is retained; a missed punch is not automatically absent.
- Overnight Punch Out closes the original shift on its starting date; the next
  day's Punch In then becomes available. One completed shift per India date.

Suggested later policy if the company wants hour-based salary: full day at the
configured standard hours; half day at half that duration; shorter shifts reviewed
by Office. Configure and approve that policy before making automatic deductions.

## Storage and Office review

Records live in azpExecutionRecords, module/collection attendance. Reuse the latest
same-day attendance record or the Office-compatible deterministic ATT_name_date ID.
They contain the master ID, punch_in / punch_out, date fields, elapsed working_minutes,
office_presence, server timestamp audit fields and staffPortalPunch source.

Execution → Attendance → staff name → Daily Attendance displays In Office / Left
Office and both times. Expand that day to review/edit attendance, fines or approved
overtime. Selected Month Attendance counts Punch In/Out days and working hours.
Staff punches do not overwrite company Half Day, Absent or effective Leave records.

Firestore transactions re-read the master and relevant known day records, prevent
repeat punches and preserve unrelated fine/attachment fields. Only committed writes
show Saved; connection failure permits retry. Punch actions require internet and are
not optimistically stored in localStorage. Login switch clears the displayed state.

## Validation

Node tests cover alias matching, ambiguous master/mobile mismatch, India midnight,
8-hour elapsed work, repeat actions, inactive/pre-joining staff, company leave and
overnight shifts. A browser test uses the real Staff App with mocked Firebase for
both logins, save failure/retry, in/out button states and account-switch isolation.
No production attendance records are created by validation.
