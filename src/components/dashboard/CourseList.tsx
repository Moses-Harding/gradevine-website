import { useCourses } from '../../hooks/useCourses';
import { useAuth } from '../../hooks/useAuth';
import type { Course } from '../../types/cloudkit';

interface CourseListProps {
  onSelect?: (course: Course) => void;
}

function courseColorStyle(colorHex: string | null): React.CSSProperties {
  if (!colorHex) return { backgroundColor: 'var(--color-purple)' };
  const hex = colorHex.startsWith('#') ? colorHex : `#${colorHex}`;
  return { backgroundColor: hex };
}

export function CourseList({ onSelect }: CourseListProps) {
  const { auth } = useAuth();
  const { courses, isLoading, error, errorType, refresh } = useCourses(auth.isSignedIn);

  if (isLoading) {
    return (
      <div className="list-loading">
        <div className="spinner" />
        <p>Loading your courses...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="list-error">
        <div className="error-icon">
          {errorType === 'zone' ? '📱' : errorType === 'auth' ? '🔐' : '⚠️'}
        </div>
        <p>{error}</p>
        <button onClick={refresh} className="btn-secondary">Retry</button>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="list-empty">
        <p>No courses found.</p>
        <p className="text-muted">Create courses in the GradeVine iOS app to get started.</p>
      </div>
    );
  }

  return (
    <div className="course-list">
      <div className="list-header">
        <h2>Your Courses</h2>
        <button onClick={refresh} className="btn-icon" title="Refresh">↻</button>
      </div>

      <div className="course-grid">
        {courses.map((course) => (
          <div
            key={course.id}
            className="course-card"
            onClick={() => onSelect?.(course)}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onKeyDown={(e) => {
              if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(course);
              }
            }}
          >
            <div className="course-card-color" style={courseColorStyle(course.colorHex)} />
            <div className="course-card-body">
              <h3>{course.name}</h3>
              <p className="text-muted">
                {course.studentIDs.length} student{course.studentIDs.length !== 1 ? 's' : ''}
              </p>
              {course.customSections.length > 0 && (
                <p className="text-muted text-small">
                  Sections: {course.customSections.join(', ')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
