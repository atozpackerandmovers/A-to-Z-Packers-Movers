# PR71 isolated read-only RTDB transport test

Purpose: collect **real browser** evidence for the WebSocket transport correction in PR71 commit `c81ccd15c64c6a328f4996999ca62b23585dfee3`. No deployment is needed. No credentials, Auth module, GPS commands, business-node reads, database writes, Rules, permissions or production-page modifications are involved.

`pr71-transport.js` contains the exact transport block extracted from that pinned commit, wrapped in a callable function; the original full app and Hosting config are in `reference/`. The harness uses the same Firebase compat SDK version (10.14.1), project and database. It intentionally does not run the full Admin app because that app requires an authenticated Admin and reads business data. This is a real network transport probe, **not full Admin acceptance**.

## Run in the working cloud browser environment

1. Extract the ZIP to an isolated folder. Node.js is the only server dependency; no npm install is needed.
2. Run `node serve.cjs` in that folder. Open `http://127.0.0.1:8765/` in a **new isolated browser context**. If using a browser proxy, forward this localhost port using the environment's supported mechanism; keep all response headers intact. Do not expose a public listener or use a file URL.
3. Verify the document response `Content-Security-Policy` exactly equals `production-headers.json`. This is the production CSP copied from the actual Hosting config, including script/frame/connect restrictions. Do not inject/eval scripts into the production page, relax CSP, add credentials, or replace real SDK/network responses with fixtures.
4. Start Console and Network capture **before navigation**. Permit the real pinned gstatic SDK and the project's Firebase WebSocket hosts, including a Firebase-assigned shard host if the SDK redirects. Do not disable Firebase network to make the test pass.
5. Wait up to 30 seconds. Pass for initial connection requires an actual `.info/connected = true` event and a real WebSocket connection/handshake in browser Network. Record the timestamp and browser version. The visible JSON is also available as `window.gpsConnectionEvidence`.
6. Inspect Network for `/.lp` requests and Console for blocked long-poll script/CSP messages. Expected: zero long-poll requests and no CSP violations. Capture requests/WebSockets through the supported browser Network/CDP API if HAR omits WebSocket traffic. The page's own counters are supporting evidence, not a substitute for Network capture.
7. Optional recovery: use **Disconnect test socket**, then **Reconnect test socket**. These invoke SDK goOffline/goOnline on this test instance only, not Driver START/STOP. Expect false then true connection events and a fresh WebSocket. Reload or create a new isolated context to test reinitialization. Do not disconnect the user's whole computer/network.
8. Save sanitized Console, request/WebSocket metadata, document CSP and visible JSON/screenshot. Do not capture passwords/tokens; none should be present in this unauthenticated probe. Close context/server afterward.

## Interpret precisely

- `.info/connected = true` proves a real RTDB transport connection from that tested environment. It does not prove Admin identity, permission to business nodes, Android GPS operation or the owner's network behavior.
- No credentials are requested. Do not attempt sign-in inside this harness.
- Failure must retain exact CSP/network/SDK evidence. Do not substitute mock success. A shard/network block in the cloud environment is an environment result, not automatically a production-code failure.
- Authenticated Admin approval/permission/recovery tests remain separate, as does affected Android device acceptance.
- No browser result is bundled or claimed. The originating Windows browser tool is blocked by MXC HRESULT 0x80070003; this package is for execution by the working cloud browser.

See `manifest.json` for source and package SHA-256 values. `verify.cjs` checks provenance, unchanged CSP, pinned transport snippet and that the test application references only `.info/connected`; it is static packaging verification, not network evidence.
