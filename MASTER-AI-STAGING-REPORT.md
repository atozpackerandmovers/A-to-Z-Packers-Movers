# Master AI Business Director — Staging Change Report

Branch: `feature/master-ai-live-reports-staging`
Production/main deployment: **not performed**
Business timezone: `Asia/Kolkata`

## Outcome

The staging implementation removes the screenshot bug where the generic word `report` became `Identifier: report`, moves Master AI reporting behind a Firebase-ID-token-protected read-only API, separates quotation-created date from shifting/execution date, and adds mixed date normalization, indexed server-side filtering, pagination, deduplication, diagnostics, and Hindi/Hinglish/English routing.

No Firebase rule, production record, production Hosting file, main branch, or deployed function was changed.

## Source-confirmed schema map

These names were observed in the supplied Execution and Quotation HTML source; they are not invented aliases.

| Module | Collection/path | Confirmed fields/discriminator |
|---|---|---|
| Quotation history | `quotations` | `quotation_number`, `quotationNo`, `customer_name`, `customerName`, `party_mobile`, `partyMobile`, `from_location`, `fromLocation`, `to_location`, `toLocation`, `quotation_date`, `date`, `total_amount`, `totalAmount`, `created_at`, `createdAt` |
| Quotation status | `quotationStatuses` | `quotationId`, `status`, `followUpStatus`, `updatedAt`, `updatedAtText`, `confirmedDate`, `cancelledDate` |
| Sales/payment | `salesBills` | `invoice_no`, `invoice_date`, `linked_quotation_no`, `customer_name`, `party_mobile`, `total_amount`, `received_amount`, `balance_due`, `received_full`, `created_at` |
| Planning | `planningSheets` | `planning_no`, `linked_quotation_no`, `customer_name`, `party_mobile`, `from_location`, `to_location`, `shifting_date`, `work_start_date`, `created_at` |
| Agreement/item list | `agreements`, `itemLists` | relationship through quotation/planning identifiers; `created_at` and module-specific dates |
| Execution core | `azpExecutionRecords` | actual `module` and `collection` discriminator fields |
| Jobs | `azpExecutionRecords` | `module/collection = jobs`; `work_start_date`, `work_date`, `shifting_date` |
| Attendance/leave | `azpExecutionRecords` | `attendance`, `leaveApproval`; `date`, `attendance_date` |
| Fooding | `azpExecutionRecords` | `fooding`, `foodingCycle` |
| Materials | `azpExecutionRecords` | `material`, `materialStock`, `fleetMaterialInventory` |
| Tasks | execution + direct collections | `taskManagement`; `azpStaffTasks`, `taskMaster`, `staffTasks` |
| Fleet/fuel | `azpExecutionRecords` | `fuel`, `fleetFuelMileage`, `vehicleMaster`, `fleetVehicleMaster`, `fleetDocumentExpiry`, `fleetRepairHistory`, `fleetServiceSchedule`, `repairing`, `documents` |
| Complaints | `complaints` + execution fallback | `status`, `statusHistory`, `note`, `updatedAt`, `updatedAtText`, `resolvedAtText` |
| GPS | Firestore mirrors + RTDB | `azpGpsTripHistory`, `azpGpsTripPoints`; existing RTDB root `gpsProduction/v1` |

Mapped comment fields: `comment`, `comments`, `note`, `notes`, `remark`, `remarks`, `followUpNote`, `follow_up_note`, `complaintNote`, `complaint_note`, `company_remark`, `activity_log`, `activityLog`, `statusHistory`.

## Date and security behavior

- Today/yesterday use `Asia/Kolkata`; Timestamp queries use India midnight converted to UTC start-inclusive/end-exclusive bounds.
- Firestore Timestamp, ISO timestamp, epoch seconds/milliseconds, `DD-MM-YYYY`, `DD/MM/YYYY`, and `YYYY-MM-DD` are normalized.
- Quotations default to `createdAt`, `created_at`, `createdAtText`, `savedAt`, or `timestamp`; `quotation_date` is a legacy fallback. Shifting fields are used only when explicitly requested.
- Jobs use `work_start_date`, `work_date`, then `shifting_date`; created date is not mixed into execution date.
- Admin Preview no longer succeeds from role/name in `localStorage`. Firebase Auth UID plus `masterAiAdmin: true` is required in the UI; the API independently verifies the ID token and custom claim (or a server-side UID allowlist).
- Master AI performs no client-side collection scan and the API repository contains no create/update/delete/write call.

## Test result

Local automated result: **47 passed, 0 failed**. `npm run lint` passes and the staging HTML module passes `node --check`.

Coverage includes India midnight, today/yesterday/kal, all three date formats, month/year boundary, Timestamp/ISO/epoch/legacy normalization, duplicate prevention, zero-record diagnostics, comment linkage, authorized and unauthorized users, origin/method rejection, mobile button wiring, and no Firestore mutation calls.

## Not yet live-verified

Manual live count comparison was not run because no authorized non-production Firebase dataset/Manoj UID claim was supplied and the request forbids testing on production. Therefore this branch does **not** claim that production today/yesterday counts are verified.

Still required in staging:

- set the Manoj test UID/custom claim;
- import sanitized fixtures or provide authorized read-only staging data;
- compare today, yesterday, three old dates, month/year and midnight boundaries with manual counts;
- create only indexes confirmed by staging query logs;
- verify RTDB GPS separately (coordinates are not returned by this Firestore report API);
- review bounded data-quality scan read cost and nested comment timestamps.

## Deployment sequence

1. Select a non-production Firebase project and sanitized fixtures.
2. Set `masterAiAdmin: true` for Manoj's test account or configure server-only `MASTER_AI_ADMIN_UIDS`.
3. Run `npm test` and `npm run lint` in `report-api`.
4. Start emulators with `firebase --config firebase.master-ai-staging.json emulators:start`.
5. Run the mandatory manual count/security/mobile checks.
6. Deploy approved indexes and `masterAiReport` to staging only.
7. Obtain Manoj Kumar Swain's approval before any production permission, billing change, main merge, or production deployment.

## Changed files

- `staging/test.driver.master-ai-staging.html`
- `report-api/src/master-ai-dates.js`
- `report-api/src/master-ai-schema.js`
- `report-api/src/master-ai-repository.js`
- `report-api/src/master-ai-report.js`
- `report-api/src/master-ai-handler.js`
- `report-api/src/index.js`
- `report-api/test/master-ai.test.js`
- `report-api/test/master-ai-html.test.js`
- `firebase.master-ai-staging.json`
- `firestore.master-ai.indexes.json`
