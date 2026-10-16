# Deployment outcome

**DEPLOYED: transport-only release. Authenticated GPS/Admin functionality is NOT yet production-verified.**

- Production URL: https://az-packers-quotation.web.app/#dashboard
- Project/site: `az-packers-quotation`; channel `live`. No staging preview deployed.
- Exact deployed source commit: `243b2a9753eca7a31db038e109fe6e5a834034d1` on `release/gps-transport-only-20261016`, independently based on main. No PR merged.
- Hosting version: `e1df0c4ec8c352b6`.
- Live release: `1792154625302000`; release timestamp **2026-10-16T12:43:45.302Z**.
- Control-plane confirmation: 12:43:46.531Z. Public asset verification: 12:44:20.445–12:44:24.094Z. Signed-out full-page browser verification: 12:44:18.704–12:44:22.749Z.

The deployed index SHA-256 is `477f90be2fb485aaf5cbf3a15697687e02bf0917fd799fcca89aaf9ed9414436`; new `app.v9.0.1-transport.js` SHA-256 is `4284bb290911c25eec9f6dc2002ca5ef647c126782543290e4522be78c8bb2fd`. Both matched exact committed bytes. The previous JS, legacy shim and both CSS files were also fetched and verified unchanged. Both `az-packers-quotation.web.app` and `az-packers-quotation.firebaseapp.com` return the expected new index. All eight deployed Hosting file hashes were checked against the reviewed manifest before release; the six inherited hashes, including both reserved Firebase init files, are unchanged. All existing headers/CSP remain unchanged; the new immutable JS has its added cache header.

## Validation and remaining acceptance

Five full-module fixture/regression tests and JavaScript syntax check passed before deployment. Real WebKit 26.5 on Windows/A2ZSERVICES loaded the full deployed Admin page with real Firebase SDKs in a fresh signed-out context: HTTP 200, correct build, visible login, hidden app, `Firebase Auth session persistence ready`, no page exception, no unauthenticated RTDB connection. Browser/network evidence is in `production-browser.json` and `production-assets.json`.

The signed-out production page has one **pre-existing** CSP console error: Firebase Auth attempts `https://apis.google.com/js/api.js`, blocked by script-src. The unchanged live baseline, local candidate and deployed candidate reproduce the same message. It was not suppressed, and CSP was not relaxed. This is not a clean authenticated acceptance result. The separate earlier transport-only real-network test of the exact WebSocket block passed connection, SDK disconnect/reconnect and reload with zero long-poll requests/CSP violations. No authenticated production WebSocket claim is made here because no app Admin session was available in the isolated browser.

Pending action: the owner/cloud worker should use the existing Admin sign-in on the production page and perform **read-only** identity, `.info/connected`, approval/live-data and recovery checks. Do not inspect/copy Auth tokens. Record actual role/UID match without secrets and sanitized Console/Network. Existing rules permit Admin approval/live/profile/acknowledgement reads, but inspection predicts denial of the app's parent trip-history listener because the grant is under individual trips. No rules change was made. Affected Android device acceptance is still required; desktop WebKit is not a substitute.

The current Driver-login fixes, Logout/STOP confirmation changes from PR71, monitor-auth candidate, Aman and all held PRs were excluded. No business data, GPS command, Auth account/domain, IAM/rules, deductions/rollover or live scoring was changed by this task. Only the approved Hosting release and its unpublished backup/version records were written. This task did not issue Mahesh START; the cloud worker owns that separate authorization after readiness.

## Backup and rollback

Before live deployment, complete immutable backup `4d17866f1dd7501f` was verified against original live version `31f2a8d04f60d777`: all seven file hashes and the entire configuration matched. It is unpublished and retained in the same Hosting site. Original live release `1785444082470000` was preserved. The local ZIP and its checksum are documented in README.md; it alone is not the exact reserved-init backup, which is supplied by the verified immutable server copy.

Restore only if needed:

```powershell
firebase hosting:clone az-packers-quotation@4d17866f1dd7501f az-packers-quotation:live --project az-packers-quotation --non-interactive
```

Then verify old index hash `2f9c738885f9c7ea5a4ec0d34a266b23442ac8c77a76c1fdbe3348d02d9d165a`, original build marker and full live manifest/config. Rollback has not been run. Keep backup version until owner acceptance. No new paid service, billing-plan change or permission change occurred; normal existing Hosting storage/transfer usage applies.

Preparation encountered a local helper options-reuse error while uploading to an unpublished version. It was corrected; the same version was resumed and fully verified before the single live release. No failed or uncertain live release attempt remains.
