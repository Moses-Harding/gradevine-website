/**
 * Computes the grading status for a list of assignments by fetching their
 * scans and checking how many are fully graded.
 *
 * Results: 'new' (no scans), 'progress' (scans exist but not all graded),
 * 'done' (all scans fully graded), 'loading' (still fetching).
 *
 * Scans are cached per-assignment via fetchScansForAssignment, so subsequent
 * renders / navigation are free.
 */

import { useState, useEffect } from 'react';
import { fetchScansForAssignment } from '../lib/cloudkit/queries';
import type { QuestionAssignment, Scan, AssignmentQuestion } from '../types/cloudkit';

export type AssignmentGradingStatus = 'new' | 'progress' | 'done' | 'loading';

function isScanFullyGraded(scan: Scan, questions: AssignmentQuestion[]): boolean {
  if (questions.length === 0) return false;
  const gradedIDs = new Set(
    scan.questionResponses.filter((r) => r.pointsEarned != null).map((r) => r.questionID),
  );
  for (const q of questions) {
    if (!gradedIDs.has(q.id)) return false;
  }
  return true;
}

function deriveStatus(
  assignment: QuestionAssignment,
  scans: Scan[],
): AssignmentGradingStatus {
  if (assignment.scanIDs.length === 0) return 'new';
  if (scans.length === 0) return 'progress';
  const allFullyGraded = scans.every((s) => isScanFullyGraded(s, assignment.questions));
  return allFullyGraded ? 'done' : 'progress';
}

export function useAssignmentGradingStatuses(
  assignments: QuestionAssignment[],
): Map<string, AssignmentGradingStatus> {
  const [statuses, setStatuses] = useState<Map<string, AssignmentGradingStatus>>(new Map());

  // Key changes whenever the list of assignment IDs changes
  const assignmentKey = assignments.map((a) => a.id).join(',');

  useEffect(() => {
    let cancelled = false;

    // Seed immediately: any assignment with 0 scans is 'new', others start as 'loading'
    const initial = new Map<string, AssignmentGradingStatus>();
    for (const a of assignments) {
      initial.set(a.id, a.scanIDs.length === 0 ? 'new' : 'loading');
    }
    setStatuses(initial);

    // Load scans for each assignment in parallel
    async function loadAll() {
      const toLoad = assignments.filter((a) => a.scanIDs.length > 0);
      const results = await Promise.all(
        toLoad.map(async (a) => {
          try {
            const scans = await fetchScansForAssignment(a.id);
            return { id: a.id, status: deriveStatus(a, scans) };
          } catch {
            return { id: a.id, status: 'progress' as AssignmentGradingStatus };
          }
        }),
      );

      if (cancelled) return;
      setStatuses((prev) => {
        const next = new Map(prev);
        for (const r of results) next.set(r.id, r.status);
        return next;
      });
    }

    loadAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentKey]);

  return statuses;
}
