# GPS Admin and Driver interaction evidence — 16 October 2026

Status: code candidate and local tests complete. **NOT DEPLOYED. NOT STAGING-TESTED. NOT PRODUCTION-VERIFIED.** No merge performed.

## Source, isolation and concurrency

- Machine: A2ZSERVICES, Windows; Node v24.18.0.
- Existing repository: `C:\Users\manoj\Documents\Codex\2026-10-13\task\integration-repo` (atozpackerandmovers/A-to-Z-Packers-Movers).
- Independent clone: `C:\Users\manoj\Documents\Codex\2026-10-16\task\staging-repo`.
- Local branch: `staging/gps-session-interactions-20261016`.
- Baseline: PR70 `041e3bb65c22b1e3434e9dd84d0f71219f0824ce`, based on main `26c17df424c50619810994fdc411b2f74b04fa53`.
- PR70 was open/draft and unchanged when inspected, and its remote head was rechecked before finalization. This candidate is stacked above PR70; PR70 and all held PRs are left alone.
- Repository README inspected. No tracked AGENTS.md, .agents skills, .codex instructions, or GitHub deployment workflow was found at this revision; the enclosing Codex .agents directory had no files. No secret or credential files were read. Local memory summaries were not needed.

## Root causes and changes

Driver: PR70 retained the saved login when Staff Master was absent, but render classified the absence as suspension. The independent Firebase restore path installed a current user before master gating; current-session revocation left identity in memory/storage. The boot callback also captured an old saved value, allowing later snapshots to resurrect a cleared login.

`driver.html` now uses one gate for startup/render/Firebase restore/tracking. Unknown master data preserves durable identity, clears active UI/action identity, detaches GPS listeners and displays a waiting message. A matching active master resumes the portal. An explicit inactive/revoked/disabled master or existing score suspension clears saved and active portal access. A stable master document ID prevents a similar-name colleague from substituting for a missing linked record. GPS callbacks check subscription generation and access state. Confirmed logout clears active identity before awaiting Firebase sign-out; refresh reads current storage rather than a captured old session. Existing Driver Logout, GPS Disconnect and legacy Stop GPS confirmations from PR70 are exercised end to end. GPS Disconnect retains the separate portal login by design.

Existing attendance/scoring behavior remains active. No salary rules, deduction activation, monthly rollover, database rules, Auth permissions or staff records were changed. `tests/salary-advance.test.cjs` only normalizes CRLF before extracting existing JavaScript, correcting two Windows-only harness syntax failures.

Admin: the live v9 source forces long polling even though CSP `script-src` permits only self and gstatic; the RTDB origin is allowed for frames but not its long-poll scripts. `connect-src` already allows Firebase WebSockets. The recovered release package is now copied into `integrations/gps-admin`, with its actual Firebase configuration. This is based on an existing matching release, not a reconstructed Hosting source.

The transport candidate calls `db.INTERNAL.forceWebSockets()` before goOnline/first ref and fails closed if unavailable. CSP is unchanged. The immutable JavaScript URL and build markers are bumped to v9.0.1 staging. The unversioned app.js remains a legacy refresh shim; unchanged CSS stays at its original URL. Admin Logout and STOP now require confirmation. Existing START behavior, seven approval gates, driver mappings and disabled RESET are preserved.

## Authoritative local release mapping

Source folder: `C:\AndroidProjects\FINAL\FINAL1\FINAL2\production-admin-mahesh-ajay-v9-browser-stable-staging\admin-v9-staging`.

`.firebaserc`: default project `az-packers-quotation`; no aliases beyond default, no named Hosting target map. `firebase.json`: hosting public directory `.`, no target/site selector; rewrite `**` to `/index.html`. Existing documentation and batch file describe Hosting preview channel `gps-admin-v9-stable`, seven-day expiry. No command from those files was executed. The deployed hostname and exact asset matches tie this package to the default project site; authenticated Hosting release/version metadata has not been inspected.

Public unauthenticated GET comparison, 2026-10-16 approximately 06:20–06:32 UTC:

| Asset | SHA-256 of both local original and served bytes |
|---|---|
| index.html | 2F9C738885F9C7EA5A4EC0D34A266B23442AC8C77A76C1FDBE3348D02D9D165A |
| app.v9.0.0.js | EDB7268EB9E000636BC64EEE76D05E3BF5FBC777F67C33B09CB59DA595E3DA17 |
| styles.v9.0.0.css | D3714B98A91ADA88C2FC76B6B473C01C9C613864064AC29FF21CDD049BFF2374 |
| styles.css | D3714B98A91ADA88C2FC76B6B473C01C9C613864064AC29FF21CDD049BFF2374 |
| app.js (legacy refresh shim) | 0DF81D64ECBFBBC58AAE80577C2CC1BFB6CF114A5EDBA04A40B4C628DBD2E552 |

Public snapshots are retained in the task's sibling `evidence` directory. They are partial public asset evidence, **not a complete current production backup**.

## Expected / actual local evidence

Tests execute the complete Driver main module and complete Admin script, with synthetic DOM/Firebase boundaries. Driver render, sync, restore, snapshot and subscription logic are not replaced with stubs. There is no real Firebase SDK connection or staff write. A confirmed legacy Stop or Admin STOP writes only to an in-memory fixture.

| Scenario | Expected | Actual |
|---|---|---|
| Empty/partial master + Auth callback | Keep saved login, wait, no GPS listener | Passed |
| Active master arrives, disappears, returns | Resume/wait/resume automatically | Passed |
| New runtime sharing saved storage | Retain identity across simulated reload/restart | Passed; real browser storage not tested |
| Temporary snapshot network error | Keep login; recover on next data | Passed |
| Explicit inactive/revoked/disabled/enabled=false | Clear saved/current access and stop GPS | Passed |
| Existing score suspension | Continue denying access | Passed |
| Similar-name record replaces linked master | Do not switch identities | Passed |
| Confirmed logout + late data/Auth callback | No resurrection | Passed |
| Driver Logout/Disconnect/Stop cancel/confirm | No side effects on cancel; intended fixture effects on confirm | Passed |
| Admin transport ordering | WebSocket setup before network listeners | Passed with SDK fixture |
| Unsupported transport / unauthorized identity | Fail closed | Passed with SDK fixture |
| Admin permission-denied read | Commands blocked, RESET disabled | Passed with injected error; real rules untested |
| Admin Logout/STOP cancel/confirm | No action on cancel; synthetic action on confirm | Passed |

Before (PR70 Driver): 3/13 pass, 10/13 fail under the same interaction harness; see `driver-before.txt`. After: 13/13 Driver and 5/5 Admin focused tests pass; see `focused-after.txt`. Full suite: **115/115 pass**, `node --experimental-vm-modules --test tests/*.test.cjs`; see `suite-after.txt`. Initial full run (before adding the explicit attendance-policy guard) was 112/114 because the pre-existing salary test extracted code using LF-only delimiters against CRLF checkout files; the test-only normalization fixes that portability issue. Both Admin JS files parse with `node --check`; `git diff --check` passes. The additional guard verifies login-only revocation does not change the shared attendance-status helper's pre-existing behavior.

## Browser, identity and permissions limits

- Supported browser tool was checked once and failed at initialization: `MXC launcher: cannot locate required Windows platform directory: HRESULT 0x80070003`. No reinstall or security setting changes attempted.
- Device/browser/role actually tested: Windows Node VM; synthetic Driver and synthetic Admin identities. No authenticated human account was used. No real Auth UID/email session was verified; only public source configuration and fixture identity gates were inspected.
- Console/Network: no new browser HAR, console capture, screenshots or device recordings are available. The public CSP is retained in `live-csp.txt`. Fixture tests observe method calls, not browser network traffic. Absence of blocked `/.lp`, CSP errors or permission errors in an actual browser remains **UNVERIFIED**.
- Prior isolated Chromium success reported by PR56 is historical evidence, not a new result from this machine.
- Actual affected Android device acceptance remains required for reload, browser restart, sleep/resume, temporary device network loss and recovery. Desktop/VM simulation does not satisfy it.
- RTDB/Firestore permissions and authenticated Admin recovery are pending. The original preview workflow shares production Firebase; no isolated staging Firebase project/test accounts were identified or created.

## Boundaries, blockers and rollback

Staging URL/timestamp: **NOT DEPLOYED**. Deployment is pending explicit approval, not attempted. Browser execution is blocked by unavailable runtime; authenticated staging acceptance is pending approved isolated test environment/access; Android acceptance is pending the affected device. Draft publication status/full commit are supplied in the final handoff.

No production data changed. No live business writes, GPS commands, account changes, permissions, merges or deployments occurred. Existing live scoring remains enabled. PR1/4/5/32/55/56/66/68 remain held; PR70 remains draft and unchanged.

Current production needs no rollback. Discard this isolated candidate or revert its commit if rejecting it. Before any later approved deployment, first back up the complete currently working production Hosting release/version ID, all artifacts and source/configuration with hashes, the current Driver artifact and a verified restore path. After an approved frontend deployment, restore that exact previous Hosting release/artifact through its verified workflow; no database rollback should be necessary. Do not use these public snapshots as a substitute for the required complete backup.
