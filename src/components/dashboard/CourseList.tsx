import { useCourses } from '../../hooks/useCourses';
import { useAuth } from '../../hooks/useAuth';
import type { Course } from '../../types/cloudkit';

interface CourseListProps {
  onSelect?: (course: Course) => void;
}

function courseColor(colorHex: string | null): string {
  if (!colorHex) return 'var(--color-purple)';
  return colorHex.startsWith('#') ? colorHex : `#${colorHex}`;
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
      <div className="section-label">YOUR COURSES</div>

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
            <div className="course-card-body">
              <div className="course-card-title">
                <span
                  className="course-title-accent"
                  style={{ background: courseColor(course.colorHex) }}
                />
                <span className="course-card-name">{course.name}</span>
              </div>
              <div className="course-card-meta">
                <span className="course-meta-num">{course.studentIDs.length}</span>
                <span className="course-meta-label">STUDENTS</span>
                {course.customSections.length > 0 && (
                  <>
                    <span className="course-meta-dot" />
                    <span className="course-meta-num">{course.customSections.length}</span>
                    <span className="course-meta-label">SECTIONS</span>
                  </>
                )}
              </div>
            </div>
            <span className="course-card-arrow">&rarr;</span>
          </div>
        ))}
      </div>
    </div>
  );
}
