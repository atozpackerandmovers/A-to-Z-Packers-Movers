# Driver-specific update candidates — no installation or deployment

These Ajay and Somnath sources extend the reviewed Mahesh acknowledgement repair at `9a4089b3a3408fdc187ff62b5004542834bb7c03`. They preserve each driver's own existing source, identity, vehicle, permissions, Room schema and location/recovery logic. The sanitized source baselines are committed at `cffcadc571f2e5e117c795cb4a7cfa146008678d`; text line endings/trailing whitespace were normalized during import. Firebase client configuration, local SDK configuration, signing keys, caches and APKs are excluded from Git.

| Driver | Baseline source / APK version | Candidate | Driver / vehicle |
|---|---|---|---|
| Ajay | 5.0.12-production-ajay-ack-schema-fix, 50012 | 5.0.16-ajay-ack-recovery, 50016 | DRIVER_AJAY_001 / VEHICLE_OD05BD8855 |
| Somnath | 5.0.15-production-somnath, 50015 | 5.0.16-somnath-ack-recovery, 50016 | DRIVER_SOMNATH_001 / VEHICLE_OD05AP9537 |

Both use package `com.atozpackersmovers.drivertracker`, but are driver-specific. Never interchange these APKs across drivers. Somnath's existing post-recovery distance logic and START timestamp taken after first-fix acquisition remain intact. Diagnostics report local command outcome separately from server delivery.

## Original artifact evidence

- Ajay source: `C:/AndroidProjects/FINAL/FINAL1/FINAL2/production-driver-ajay-v5.0.12-ack-fix/production-driver-ajay`; APK under `app/build/outputs/apk/debug/app-debug.apk`, 6,041,781 bytes, SHA-256 `858a2ee11dc7bd41a64f01050122a7cf32ed1934c1c398bad2456dc43385de21`.
- Somnath source: `C:/AndroidProjects/FINAL/FINAL1/FINAL2/SOMNATH/production-driver-somnath-v5.0.15-source/production-driver-somnath-v5.0.15`; APK `C:/AndroidProjects/FINAL/FINAL1/FINAL2/SOMNATH/somnath.apk`, 6,043,929 bytes, SHA-256 `3c08559cf2f00f5b8cbb3a983977f64398961d42877e89d5246ae1143b22287f`.
- Each APK passes all 501 ZIP-entry CRC/size checks and Android SDK signature verification (v2, one signer). Static DEX markers match only its respective driver and vehicle.
- Shared public signing certificate SHA-256: `ce73570e7a15a5916d5b4435e82a297661521067a900d9a99efdcdb1866dc391`. The existing local Android debug signing identity has the same public fingerprint. No signing key was created or exported.
- A second Ajay 50012 APK in the similarly named `ack-fixx` source tree has SHA-256 `fb100847766414362a7b65a07cfcb4134723d02daaf1626214f42fd06b654ca8` and the same verified certificate. It is not substituted for the selected baseline.
- These are local artifact/source observations, not byte-level proof of the currently installed phone versions. All originals remain unchanged.

## Repairs and evidence

The shared repair requires authenticated server-only command reads, retains pending acknowledgements across failures and restarts, and delivers current trip summaries through the existing durable command outbox. STOP with an empty GPS queue is covered. It introduces no Room migration, permission expansion, account or rules change. No GPS command or production data write is performed by this build/test work.

`tests/driver-variant-preservation.cjs` compares the source baseline: 39 Ajay and 41 Somnath protected files are unchanged, as are identities, permissions, schema/entity and trip/live payload implementations. Protocol tests use each compiled variant's identity. Unit tests use fixtures, not production accounts or real phones. See collected test evidence for final counts.

## Delivery and later update gates

The owner authorized building/delivering artifacts using the existing compatible signing workflow. Installation, deployment and GPS commands remain unapproved. Actual authenticated Firebase REST/summary permission checks, real process death, temporary network loss and Android update preservation require later controlled acceptance.

The owner-supplied Mahesh `app-debug(9).apk` is Library ID `libfile_d21268d986388191b12ad4277689612a`, version 0, 6,038,349 bytes. Windows materialization was blocked, so the parent obtained an independent cloud static inspection through Library and supplied its verified findings: SHA-256 `010741dd6de1c0030444d661e62fb0c619f43d9b7fadfee35434ba7807362099`, package `com.atozpackersmovers.drivertracker`, version `5.0.9-production-pilot` / 50009, debuggable true, valid APK v2 RSA PKCS#1 SHA-256 signature and whole-APK content digest. Its public certificate exactly matches the existing signer above. These are attributed cloud findings, not a claim that Windows materialized the upload or inspected the installed phone.

Ajay and Somnath source commit `85dc738a3d843787463790789b9fae57e1288ff8` is published in [draft PR 73](https://github.com/atozpackerandmovers/A-to-Z-Packers-Movers/pull/73), based on [draft PR 72](https://github.com/atozpackerandmovers/A-to-Z-Packers-Movers/pull/72). Both remain on hold. Ajay passes 60 JVM tests and Somnath 67; build and artifact evidence is recorded alongside this file.

Before any later approved in-place update, preserve the actual working installed version and verify the correct driver, package and compatible signer. Perform phone work only when parked. Do not uninstall, clear app data, force a downgrade, change permissions or enable debugging as a shortcut. Same package/schema/signature supports an in-place update; it does not prove retained session/queue data without device acceptance. A rollback requires a separately approved forward-version build with the same signer/schema, after reconciling pending commands.
