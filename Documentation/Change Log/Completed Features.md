# Completed Features

**Purpose**: Track completed web features (WEB-FEAT-001, WEB-FEAT-002, etc.).

---

## WEB-FEAT-001: Admin Console

**Status**: Complete
**Completed**: 2026-04-21
**Effort**: Small

### Summary
Password-protected admin console at `/admin` for managing GradeVine backend operations. Secured with Apple Sign-In and a hardcoded `userRecordName` whitelist so only the developer's Apple ID can access it.

### What Was Built

**Authentication**: Apple Sign-In via CloudKit JS (same auth as the dashboard). `userRecordName` checked against developer whitelist (`_cc831b2c736681ff02525cdf665cfafd`). Anyone else sees an "Access Denied" screen.

**Promo Code Management**: Full CRUD interface connected to the Firebase Realtime Database `promo_codes/` node (same DB as iOS app).
- Create form with labeled fields: Code Name (auto-uppercased, monospace), Credits, Max Uses, Expiry Days
- Writes the same data shape as iOS `PromoCodeManager.createPromoCode()`
- Existing codes table showing code, credits, used/max redemptions, expiration date, and status tag (Active / Expired / Exhausted / Inactive)
- Refresh button to reload from Firebase

**Analytics Dashboard**: Placeholder section with 8 metric cards (Batch Scans, Pages Processed, Success Rate, Error Rate, Hallucination Rate, Manual Corrections, Low Confidence, Name Match Rate). Mirrors the iOS debug analytics view layout. Currently shows `—` since analytics events are stored locally on-device (UserDefaults); will populate when a centralized pipeline is added.

### Files Created/Modified
- `src/pages/admin.astro` — page at `/admin` with CloudKit JS script, sign-in/out button containers, all admin CSS
- `src/components/admin/AdminApp.tsx` — React app: `AdminAuthGate`, `AdminAccessDenied`, `PromoCodeSection`, `AnalyticsSection`, `AdminDashboard`
- `src/lib/firebase/config.ts` — Firebase JS SDK initialization (shared project with iOS app)

### Dependencies
- `firebase` npm package (added to dependencies)
- Firebase Realtime Database: `https://gradevine-ea94e-default-rtdb.firebaseio.com/promo_codes/`
- CloudKit JS: same auth infrastructure as `/dashboard`
