# Completed Improvements

## WEB-IMP-001: Student Jump Selector
**Completed**: 2026-04-16
**Description**: Searchable student jump modal triggered by clicking student name or pressing J. Shows all students with grade status icons (graded checkmark, current arrow, ungraded circle) and scores. Supports search filtering and keyboard navigation (Enter to select single result, Esc to close). Respects blind grading mode.
**Files**: `GradeByQuestionView.tsx`, `dashboard.astro`

## WEB-IMP-002: Keyword Highlighting in Transcription
**Completed**: 2026-04-16
**Description**: Renders pre-computed keyword matches from iOS with color-coded highlights. Question keywords shown in yellow (#FFD24C) at 30% opacity (fuzzy: score-weighted). AI contextual matches shown as blue text on faint blue background with confidence-weighted opacity. Hover popovers on fuzzy and contextual matches display keyword name and confidence percentage. Assignment-level keyword path removed (dead after IMP-053 migration).
**Files**: `GradeByQuestionView.tsx`, `dashboard.astro`

## WEB-IMP-003: Blind Grading Toggle
**Completed**: 2026-04-16
**Description**: "BLIND" / "SHOW NAMES" toggle in GradeByQuestion top bar. Replaces student names with "Student 1", "Student 2" etc. Avatar shows # instead of initial. Also applies in student jump selector.
**Files**: `GradeByQuestionView.tsx`, `dashboard.astro`

## WEB-IMP-004: Scan Image Zoom
**Completed**: 2026-04-16
**Description**: Click-to-zoom lightbox overlay for scan images. Full-screen dark overlay with native-resolution image, page label, and close button. Respects color invert toggle. Closes on overlay click or Esc.
**Files**: `GradeByQuestionView.tsx`, `dashboard.astro`

## WEB-IMP-005: Multi-Page Scan Viewer
**Completed**: 2026-04-16
**Description**: Page prev/next navigation controls in the image panel header when a scan has multiple pages. Shows "PAGE X / Y" indicator. Defaults to template-matched page, allows manual override. Resets to default page on student/question change.
**Files**: `GradeByQuestionView.tsx`, `dashboard.astro`

## WEB-IMP-006: Collapsible Sections
**Completed**: 2026-04-16
**Description**: Question prompt, Transcription, Grading Key, and AI Evaluation sections in the grading panel are now collapsible via clickable headers with right-aligned rotating chevron (❯). Grading Key collapsed by default; others expanded. Reduces visual noise when grading quickly.
**Files**: `GradeByQuestionView.tsx`, `dashboard.astro`

## WEB-IMP-007: Color Invert Toggle
**Completed**: 2026-04-16
**Description**: "INVERT" / "NORMAL" toggle in GradeByQuestion top bar. Applies CSS `filter: invert(1)` to scan images for improved legibility of faint pencil writing. Also applies in zoom lightbox.
**Files**: `GradeByQuestionView.tsx`, `dashboard.astro`
