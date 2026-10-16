# GPS and Driver session candidate — 16 October 2026

Status: CANDIDATE PREPARED. No production verification or approval requested.

## Isolation and scope

Repository: https://github.com/atozpackerandmovers/A-to-Z-Packers-Movers
Branch: staging/gps-session-20261016
Base: 26c17df424c50619810994fdc411b2f74b04fa53
Local working directory: /workspace/atoz-staging
Candidate derived from PR #55 (a614974392d1c1150d3c53a32313028b9e5a0a06) and transport patch in PR #56 (91a4b9f818395c0b19d6b648fb66886ae2a922ca). Neither PR merged.

## A — GPS Admin

Read-only HTTP inspection at approximately 2026-10-16 04:46 UTC confirmed the served index uses app.v9.0.0.js, whose startAuthenticatedSession still calls forceLongPolling. Live CSP script-src allows self and www.gstatic.com only, while connect-src explicitly allows Firebase wss origins. This corroborates the transport/CSP incompatibility reported in PR #56. No new browser reproduction or successful connection is claimed.

The accessible main repositories A-to-Z-Packers-Movers and atoz-car-carriers have no authoritative app.v9.0.0.js, firebase.json or .firebaserc. The first repository's remote branch names and the referenced evidence PR were also inspected; Hosting ownership remains unresolved. GitHub website source is not established as the Firebase Hosting deployment source.

The PR #56 transport patch applies cleanly to the current downloaded JS and node --check passes on the resulting local candidate. Patch retained here for integration into the owning source, not as a deployable Admin artifact. Do not deploy a reconstructed application or broaden CSP based on this report.

Expected: authenticated .info/connected=true, fresh vehicle updates, no blocked /.lp or permission errors, automatic reload/reopen/offline recovery. Actual: NOT TESTED. Authenticated Admin, UID/email session, RTDB/Firestore permissions, Console/Network, live vehicle and recovery acceptance remain pending.

## B — Driver session

Source-level failure path: startup removed azp_staff_login whenever staff master was missing, including partial/cache responses. Candidate preserves that value until a master is available and retains the existing explicit inactive-master clearing behavior at startup. It does not grant portal access solely because a saved value exists in this branch. Existing Firebase browserLocalPersistence is retained.

Changes: driver.html startup guard from PR #55; confirmation before portal logout, GPS login disconnect, and legacy Stop GPS. tests/driver-login-retention.test.cjs includes missing/active/disabled master, cancellation and confirmed signout tests. The transport patch is documentation only.

Before: same eight focused tests against base driver.html: 4 pass, 4 fail. The Stop GPS cancellation case fails because the old unguarded function reaches unavailable side-effect dependencies; this is a synthetic harness failure, not a captured phone incident. After: 8/8 pass. Full suite: 105/105 pass using node --experimental-vm-modules --test tests/*.test.cjs. node --test without that flag initially failed because existing tests require vm.SourceTextModule; rerun with required flag passes. git diff --check passes.

These are extracted-function VM tests with synthetic dependencies on cloud Linux/Node. No actual Driver account or Android browser was tested. They do not prove Firebase persistence, screen focus, browser restart, offline behavior, revocation during an existing session or real permission enforcement. Missing-master startup waits for data; seamless offline portal presentation is not established. Staff name matching and current-session revocation need further review before acceptance.

## Acceptance evidence fields

- Full candidate commit: use the draft PR head SHA; commit supplied in handoff.
- PR link: supplied in handoff after creation.
- Staging URL / deployment timestamp: NONE; no deployment performed. Owner instruction prohibits deployment without approval. No verified isolated Firebase staging project or test account is configured.
- Test device/browser/role: cloud Linux Node VM, synthetic Driver session. No real Android, Admin or Owner session.
- Before/after screenshot or recording: unavailable; no device/browser acceptance run. Text test output attached.
- Console/Network: live HTTP CSP captured; no authenticated browser capture.
- Firebase Auth UID/email status: not authenticated or verified. No passwords/tokens used or recorded.
- RTDB/Firestore permissions: not tested. Syntax and transport policy checks do not prove business permissions.
- Production data: no writes made. Only public HTML/JS/header GETs; no business record queries, commands, Auth mutation, rules changes, merge or deployment.

## Rollback and backup

Current production remains untouched; no operational rollback is needed. Abandon this isolated branch to discard the candidate. If later approved and deployed, revert only the approved candidate commit through the authoritative release process and redeploy the verified previous artifact; no database rollback is expected for these frontend changes.

Before any later deployment, capture the complete current Hosting release/version ID, source commit, configuration, all served assets and verified hashes, plus the Driver hosting artifact, and verify a restoration path. Current downloaded index/JS under /workspace/scratch with hashes here are partial read-only snapshots, NOT a complete production backup. Do not deploy until the complete backup exists.

## Release gates

CODE FIXED: NOT CLAIMED — local Driver candidate prepared; GPS source integration blocked.
STAGING TESTED: NO — local automated checks only.
DEPLOYED: NO.
PRODUCTION VERIFIED: NO.

Next: identify Hosting source and isolated Firebase staging project/test accounts, review remaining session access paths, then obtain approval for a specific staging deployment. Run authenticated Admin connection and recovery tests and affected Android Driver tests; collect screenshots, sanitized Console/Network and permission results. Send staging acceptance evidence before requesting production approval. Priorities C–E and 2–4 remain pending. All user-listed held PRs remain held; no deduction or rollover activation.
