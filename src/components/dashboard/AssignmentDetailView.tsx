/**
 * Assignment detail / landing page.
 *
 * Shown when the user clicks an assignment card. Contains:
 *  - Header with title, course, metadata
 *  - Question list (label, prompt preview, point value)
 *  - Grade matrix (students × questions)
 *  - Analytics (class average, grade distribution, question performance)
 *  - Grade by Student / Grade by Question action buttons
 */

import { useMemo, useState } from 'react';
import { useStudentScans } from '../../hooks/useStudentScans';
import type { QuestionAssignment, AssignmentQuestion, Scan } from '../../types/cloudkit';

interface AssignmentDetailViewProps {
  assignment: QuestionAssignment;
  courseColor?: string;
  onGradeByStudent: () => void;
  onGradeByQuestion: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  return year === currentYear ? `${month} ${day}` : `${month} ${day}, ${year}`;
}

function pointsEarnedForScan(scan: Scan): number {
  let total = 0;
  for (const r of scan.questionResponses) {
    if (r.pointsEarned != null) total += r.pointsEarned;
  }
  return total;
}

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

function percentageScore(scan: Scan, questions: AssignmentQuestion[]): number | null {
  const totalPossible = questions.reduce((sum, q) => sum + q.pointValue, 0);
  if (totalPossible === 0) return null;
  const earned = pointsEarnedForScan(scan);
  return (earned / totalPossible) * 100;
}

function exportGradeMatrixCSV(
  entries: { student?: { name: string } | null; scan: Scan }[],
  questions: AssignmentQuestion[],
  gradeMatrix: Map<string, Map<string, number | null>>,
  totalPointsPossible: number,
  assignmentTitle: string,
) {
  const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = ['Student', ...questions.map((_, i) => `Q${i + 1}`), 'Total', 'Percentage'];
  const rows = entries.map((entry) => {
    const row = gradeMatrix.get(entry.scan.id);
    const earned = pointsEarnedForScan(entry.scan);
    const pct = totalPointsPossible > 0 ? ((earned / totalPointsPossible) * 100).toFixed(1) + '%' : '0%';
    return [
      escape(entry.student?.name ?? 'Unknown'),
      ...questions.map((q) => { const v = row?.get(q.id); return v != null ? String(v) : ''; }),
      `${earned}/${totalPointsPossible}`,
      pct,
    ];
  });
  const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${assignmentTitle.replace(/[^a-zA-Z0-9 ]/g, '').trim()} - Grades.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const STRUGGLING_THRESHOLD_KEY = 'gv-struggling-threshold';

export function AssignmentDetailView({
  assignment,
  courseColor,
  onGradeByStudent,
  onGradeByQuestion,
}: AssignmentDetailViewProps) {
  const { entries, isLoading, error } = useStudentScans(assignment.id);
  const chipColor = courseColor ?? '#5002F7';

  // Struggling students threshold — persisted in localStorage
  const [strugglingThreshold, setStrugglingThreshold] = useState<number>(() => {
    if (typeof window === 'undefined') return 60;
    const stored = window.localStorage.getItem(STRUGGLING_THRESHOLD_KEY);
    return stored ? parseInt(stored, 10) : 60;
  });

  const updateThreshold = (value: number) => {
    setStrugglingThreshold(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STRUGGLING_THRESHOLD_KEY, String(value));
    }
  };

  const questions = assignment.questions;
  const totalPointsPossible = useMemo(
    () => questions.reduce((sum, q) => sum + q.pointValue, 0),
    [questions],
  );

  // Entries sorted by student name
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const nameA = a.student?.name ?? 'Unknown Student';
      const nameB = b.student?.name ?? 'Unknown Student';
      return nameA.localeCompare(nameB);
    });
  }, [entries]);

  // Grade matrix: studentID → questionID → pointsEarned (null = ungraded)
  const gradeMatrix = useMemo(() => {
    const matrix = new Map<string, Map<string, number | null>>();
    for (const entry of sortedEntries) {
      const row = new Map<string, number | null>();
      for (const q of questions) {
        const resp = entry.scan.questionResponses.find((r) => r.questionID === q.id);
        row.set(q.id, resp?.pointsEarned ?? null);
      }
      matrix.set(entry.scan.id, row);
    }
    return matrix;
  }, [sortedEntries, questions]);

  // Analytics
  const analytics = useMemo(() => {
    const scans = sortedEntries.map((e) => e.scan);
    const fullyGraded = scans.filter((s) => isScanFullyGraded(s, questions));
    const partiallyGraded = scans.filter((s) =>
      s.questionResponses.some((r) => r.pointsEarned != null),
    );

    const percentScores = fullyGraded
      .map((s) => percentageScore(s, questions))
      .filter((x): x is number => x != null);

    const average =
      percentScores.length > 0
        ? percentScores.reduce((a, b) => a + b, 0) / percentScores.length
        : null;

    const sortedScores = [...percentScores].sort((a, b) => a - b);
    const median =
      sortedScores.length === 0
        ? null
        : sortedScores.length % 2 === 0
          ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
          : sortedScores[Math.floor(sortedScores.length / 2)];

    const highest = percentScores.length > 0 ? Math.max(...percentScores) : null;
    const lowest = percentScores.length > 0 ? Math.min(...percentScores) : null;

    // Grade distribution
    const distribution = {
      A: percentScores.filter((s) => s >= 90).length,
      B: percentScores.filter((s) => s >= 80 && s < 90).length,
      C: percentScores.filter((s) => s >= 70 && s < 80).length,
      D: percentScores.filter((s) => s >= 60 && s < 70).length,
      F: percentScores.filter((s) => s < 60).length,
    };

    // Per-question averages (percentage + avg points earned)
    const questionAverages = new Map<string, number | null>();
    const questionAvgPoints = new Map<string, number | null>();
    for (const q of questions) {
      const responses = partiallyGraded
        .flatMap((s) => s.questionResponses)
        .filter((r) => r.questionID === q.id && r.pointsEarned != null);
      if (responses.length === 0) {
        questionAverages.set(q.id, null);
        questionAvgPoints.set(q.id, null);
      } else {
        const totalEarned = responses.reduce((sum, r) => sum + (r.pointsEarned ?? 0), 0);
        const totalPossible = responses.length * q.pointValue;
        const avgEarned = totalEarned / responses.length;
        questionAverages.set(q.id, totalPossible > 0 ? (totalEarned / totalPossible) * 100 : null);
        questionAvgPoints.set(q.id, avgEarned);
      }
    }

    return {
      totalStudents: scans.length,
      fullyGradedCount: fullyGraded.length,
      partiallyGradedCount: partiallyGraded.length,
      average,
      median,
      highest,
      lowest,
      distribution,
      questionAverages,
      questionAvgPoints,
    };
  }, [sortedEntries, questions]);

  // Grade matrix filter — multiple can be active at once
  const [matrixFilters, setMatrixFilters] = useState({ graded: true, partial: true, ungraded: true });
  const [highlightMatrix, setHighlightMatrix] = useState(true);

  const toggleMatrixFilter = (key: keyof typeof matrixFilters) => {
    setMatrixFilters((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Don't allow all unchecked — re-enable the one being toggled
      if (!next.graded && !next.partial && !next.ungraded) return prev;
      return next;
    });
  };

  const filteredEntries = useMemo(() => {
    const allOn = matrixFilters.graded && matrixFilters.partial && matrixFilters.ungraded;
    if (allOn) return sortedEntries;
    return sortedEntries.filter((entry) => {
      const fullyGraded = isScanFullyGraded(entry.scan, questions);
      const hasAnyGrade = entry.scan.questionResponses.some((r) => r.pointsEarned != null);
      if (fullyGraded) return matrixFilters.graded;
      if (hasAnyGrade) return matrixFilters.partial;
      return matrixFilters.ungraded;
    });
  }, [sortedEntries, questions, matrixFilters]);

  // Struggling students: fully graded + percentage below threshold, sorted ascending
  const strugglingStudents = useMemo(() => {
    return sortedEntries
      .filter((entry) => isScanFullyGraded(entry.scan, questions))
      .map((entry) => {
        const pct = percentageScore(entry.scan, questions);
        const earned = pointsEarnedForScan(entry.scan);
        return { entry, pct: pct ?? 0, earned };
      })
      .filter(({ pct }) => pct < strugglingThreshold)
      .sort((a, b) => a.pct - b.pct);
  }, [sortedEntries, questions, strugglingThreshold]);

  return (
    <div className="adv-container">
      {/* Header */}
      <div className="adv-header" style={{ '--cc': chipColor } as React.CSSProperties}>
        <div className="adv-header-accent" />
        <div className="adv-header-content">
          <div className="adv-header-top">
            <div className="adv-header-meta">
              <span className="adv-course-name">{assignment.courseName}</span>
              <span className="adv-meta-sep">•</span>
              <span className="adv-meta-item">{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
              <span className="adv-meta-sep">•</span>
              <span className="adv-meta-item">{totalPointsPossible} points</span>
              <span className="adv-meta-sep">•</span>
              <span className="adv-meta-item">{assignment.scanIDs.length} scan{assignment.scanIDs.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <h1 className="adv-title">{assignment.title}</h1>
          <div className="adv-header-dates">
            <span className="adv-meta-item">Created {formatDate(assignment.createdDate)}</span>
            <span className="adv-meta-sep">•</span>
            <span className="adv-meta-item">Modified {formatDate(assignment.updatedDate)}</span>
          </div>
        </div>
        <div className="adv-header-actions">
          <button className="acard-action-btn" onClick={onGradeByStudent}>
            GRADE BY STUDENT
          </button>
          <button className="acard-action-btn acard-action-primary" onClick={onGradeByQuestion}>
            GRADE BY QUESTION
          </button>
        </div>
      </div>

      {/* Grading progress summary */}
      <div className="adv-progress-bar">
        <div className="adv-progress-stat">
          <span className="adv-progress-value">{analytics.fullyGradedCount}</span>
          <span className="adv-progress-label">FULLY GRADED</span>
        </div>
        <div className="adv-progress-stat">
          <span className="adv-progress-value">{analytics.partiallyGradedCount - analytics.fullyGradedCount}</span>
          <span className="adv-progress-label">IN PROGRESS</span>
        </div>
        <div className="adv-progress-stat">
          <span className="adv-progress-value">{analytics.totalStudents - analytics.partiallyGradedCount}</span>
          <span className="adv-progress-label">UNGRADED</span>
        </div>
        <div className="adv-progress-stat">
          <span className="adv-progress-value">{analytics.totalStudents}</span>
          <span className="adv-progress-label">TOTAL SCANS</span>
        </div>
      </div>

      {isLoading && (
        <div className="list-loading">
          <div className="spinner" />
          <p>Loading assignment data...</p>
        </div>
      )}

      {error && (
        <div className="list-error">
          <p>{error}</p>
        </div>
      )}

      {/* Row 1: Grade Distribution + Struggling Students */}
      {analytics.fullyGradedCount > 0 && (
        <div className="adv-widget-row">
          <Section title="GRADE DISTRIBUTION">
            <div className="adv-distribution-list">
              <GradeDistRow letter="A" range="90-100%" count={analytics.distribution.A} total={analytics.fullyGradedCount} />
              <GradeDistRow letter="B" range="80-89%" count={analytics.distribution.B} total={analytics.fullyGradedCount} />
              <GradeDistRow letter="C" range="70-79%" count={analytics.distribution.C} total={analytics.fullyGradedCount} />
              <GradeDistRow letter="D" range="60-69%" count={analytics.distribution.D} total={analytics.fullyGradedCount} />
              <GradeDistRow letter="F" range="<60%" count={analytics.distribution.F} total={analytics.fullyGradedCount} />
            </div>
          </Section>

          <Section
            title={`STRUGGLING STUDENTS (<${strugglingThreshold}%)`}
            trailing={
              <select
                className="adv-threshold-select"
                value={strugglingThreshold}
                onChange={(e) => updateThreshold(parseInt(e.target.value, 10))}
                onClick={(e) => e.stopPropagation()}
              >
                <option value={50}>50%</option>
                <option value={60}>60%</option>
                <option value={70}>70%</option>
              </select>
            }
          >
            {strugglingStudents.length === 0 ? (
              <p className="adv-empty-hint">
                No students scoring below {strugglingThreshold}%
              </p>
            ) : (
              <>
                <div className="adv-struggling-banner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>
                    {strugglingStudents.length} student{strugglingStudents.length !== 1 ? 's' : ''} need additional support
                  </span>
                </div>
                <div className="adv-struggling-list">
                  {strugglingStudents.map(({ entry, pct, earned }) => (
                    <button
                      key={entry.scan.id}
                      className="adv-struggling-row"
                      onClick={onGradeByStudent}
                    >
                      <div className="adv-struggling-info">
                        <div className="adv-struggling-name">
                          {entry.student?.name ?? 'Unknown'}
                        </div>
                        <div className="adv-struggling-meta">
                          <span className="adv-struggling-pct">{Math.round(pct)}%</span>
                          <span className="adv-meta-sep">•</span>
                          <span>{earned} / {totalPointsPossible} pts</span>
                        </div>
                      </div>
                      <span className="adv-struggling-chevron">›</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Section>
        </div>
      )}

      {/* Row 2: Summary Statistics + Average Points per Question */}
      <div className="adv-widget-row">
        <Section title="SUMMARY STATISTICS">
          <div className="adv-stat-list">
            <StatRow label="Total Students" value={`${analytics.totalStudents}`} />
            <StatRow
              label="Students Graded"
              value={
                analytics.totalStudents > 0
                  ? `${analytics.fullyGradedCount} (${Math.round((analytics.fullyGradedCount / analytics.totalStudents) * 100)}%)`
                  : '0 (0%)'
              }
            />
            <StatRow
              label="Average Score"
              value={analytics.average != null ? `${analytics.average.toFixed(1)}%` : 'N/A'}
              secondary={analytics.average == null}
            />
            <StatRow
              label="Median Score"
              value={analytics.median != null ? `${analytics.median.toFixed(1)}%` : 'N/A'}
              secondary={analytics.median == null}
            />
            <StatRow
              label="Highest Score"
              value={analytics.highest != null ? `${analytics.highest.toFixed(1)}%` : 'N/A'}
              secondary={analytics.highest == null}
            />
            <StatRow
              label="Lowest Score"
              value={analytics.lowest != null ? `${analytics.lowest.toFixed(1)}%` : 'N/A'}
              secondary={analytics.lowest == null}
            />
          </div>
        </Section>

        {questions.length > 0 && (
          <Section title="Average Points per Question">
            <div className="adv-ring-grid">
              {questions.map((q) => {
                const avgPoints = analytics.questionAvgPoints.get(q.id);
                const ratio =
                  avgPoints != null && q.pointValue > 0 ? avgPoints / q.pointValue : null;
                return (
                  <AvgPointsRing
                    key={q.id}
                    label={q.label}
                    avgPoints={avgPoints}
                    pointsPossible={q.pointValue}
                    ratio={ratio}
                  />
                );
              })}
            </div>
          </Section>
        )}
      </div>

      {/* Grade matrix */}
      {sortedEntries.length > 0 && questions.length > 0 && (
        <Section
          title="GRADE MATRIX"
          trailing={
            <div className="adv-matrix-filters">
              <div className="adv-var-switch-group">
                <button className={`adv-var-switch-btn ${matrixFilters.graded ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleMatrixFilter('graded'); }} style={{ '--sw-color': chipColor } as React.CSSProperties}>
                  <span className="adv-var-switch-track"><span className="adv-var-switch-knob" /></span>
                  Graded
                </button>
                <button className={`adv-var-switch-btn ${matrixFilters.partial ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleMatrixFilter('partial'); }} style={{ '--sw-color': chipColor } as React.CSSProperties}>
                  <span className="adv-var-switch-track"><span className="adv-var-switch-knob" /></span>
                  In Progress
                </button>
                <button className={`adv-var-switch-btn ${matrixFilters.ungraded ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleMatrixFilter('ungraded'); }} style={{ '--sw-color': chipColor } as React.CSSProperties}>
                  <span className="adv-var-switch-track"><span className="adv-var-switch-knob" /></span>
                  Ungraded
                </button>
                <button className={`adv-var-switch-btn ${highlightMatrix ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setHighlightMatrix((v) => !v); }} style={{ '--sw-color': chipColor } as React.CSSProperties}>
                  <span className="adv-var-switch-track"><span className="adv-var-switch-knob" /></span>
                  Highlight
                </button>
              </div>
              <div className="adv-var-divider" />
              <button className="adv-var-export-outlined" onClick={(e) => { e.stopPropagation(); exportGradeMatrixCSV(filteredEntries, questions, gradeMatrix, totalPointsPossible, assignment.title); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
            </div>
          }
        >
          {filteredEntries.length === 0 ? (
            <p className="adv-empty-hint">No students match this filter</p>
          ) : (
            <div className="adv-matrix-wrap">
              <table className="adv-matrix">
                <thead>
                  <tr>
                    <th className="adv-matrix-student-h">STUDENT</th>
                    {questions.map((q, i) => (
                      <th key={q.id} className="adv-matrix-q-h" title={q.prompt}>
                        Q{i + 1}
                      </th>
                    ))}
                    <th className="adv-matrix-total-h">TOTAL</th>
                  </tr>
                  <tr className="adv-matrix-avg-row">
                    <td className="adv-matrix-student adv-matrix-avg-label">AVG</td>
                    {questions.map((q) => {
                      const avg = analytics.questionAverages.get(q.id);
                      return (
                        <td key={q.id} className="adv-matrix-cell adv-matrix-avg">
                          {avg != null ? `${avg.toFixed(0)}%` : '—'}
                        </td>
                      );
                    })}
                    <td className="adv-matrix-cell adv-matrix-avg">
                      {analytics.average != null ? `${analytics.average.toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => {
                    const row = gradeMatrix.get(entry.scan.id);
                    const earned = pointsEarnedForScan(entry.scan);
                    const pct = totalPointsPossible > 0 ? (earned / totalPointsPossible) * 100 : 0;
                    return (
                      <tr key={entry.scan.id}>
                        <td className="adv-matrix-student">
                          {entry.student?.name ?? 'Unknown'}
                        </td>
                        {questions.map((q) => {
                          const val = row?.get(q.id);
                          let hlClass = '';
                          if (highlightMatrix) {
                            if (val == null) hlClass = '';
                            else if (val >= q.pointValue) hlClass = 'adv-hl-correct';
                            else if (val <= 0) hlClass = 'adv-hl-incorrect';
                            else hlClass = 'adv-hl-partial';
                          }
                          return (
                            <td key={q.id} className={`adv-matrix-cell ${hlClass}`}>
                              {val != null ? val : <span className="adv-matrix-empty">—</span>}
                            </td>
                          );
                        })}
                        <td className="adv-matrix-cell adv-matrix-total">
                          {earned} / {totalPointsPossible}
                          <span className="adv-matrix-total-pct">
                            {` (${pct.toFixed(0)}%)`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* Questions list */}
      <Section title="QUESTIONS">
        <div className="adv-questions-list">
          {questions.map((q, i) => (
            <div key={q.id} className="adv-question-row">
              <div className="adv-question-badge" style={{ background: chipColor }}>
                {i + 1}
              </div>
              <div className="adv-question-body">
                <div className="adv-question-label-row">
                  <span className="adv-question-label">{q.label}</span>
                  <span className="adv-question-pts">{q.pointValue} PTS</span>
                </div>
                <div className="adv-question-prompt">{q.prompt || <em>(no prompt)</em>}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  trailing,
}: {
  title: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="adv-section">
      <div className="adv-section-bar">
        <span>{title}</span>
        {trailing && <div className="adv-section-trailing">{trailing}</div>}
      </div>
      <div className="adv-section-body">{children}</div>
    </div>
  );
}

function StatRow({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: boolean;
}) {
  return (
    <div className="adv-stat-row">
      <span className="adv-stat-row-label">{label}</span>
      <span className={`adv-stat-row-value ${secondary ? 'adv-stat-row-secondary' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function GradeDistRow({
  letter,
  range,
  count,
  total,
}: {
  letter: 'A' | 'B' | 'C' | 'D' | 'F';
  range: string;
  count: number;
  total: number;
}) {
  const color = gradeColor(letter);
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="adv-dist-row">
      <span className="adv-dist-badge" style={{ background: color }}>{letter}</span>
      <span className="adv-dist-range">{range}</span>
      <div className="adv-dist-bar-track">
        <div
          className="adv-dist-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="adv-dist-count">{count}</span>
    </div>
  );
}

// Match iOS system colors (successGreen / primaryBlue / warningOrange / errorRed)
function gradeColor(grade: 'A' | 'B' | 'C' | 'D' | 'F'): string {
  switch (grade) {
    case 'A': return '#34C759'; // iOS successGreen
    case 'B': return '#007AFF'; // iOS primaryBlue
    case 'C': return '#FF9500'; // iOS warningOrange
    case 'D': return '#FFB04C'; // iOS warningOrange @ 0.7
    case 'F': return '#FF1C36'; // iOS errorRed
  }
}


// ---------------------------------------------------------------------------
// Ring chart — matches iOS AvgPointsRing (64×64 circle with arc + center text)
// ---------------------------------------------------------------------------

function ringColor(ratio: number | null): string {
  if (ratio == null) return '#c7c7cc';
  if (ratio >= 0.8) return '#34C759'; // iOS green
  if (ratio >= 0.5) return '#FF9500'; // iOS orange
  return '#FF1C36'; // iOS red
}

function AvgPointsRing({
  label,
  avgPoints,
  pointsPossible,
  ratio,
}: {
  label: string;
  avgPoints: number | null;
  pointsPossible: number;
  ratio: number | null;
}) {
  const size = 72;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedRatio = ratio != null ? Math.max(0, Math.min(1, ratio)) : 0;
  const dashArray = `${circumference * clampedRatio} ${circumference}`;
  const color = ringColor(ratio);

  return (
    <div className="adv-ring-cell">
      <div className="adv-ring-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e5e5ea"
            strokeWidth={strokeWidth}
          />
          {/* Arc */}
          {ratio != null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={dashArray}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-dasharray 0.4s ease' }}
            />
          )}
        </svg>
        <div className="adv-ring-center">
          {avgPoints != null ? (
            <>
              <div className="adv-ring-avg" style={{ color }}>
                {avgPoints.toFixed(1)}
              </div>
              <div className="adv-ring-possible">/{pointsPossible}</div>
            </>
          ) : (
            <div className="adv-ring-na">—</div>
          )}
        </div>
      </div>
      <div className="adv-ring-label">{label}</div>
    </div>
  );
}
