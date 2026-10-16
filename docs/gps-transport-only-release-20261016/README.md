# Approved GPS Admin transport-only release

Target: project/site `az-packers-quotation`, channel `live`, https://az-packers-quotation.web.app/#dashboard. No staging deployment is included. This isolated branch starts at current main `26c17df424c50619810994fdc411b2f74b04fa53`; no PR70/71 merge or Driver changes are included.

## Exact delta

The complete currently served v9 Admin source was recovered and verified against Hosting file hashes. `integrations/gps-admin-transport-only/app.v9.0.1-transport.js` is the exact original script with only the previously reviewed PR71 WebSocket transport block and build identifier changed. It calls forceWebSockets before goOnline/listeners and fails closed if unavailable. The index points to this new immutable filename and matching build markers. The old JS, legacy shim and both stylesheets remain byte-identical. The cache header for the new immutable filename is added; CSP, authentication/session persistence, data paths, command behavior and all other Hosting settings remain unchanged. The source fixture proves equality outside transport/build markers.

`firebase.json` preserves the recovered config, adding the verified explicit site ID and the new JS cache rule. `.firebaserc` maps default to the existing project; no named targets or new resources are invented. To preserve even Firebase-managed reserved initialization assets exactly, release preparation uses the documented Hosting REST API with the installed CLI's existing authentication and the complete original hash manifest. Only index.html and the new JS need upload; six original file hashes are retained. No Auth, database, IAM, billing, rules or domain mutation is part of the release. No credentials are exported/read by the task.

## Backup and rollback

- Original live version: `31f2a8d04f60d777`; release `1785444082470000`, 2026-07-30T20:41:22.470Z.
- Complete immutable unpublished backup: `sites/az-packers-quotation/versions/4d17866f1dd7501f`, verified 2026-10-16T12:35:38.637Z.
- All seven file hashes and full Hosting configuration match; original live stayed unchanged during backup. No public backup channel or Auth domain was created. Keep this backup version until owner accepts the release.
- Local backup ZIP: enclosing task `evidence/production-backup-20261016.zip`, SHA-256 `3AF88773E992003475DB65B1C15DED13160595636E5A0030249CD0699153941E`. It contains release/version metadata, complete manifest, five verified public application files, and public observations of the two reserved init URLs. Those reserved URLs are dynamically served and do not reproduce their stored hashes; the verified server-side immutable copy supplies the exact complete seven-file rollback.
- Rollback, only if required: `firebase hosting:clone az-packers-quotation@4d17866f1dd7501f az-packers-quotation:live --project az-packers-quotation --non-interactive`. The installed CLI supports version-ID source. Existing live channel is targeted, so its code path does not create a channel or modify authorized Auth domains. Verify restored version, hashes and index afterward.

## Pre-release checks

- JavaScript syntax passed; five full-module fixture/regression checks passed: transport-before-listeners, unsupported transport fails closed, unrelated identity rejected, permission denial gates commands, reconnect without command writes, and exact source-scope equality.
- Real isolated WebKit full Admin page loads real SDKs, displays login and waits for Auth before RTDB; no page errors or unauthenticated database connection.
- Live baseline and candidate both show the same existing CSP error for Firebase Auth's attempted `https://apis.google.com/js/api.js` load. Both reach `Firebase Auth session persistence ready`. This is a pre-existing issue, not repaired or hidden by this transport release; authenticated sign-in/permissions remain unverified.
- Previous real connection-only WebKit test of this exact transport block passed initial connection, SDK disconnect/reconnect and reload with no long polling or CSP errors. This is separate from authenticated full-app acceptance.
- Existing RTDB rules grant Admin access to approval flags, driver live/profile and acknowledgements. The app's parent-level `/drivers/<id>/trips` listener is not granted by per-trip rules; that pre-existing denial remains. No permission change is included.

Deployment status and post-release evidence are recorded separately after the release operation. No vehicle START/STOP commands will be issued by this task. Actual affected Android acceptance, authenticated full Admin verification and Driver session fixes are separate; do not label the whole GPS issue fixed from source or transport evidence alone.

References: [Firebase Hosting REST deployment](https://firebase.google.com/docs/hosting/api-deploy), [Hosting release/version management](https://firebase.google.com/docs/hosting/manage-hosting-resources). Existing Hosting storage/transfer usage applies; no plan upgrade, new paid service or billing setting change is made.
