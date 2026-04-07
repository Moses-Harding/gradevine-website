/**
 * Typed query helpers for fetching GradeVine records from CloudKit.
 *
 * Each function queries via CloudKit JS and converts raw records
 * into typed TypeScript interfaces.
 */

import type { Course, Student, QuestionAssignment, Scan, ScanPage, AssignmentQuestion, ScanQuestionResponse } from '../../types/cloudkit';
import type { CKJSRecord } from './auth';
import { RecordTypes } from './config';
import {
  queryRecords,
  lookupRecords,
  stringField,
  numberField,
  stringListField,
  timestampField,
  assetUrl,
  type QueryFilter,
} from './rest';
import { getCache, setCache } from './cache';

// ---------------------------------------------------------------------------
// Record → Model converters
// ---------------------------------------------------------------------------

function parseCourse(record: CKJSRecord): Course {
  return {
    id: record.recordName,
    name: stringField(record, 'name') ?? '',
    studentIDs: stringListField(record, 'studentIDs'),
    colorHex: stringField(record, 'colorHex'),
    isArchived: (numberField(record, 'isArchived') ?? 0) === 1,
    archivedDate: timestampField(record, 'archivedDate'),
    hasImportedFromRoster: (numberField(record, 'hasImportedFromRoster') ?? 0) === 1,
    customSections: stringListField(record, 'customSections'),
  };
}

function parseStudent(record: CKJSRecord): Student {
  return {
    id: record.recordName,
    name: stringField(record, 'name') ?? '',
    courseIDs: stringListField(record, 'courseIDs'),
    scanIDs: stringListField(record, 'scanIDs'),
    alternateNames: stringListField(record, 'alternateNames'),
    averageScore: numberField(record, 'averageScore'),
    colorHex: stringField(record, 'colorHex'),
    courseSections: parseJsonField<Record<string, string>>(record, 'courseSections') ?? {},
    isPlaceholder: (numberField(record, 'isPlaceholder') ?? 0) === 1,
    isArchived: (numberField(record, 'isArchived') ?? 0) === 1,
    archivedDate: timestampField(record, 'archivedDate'),
    createdDate: timestampField(record, 'createdDate') ?? new Date().toISOString(),
  };
}

function parseAssignment(record: CKJSRecord): QuestionAssignment {
  return {
    id: record.recordName,
    title: stringField(record, 'title') ?? '',
    courseName: stringField(record, 'courseName') ?? '',
    courseID: stringField(record, 'courseID'),
    keywords: stringListField(record, 'keywords'),
    scanIDs: stringListField(record, 'scanIDs'),
    questions: parseBinaryJsonField<AssignmentQuestion[]>(record, 'questionsData') ?? [],
    totalCreditsUsed: numberField(record, 'totalCreditsUsed') ?? 0,
    templatePageCount: numberField(record, 'templatePageCount'),
    isArchived: (numberField(record, 'isArchived') ?? 0) === 1,
    archivedDate: timestampField(record, 'archivedDate'),
    createdDate: timestampField(record, 'createdDate') ?? new Date().toISOString(),
    updatedDate: timestampField(record, 'updatedDate') ?? new Date().toISOString(),
    description: stringField(record, 'description'),
    criteria: stringField(record, 'criteria') ?? '',
  };
}

function parseScan(record: CKJSRecord): Scan {
  return {
    id: record.recordName,
    assignmentID: stringField(record, 'assignmentID') ?? '',
    studentID: stringField(record, 'studentID'),
    courseID: stringField(record, 'courseID'),
    questionResponses: parseBinaryJsonField<ScanQuestionResponse[]>(record, 'questionResponsesData') ?? [],
    feedback: stringField(record, 'feedback'),
    lastModifiedDate: timestampField(record, 'lastModifiedDate'),
    createdDate: timestampField(record, 'createdDate') ?? new Date().toISOString(),
    updatedDate: timestampField(record, 'updatedDate') ?? new Date().toISOString(),
    isTemplate: (numberField(record, 'isTemplate') ?? 0) === 1,
    recordChangeTag: record.recordChangeTag ?? '',
  };
}

function parseScanPage(record: CKJSRecord): ScanPage {
  const filename = stringField(record, 'imageFilename') ?? `${record.recordName}.jpg`;
  const imgUrl = assetUrl(record, 'imageAsset', filename);
  return {
    id: record.recordName,
    pageNumber: numberField(record, 'pageNumber') ?? 1,
    imageFilename: filename,
    transcript: stringField(record, 'transcript') ?? '',
    keywordsFound: stringListField(record, 'keywordsFound'),
    score: numberField(record, 'score'),
    totalPoints: numberField(record, 'totalPoints'),
    detectedTemplatePageNumber: numberField(record, 'detectedTemplatePageNumber'),
    imageUrl: imgUrl,
  };
}

/** Parse a JSON-encoded string field into a typed object. */
function parseJsonField<T>(record: CKJSRecord, fieldName: string): T | null {
  const raw = stringField(record, fieldName);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Parse a binary (Data/BYTES) field that contains JSON.
 * CloudKit JS delivers BYTES fields as base64-encoded strings.
 * The iOS app encodes these via JSONEncoder → Data → CKRecord.
 */
function parseBinaryJsonField<T>(record: CKJSRecord, fieldName: string): T | null {
  const field = record.fields[fieldName];
  if (!field || field.value == null) return null;

  try {
    let jsonString: string;
    const val = field.value;

    if (typeof val === 'string') {
      // Base64-encoded bytes
      jsonString = atob(val);
    } else if (val instanceof ArrayBuffer || val instanceof Uint8Array) {
      const bytes = val instanceof Uint8Array ? val : new Uint8Array(val);
      jsonString = new TextDecoder().decode(bytes);
    } else {
      // Might already be parsed by CloudKit JS
      return val as T;
    }

    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.warn(`Failed to parse binary JSON field "${fieldName}":`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public query API
// ---------------------------------------------------------------------------

/**
 * Fetch all courses for the signed-in teacher.
 */
export async function fetchCourses(forceRefresh = false): Promise<Course[]> {
  const cacheKey = 'courses';
  if (!forceRefresh) {
    const cached = getCache<Course[]>(cacheKey);
    if (cached) return cached;
  }

  const records = await queryRecords(RecordTypes.Course);
  const courses = records.map(parseCourse).filter((c) => !c.isArchived);
  setCache(cacheKey, courses);
  return courses;
}

/**
 * Fetch students for a given course.
 */
export async function fetchStudentsForCourse(
  courseID: string,
  forceRefresh = false,
): Promise<Student[]> {
  const cacheKey = `students-${courseID}`;
  if (!forceRefresh) {
    const cached = getCache<Student[]>(cacheKey);
    if (cached) return cached;
  }

  const allStudents = await fetchAllStudents(forceRefresh);
  const courseStudents = allStudents.filter(
    (s) => s.courseIDs.includes(courseID) && !s.isArchived,
  );
  setCache(cacheKey, courseStudents);
  return courseStudents;
}

/**
 * Fetch all students (cached).
 */
export async function fetchAllStudents(forceRefresh = false): Promise<Student[]> {
  const cacheKey = 'all-students';
  if (!forceRefresh) {
    const cached = getCache<Student[]>(cacheKey);
    if (cached) return cached;
  }

  const records = await queryRecords(RecordTypes.Student);
  const students = records.map(parseStudent);
  setCache(cacheKey, students);
  return students;
}

/**
 * Fetch assignments for a given course.
 */
export async function fetchAssignmentsForCourse(
  courseID: string,
  forceRefresh = false,
): Promise<QuestionAssignment[]> {
  const cacheKey = `assignments-${courseID}`;
  if (!forceRefresh) {
    const cached = getCache<QuestionAssignment[]>(cacheKey);
    if (cached) return cached;
  }

  const filters: QueryFilter[] = [
    {
      fieldName: 'courseID',
      comparator: 'EQUALS',
      fieldValue: { value: courseID, type: 'STRING' },
    },
  ];

  const records = await queryRecords(RecordTypes.Assignment, filters);
  const assignments = records.map(parseAssignment).filter((a) => !a.isArchived);
  setCache(cacheKey, assignments);
  return assignments;
}

/**
 * Fetch scans for a given assignment.
 */
export async function fetchScansForAssignment(
  assignmentID: string,
  forceRefresh = false,
): Promise<Scan[]> {
  const cacheKey = `scans-${assignmentID}`;
  if (!forceRefresh) {
    const cached = getCache<Scan[]>(cacheKey);
    if (cached) return cached;
  }

  const filters: QueryFilter[] = [
    {
      fieldName: 'assignmentID',
      comparator: 'EQUALS',
      fieldValue: { value: assignmentID, type: 'STRING' },
    },
  ];

  const records = await queryRecords(RecordTypes.Scan, filters);
  const scans = records.map(parseScan).filter((s) => !s.isTemplate);
  setCache(cacheKey, scans);
  return scans;
}

/**
 * Fetch scan pages for a given scan.
 */
export async function fetchScanPages(
  scanID: string,
  forceRefresh = false,
): Promise<ScanPage[]> {
  const cacheKey = `scanpages-${scanID}`;
  if (!forceRefresh) {
    const cached = getCache<ScanPage[]>(cacheKey);
    if (cached) return cached;
  }

  const filters: QueryFilter[] = [
    {
      fieldName: 'scanID',
      comparator: 'EQUALS',
      fieldValue: { value: scanID, type: 'STRING' },
    },
  ];

  const records = await queryRecords(RecordTypes.ScanPage, filters);
  const pages = records.map(parseScanPage).sort((a, b) => a.pageNumber - b.pageNumber);
  setCache(cacheKey, pages);
  return pages;
}

/**
 * Fetch specific records by ID.
 */
export async function fetchRecordsByID<T>(
  ids: string[],
  parser: (record: CKJSRecord) => T,
): Promise<T[]> {
  const records = await lookupRecords(ids);
  return records.map(parser);
}
