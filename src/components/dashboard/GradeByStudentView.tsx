/**
 * Self-contained Grade by Student view.
 * Loads student/scan data, then renders ScanViewer with internal navigation.
 */
import { useState, useMemo, useCallback } from 'react';
import { useStudentScans, type StudentScanEntry } from '../../hooks/useStudentScans';
import { ScanViewer } from './ScanViewer';
import type { QuestionAssignment } from '../../types/cloudkit';

interface GradeByStudentViewProps {
  assignment: QuestionAssignment;
  courseColor?: string;
  onBack: () => void;
}

export function GradeByStudentView({ assignment, courseColor, onBack }: GradeByStudentViewProps) {
  const { entries, isLoading, error, refresh } = useStudentScans(assignment.id);
  const [selectedEntry, setSelectedEntry] = useState<StudentScanEntry | null>(null);

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

  // Split: entries with uploaded pages vs without (matches iOS BUG-022 filter)
  const entriesWithPages = useMemo(() => sortedEntries.filter((e) => e.hasPages), [sortedEntries]);
  const entriesWithoutPages = useMemo(() => sortedEntries.filter((e) => !e.hasPages), [sortedEntries]);

  // Auto-select first entry once loaded
  const currentEntry = selectedEntry
    ? entriesWithPages.find((e) => e.scan.id === selectedEntry.scan.id) ?? entriesWithPages[0] ?? null
    : entriesWithPages[0] ?? null;

  const handleNavigate = useCallback((entry: StudentScanEntry) => {
    setSelectedEntry(entry);
  }, []);

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

  if (entriesWithPages.length === 0) {
    return (
      <div className="list-empty">
        <p>No scans found for this assignment.</p>
        <button onClick={onBack} className="btn-secondary">Back to Assignments</button>
      </div>
    );
  }

  return (
    <ScanViewer
      entry={currentEntry!}
      assignment={assignment}
      allEntries={entriesWithPages}
      entriesWithoutPages={entriesWithoutPages}
      courseColor={courseColor}
      onBack={onBack}
      onNavigate={handleNavigate}
    />
  );
}
