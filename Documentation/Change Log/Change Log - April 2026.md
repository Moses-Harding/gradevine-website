# Change Log - April 2026

### GradeByQuestion iOS Parity (2026-04-16)

Six improvements to close feature gaps between iOS GradeByQuestionView and the web dashboard:

- **WEB-IMP-001**: Student jump selector — searchable modal (click name or press J) with grade status per student
- **WEB-IMP-002**: Keyword highlighting — yellow for question keywords, blue text for AI contextual matches, hover popovers with confidence
- **WEB-IMP-003**: Blind grading toggle — hide student names for fair grading
- **WEB-IMP-004**: Scan image zoom — click-to-zoom lightbox overlay
- **WEB-IMP-005**: Multi-page scan viewer — page prev/next controls
- **WEB-IMP-006**: Collapsible sections — click headers to toggle Question, Transcription, Grading Key, AI Evaluation
- **WEB-IMP-007**: Color invert toggle — CSS invert filter for faint pencil legibility

Also: "Next" on last student advances to next question, keyboard shortcuts info icon, home refresh button.

**Files modified:** `GradeByQuestionView.tsx` (+400 lines), `HomeView.tsx`, `dashboard.astro` (+350 lines CSS)

---

### CourseDetailView Feature & Visual Overhaul (2026-04-14)

Major enhancement of the CourseDetailView with 7 functional improvements and 6 visual polish changes, bringing it closer to iOS feature parity.

**Functional improvements:**
- **Course toolbar menu** — three-dot menu in header with "Export Roster (CSV)" download (client-side Blob generation with proper CSV escaping)
- **Per-course student scan counts** — previously showed total scans across all courses; now intersects student scanIDs with course assignment scanIDs for accurate per-course counts
- **Assignment sorting** — cards now sorted by `updatedDate` descending (newest first), matching iOS; timeline retains chronological order
- **Bulk student selection mode** — "Select" toggle in Students toolbar, checkboxes on rows, section-level "Select All / Deselect All", selection count bar with clear action
- **Interactive multi-line trend chart** — SVG chart with per-student lines, 60% threshold, hover-to-highlight with data point dots, bidirectional legend-chart hover sync, expandable legend
- **Roster import reminder banner** — shows when <3 students enrolled, dismissible, course-color accent
- **Sortable students** — A-Z / Scans toggle sorts within section groups

**Layout changes:**
- Grading Progress and Needs Attention now sit side by side (widget row); Students by Section fills right slot when no at-risk students exist
- Needs Attention section now uses the same struggling-students pattern as AssignmentDetailView (warning banner + row list with percentage, severity badge, trend tag, sparklines)
- Richer empty states with SVG illustrations for both Assignments and Students sections

**Visual polish:**
- Progress bar stats now include colored icon badges and colored underline accents
- Student avatars have gradient fill and course-color drop shadow
- Assignment cards lift on hover (`translateY(-1px)` + deeper shadow)
- Student rows highlight with course-color left border on hover
- Trend chart has subtle background tint and drop shadow on lines
- Timeline dots for in-progress assignments pulse with an animated ring

**Files modified:** `src/components/dashboard/CourseDetailView.tsx` (+615 lines), `src/pages/dashboard.astro` (+439 lines CSS)

---

### No-Scan Filtering in Grade by Student View (2026-04-14)

Extended the no-scan filtering (already in Grade by Question) to Grade by Student. Students whose scan records have no uploaded pages are now excluded from navigation (Prev/Next, keyboard arrows) and shown in a collapsible "NO SCAN" section at the bottom of the student sidebar in both grading views. Matches the iOS `BUG-022` filter (`scan.pages.isEmpty`).

**Files modified:** `src/components/dashboard/GradeByStudentView.tsx`, `src/components/dashboard/ScanViewer.tsx`

---

### Assignment Detail View, Analytics, and Grading Status Fixes (2026-04-10)

Added a full AssignmentDetailView as the landing page when tapping an assignment card. Previously, clicking an assignment only exposed the GRADE BY STUDENT / GRADE BY QUESTION buttons — tapping the card itself did nothing. Now, clicking an assignment opens a dedicated detail view with header metadata, progress summary (Fully Graded / In Progress / Ungraded / Total Scans), questions list, struggling students section with configurable threshold (50/60/70%) persisted in localStorage, grade distribution with iOS-style circular letter badges, ring charts for average points per question (matching the iOS `AvgPointsRing` component), and a full grade matrix with sticky student column and per-question averages row. All analytics styling mirrors the iOS app (white card sections with soft drop shadows, iOS system colors, pill badges).

Fixed a major status bug: assignment cards in both AssignmentList and HomeView's Recent Assignments were hardcoded to display `IN PROGRESS` whenever any scans existed, regardless of whether grading was actually complete. Created a new `useAssignmentGradingStatuses` hook that loads scans per assignment (using the existing cache, so it's cheap on repeat visits) and computes real status: `new` / `loading` / `progress` / `done`. Cards now correctly display `NO SCANS YET`, `LOADING…`, `IN PROGRESS` (amber), or `COMPLETE` (green).

Fixed a silent data migration bug in the web parser: iOS's `ScanQuestionResponse` model has a deprecated `earnedPoints: Int?` legacy field that iOS migrates to `pointsEarned: Double?` via `migratePointsIfNeeded()` on load. The web dashboard's `parseScan` wasn't running this migration, so scans originally graded on older iOS versions (with only the legacy field still populated in CloudKit) were appearing as ungraded in the web UI. Added the migration in `parseScan` so grades now display correctly. Also added a code-cleanup roadmap item to eventually remove the legacy field once all CloudKit records have been migrated.

Redesigned the dashboard's auth gate (shown when not signed in) with a two-column layout: brand pitch on the left (gradient-accented "Grade faster on the big screen." headline, feature bullet list, back link) and sign-in card on the right (teacher login eyebrow, privacy note with shield icon, App Store download link). The CloudKit-rendered Apple sign-in button is physically moved into the card slot via `useEffect` + `appendChild` DOM re-parenting, preserving CloudKit JS internal state. Changed the landing page button from "Login" to "Log into web dashboard" and made the `?login=1` auto-click more reliable by polling for the Apple button to appear (up to 5s) rather than firing once immediately after `initAuth()`.

Assignment card layout restructured into a two-row format: title + `scans / created / modified` metadata on the top row, course name + question count on a second sub-line, and status badge + action buttons on a bottom divider row. The Recent Assignments section in HomeView applies the same card pattern, with overrides to make nested cards sit flush (no double-rounded borders inside the container). Renamed action buttons from `BY STUDENT` / `BY QUESTION` to `GRADE BY STUDENT` / `GRADE BY QUESTION`. Cards are now fully clickable (keyboard accessible) and navigate to the detail view; buttons stop event propagation so they still jump directly to grading.

Added a small monospace dev label (`HomeView` / `AssignmentList` / `AssignmentDetailView` / `GradeByStudentView` / `GradeByQuestionView`) above the breadcrumb in DashboardApp so it's easy to reference the current view when describing issues. The breadcrumb itself now includes the assignment title as a clickable segment and a trailing `GRADE BY STUDENT` / `GRADE BY QUESTION` segment when inside a grading view, so back navigation returns to the assignment detail view instead of jumping two levels up.

**Files created:** `src/components/dashboard/AssignmentDetailView.tsx` (new), `src/hooks/useAssignmentGradingStatuses.ts` (new)

**Files modified:** `src/components/dashboard/AssignmentList.tsx`, `src/components/dashboard/AuthGate.tsx`, `src/components/dashboard/DashboardApp.tsx`, `src/components/dashboard/HomeView.tsx`, `src/hooks/useAuth.ts`, `src/lib/cloudkit/queries.ts`, `src/pages/dashboard.astro`, `src/pages/index.astro`

**Commit:** 122c018

---

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

