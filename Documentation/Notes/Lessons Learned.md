# Web Dashboard Lessons Learned

## 1. Resetting CloudKit Dev Environment Invalidates API Tokens (2026-04-20)

**Symptom**: Scan page images returned 400 Bad Request (`{UUID}.jpg`). CloudKit auth also failed with 401 AUTHENTICATION_FAILED.

**Root cause**: The CloudKit development environment was reset from the dashboard, which invalidated the existing API token. The 400 on images was a downstream effect — with an invalid token, asset download URLs were also broken.

**Fix**: Created a new API token in the CloudKit Dashboard (Development environment) with `http://localhost:4321` as an allowed origin, then updated `src/lib/cloudkit/config.ts`.

**Lesson**: After resetting the CloudKit dev environment, you must regenerate the API token. The old token becomes permanently invalid. Also check allowed origins include the current dev server port.

## 2. CloudKit JS `hasErrors` with Empty Records Array (2026-04-20)

**Symptom**: Grades appeared to save successfully (UI showed "saved") but were not persisted to CloudKit. On reload, grades were gone.

**Root cause**: Two bugs compounded:
1. `saveGrades()` sent `feedback: null` to CloudKit, but the `feedback` field didn't exist in the schema (wiped by dev environment reset). CloudKit returned `BAD_REQUEST: "Field feedback not found in Scan"`.
2. CloudKit JS put the error in `response._errors` (not `response.records`), so `response.hasErrors` was `true` but `response.records` was an empty array. The error-handling code only checked `response.records.find(r => r.serverErrorCode)`, found nothing, and fell through to the success path.

**Fix**:
- Only include `feedback` field in the save payload when non-empty (truthy check instead of `!== undefined`)
- When `hasErrors` is true but no error record is found in `records`, treat it as a failure instead of falling through to success

**Lesson**: CloudKit JS has two error paths — errors can appear in `response.records[].serverErrorCode` OR in `response._errors[]`. Always treat `hasErrors === true` as a failure even if `records` is empty. Also, never send optional fields with null values — if the field doesn't exist in the schema, CloudKit rejects the entire save.

## 3. Dev Environment Reset Wipes CloudKit Schema (2026-04-20)

**Symptom**: After resetting the CloudKit development environment, saves failed with "Field not found" errors for fields that previously existed (e.g., `feedback` on Scan).

**Root cause**: Resetting the dev environment wipes the schema. Fields are only recreated when iOS syncs records that use those fields.

**Lesson**: After a dev environment reset, the web dashboard must be resilient to missing optional fields. Only include fields in save payloads when they have actual values. Required fields (like `questionResponsesData`) are fine because they always have values.
