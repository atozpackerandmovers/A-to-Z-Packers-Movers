# Staff scoreboard

Office Attendance in staff.html shows a separate read-only score for each linked
Indoor Staff Master. Initial score is 100, retained across dates and shifts.
Attendance, lateness, early exit, punch actions, salary and task completion have
no effect on the score. The scoreboard has no staff adjustment controls.

Score updates come only from explicit Dots reports supplied to the owner/assistant.
This does not establish an automatic connection to the user's ChatGPT Dots agent.
To apply a report, identify the staff member, reason and a unique report
ID. Each distinct Dots instruction deducts exactly 2 points. Publish the corresponding update
in staff-score-updates.json through the usual reviewed GitHub change. Never infer
a deduction from attendance. Do not apply a report twice.

The file contains an updates array. Each update has module: staffScore,
source_app: agentScoreUpdate, master_id (preferred, the actual Indoor Staff Master
ID), or staff_key (the normalized login alias: sanju or swagatika), reason, report_id and updatedAtMs. Append one row per distinct Dots instruction.
The score is max(0, 100 − 2 × unique report IDs). Repeated report IDs count once.
No absolute score or variable deduction is accepted.
Records for another staff member, another module or another source are ignored.
Reports without valid IDs show unavailable, rather than resetting to 100.

The file is loaded on login and refreshed once per minute with cache disabled.
Failed loads display an unavailable state rather than a misleading initial score.
No personal details or private report content should be placed in this public file;
use a short non-sensitive reason and staff alias/ID only.

The initial empty array is intentional: no deductions have been authorized yet.
