# Roadmap: GradeByQuestion iOS Parity

Closes the feature gaps between the iOS GradeByQuestionView and the web dashboard equivalent.

## Items

### WEB-IMP-001: Student Jump Selector
**Priority**: High
**Status**: Complete
**Description**: Add a searchable student jump modal (triggered by clicking the student name/position indicator). Shows all students with grade status icons and score. Allows one-tap jump to any student instead of sequential Prev/Next navigation.
**iOS Reference**: `StudentJumpSelectorView.swift`

### WEB-IMP-002: Keyword Highlighting in Transcription
**Priority**: High
**Status**: Complete
**Description**: Highlight matching keywords in the transcription text section. iOS highlights question keywords, assignment keywords, and contextual matches with distinct colors. Teachers rely on this to quickly assess answers.
**iOS Reference**: Keyword highlighting logic in `StudentResponseCard.swift`

### WEB-IMP-003: Blind Grading Toggle
**Priority**: Medium
**Status**: Complete
**Description**: Add a "Hide Student Names" toggle to the top bar. When enabled, replace student names with "Student 1", "Student 2", etc. for fair grading. Simple UI toggle — no data changes.
**iOS Reference**: `hideStudentNames` state in `GradeByQuestionView.swift`

### WEB-IMP-004: Scan Image Zoom
**Priority**: Medium
**Status**: Complete
**Description**: Wire up tap/click-to-zoom on scan images. State already exists in the component but the UI controls and overlay aren't connected. Show a full-screen lightbox overlay with the image at native resolution.
**iOS Reference**: `showZoomImage` state in `StudentResponseCard.swift`

### WEB-IMP-005: Multi-Page Scan Viewer
**Priority**: Medium
**Status**: Complete
**Description**: Add page navigation when a scan has multiple pages. Currently only shows the templatePage-matched page (or first page). Add prev/next page controls or a page strip below the image. Show "Page X of Y" indicator.
**iOS Reference**: `FullScanViewer.swift`

### WEB-IMP-006: Collapsible Sections
**Priority**: Low
**Status**: Not Started
**Description**: Make Question prompt, Transcription, Grading Key, and AI Evaluation sections collapsible (click header to toggle). Reduces visual noise when grading quickly. iOS uses DisclosureGroup for all sections.
**iOS Reference**: `isQuestionExpanded`, `isTranscriptionExpanded`, etc. in `StudentResponseCard.swift`

### WEB-IMP-007: Color Invert Toggle
**Priority**: Low
**Status**: Complete
**Description**: Add a "Color Invert" toggle for scan images to improve legibility of faint pencil writing on white paper. Apply CSS `filter: invert(1)` to the image element.
**iOS Reference**: `isColorInverted` state in `GradeByQuestionView.swift`
