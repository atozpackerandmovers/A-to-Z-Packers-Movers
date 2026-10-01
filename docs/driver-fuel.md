# Driver fuel entry and settlement

The Driver Fuel form adapts the fields, styling and consumption formula from
`atozpackerandmovers/atozpackersandmoverss/fuel_update1.html`. It is hosted beside
`driver.html`; it no longer relies on an embedded base64 document or a separate
browser's local-storage ledger.

- Fuel consumption = (ending meter - starting meter) / mileage × price per litre.
- Saved balance = sum(fuel_cost - boss_amount + company_returned).
- Positive: company owes driver. Negative: driver returns money to company.
- Balances are grouped by driver; money owed to one driver never offsets another.
- A blank/missing company payment is unknown, not zero. Such legacy records are
  excluded from the balance and flagged for office review. The old form's default
  INR 3,000 is not imported as a real payment. The office can complete old entries
  through Fuel → Edit, using verified cost and payment amounts.
- To record settlement only, the office may add a fuel record with cost 0 and
  the amount actually paid or returned. Do not repeat a previously saved advance.

Driver entry submission uses `azpExecutionRecords` with module `fuel`. The parent
binds the logged-in driver, validates the assigned vehicle, recalculates amounts,
checks the iframe origin/source and creates the document transactionally using
one request UUID. Retrying the same draft does not create another record. It uses
existing app/Firebase access controls; the client bridge is not a substitute for
server-side authorization rules. The same draft with changed values after a
successful save is rejected instead of overwriting the first record.

The form keeps unsaved drafts in per-driver sessionStorage. Firestore refreshes
update saved history without recreating the iframe or clearing form inputs.
A success message is shown only after the transaction completes. WhatsApp sharing
is a separate user action. Legacy local-only entries are not auto-migrated or
assumed to be reconciled. Resetting the old device cache does not delete ledger
records.

Validation: `node --test tests/fuel-ledger.test.cjs` covers balance signs, carry,
unknown payments, group separation, strict numeric validation, driver binding,
origin/source checks, idempotent retries and database errors. Tests mock database
writes; no sample fuel payments are written into the production ledger.

## Video-reference form restored (28 September 2026)

The entry form appears first; the balance dashboard is below the session list.
Settings, GPS screenshot upload / camera capture, clear-photo confirmation,
preview, stamped JPEG output, primary WhatsApp, session drafts, monthly session
PDF and stored-record sharing are available within the embedded form. The logged-in
driver remains fixed. Vehicle additions are personal form choices, not edits to
Vehicle Master. New registrations are explicitly marked Driver entered on save.

Photo selection and stamping happen on the device. Save Entry saves the fuel
ledger, not the photo. Use the explicit Share or Download Stamped Photo action
for the image. The original image and existing GPS overlay are retained; the
added footer says report-generation time and never invents capture coordinates.
Native-share cancellation keeps the draft. On unsupported browsers the stamped
JPEG downloads and a WhatsApp compose link is offered for manual attachment.

Session entries are labelled drafts until the Execution save acknowledgement.
Restart clears only session drafts; it does not erase saved financial records.

Company payment and note are entered in the main form before Primary WhatsApp.
Primary and session reports use the same validated payment as the Execution save,
including the per-entry difference and projected saved balance. Blank payments
block sharing; explicit zero is accepted. Photo stamps and session PDFs include
the company payment. Saved session reports use acknowledged Execution amounts.
