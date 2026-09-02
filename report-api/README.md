# Secure Daily Operations Report API

Isolated Firebase Functions v2 codebase for the A TO Z Packers & Movers Execution Software.

## Safety guarantees

- Reads only from `azpExecutionRecords`.
- Contains no Firestore `set`, `add`, `update`, `delete`, batch, or write transaction call.
- Does not modify `executions.html`, existing functions, Hosting, Firestore rules, Authentication, or production records.
- Accepts HTTPS `GET` only and requires `Authorization: Bearer <token>`.
- Uses the Firebase Secret `DAILY_REPORT_API_TOKEN`; no production token belongs in source control.
- Returns allowlisted operational fields only. Phone numbers, addresses, login passwords, API keys, salary details, bank/identity data, and GPS coordinates are excluded.
- Uses `Asia/Kolkata` for the default report date.
- Uses one bounded OR query per module (500 records maximum) and fails safely if the bound is reached.
- Runs with `minInstances: 0` and `maxInstances: 2` to limit cost exposure.

## Project target

- Firebase project: `az-packers-quotation`
- Region: `asia-south1`
- Function: `dailyOperationsReport`
- Runtime: Node.js 22
- Functions codebase: `daily-report-api`

The repository `.firebaserc` pins the default project. Always confirm it before any cloud command:

```bash
firebase use
firebase projects:list
```

## Inspected production mappings

| Report area | Module discriminator | Important fields |
|---|---|---|
| Material stock | `materialStock` | `item_name`, `unit_name`, `opening_stock`, `purchase_qty`, `used_qty`, `reorder_level`, `updatedAt` |
| Material issue | `material` | `date`, material-specific quantity fields, `job_id`, `driver_name`, `received_by`, `issued_by`, `updatedAt` |
| Attendance | `attendance` | `master_id`, `employee_name`, `role`, `date`, `attendance_status`, `fooding_eligible`, punch/check-in fields |
| Leave | `leaveApproval` | employee identity, leave-from/to fields, approval status |
| Staff masters | `driverMaster`, `workerMaster`, `indoorStaffMaster` | names, joining/inactive dates, status, designation; private fields are never returned |
| Fooding rates | `staffSalaryMaster`, `salarySettings` | `fooding_rate`, `fooding_amount`, staff identity, role, status |
| Fooding rule | `attendanceSettings` plus existing code default | Present is eligible; Half Day follows `half_day_fooding_eligible` (existing default: Yes); Absent/Leave/Not Marked are not eligible |
| Duty status | `jobs` | selected work date, assigned driver/worker names, status; customer details are never returned |

Existing production role defaults are preserved: Driver ₹250/day, Worker ₹150/day, and Office/Indoor ₹0 unless explicitly enabled with a positive rate.

## Local setup

```bash
cd report-api
npm ci
npm run lint
npm test
npm run test:runtime
npm run audit
```

## Emulator test

Create `report-api/.secret.local` locally (it is gitignored):

```text
DAILY_REPORT_API_TOKEN=emulator-only-daily-report-token
```

From the repository root, run the Functions Emulator against a local `demo-*` project and the built-in safe fixture:

```bash
REPORT_API_USE_LOCAL_FIXTURE=true firebase emulators:exec --project demo-az-packers-quotation --only functions "node report-api/test/emulator-smoke.js"
```

The smoke test does not connect to or write to production Firestore. The fixture repository is enabled only when both `FUNCTIONS_EMULATOR=true` and `REPORT_API_USE_LOCAL_FIXTURE=true` are present.

## Production secret (owner approval required)

Do not run this before Manoj Kumar Swain approves secret creation:

```bash
openssl rand -base64 48
firebase functions:secrets:set DAILY_REPORT_API_TOKEN --project az-packers-quotation
```

Do not place the token in GitHub, HTML, logs, screenshots, email, WhatsApp, comments, or a PR description. Share it with the owner through an approved encrypted password manager or a secure one-time secret link.

### Rotate or revoke

Rotation creates a new Secret Manager version and requires redeploying only this function so the new version is bound:

```bash
firebase functions:secrets:set DAILY_REPORT_API_TOKEN --project az-packers-quotation
firebase deploy --only functions:daily-report-api:dailyOperationsReport --project az-packers-quotation
```

After verifying the new token, disable or destroy the prior secret version in Secret Manager. Revocation without replacement will make the endpoint return a safe failure/unauthorized response after the bound function revision is updated.

## Production deployment (owner approval required)

Never run a broad `firebase deploy`. After approval, deploy only the new function:

```bash
firebase deploy --only functions:daily-report-api:dailyOperationsReport --project az-packers-quotation
```

Before deployment, reconfirm Blaze billing, the exact project, the exact function name, the secret binding, dependency audit, and test results. Keep `minInstances` at zero unless the owner separately approves a recurring idle cost.

## Rollback

Rollback does not modify existing software. If the new function must be withdrawn, disable access by rotating/revoking the bearer token first. Deleting the new function is a production/destructive action and requires owner approval:

```bash
firebase functions:delete dailyOperationsReport --region asia-south1 --project az-packers-quotation
```
