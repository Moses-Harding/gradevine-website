import { useMemo } from 'react';
import { useStudentScans, type StudentScanEntry } from '../../hooks/useStudentScans';
import type { QuestionAssignment } from '../../types/cloudkit';
import { CsvExport } from './CsvExport';

interface StudentScanListProps {
  assignment: QuestionAssignment;
  courseColor?: string;
  onSelectScan: (entry: StudentScanEntry, allEntries: StudentScanEntry[]) => void;
  onBack: () => void;
}

function statusLabel(status: StudentScanEntry['gradingStatus']): string {
  switch (status) {
    case 'graded': return 'GRADED';
    case 'partial': return 'PARTIAL';
    case 'ungraded': return 'UNGRADED';
  }
}

function statusClass(status: StudentScanEntry['gradingStatus']): string {
  switch (status) {
    case 'graded': return 'status-graded';
    case 'partial': return 'status-partial';
    case 'ungraded': return 'status-ungraded';
  }
}

function initial(name: string | undefined): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

export function StudentScanList({ assignment, courseColor, onSelectScan, onBack }: StudentScanListProps) {
  const { entries, isLoading, error, refresh } = useStudentScans(assignment.id);

  const totalPointsPossible = useMemo(
    () => assignment.questions.reduce((sum, q) => sum + q.pointValue, 0),
    [assignment.questions],
  );

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

  const pct = sortedEntries.length > 0 ? (gradedCount / sortedEntries.length) * 100 : 0;
  const avatarColor = courseColor ?? '#5002F7';

  return (
    <div className="student-scan-list">
      <div className="section-bar">
        <span>SUBMISSIONS &mdash; {sortedEntries.length} STUDENTS</span>
      </div>

      <div className="list-header-actions" style={{ marginBottom: 12 }}>
        <CsvExport assignment={assignment} entries={sortedEntries} />
        <button onClick={refresh} className="btn-icon" title="Refresh">&#x21bb;</button>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="student-list">
        {sortedEntries.map((entry) => (
          <button
            key={entry.scan.id}
            className="student-row"
            onClick={() => onSelectScan(entry, sortedEntries)}
          >
            <div className="student-avatar" style={{ background: avatarColor }}>
              {initial(entry.student?.name)}
            </div>
            <span className="student-name">
              {entry.student?.name ?? 'Unknown Student'}
            </span>
            <span className={`status-badge ${statusClass(entry.gradingStatus)}`}>
              {statusLabel(entry.gradingStatus)}
            </span>
            {entry.gradingStatus !== 'ungraded' && (
              <span className="student-score">
                {entry.pointsEarned} / {entry.pointsPossible}
              </span>
            )}
            <span className="student-row-arrow">&rarr;</span>
          </button>
        ))}
      </div>
    </div>
  );
}
