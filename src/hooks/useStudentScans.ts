import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Scan, Student } from '../types/cloudkit';
import { fetchScansForAssignment, fetchAllStudents, fetchScanPages } from '../lib/cloudkit/queries';

export interface StudentScanEntry {
  scan: Scan;
  student: Student | null; // null = unmatched
  gradingStatus: 'ungraded' | 'partial' | 'graded';
  pointsEarned: number;
  pointsPossible: number;
  hasPages: boolean; // false = scan exists but no uploaded work
}

interface UseStudentScansReturn {
  entries: StudentScanEntry[];
  students: Student[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

function computeGradingStatus(
  scan: Scan,
): { status: 'ungraded' | 'partial' | 'graded'; earned: number; possible: number } {
  const responses = scan.questionResponses;
  if (responses.length === 0) return { status: 'ungraded', earned: 0, possible: 0 };

  let graded = 0;
  let earned = 0;
  // We don't have pointValue from the scan, so just count graded responses
  for (const r of responses) {
    if (r.pointsEarned != null) {
      graded++;
      earned += r.pointsEarned;
    }
  }

  const status = graded === 0 ? 'ungraded' : graded === responses.length ? 'graded' : 'partial';
  return { status, earned, possible: 0 }; // possible filled by caller with assignment data
}

export function useStudentScans(assignmentID: string | null): UseStudentScansReturn {
  const [scans, setScans] = useState<Scan[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scanPageCounts, setScanPageCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!assignmentID) return;
      setIsLoading(true);
      setError(null);
      try {
        const [scanData, studentData] = await Promise.all([
          fetchScansForAssignment(assignmentID, forceRefresh),
          fetchAllStudents(forceRefresh),
        ]);
        setScans(scanData);
        setStudents(studentData);

        // Batch-check page existence for all scans (also prefetches for grading)
        const pageCounts = new Map<string, number>();
        await Promise.all(
          scanData.map(async (scan) => {
            try {
              const pages = await fetchScanPages(scan.id, false);
              pageCounts.set(scan.id, pages.length);
            } catch {
              pageCounts.set(scan.id, 0);
            }
          }),
        );
        setScanPageCounts(pageCounts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load submissions');
      } finally {
        setIsLoading(false);
      }
    },
    [assignmentID],
  );

  useEffect(() => {
    setScans([]);
    load();
  }, [load]);

  const entries = useMemo(() => {
    const studentMap = new Map(students.map((s) => [s.id, s]));

    return scans.map((scan): StudentScanEntry => {
      const student = scan.studentID ? studentMap.get(scan.studentID) ?? null : null;
      const { status, earned } = computeGradingStatus(scan);
      return {
        scan,
        student,
        gradingStatus: status,
        pointsEarned: earned,
        pointsPossible: 0,
        hasPages: (scanPageCounts.get(scan.id) ?? 0) > 0,
      };
    });
  }, [scans, students, scanPageCounts]);

  return { entries, students, isLoading, error, refresh: useCallback(() => load(true), [load]) };
}
