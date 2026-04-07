import { useAssignments } from '../../hooks/useAssignments';
import type { QuestionAssignment, Course } from '../../types/cloudkit';

interface AssignmentListProps {
  course: Course;
  onSelect: (assignment: QuestionAssignment) => void;
  onGradeByQuestion: (assignment: QuestionAssignment) => void;
  onBack: () => void;
}

function totalPoints(assignment: QuestionAssignment): number {
  return assignment.questions.reduce((sum, q) => sum + q.pointValue, 0);
}

function courseColor(colorHex: string | null): string {
  if (!colorHex) return 'var(--color-purple)';
  return colorHex.startsWith('#') ? colorHex : `#${colorHex}`;
}

export function AssignmentList({ course, onSelect, onGradeByQuestion, onBack }: AssignmentListProps) {
  const { assignments, isLoading, error, refresh } = useAssignments(course.id);
  const color = courseColor(course.colorHex);

  if (isLoading) {
    return (
      <div className="list-loading">
        <div className="spinner" />
        <p>Loading assignments...</p>
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

  if (assignments.length === 0) {
    return (
      <div className="list-empty">
        <p>No assignments found for {course.name}.</p>
        <button onClick={onBack} className="btn-secondary">Back to Courses</button>
      </div>
    );
  }

  return (
    <div className="assignment-list">
      <div className="section-bar">
        <span>{course.name.toUpperCase()}</span>
        <span className="section-bar-accent" style={{ background: color }} />
      </div>
      <div className="section-label">{assignments.length} ASSIGNMENT{assignments.length !== 1 ? 'S' : ''}</div>

      <div className="assignment-grid">
        {assignments.map((a) => (
          <div
            key={a.id}
            className="assignment-card assignment-card-static"
            style={{ '--assign-color': color } as React.CSSProperties}
          >
            <div className="assignment-header">
              <span className="assignment-name">{a.title}</span>
              <span className="assignment-scan-count">{a.scanIDs.length}</span>
            </div>
            <div className="assignment-body">
              <div className="assignment-meta">
                <span className="assign-meta-pill">{a.questions.length} Q</span>
                <span className="assign-meta-pill">{totalPoints(a)} PTS</span>
                <span className="assign-meta-pill">{a.scanIDs.length} SCANS</span>
              </div>
              <div className="assignment-actions">
                <button
                  className="assignment-action-btn"
                  style={{ '--assign-color': color } as React.CSSProperties}
                  onClick={() => onSelect(a)}
                >
                  BY STUDENT
                </button>
                <button
                  className="assignment-action-btn"
                  style={{ '--assign-color': color } as React.CSSProperties}
                  onClick={() => onGradeByQuestion(a)}
                >
                  BY QUESTION
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
