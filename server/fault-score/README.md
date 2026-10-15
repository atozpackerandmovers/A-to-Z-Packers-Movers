# Fault relay source

This directory preserves the previously reviewed deployed core/ingress/gateway source and adds the **disabled-by-default** staff self-score route. It is not an automatic deployment configuration.

See [staff self-score review](../../docs/staff-self-score-review.md) for the exact authorization, identity and index prerequisites. Do not deploy or enable this feature from the review branch.

Run `npm ci --ignore-scripts` and `npm test` with Node 22. No tests in the default suite use production credentials, make staff contact, or write live scores. `tests/emulator.cjs` is a separately guarded, synthetic loopback Firestore test retained from the baseline; it requires the demo emulator and does not validate the new production index.
