/**
 * TypeScript interfaces matching GradeVine's CloudKit record types.
 *
 * These mirror the Swift models in the iOS app. Only fields relevant to
 * the web grading dashboard are included — device-local or sync-internal
 * fields (cloudKitStatus, storageLocation, etc.) are omitted.
 *
 * CloudKit record type names: "Course", "Student", "Assignment", "Scan", "ScanPage"
 * All records live in the private database, zone "GradeVineSync".
 */

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

export interface Course {
  id: string; // UUID
  name: string;
  studentIDs: string[]; // UUID[]
  colorHex: string | null;
  isArchived: boolean;
  archivedDate: string | null; // ISO 8601
  hasImportedFromRoster: boolean;
  customSections: string[];
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export interface Student {
  id: string;
  name: string;
  courseIDs: string[];
  scanIDs: string[];
  alternateNames: string[];
  averageScore: number | null;
  colorHex: string | null;
  courseSections: Record<string, string>; // courseID → section name
  isPlaceholder: boolean;
  isArchived: boolean;
  archivedDate: string | null;
  createdDate: string;
}

// ---------------------------------------------------------------------------
// Assignment (QuestionAssignment)
// ---------------------------------------------------------------------------

export interface AssignmentQuestion {
  id: string;
  label: string;
  prompt: string;
  pointValue: number;
  templatePageNumber: number | null;
  gradingKey: string | null;
  gradingKeyLastModified: string | null;
}

export interface QuickFeedbackItem {
  id: string;
  questionID: string;
  text: string;
  createdDate: string;
  lastModifiedDate: string;
  lastUsedDate: string | null;
}

export interface QuestionAssignment {
  id: string;
  title: string;
  courseName: string;
  courseID: string | null;
  keywords: string[];
  scanIDs: string[];
  questions: AssignmentQuestion[];
  totalCreditsUsed: number;
  templatePageCount: number | null;
  isArchived: boolean;
  archivedDate: string | null;
  createdDate: string;
  updatedDate: string;
  description: string | null;
  criteria: string;
  quickFeedback: QuickFeedbackItem[];
}

// ---------------------------------------------------------------------------
// ScanQuestionResponse (nested in Scan)
// ---------------------------------------------------------------------------

export interface AIEvaluation {
  status: 'correct' | 'partial' | 'incorrect' | 'unableToDetermine';
  confidence: number; // 0.0–1.0
  reasoning: string;
  evaluatedAt: string;
}

export interface ScanQuestionResponseFragment {
  id: string;
  pageID: string;
  text: string;
  createdAt: number | string; // Swift timeIntervalSinceReferenceDate or ISO string
  [key: string]: unknown; // Preserve unknown fields from iOS
}

export interface ScanQuestionResponse {
  id: string;
  questionID: string;
  questionLabel: string;
  fragments: ScanQuestionResponseFragment[];
  feedback: string | null;
  pointsEarned: number | null; // null = ungraded
  gradedAt: number | null; // Swift timeIntervalSinceReferenceDate
  aiEvaluation: AIEvaluation | null;
  lastUpdated: number | string; // Swift timeIntervalSinceReferenceDate
  pageNumber: number | null;
  [key: string]: unknown; // Preserve unknown fields from iOS (contextualMatches, keywordMatches, etc.)
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

export interface Scan {
  id: string;
  assignmentID: string;
  studentID: string | null; // null = unmatched
  courseID: string | null;
  questionResponses: ScanQuestionResponse[];
  feedback: string | null;
  lastModifiedDate: string | null;
  createdDate: string;
  updatedDate: string;
  isTemplate: boolean;
  /** CloudKit record change tag for conflict detection on save */
  recordChangeTag: string;
}

// ---------------------------------------------------------------------------
// ScanPage
// ---------------------------------------------------------------------------

export interface ScanPage {
  id: string;
  pageNumber: number; // 1-indexed
  imageFilename: string;
  transcript: string;
  keywordsFound: string[];
  score: number | null;
  totalPoints: number | null;
  detectedTemplatePageNumber: number | null;
  /** CKAsset download URL for the page image (may expire) */
  imageUrl: string | null;
}

// ---------------------------------------------------------------------------
// CloudKit REST API types
// ---------------------------------------------------------------------------

/** CloudKit REST API record wrapper */
export interface CKRecord {
  recordName: string;
  recordType: string;
  recordChangeTag: string;
  fields: Record<string, CKFieldValue>;
}

export type CKFieldValue =
  | { value: string; type: 'STRING' }
  | { value: number; type: 'INT64' | 'DOUBLE' }
  | { value: number; type: 'TIMESTAMP' } // milliseconds since epoch
  | { value: string[]; type: 'STRING_LIST' }
  | { value: CKAssetValue; type: 'ASSETID' }
  | { value: CKReferenceValue; type: 'REFERENCE' }
  | { value: unknown; type: string };

export interface CKAssetValue {
  fileChecksum: string;
  size: number;
  downloadURL: string;
}

export interface CKReferenceValue {
  recordName: string;
  action: string;
}

export interface CKQueryResponse {
  records: CKRecord[];
  continuationMarker?: string;
}

export interface CKRecordLookupResponse {
  records: CKRecord[];
}

export interface CKErrorResponse {
  uuid: string;
  serverErrorCode: string;
  reason: string;
}
