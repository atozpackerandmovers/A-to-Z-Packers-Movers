# GPS display and read-error staging candidate

**NOT DEPLOYED.** Separate branch `staging/gps-status-read-errors-20261016`, based on release evidence commit `8ced8dc427045d2af3ae33bcfe1852a3c71779cb`. The deployed transport-only source remains `243b2a9753eca7a31db038e109fe6e5a834034d1`, Hosting version `e1df0c4ec8c352b6`; this task made no further cloud/backend changes.

## Change and evidence

New immutable asset `integrations/gps-admin-transport-only/app.v9.0.2-status-staging.js` derives from retained v9.0.1. Index/build markers point to the staging asset, and firebase.json adds its immutable cache header. Existing JS/CSS and security headers remain unchanged. `runtime.diff` shows the focused old-to-new JavaScript difference.

- Fleet and selected-driver overview show `STALE — last reported RUNNING` instead of presenting old stored RUNNING as current activity. Snapshot age is displayed. Accuracy, location, distance and trip fields are explicitly historical/last-reported where appropriate.
- Freshness uses the card's sync timestamp first (known aliases), falling back to update timestamp only if sync is absent. The existing 120-second freshness window is reused. Missing, invalid, zero or future timestamps are not called fresh. Old sync cannot be hidden by a newer update field. This is a display heuristic, not proof of Android tracker health or a new command gate.
- A local 15-second timer ages visible snapshots even when no new backend event arrives. It does not poll Firebase, write data or refresh the map iframe.
- Live-data and acknowledgement errors show the exact source path and SDK error in a separate panel; approval errors remain in existing approval diagnostics. They no longer relabel RTDB as disconnected. Actual connection/session error handling is retained.
- A failed live read clears only that driver's displayed snapshot, marks its panel unavailable, and preserves the other driver's display. Session-generation checks reject detached callbacks. Session cleanup clears displayed errors. These are in-memory/UI changes, not record deletions.
- Unsupported parent trip enumeration is removed. Trip and route history state `History unavailable under current permissions; trip-list loading is suspended. No trip records were changed.` The history selector is disabled. No substitute path or broader query is introduced.

All command gates, payloads, click/login/logout handlers, WebSocket transport and command-writing function are byte-identical to deployed v9.0.1 (regression assertion). RESET remains disabled. START/STOP behavior is deliberately unchanged; visible enabled controls are not a declaration that a new command is safe. No Driver code, rules, IAM, Auth domains/accounts, trip/command records, deductions, rollover or live scoring changes.

## Tests

`node --check integrations/gps-admin-transport-only/app.v9.0.2-status-staging.js` passed.

`node --test tests/gps-status-read-errors.test.cjs tests/gps-transport-only.test.cjs`: **13 passed, 0 failed** (8 new full-module fixture tests plus 5 existing transport regressions).

Coverage: stale RUNNING with trip/accuracy retained; 120-second boundary; missing/invalid/future timestamps; conservative old-sync handling; aging without snapshots and fresh-data recovery; live/ack/approval denial separated from connectivity; other-driver isolation; actual disconnect display; no parent trip read including reconnect; history labeling; logout cleanup/detached callbacks; byte-identical commands/transport/Auth handlers and unchanged CSP. No real account, staff/GPS write, live browser-log inspection or backend query was used. Actual Android/rendered browser acceptance remains outstanding.

## Evidence needed before considering the separately approved Mahesh START

Collect passive evidence through the existing authorized device/app UI and already-supported Admin views; do not retry denied browser-log inspection or invent backend queries.

1. Confirm the physical affected Android device, its actual browser/native tracking app and version, Mahesh identity/driver mapping, and vehicle OD-33-AR-8855. Record device/browser/role and observation time; never copy credentials or tokens. Ensure automatic device clock/timezone is correct without changing settings through this task.
2. With Mahesh present, record the tracker's visible service/tracking state, location-permission state, current active-trip identity (or explicitly no active trip), pending queue and any visible command/acknowledgement status. Do not press Start/Stop/Reset, sign out, clear storage, force-stop or reinstall merely to inspect it.
3. Capture two passive observations about 30–60 seconds apart, with advancing last-sync/heartbeat timestamps near the real observation time (within the 120-second display window), current GPS-fix timestamp/accuracy and plausible location. The phone need not move. A new render time, old accuracy of 13.9 m, green RTDB badge, approval flags or a TEST_TRIP prefix is insufficient evidence by itself.
4. Reconcile device state with the Admin's fresh live snapshot. If already tracking an actual trip, do not issue a second START. If stale, conflicting, missing, permission-denied or showing an unresolved pending/unknown command, keep START on hold; do not reset, end, rename or fabricate trips to make the display consistent.
5. Before the cloud worker consumes the existing one-START authorization, establish that the actual receiver is available, stopped/ready, associated with the intended driver/vehicle, and not processing another command. The receiver's duplicate-START/idempotency behavior has not been established here. If existing UI/source cannot establish this, request only the missing device/receiver evidence. This candidate does not resolve that uncertainty.
6. Only the cloud worker owns that separate command authorization. If it eventually sends one START after readiness, record its single command ID and acknowledgement/fresh updates; an unknown submission outcome must be investigated before any retry. This staging task issued none.

## Approval-ready deployment scope (not executed)

Requested future approval would be only: deploy this staging display/read-error candidate to existing Firebase project/site `az-packers-quotation`, live channel, https://az-packers-quotation.web.app/#dashboard. No staging preview or production release has been created for this candidate. A preview would use the same real backend and would require its own deployment approval; it would not supply isolated test data or new permissions.

Before any approved deployment, re-read current release metadata, preserve/verify a complete backup of that then-current release, and compare concurrent changes. Retain all eight files from the transport release, replace index.html, add this new JS (nine total file paths if the live baseline remains unchanged), and add only its cache rule. Preserve CSP, Auth, database paths, security rules, existing commands and all other assets. Do not reuse the older transport release manifest as the new deployment manifest. Exact payload/config must be regenerated from this commit and verified against the then-current release.

No new services, billing plan, credentials or permissions are requested; normal existing Hosting usage would apply. Rollback would restore the exact pre-deployment immutable Hosting version after verifying its full manifest/config. Current retained pre-transport backup `4d17866f1dd7501f` is not the correct default rollback for a future display-only deployment: back up the current WebSocket release first.

Post-deployment acceptance, only if approved: read-only authenticated Admin check of connected transport plus independent panel errors, stale labels/timestamp aging, historical values, explicit unavailable history, and the actual affected Android observations above. No commands or trip changes are part of display acceptance. The exact runtime path that originally caused Access denied remains unverified; the parent trip-list mismatch is established from saved source/rules evidence, not a new runtime log inspection.
