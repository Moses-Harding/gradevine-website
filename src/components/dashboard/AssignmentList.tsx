import { useAssignments } from '../../hooks/useAssignments';
import type { QuestionAssignment, Course } from '../../types/cloudkit';

interface AssignmentListProps {
  course: Course;
  onSelect: (assignment: QuestionAssignment) => void;
  onBack: () => void;
}

function totalPoints(assignment: QuestionAssignment): number {
  return assignment.questions.reduce((sum, q) => sum + q.pointValue, 0);
}

export function AssignmentList({ course, onSelect, onBack }: AssignmentListProps) {
  const { assignments, isLoading, error, refresh } = useAssignments(course.id);

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
      <div className="list-header">
        <h2>Assignments</h2>
        <button onClick={refresh} className="btn-icon" title="Refresh">↻</button>
      </div>

      <div className="assignment-grid">
        {assignments.map((a) => (
          <button key={a.id} className="assignment-card" onClick={() => onSelect(a)}>
            <div className="assignment-card-body">
              <h3>{a.title}</h3>
              <div className="assignment-meta">
                <span>{a.questions.length} question{a.questions.length !== 1 ? 's' : ''}</span>
                <span className="meta-dot" />
                <span>{totalPoints(a)} pts</span>
                <span className="meta-dot" />
                <span>{a.scanIDs.length} scan{a.scanIDs.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <span className="assignment-card-arrow">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
