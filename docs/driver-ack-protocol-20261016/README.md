# Driver acknowledgement protocol candidate — NOT INSTALLED / NOT DEPLOYED

This candidate repairs the Mahesh Android 5.0.9 acknowledgement protocol. It does not import the unrelated 5.0.13 power-off recovery changes. No production data, rules, accounts, permissions, GPS commands, Hosting release, or phone installation was changed while preparing it.

## Candidate and provenance

- Branch: `staging/driver-ack-protocol-20261016`.
- App source: `integrations/driver-android-ack`.
- Candidate version: `5.0.14-staging-ack-protocol`, code `50014` (source candidate; no signed APK).
- Package: `com.atozpackersmovers.drivertracker`.
- Original source: local `C:/AndroidProjects/production-driver-source/production-driver-android`, reporting `5.0.9-production-pilot`, code `50009`.
- Unmodified, sanitized source import: `d2387601ae9d1bcc1050d0094706590c9fbe710c` on repository base `c5d3cb509bd376eea4f0469b4944d519d8438742`.
- Google configuration, local SDK configuration, signing keys, credentials, APKs and caches were excluded. The source/build configuration is evidence of this local candidate, not proof of the installed phone's APK identity.

## Defect and correction

5.0.9 sends legacy `trip_command_*` fields after executing locally. Saved production rules require an atomic RECEIVED acknowledgement plus command status, followed by EXECUTED or FAILED. They reject the legacy keys and terminal-without-RECEIVED writes. A failed acknowledgement could therefore leave Admin unaware that local execution happened.

The candidate introduces a narrow acknowledgement transport and a durable command processor:

1. Authentication, driver/vehicle identity and unsupported-command gates remain before production protocol writes. Unknown expired/future-dated historical commands are not backfilled when the listener replays history.
2. Existing local command results are checked before freshness checks, so an old pending final result can still be delivered without execution. Existing legacy completed records are returned without rewriting them.
3. A new command is reserved in the existing Room `command_records` table. RECEIVED and `/commands/<id>/status` are written atomically before local validation/rejection handling, GPS acquisition, START or STOP. Authentication/freshness are rechecked after this network phase.
4. Active-trip and other admitted-command rejections now follow RECEIVED -> FAILED. A failed RECEIVED write prevents local execution; its failure result remains durable for delivery.
5. Local terminal results are stored in the existing acknowledgement JSON column with `ACK_PENDING_*` status before delivery or trip-summary network work. No table/column migration is introduced.
6. Final acknowledgement and command status are updated atomically. Retries read only the driver's own command path using authenticated HTTPS REST, with caching and redirects disabled. Firebase SDK `get()` is not used: its offline cache can contain an optimistic terminal write that never reached the server. The existing user's Firebase ID token stays transient; URLs and transport exception details are excluded from errors. No new credential or permission is introduced. See [Firebase REST authentication](https://firebase.google.com/docs/database/rest/auth).
7. Only an authenticated server response containing the expected terminal command status can reconcile a lost final response. Offline reads leave the outbox pending even if the SDK's local cache says EXECUTED. A conflicting server terminal status is retained locally as `ACK_BLOCKED_*` for reconciliation.
8. Pending results are retried every 15 seconds while the authenticated command source is running, and again when it starts after a process restart. Logout cancels the retry job; every actual transport call rechecks the authenticated pilot identity. A stopped/killed app cannot guarantee background delivery until its authorized source runs again.
9. A previously reserved command with no durable result is marked `EXECUTION_OUTCOME_UNKNOWN` on replay; local execution is never repeated. This conservative path requires inspection of the local trip before another command. It does not claim to determine whether a service started immediately before a process crash.
10. The command outbox also delivers the current local trip summary before its terminal acknowledgement. A failed/timed-out summary leaves the same durable result pending, including STOP with an empty GPS queue. Restart retries without repeating START/STOP. If STOP committed before the result was saved, the existing trip's matching lastAppliedCommandId recovers its COMPLETED summary before reporting the uncertain command outcome. Missing or mismatched applied trips stay pending. Only an additional DAO query is needed; the Room schema and historical records remain unchanged.

This provides local idempotence and durable final-result retry. **It is not a cross-device execution lock.** The existing rules/protocol have no exclusive receiver registration. Manoj's app being simultaneously signed into Mahesh's assignment remains unresolved and must be resolved before the controlled single-phone pilot.

## Verification and limits

- Actual Kotlin production protocol/processor classes are exercised by JUnit with in-memory command records and a fake atomic wire. Tests recreate the processor/store from persisted record contents; this is not a real Android process-kill or Room-on-device test.
- Cases include START, STOP, active-trip rejection, failed RECEIVED, offline final delivery, restored pending results, lost commit responses, concurrent duplicate calls, interrupted execution, remote-terminal conflicts, wrong identity, assignment-scoped retry, cancellation, legacy records and timeouts.
- The Kotlin tests emit their actual update maps. `tests/driver-ack-saved-rules.cjs` evaluates these against the saved rules: 8 accepted transitions and 20 negative assertions (wrong identity, unexpected keys and blind terminal replay). This is an explicit offline expression harness, **not the Firebase emulator** or live security-rule acceptance.
- `tests/driver-ack-preservation.cjs` verifies 14 protected files, the unchanged Room command entity, identity/build permission configuration, and the exact trip/live upload code. Generated Room schema version 2 is unchanged.
- Build uses existing Android Studio JBR 21, Gradle 8.9, AGP 8.7.3, Kotlin 2.0.21 and SDK 35. Existing pinned dependencies missing from the offline cache were resolved through the configured repositories. No dependency versions were upgraded. Java's source/target 8 deprecation warning is non-fatal.
- Initial build failures were tooling setup issues: sandbox Gradle cache locking; skipping the Google Services task without disabling its resource provider; an overly broad test-only packaging guard; missing cached Room compiler dependencies. These were resolved for local compile/JVM testing. No security setting was changed.
- Firebase RTDB emulator, authenticated device permission checks, installed APK signature matching, real GPS, actual Android restart/network-loss acceptance and an in-place phone update remain unverified.

The review repairs pass 60 JVM tests (22 protocol/outbox, 5 HTTP transport, 29 core, 4 status formatting), including optimistic cached EXECUTED without server commit, process death, STOP with zero GPS queue entries, interrupted STOP completion, summary timeout, missing/foreign local trip, HTTP permission errors and sanitized exceptions. The first repair run found one overly strict test assertion about coroutine exception wrapping; checking the full exception chain for token leakage passes.

Final counts and timestamps are recorded in `unit-test-summary.json`, `saved-rule-results.json`, `preservation-results.json` and `repair-build.log`. HTTP tests use fake connections, not a live Firebase session. Live authenticated REST/summary permissions and real Android acceptance remain unverified.

Reproduce from `integrations/driver-android-ack`, with the existing JDK and Android SDK configured:

```powershell
.\gradlew.bat --offline --no-daemon :app:testDebugUnitTest -PisolatedProtocolTest=true -Pkotlin.compiler.execution.strategy=in-process
```

The test-only property omits Google Services configuration and rejects APK/AAB packaging, signing validation and installation tasks. It is not an installation build. From the repository root:

```powershell
node tests/driver-ack-saved-rules.cjs
node tests/driver-ack-preservation.cjs
```

## Update and signing verification plan — approval required before execution

1. Preserve the exact current working signed APK/version and its SHA-256 and signing certificate before any approved installation. No phone APK backup was taken in this task. Android `allowBackup=false` is unchanged; do not assume an APK backup includes private Room/session data or promise a generic data backup.
2. Establish the installed package/version and certificate using an already-authorized device inspection channel or a verified installed APK artifact. Do not enable USB debugging, create credentials, alter security settings, uninstall, clear app storage or infer installed signing identity from the source tree or a random local APK.
3. Build the reviewed candidate only with the existing approved Firebase configuration and signing workflow. Do not create a new signing key or use a newly generated debug key. Compare the original and candidate certificates using the existing SDK `apksigner verify --print-certs <apk>` (certificate fingerprints only, no private key access), plus package/version metadata. Verify certificate/lineage compatibility with the actually installed build.
4. Source comparisons support data preservation: same package, SDK target, permission manifest, Room database name/schema, entities, identity storage and codec. A compatible in-place signed update is required; actual retained grants/session/queue/trip data must be checked on the affected phone. Source comparison alone is not device acceptance.
5. Resolve the sole active Mahesh receiver first. After installation approval and an in-place update, perform the separately approved single START only through the designated browser worker. No pre-START idle heartbeat is required. Observe the exact command acknowledgement, new local trip and fresh matching cloud live record. Do not resend merely because an acknowledgement is missing.
6. New trips use separate IDs. Existing historical trip records are not closed, reset or deleted by this patch. The original `/live` replacement behavior remains unchanged when a new point uploads. The August trip will retain its stored RUNNING status unless separately reconciled under new authorization.

## Rollback / hold procedure

- Before installation: hold this branch; nothing on any phone or server needs rollback.
- Keep the baseline commit and original signed APK for forensic comparison. Do not uninstall or force a version downgrade to roll back: that may lose app data or fail version/signature checks.
- If an approved installed candidate later needs rollback, stop further command issuance and reconcile the exact outstanding command/local trip first. Prepare a separately approved forward-version rollback with the same signing identity and unchanged schema, preserving the database/outbox. Reverting to 5.0.9 code restores its acknowledgement defect, so it is not permission to resume GPS commands.
- No deletion/reset, rules widening, deployment, installation or rollback action is authorized by this document.
