# Real WebKit transport evidence — 16 October 2026

**PASS: connection-only transport test. NOT DEPLOYED. Full staging/Admin/Android acceptance remains outstanding.**

## Exact subject and environment

- Candidate: draft [PR71](https://github.com/atozpackerandmovers/A-to-Z-Packers-Movers/pull/71), commit `c81ccd15c64c6a328f4996999ca62b23585dfee3`.
- Unmodified portable harness: commit `60084e76caa9c9e703e3886e2ab3b590d0867224`, `tools/gps-connection-test/`. Its verifier passed again after the browser run (hashes, pinned transport block, original CSP and connection-only application path).
- Execution: A2ZSERVICES, Windows, installed Playwright 1.62.1 standalone WebKit 26.5, headless, new isolated context. This is the test engine on Windows; its Safari/macOS-shaped user-agent is not evidence of a Mac or iPhone test.
- Test origin: `http://127.0.0.1:18766/`; real Firebase SDK 10.14.1 from gstatic and real RTDB WebSocket endpoint. No mocked responses or fixtures.
- UTC run: 2026-10-16 12:28:20–12:28:24; exact timestamps in `browser-evidence.json`.
- Role/Auth: unauthenticated connection-only probe; no Auth module, credentials or saved user profile. Only `.info/connected` is observed. Business-node permissions were intentionally not exercised.

## Expected and actual

| Check | Expected | Actual |
|---|---|---|
| Initial transport | `.info/connected` becomes true | Passed |
| Disconnect test instance | false event | Passed |
| Reconnect test instance | true event and new WebSocket | Passed |
| Reload | fresh initialization becomes true | Passed |
| Real network transport | WebSocket handshake/frame traffic | 3 sockets; 5 received frames total |
| Long polling | No `/.lp` request | 0 |
| CSP | Production header unchanged; no violations | Exact header matched; 0 violations |
| Errors | No console, page or socket errors | 0 |
| Data mutation | No business reads, GPS commands or database mutation actions | None; only SDK statistics action `s` observed outbound |

`browser-evidence.json` contains sanitized request URLs (queries removed), WebSocket frame counts/action codes without payloads, console entries, document CSP and page connection-state snapshots. `run-webkit-connection.cjs` is the runner used from the enclosing task directory; its installed module path is machine-specific. It closes the context, browser and local server on completion.

## Screenshot instrumentation finding

An initial diagnostic run at 12:25 UTC connected successfully but the default Playwright WebKit screenshot helper injected an inline `body {}` stylesheet for animation synchronization. CSP correctly rejected it. Inspection caught that the initial runner's snapshots preceded the screenshot, so its zero-CSP summary did not include this late instrumentation error. That initial summary is superseded by the measured run here.

The final runner omits screenshots, adds a final observation, and rejects console errors/request failures as well as CSP/page errors. The existing framework was not modified; CSP was not relaxed or bypassed. Initial diagnostic screenshot/log remain local and are not presented as clean acceptance evidence.

## Scope, safeguards and remaining work

The installed engine allowed this test without MXC, downloads, installations, browser-policy changes, certificate changes or user-profile access. Checked local Chrome/Edge policy keys and Firefox policy locations had no private/debug restriction; this limited inspection is not a claim about every possible organization policy. The cloud browser's Incognito restriction was left untouched.

No production data changed. No deployment, merge, Firebase rule/permission/account change, START/STOP GPS, deduction/rollover activation or live-scoring change occurred. Only the test SDK instance was disconnected; the computer's internet remained available.

This establishes the exact PR71 WebSocket block can connect and recover from explicit SDK socket disconnect/reload under the current CSP from this Windows environment. It does not establish authenticated Admin approval paths, business-node authorization, full Admin-page behavior, browser restart persistence, actual network-outage recovery, or affected Android Driver GPS/session acceptance. Existing Driver fixture regression results remain separate evidence.

No environment setup approval is needed for this completed probe. Further authenticated/device testing remains subject to the existing task authorization and availability of the actual session/device. Any later deployment still requires explicit approval and a complete verified backup of the current working production version; earlier public-file snapshots are not that backup.

Rollback: this report and artifact branch do not change a deployed version. Stop the test server/close the isolated context (already done); discard this evidence-only commit if desired. No production rollback is required.
