import { useAssignments } from '../../hooks/useAssignments';
import {
  useAssignmentGradingStatuses,
  type AssignmentGradingStatus,
} from '../../hooks/useAssignmentGradingStatuses';
import type { QuestionAssignment, Course } from '../../types/cloudkit';

interface AssignmentListProps {
  course: Course;
  onSelectAssignment: (assignment: QuestionAssignment) => void;
  onGradeByStudent: (assignment: QuestionAssignment) => void;
  onGradeByQuestion: (assignment: QuestionAssignment) => void;
  onBack: () => void;
}

function courseColor(colorHex: string | null): string {
  if (!colorHex) return 'var(--color-purple)';
  return colorHex.startsWith('#') ? colorHex : `#${colorHex}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  return year === currentYear ? `${month} ${day}` : `${month} ${day}, ${year}`;
}

export function AssignmentList({ course, onSelectAssignment, onGradeByStudent, onGradeByQuestion, onBack }: AssignmentListProps) {
  const { assignments, isLoading, error, refresh } = useAssignments(course.id);
  const color = courseColor(course.colorHex);
  const gradingStatuses = useAssignmentGradingStatuses(assignments);

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
          const hasScanData = scanCount > 0;

          return (
            <div
              key={a.id}
              className={`acard acard-clickable ${!hasScanData ? 'acard-empty' : ''}`}
              style={{ '--cc': color } as React.CSSProperties}
              onClick={() => onSelectAssignment(a)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectAssignment(a);
                }
              }}
            >
              {/* Row 1: Title + metadata */}
              <div className="acard-row-top">
                <div className="acard-accent" />
                <div className="acard-top-content">
                  <div className="acard-top-line1">
                    <span className="acard-name">{a.title}</span>
                    <div className="acard-top-meta">
                      <span className="acard-meta-item">{scanCount} scan{scanCount !== 1 ? 's' : ''}</span>
                      <span className="acard-meta-item">Created {formatDate(a.createdDate)}</span>
                      <span className="acard-meta-item">Modified {formatDate(a.updatedDate)}</span>
                    </div>
                  </div>
                  <div className="acard-top-line2">
                    <span className="acard-course-name">{a.courseName}</span>
                    <span className="acard-meta-item">{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Status + actions */}
              <div className="acard-row-bottom">
                <div className="acard-status-area">
                  <StatusBadge
                    status={gradingStatuses.get(a.id) ?? (hasScanData ? 'loading' : 'new')}
                  />
                </div>
                {hasScanData && (
                  <div className="acard-actions">
                    <button
                      className="acard-action-btn"
                      onClick={(e) => { e.stopPropagation(); onGradeByStudent(a); }}
                    >
                      GRADE BY STUDENT
                    </button>
                    <button
                      className="acard-action-btn acard-action-primary"
                      onClick={(e) => { e.stopPropagation(); onGradeByQuestion(a); }}
                    >
                      GRADE BY QUESTION
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge (shared between list views)
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: { status: AssignmentGradingStatus }) {
  switch (status) {
    case 'new':
      return <span className="acard-empty-label">NO SCANS YET</span>;
    case 'loading':
      return <span className="acard-status-badge acard-status-loading">LOADING…</span>;
    case 'done':
      return <span className="acard-status-badge acard-status-done">COMPLETE</span>;
    case 'progress':
      return <span className="acard-status-badge">IN PROGRESS</span>;
  }
}
