# Vehicle document cabinet

Driver and Execution share `vehicle-documents.js`, the stylesheet, and the Firebase adapter. Execution metadata remains in `azpExecutionRecords` with `module: documents`, `record_type: vehicleDocumentV1`. Binary files use the existing Firebase Storage bucket under `vehicleDocuments/<vehicle-or-driver>/<request-id>/<page>`. Existing renewal-date records are retained and displayed separately.

## Workflow

Select an assigned vehicle, add document type/name/number and validity (or explicitly no printed expiry), take photos or upload JPG/PNG/WebP/PDF, label all pages, preview/crop/rotate images, confirm legibility, and save. Uploads remain Pending until office review. The newest verified version is used for inspection/offline download. Pending/rejected/previous versions remain available without deleting the verified copy. Expiry is always displayed independently of verification. No financial records are changed.

Driver vehicle choices come from current Driver/Vehicle Master assignments, with the existing production driver mapping as fallback; old jobs/fuel entries do not grant document visibility. Driving Licence is tied to the driver, not to the vehicle. Execution office reviews from its existing Vehicle Docs section. This is application-level filtering in the existing portal: this patch does not change Firebase access rules or claim to introduce server-side identity enforcement. Existing Firebase authentication and bucket permissions must permit uploads. Permission errors preserve selected pages and never show success.

## Reliability and privacy

Original historical records remain. A retry uses the same request ID and does not replace files or review status for a saved record. Metadata is written only after all file uploads succeed; interrupted uploads can leave unreferenced storage objects for future administrative cleanup. The office review identity is labelled Execution Office (the existing page has no named reviewer identity). No global vehicle master or expiry field is silently overwritten.

Preview images remain in memory until save/cancel/navigation. No document bytes are put in localStorage. Full-resolution uploaded images are preserved unless the user explicitly crops/rotates them (JPEG quality 95%). Max 12 files/document, 15 MB/file, 50 MB/document; image limit 50 MP. File types are restricted; document labels are escaped in display. Uploading does not automatically scan/OCR or validate legal completeness. Checklist is operational, not a claim of legal sufficiency.

Offline Download creates a standalone HTML package of the current verified papers, including validity and snapshot timestamp. Open from phone Downloads. PDFs have embedded download links. The package must be downloaded again after renewals, and it stays on the phone until manually deleted. This does not cache the entire Driver App for offline login. Offline package limit 100 MB.

## Validation

`node --test tests/vehicle-documents.test.cjs` covers assignment normalization/isolation, driver licence isolation, expiry boundaries, malicious file links/types, preserving verified revisions, upload failure and retry idempotency. Host inline module syntax is validated separately. Live checks must not fabricate official vehicle documents; no real documents were supplied in this request.
