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

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
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
      <div className="section-label">
        {assignments.length} ASSIGNMENT{assignments.length !== 1 ? 'S' : ''}
      </div>

      <div className="acard-list">
        {assignments.map((a) => {
          const scanCount = a.scanIDs.length;
          const questionCount = a.questions.length;
          const points = totalPoints(a);
          const hasScanData = scanCount > 0;

          return (
            <div
              key={a.id}
              className={`acard ${!hasScanData ? 'acard-empty' : ''}`}
              style={{ '--cc': color } as React.CSSProperties}
            >
              {/* Header: accent + title + actions */}
              <div className="acard-header">
                <div className="acard-header-left">
                  <div className="acard-accent" />
                  <div className="acard-title-block">
                    <div className="acard-name">{a.title}</div>
                    <div className="acard-sub">
                      {questionCount} question{questionCount !== 1 ? 's' : ''}
                      {' · '}{points} points
                      {' · '}{scanCount} scan{scanCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div className="acard-header-right">
                  {hasScanData ? (
                    <>
                      <button
                        className="acard-action-btn"
                        onClick={() => onSelect(a)}
                      >
                        BY STUDENT
                      </button>
                      <button
                        className="acard-action-btn acard-action-primary"
                        onClick={() => onGradeByQuestion(a)}
                      >
                        BY QUESTION
                      </button>
                    </>
                  ) : (
                    <span className="acard-empty-label">NO SCANS YET</span>
                  )}
                </div>
              </div>

              {/* Body: progress + stats (only if scans exist) */}
              {hasScanData && (
                <div className="acard-body">
                  <div className="acard-stats-row">
                    <span className="acard-mini-stat">
                      SCANS <strong>{scanCount}</strong>
                    </span>
                    <span className="acard-mini-stat">
                      QUESTIONS <strong>{questionCount}</strong>
                    </span>
                    <span className="acard-mini-stat">
                      POINTS <strong>{points}</strong>
                    </span>
                    <span className="acard-mini-stat acard-stat-right">
                      Updated {timeAgo(a.updatedDate)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
