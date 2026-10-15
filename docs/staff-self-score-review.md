# Staff private score access — review only

## Current production findings

The current `staff.html` dashboard accepts a typed name/role/phone in local storage and signs in to Firebase anonymously. That session cannot prove which employee is using it. Do not authorize scores from that name, phone, anonymous UID, editable staff record, or a caller-supplied staff ID.

Read-only inspection on 15 October 2026 found the four exact staff master records, but none contained a Firebase UID binding. The existing Auth metadata search established no verified account match for them. This does **not** prove that a person has no account under a different name; their identity must be verified before binding. No accounts, credentials or bindings were created, and no staff were contacted.

| Staff | Canonical staff ID | Required account binding |
| --- | --- | --- |
| Sanju | `INDOOR_STAFF_ZD9A1Z` | Verified individual Firebase password-account UID, unresolved |
| Ranjit | `INDOOR_STAFF_10HIAWK` | Verified individual Firebase password-account UID, unresolved |
| Swagatika | `INDOOR_STAFF_1MJSC46` | Verified individual Firebase password-account UID, unresolved |
| Srinivas | `INDOOR_STAFF_9JJREB` | Verified individual Firebase password-account UID, unresolved |

No phone/name/Slack identity is guessed into a Firebase UID. The owner's account is explicitly excluded from the staff bindings. Existing approved Slack-to-staff scoring mappings are unchanged.

## Resulting behavior

`my-score.html` uses a separate named Firebase app with memory-only persistence. A person signs in with their own verified account. It shows only the server-selected person's current score, including zero, and their latest 50 score changes with reason and date. Empty reasons are reported as absent, not invented. Truncation is explicit. Logout, account changes and failed requests clear displayed data. Reasons are inserted as text, never HTML; no Slack links, owner identifiers, raw messages, receipt keys or other employees' records are returned.

The old attendance panel's public-file score display becomes a link to this private page. It no longer fetches `staff-score-updates.json` or presents its empty-file default of 100 as the current Fault score. Existing device task counters are labelled separately; attendance and task behavior are preserved. The public update file itself is not populated or changed.

The only new API route is `GET /api/staff-score/me`. It rejects query parameters and mutation methods. Both the existing gateway and private core authenticate the Firebase token with revocation checks and resolve the same explicit UID mapping. Staff tokens remain forbidden on every owner route. The core additionally requires the existing gateway service identity; anonymous/direct access remains denied. The history query filters by the authenticated staff ID before ordering and limiting, inside the same read transaction as the balance.

Scoring ingress, minus-two behavior, deduplication, cutoff, owner access, balances and salary behavior are unchanged. The self endpoint performs no writes and does not call Slack.

## Exact proposed deployment delta — approval still required

1. Verify and approve the four individual Firebase UID bindings. Existing verified password accounts can be reused only after identity confirmation. If new accounts or a different authentication method are needed, that is a separate approval decision; this PR does not provision them or send invitations.
2. Set identical server-only `AZP_STAFF_SCORE_UID_BINDINGS` JSON maps on the existing `staffScore` core and `faultOwnerGateway`. Keys must be exactly the four canonical staff IDs above, values four distinct verified UIDs. No owner UID is allowed. Missing, malformed, partial or duplicate mappings fail closed.
3. Review/create the composite index from `server/fault-score/firestore.indexes.review.json` in the existing **named `fault-score` database**: `private_score_audit`, `value.staffId ASC`, `recordedAt DESC`. It has not been deployed or verified in production. Index storage/read usage can incur normal service charges.
4. Build and deploy **only the core and owner gateway** after explicit approval, preserving existing identities, IAM, secrets, flags/cutoff, resource limits and private core access. This needs two new metered backend builds; none were run for this feature. No new IAM grants, service accounts, secrets, public services, database rules or authentication providers are proposed. This does expand application authorization to the four approved accounts on the single self route.
5. Enable `AZP_STAFF_SELF_SCORE_ENABLED=true` on those two services only after the bindings and index are verified. It defaults to disabled. Publish the staff UI only as part of that approved release and verify with real individual staff sign-ins. Those production sign-ins have not been performed.

Do not deploy the whole package indiscriminately: `faultIngress` needs no update. Do not merge this staff PR as authorization to activate backend access. No CI workflow or automatic backend deployment was added.

## Validation and provenance

The first commit imports the exact reviewed runtime source/package and its tests from the deployed relay baseline so the backend is now reviewable in this repository. The source ZIP previously deployed had SHA-256 `a9ad7a17084e7be9b14cffd791de00bde288d93a507fc19f1995e67396aec6c1`; the feature changes are in the following commit. No secret values or production account metadata are committed. Package versions remain locked.

With Node 22:

```sh
cd server/fault-score
npm ci --ignore-scripts
npm test
cd ../..
node --test tests/staff-self-score.test.cjs tests/staff-punch.test.cjs tests/staff-scoreboard.test.cjs
```

Local result: **46/46 backend tests**, using the locked dependencies, and **22/22 staff UI/attendance/client tests** passed. Coverage includes all four self bindings; staff/owner separation; selector, method and origin rejection; anonymous/unverified/revoked/expired/forged identities; mapping errors; private service identity; filtered history limits; missing balances/index failures; zero; in-flight account changes; and existing scoring/queue regressions. Tests use synthetic identities and records, not staff credentials.

`tests/staff-self-score-browser.cjs` runs with Playwright available on `NODE_PATH`; optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome and `SCREENSHOT_DIR` to a local output folder. Synthetic 390px/1200px browser checks passed for named memory-only auth, own endpoint, password/data clearing, account switching, denied access, literal text, dates and no horizontal overflow. These tests do not establish production staff login, index readiness, or a live deduction.

## Rollback boundary

Disable `AZP_STAFF_SELF_SCORE_ENABLED` on gateway and core to close staff access without affecting scoring or owner reads. Remove the staff-page link if publication must be rolled back. Preserve score/audit records. Do not change existing scoring flags, cutoff, IAM or balances; no historical replay or reversal is part of this feature.
