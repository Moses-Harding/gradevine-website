/**
 * Course-level analytics hook.
 *
 * Fetches scans for every assignment in the course, then computes:
 *  - Class average & median
 *  - Trend delta (last assignment vs previous)
 *  - Per-student averages, trends, and risk severity
 *  - At-risk student list
 *
 * Mirrors iOS AppStore+Analytics.swift / CourseAnalyticsView.swift.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { QuestionAssignment, Scan, Student } from '../types/cloudkit';
import { fetchScansForAssignment } from '../lib/cloudkit/queries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrendDirection = 'improving' | 'declining' | 'stable';
export type RiskSeverity = 'critical' | 'high' | 'medium';

export interface AssignmentScore {
  assignmentID: string;
  assignmentTitle: string;
  percentage: number;
}

export interface StudentTrend {
  studentID: string;
  name: string;
  overallAverage: number;
  scores: AssignmentScore[]; // chronological
  trendDirection: TrendDirection;
  trendDelta: number;
  riskSeverity: RiskSeverity | null;
}

export interface CourseAnalyticsSnapshot {
  classAverage: number;
  classMedian: number;
  studentCount: number;
  assignmentCount: number;
  trendDelta: number | null;
  studentTrends: StudentTrend[];
  atRiskStudents: StudentTrend[];
}

interface UseCourseAnalyticsReturn {
  analytics: CourseAnalyticsSnapshot | null;
  isLoading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCourseAnalytics(
  assignments: QuestionAssignment[],
  students: Student[],
  threshold = 60,
): UseCourseAnalyticsReturn {
  const [scansByAssignment, setScansByAssignment] = useState<Map<string, Scan[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable assignment ID list to avoid re-fetching on every render
  const assignmentIDs = useMemo(
    () => assignments.map((a) => a.id).sort().join(','),
    [assignments],
  );

  const load = useCallback(async () => {
    if (assignments.length === 0) {
      setScansByAssignment(new Map());
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        assignments.map((a) => fetchScansForAssignment(a.id)),
      );
      const map = new Map<string, Scan[]>();
      assignments.forEach((a, i) => map.set(a.id, results[i]));
      setScansByAssignment(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentIDs]);

  useEffect(() => {
    load();
  }, [load]);

  const analytics = useMemo(() => {
    if (assignments.length === 0 || scansByAssignment.size === 0) return null;
    return computeCourseAnalytics(assignments, students, scansByAssignment, threshold);
  }, [assignments, students, scansByAssignment, threshold]);

  return { analytics, isLoading, error };
}

// ---------------------------------------------------------------------------
// Computation (mirrors iOS AppStore+Analytics)
// ---------------------------------------------------------------------------

function computeCourseAnalytics(
  assignments: QuestionAssignment[],
  students: Student[],
  scansByAssignment: Map<string, Scan[]>,
  threshold: number,
): CourseAnalyticsSnapshot | null {
  // Sort assignments chronologically
  const sorted = [...assignments].sort(
    (a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime(),
  );

  // Build per-student scores across assignments
  const studentScoresMap = new Map<string, AssignmentScore[]>();
  const studentNameMap = new Map<string, string>();

  // Populate name map from students array
  for (const s of students) {
    studentNameMap.set(s.id, s.name);
  }

  // Per-assignment averages (for trend delta)
  const assignmentAverages: number[] = [];

  for (const assignment of sorted) {
    const scans = scansByAssignment.get(assignment.id) ?? [];
    const totalPossible = assignment.questions.reduce((sum, q) => sum + q.pointValue, 0);
    if (totalPossible === 0) continue;

    const assignmentScores: number[] = [];

    for (const scan of scans) {
      if (!scan.studentID) continue;

      // Check if fully graded
      const gradedIDs = new Set(
        scan.questionResponses
          .filter((r) => r.pointsEarned != null)
          .map((r) => r.questionID),
      );
      const isFullyGraded = assignment.questions.every((q) => gradedIDs.has(q.id));
      if (!isFullyGraded) continue;

      const earned = scan.questionResponses.reduce(
        (sum, r) => sum + (r.pointsEarned ?? 0), 0,
      );
      const pct = (earned / totalPossible) * 100;

      assignmentScores.push(pct);

      // Track per-student
      if (!studentNameMap.has(scan.studentID)) {
        studentNameMap.set(scan.studentID, 'Unknown Student');
      }
      const list = studentScoresMap.get(scan.studentID) ?? [];
      list.push({
        assignmentID: assignment.id,
        assignmentTitle: assignment.title,
        percentage: pct,
      });
      studentScoresMap.set(scan.studentID, list);
    }

    if (assignmentScores.length > 0) {
      const avg = assignmentScores.reduce((a, b) => a + b, 0) / assignmentScores.length;
      assignmentAverages.push(avg);
    }
  }

  // Build student trends
  const studentTrends: StudentTrend[] = [];
  for (const [studentID, scores] of studentScoresMap) {
    if (scores.length === 0) continue;
    const overallAverage = scores.reduce((sum, s) => sum + s.percentage, 0) / scores.length;
    const { direction, delta } = computeTrend(scores);
    const severity = classifyRisk(overallAverage, threshold);

    studentTrends.push({
      studentID,
      name: studentNameMap.get(studentID) ?? 'Unknown',
      overallAverage,
      scores,
      trendDirection: direction,
      trendDelta: delta,
      riskSeverity: severity,
    });
  }

  // Sort by average descending
  studentTrends.sort((a, b) => b.overallAverage - a.overallAverage);

  // At-risk students (have a severity)
  const atRiskStudents = studentTrends
    .filter((s) => s.riskSeverity != null)
    .sort((a, b) => a.overallAverage - b.overallAverage);

  // Class stats
  const allAverages = studentTrends.map((s) => s.overallAverage);
  const classAverage = allAverages.length > 0
    ? allAverages.reduce((a, b) => a + b, 0) / allAverages.length
    : 0;
  const classMedian = median(allAverages);

  // Trend delta: compare last two assignment averages
  const trendDelta = assignmentAverages.length >= 2
    ? assignmentAverages[assignmentAverages.length - 1] - assignmentAverages[assignmentAverages.length - 2]
    : null;

  return {
    classAverage,
    classMedian,
    studentCount: students.length,
    assignmentCount: assignments.length,
    trendDelta,
    studentTrends,
    atRiskStudents,
  };
}

function computeTrend(scores: AssignmentScore[]): { direction: TrendDirection; delta: number } {
  if (scores.length < 2) return { direction: 'stable', delta: 0 };
  const last = scores[scores.length - 1].percentage;
  const prev = scores[scores.length - 2].percentage;
  const delta = last - prev;
  if (Math.abs(delta) <= 2) return { direction: 'stable', delta };
  return { direction: delta > 0 ? 'improving' : 'declining', delta };
}

function classifyRisk(average: number, threshold: number): RiskSeverity | null {
  if (average < threshold * 0.67) return 'critical';
  if (average < threshold) return 'high';
  if (average < threshold * 1.17) return 'medium';
  return null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
