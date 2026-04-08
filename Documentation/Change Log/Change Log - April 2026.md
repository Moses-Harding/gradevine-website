# Change Log - April 2026

### Dashboard Home View Redesign (2026-04-08)

Redesigned courses/home view with two-column layout for richer visual hierarchy and functionality. Created new HomeView component featuring: courses table with color indicators (name, student count, assignment count), recent assignments section with enriched card design showing metadata and direct grading access (BY STUDENT / BY QUESTION action buttons), and activity feed sidebar tracking recent assignment changes. Implemented new `useAllAssignments()` hook to fetch assignments across all courses, supporting the recent assignments widget. Updated AssignmentList component to use enriched card style with visible statistics row (scans, questions, points, update time) instead of dark header design. Action buttons intelligently hide when no scans exist, showing "NO SCANS YET" label instead. Responsive grid layout collapses sidebar on smaller viewports.

**Files created:** `src/components/dashboard/HomeView.tsx` (new), `src/hooks/useAllAssignments.ts` (new)

**Files modified:** `src/components/dashboard/DashboardApp.tsx`, `src/components/dashboard/AssignmentList.tsx`, `src/lib/cloudkit/queries.ts`, `src/pages/dashboard.astro` (~400 lines of styling added)

---

### Support Page & FAQ (2026-04-07)

Added `/support` page with collapsible FAQ section covering 7 categories from in-app help content: Getting Started, Courses & Sections, Assignments, Importing & Scanning, Student Matching, Grading, and Students. Consolidated 40+ FAQs into organized accordion-style interface. Updated homepage footer with "Help & FAQ" link. Changed support email from `support@gradevine.app` to `moses.harding.dev@gmail.com`.

**Files modified:** `src/pages/support.astro` (new), `src/pages/index.astro`

**Support URL:** https://gradevine.app/support

---

### Landing Page Redesign: Hero, Features, Pricing (2026-03-31 to 2026-04-01)

Major refresh of hero section, features, and pricing areas. Replaced hero subtitle with 5 bullet points highlighting core capabilities. Added stepped "How it works" video section with inline step numbers. Redesigned features section with new AI-Suggested Grading Key and AI Analysis cards; merged Auto-Match Students into AI Transcription. Built interactive credit calculator with stepper inputs and iOS-style toggle. Updated pricing messaging to accurately reflect free plan limitations. Changed primary tagline from "AI that grades papers, not writes them" to "AI grading for teachers who still use paper."

**Files modified:** `src/pages/index.astro`, `Documentation/Notes/Tagline Candidates.md` (new)

---

