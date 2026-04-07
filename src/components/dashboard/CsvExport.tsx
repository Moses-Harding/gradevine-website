import { useCallback } from 'react';
import type { QuestionAssignment } from '../../types/cloudkit';
import type { StudentScanEntry } from '../../hooks/useStudentScans';

interface CsvExportProps {
  assignment: QuestionAssignment;
  entries: StudentScanEntry[];
}

export function CsvExport({ assignment, entries }: CsvExportProps) {
  const handleExport = useCallback(() => {
    const questions = assignment.questions;
    const totalPossible = questions.reduce((sum, q) => sum + q.pointValue, 0);

    // Header row
    const headers = [
      'Student',
      ...questions.map((q) => `${q.label} (/${q.pointValue})`),
      `Total (/${totalPossible})`,
      'Percentage',
      'Feedback',
    ];

    // Data rows
    const rows = entries.map((entry) => {
      const name = entry.student?.name ?? 'Unknown Student';
      const questionScores = questions.map((q) => {
        const response = entry.scan.questionResponses.find((r) => r.questionID === q.id);
        return response?.pointsEarned != null ? String(response.pointsEarned) : '';
      });
      const total = entry.scan.questionResponses.reduce(
        (sum, r) => sum + (r.pointsEarned ?? 0),
        0,
      );
      const hasAnyGrade = entry.scan.questionResponses.some((r) => r.pointsEarned != null);
      const pct = hasAnyGrade && totalPossible > 0
        ? `${Math.round((total / totalPossible) * 100)}%`
        : '';
      const feedback = entry.scan.feedback ?? '';

      return [name, ...questionScores, hasAnyGrade ? String(total) : '', pct, csvEscape(feedback)];
    });

    // Sort by name
    rows.sort((a, b) => a[0].localeCompare(b[0]));

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(','))
      .join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${assignment.title} - Grades.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [assignment, entries]);

  return (
    <button onClick={handleExport} className="btn-secondary btn-sm" title="Export grades as CSV">
      Export CSV
    </button>
  );
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
