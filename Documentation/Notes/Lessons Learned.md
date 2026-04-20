# Web Dashboard Lessons Learned

## 1. Resetting CloudKit Dev Environment Invalidates API Tokens (2026-04-20)

**Symptom**: Scan page images returned 400 Bad Request (`{UUID}.jpg`). CloudKit auth also failed with 401 AUTHENTICATION_FAILED.

**Root cause**: The CloudKit development environment was reset from the dashboard, which invalidated the existing API token. The 400 on images was a downstream effect — with an invalid token, asset download URLs were also broken.

**Fix**: Created a new API token in the CloudKit Dashboard (Development environment) with `http://localhost:4321` as an allowed origin, then updated `src/lib/cloudkit/config.ts`.

**Lesson**: After resetting the CloudKit dev environment, you must regenerate the API token. The old token becomes permanently invalid. Also check allowed origins include the current dev server port.
