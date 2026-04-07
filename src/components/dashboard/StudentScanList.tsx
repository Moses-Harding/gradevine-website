import { useMemo } from 'react';
import { useStudentScans, type StudentScanEntry } from '../../hooks/useStudentScans';
import type { QuestionAssignment } from '../../types/cloudkit';

interface StudentScanListProps {
  assignment: QuestionAssignment;
  onSelectScan: (entry: StudentScanEntry, allEntries: StudentScanEntry[]) => void;
  onBack: () => void;
}

type SortKey = 'name' | 'status' | 'score';

function statusLabel(status: StudentScanEntry['gradingStatus']): string {
  switch (status) {
    case 'graded': return 'Graded';
    case 'partial': return 'Partial';
    case 'ungraded': return 'Ungraded';
  }
}

function statusClass(status: StudentScanEntry['gradingStatus']): string {
  switch (status) {
    case 'graded': return 'status-graded';
    case 'partial': return 'status-partial';
    case 'ungraded': return 'status-ungraded';
  }
}

export function StudentScanList({ assignment, onSelectScan, onBack }: StudentScanListProps) {
  const { entries, isLoading, error, refresh } = useStudentScans(assignment.id);

  const totalPointsPossible = useMemo(
    () => assignment.questions.reduce((sum, q) => sum + q.pointValue, 0),
    [assignment.questions],
  );

  // Enrich entries with pointsPossible and sort by name
  const sortedEntries = useMemo(() => {
    return entries
      .map((e) => ({ ...e, pointsPossible: totalPointsPossible }))
      .sort((a, b) => {
        const nameA = a.student?.name ?? 'Unknown Student';
        const nameB = b.student?.name ?? 'Unknown Student';
        return nameA.localeCompare(nameB);
      });
  }, [entries, totalPointsPossible]);

  const gradedCount = sortedEntries.filter((e) => e.gradingStatus === 'graded').length;

  if (isLoading) {
    return (
      <div className="list-loading">
        <div className="spinner" />
        <p>Loading submissions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="list-error">
        <p>{error}</p>
        <button onClick={refresh} className="btn-secondary">Retry</button>
      </div>
    );
  }

  if (sortedEntries.length === 0) {
    return (
      <div className="list-empty">
        <p>No scans found for this assignment.</p>
        <button onClick={onBack} className="btn-secondary">Back to Assignments</button>
      </div>
    );
  }

  return (
    <div className="student-scan-list">
      <div className="list-header">
        <div>
          <h2>Submissions</h2>
          <p className="text-muted">
            {gradedCount} / {sortedEntries.length} graded
          </p>
        </div>
        <button onClick={refresh} className="btn-icon" title="Refresh">↻</button>
      </div>

      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${sortedEntries.length > 0 ? (gradedCount / sortedEntries.length) * 100 : 0}%` }}
        />
      </div>

      <div className="student-list">
        {sortedEntries.map((entry) => (
          <button
            key={entry.scan.id}
            className="student-row"
            onClick={() => onSelectScan(entry, sortedEntries)}
          >
            <div className="student-row-info">
              <span className="student-name">
                {entry.student?.name ?? 'Unknown Student'}
              </span>
              <span className={`status-badge ${statusClass(entry.gradingStatus)}`}>
                {statusLabel(entry.gradingStatus)}
              </span>
            </div>
            {entry.gradingStatus !== 'ungraded' && (
              <span className="student-score">
                {entry.pointsEarned} / {entry.pointsPossible}
              </span>
            )}
            <span className="student-row-arrow">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
