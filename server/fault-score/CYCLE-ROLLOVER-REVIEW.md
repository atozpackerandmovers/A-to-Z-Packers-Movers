# Individual score-cycle rollover candidate

Review candidate only. No production rollover, migration, scheduler creation, build or deployment has run for this change. Staff self access (PR #66) and the Execution dashboard widget (PR #67) are independent.

## Release hold after expanded October 15 source recheck

Read-only recheck at **2026-10-15 15:34:40 UTC** confirmed the same four joining-date anchors below. It also projected reminder fields that the earlier read omitted. Swagatika's exact current unpaid record `SALARY_LIVE_INDOOR_STAFF_1MJSC46_indoor_staff` has **`salary_due_date: 2026-10-27`**. This is real source evidence for the owner's reported 27th, not merely an unsupported recollection. Current source labels this field **Salary Due Date (Reminder Only)** and uses it in `azpSalaryDueDateForRecord`; `azpSalaryJoiningCycle` still derives a cycle ending October 29 from July 30 joining.

**Do not activate the current hard-coded calendar until the owner resolves one choice:** is the 27th the cycle-end date to use for score reset (reset October 28), or only the salary reminder date while the score cycle ends on the 29th (reset October 30)? This clarification changes score-calendar configuration only; no salary/payment data may be changed. Dates in the table below remain source-derived candidates, not activation approval.

The live core still has no rollover flag. The only listed Mumbai Scheduler job remains the existing SMS delivery-receipt poll every two minutes. Reusing it would require changing an unrelated SMS function and deploying code; it is not an existing score-reset route or a verified zero-cost option. Current PR68 can catch up inside an incoming Fault transaction without a new job, but cannot reset an inactive employee at midnight on its own. Owner score GETs remain read-only; do not silently turn them into reset writes.

There is no verified no-additional-cost route meeting independent scheduled resets. A dedicated job can reuse the existing Scheduler service-agent Pub/Sub permission without new IAM, but shared free-tier availability has not been established. The proposed one core build plus one daily job still needs explicit release/cost approval. PR69's persistent login code is present on main and untouched by this branch.

The approved rule resets each of the four existing staff scores to 100 at the start of the calendar day following that employee's monthly salary cycle, in Asia/Kolkata, whether salary is paid or unpaid. Prior Fault receipts and audits remain intact. No salary or payment records are written.

## Verified calendar source

Read-only inspection of the four exact `azpExecutionRecords` master IDs on 2026-10-15 at 12:24:31 UTC found matching `joining_date`, `join_date`, `date_of_joining` and linked salary-master joining dates. Existing `azpSalaryJoiningCycle` in `executions.html` calculates monthly joining anniversaries, clamping to the last day of shorter months. Its cycle ends one day before the next anniversary.

| Employee | Joining date | Current calendar cycle end | Next reset, 00:00 IST |
|---|---|---|---|
| Sanju | 2026-08-27 | 2026-10-26 | 2026-10-27 |
| Ranjit | 2026-10-01 | 2026-10-31 | 2026-11-01 |
| Swagatika | 2026-07-30 | 2026-10-29 | 2026-10-30 |
| Srinivas | 2026-10-01 | 2026-10-31 | 2026-11-01 |

The live salary records' `salary_cycle_end` was October 15 for every employee: it is the accrued-through-today date, not the recurring calendar boundary. Unpaid carry-forward starts and payment-dependent `azpSalaryLiveCycleStart` are deliberately excluded. The four verified joining anchors are versioned in `core/cycles.cjs`; future changes require re-verification and migration review rather than a silent calendar change. Raw salary documents are not included in this PR.

## Transaction behavior

`AZP_SCORE_CYCLE_ROLLOVER_ENABLED` defaults off. A metadata-only adoption records each current cycle and actual current balance without changing it. Arming within that same cycle also preserves the balance. Crossing a boundary before arming fails closed, because the old worker could otherwise have applied new-cycle deductions during migration.

Once armed, each due cycle resets once in a Firestore transaction and writes a separate private cycle archive with prior balance, before/after, effective boundary and processing timestamp. Missed cycles are caught up in order. Existing Fault receipts and audits are never removed or rewritten by rollover; receipt deduplication persists across cycles. Scheduler redelivery does nothing after the cycle has advanced.

A verified current-cycle Fault checks rollover in its deduction transaction. If the scheduler is late, the first Fault resets then deducts to 98 atomically. Scheduler delivery afterwards cannot erase that deduction. A delayed prior-cycle Fault is held with `previous-cycle-delivery`, rather than making a historical or current-cycle deduction. A future-cycle event retries until its boundary. Manual deduction/reversal routes remain unexposed.

The scheduled queue envelope accepts exactly `{kind: 'cycle-rollover', version: 1}` through the existing private authenticated Pub/Sub push route. It accepts no staff selector, date or balance. The existing push identity, audience, subscription and message freshness checks apply. Ingress and owner gateway require no change or deployment.

## Proposed production delta, requiring separate approval

- One build/deployment of `staffScore`, preserving its private identity, secrets, IAM, limits, Fault cutoff and other flags.
- One daily Cloud Scheduler job `fault-score-cycle-rollover`, region `asia-south1`, `0 0 * * *`, timezone `Asia/Kolkata`, publishing the fixed envelope to existing topic `fault-score-events`.
- Metadata and archives in existing named database `fault-score`: `private_score_cycles` and `private_score_cycle_archives`. No new query index, credential, service account or IAM grant is proposed.

Cloud Scheduler is already enabled. The October 15 inventory found one existing job, `firebase-schedule-pollSpringEdgeDlr-asia-south1`; do not modify it. Existing project policy grants the Scheduler service agent its normal role, which includes `pubsub.topics.publish`. Re-read that policy before deployment; stop if any new grant would be required.

Scheduler list pricing is $0.10 per job per 31 days, with three free jobs shared across the billing account; available free quota has not been established. One core build previously took 46.528 seconds: at $0.006/minute that is about $0.0047 of build compute; a 0.5–10 minute planning range is $0.003–$0.06, not a spending cap. Pub/Sub, Cloud Run, Firestore and artifact storage may add normal metered charges. Sources: [Scheduler pricing](https://cloud.google.com/scheduler/pricing), [Build pricing](https://cloud.google.com/build/pricing), [Scheduler service-agent permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/cloudscheduler).

## Safe activation sequence after approval

1. Re-verify the exact four calendar anchors, existing balances, deployed core source/revision and IAM. Preserve existing score, receipt and audit readback evidence.
2. While rollover is disabled, run the operator-only `adoptCycles` helper in one transaction against the named database using existing authorized credentials. It is not a remotely exposed route. Do not overwrite existing metadata or reset balances. If a boundary cannot be reached safely before arming, stop and review.
3. Deploy only the reviewed core candidate with rollover enabled; verify all serving traffic uses the new core before arming. No old worker may continue applying Faults across the first reset boundary. Preserve all other settings.
4. Publish one fixed cycle-check envelope through the existing authorized topic before the earliest next boundary. Read back four armed records, unchanged current balances and no reset archives. This proves migration/transport without sending any staff Fault.
5. Create the approved daily job only when arming is verified. Confirm timezone, target and next run; verify normal delivery on its first actual boundary and the persisted reset archive/balance. Scheduler timing is best effort; a missed run catches up on the next successful run or current-cycle Fault.

Rollback: pause the new job and disable only the rollover flag. Preserve all metadata, archives and receipts. If rolling back to old code, do not resume rollover across any elapsed boundary without reviewing deductions made by that code; metadata alone cannot establish which cycle those deductions belong to. Never restore a historical balance or delete deduplication receipts automatically.

## Validation and limits

Local tests exercise the production store adapter against transactional stand-ins, including native read-before-write checks and optimistic conflict retries. Coverage includes all four boundaries, IST midnight, short/leap months, preserved migration balances/history, unarmed-boundary failure, due-only resets, missed cycles, duplicate scheduler runs, atomic rollback, concurrent Faults and queue authentication. These are local tests, not evidence of a production reset or real Slack deduction. The existing live Fault activation and staff-self PR are separate work.
