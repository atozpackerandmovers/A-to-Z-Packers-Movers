# GPS Admin source candidate — NOT DEPLOYED

This package was copied from the existing A2ZSERVICES release folder:

`C:\AndroidProjects\FINAL\FINAL1\FINAL2\production-admin-mahesh-ajay-v9-browser-stable-staging\admin-v9-staging`

On 2026-10-16 its index, versioned JavaScript, versioned CSS and unversioned compatibility assets matched the public `https://az-packers-quotation.web.app/` responses byte for byte. See `../../docs/gps-session-interactions-20261016/README.md` for provenance and acceptance limits.

The original `.firebaserc` default project is `az-packers-quotation`. `firebase.json` serves `.`; it has no `target` or `site`, and `.firebaserc` has no named target mapping. The existing release folder documents Firebase Hosting preview channel `gps-admin-v9-stable` with a seven-day expiry. That workflow was inspected, never run. A preview channel still points to production Auth/RTDB through this app configuration. It is not a separate test database.

This candidate forces WebSockets before the first RTDB listener, fails closed when unsupported, keeps the existing CSP, adds Admin Logout/STOP confirmation, and changes the immutable JavaScript URL to `app.v9.0.1-staging.js`. `app.js` remains the legacy reload bootstrap; CSS is unchanged. Driver mappings, approval gates, SESSION Auth persistence, RESET prohibition and command payloads remain inherited from v9.

Do not run any deployment without Manoj's approval. Before a later approved deployment, back up the complete current production release/version ID, source and artifacts/configuration with hashes and a verified restore procedure. Public GET snapshots alone are not that backup. Authenticated testing needs an approved isolated project/emulator and test identities; no such project or credentials were created here.
