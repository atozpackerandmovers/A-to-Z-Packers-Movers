# Persistent score-owner session fix

The owner reported that the published Execution score widget displayed `Owner session required` after signing in. The previous standalone Owner Score page used a named, memory-only Firebase session; Execution watched the default app's different session. A cached `emailVerified: false` could also prevent the widget from ever reloading the exact owner's current verification state.

Both pages now share the existing `owner-fault-score` Firebase app with `indexedDBLocalPersistence`. Firebase owns the persisted authentication state. This change was explicitly requested by the owner so sign-in survives navigation, tab reload and browser restart until sign-out, subject to token revocation/account disablement and browser storage availability.

If Execution already has the exact verified owner in its default/GPS session, the SDK's `updateCurrentUser` adopts that authenticated same-project user into the isolated score session. The code never extracts or manually copies raw tokens, and never changes or signs out the default/GPS session. Guest accounts, other UIDs and unverified identities are not adopted. The score client still checks the exact owner UID, email, verified status and password provider; the server still verifies the token independently.

Explicit Owner Score sign-out clears that named SDK session and records only a non-secret `signed-out` preference in localStorage. Execution hides scores across tabs and the preference prevents a still-signed-in GPS account from silently recreating the score session. A later explicit Owner Score sign-in removes that preference. No balance, audit record or password is stored by application code. SDK authentication material persists in the browser profile as requested; someone with access to that signed-in browser can use the owner session until it is signed out or revoked.

HTTP errors now hide scores without automatically signing the owner out. Both pages clear rendered score data on page hide; restored pages revalidate. No storage is globally cleared. No new credentials/accounts, IAM grants, backend changes, salary changes or real Fault test deductions are involved.

Validation uses synthetic identities and intercepted service replies. Unit checks cover exact owner gates, stale verification recovery, auth races, explicit/cross-tab sign-out, failed persistence and preserved GPS state. A browser test uses the real Firebase 12.10.0 SDK and fresh temporary profiles to verify shared login, reload, browser restart, cross-tab logout, retained logout preference and existing GPS-owner adoption. A separate 390/1280px regression test preserves placement above Fuel Settlement and absence of embedded controls.

This cannot recover a prior memory-only session that has already disappeared. If no valid owner session remains in either app, one normal owner sign-in is still required after deployment; the new session then persists. The owner's actual Edge session has not been inspected, so that specific session's state is not claimed verified.

Production boundary: this is a new frontend change after PR67. Prepare and review the PR before obtaining explicit approval to merge/publish it. PR66 staff access and PR68 salary rollover remain separate and undeployed.
