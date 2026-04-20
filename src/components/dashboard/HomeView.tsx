import { useMemo } from 'react';
import { useCourses } from '../../hooks/useCourses';
import { useAllAssignments } from '../../hooks/useAllAssignments';
import { useAuth } from '../../hooks/useAuth';
import { useAssignmentGradingStatuses } from '../../hooks/useAssignmentGradingStatuses';
import { StatusBadge } from './CourseDetailView';
import { isAssignmentEditable, type Course, type QuestionAssignment } from '../../types/cloudkit';

function courseColor(colorHex: string | null): string {
  if (!colorHex) return '#5002F7';
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

interface HomeViewProps {
  onSelectCourse: (course: Course) => void;
  onSelectAssignment: (course: Course, assignment: QuestionAssignment) => void;
  onGradeByStudent: (course: Course, assignment: QuestionAssignment) => void;
  onGradeByQuestion: (course: Course, assignment: QuestionAssignment) => void;
}

export function HomeView({ onSelectCourse, onSelectAssignment, onGradeByStudent, onGradeByQuestion }: HomeViewProps) {
  const { auth } = useAuth();
  const { courses, isLoading: coursesLoading, error: coursesError, errorType, refresh: refreshCourses } = useCourses(auth.isSignedIn);
  const { assignments, isLoading: assignmentsLoading, error: assignmentsError, refresh: refreshAssignments } = useAllAssignments(auth.isSignedIn);

  // Build a course lookup map
  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    for (const c of courses) map.set(c.id, c);
    return map;
  }, [courses]);

  // Only show active (editable) assignments in home view
  const activeAssignments = useMemo(() => assignments.filter(isAssignmentEditable), [assignments]);

  // Sort assignments by updatedDate descending, limit to 10
  const recentAssignments = useMemo(() => {
    return [...activeAssignments]
      .sort((a, b) => new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime())
      .slice(0, 10);
  }, [activeAssignments]);

  // Load grading status for the recent assignments list
  const gradingStatuses = useAssignmentGradingStatuses(recentAssignments);

  // Count assignments per course (active only)
  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of activeAssignments) {
      if (a.courseID) counts.set(a.courseID, (counts.get(a.courseID) ?? 0) + 1);
    }
    return counts;
  }, [activeAssignments]);

  if (coursesLoading) {
    return (
      <div className="list-loading">
        <div className="spinner" />
        <p>Loading your courses...</p>
      </div>
    );
  }

  if (coursesError) {
    return (
      <div className="list-error">
        <div className="error-icon">
          {errorType === 'zone' ? '📱' : errorType === 'auth' ? '🔐' : '⚠️'}
        </div>
        <p>{coursesError}</p>
        <button onClick={refreshCourses} className="btn-secondary">Retry</button>
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

  const handleRefreshAll = () => {
    refreshCourses();
    refreshAssignments();
  };

  return (
    <div className="home-layout">
      {/* Main column: courses table + recent assignments */}
      <div className="home-main">
        <CoursesCards
          courses={courses}
          assignmentCounts={assignmentCounts}
          onSelect={onSelectCourse}
          onRefresh={handleRefreshAll}
        />

        <RecentAssignments
          assignments={recentAssignments}
          courseMap={courseMap}
          gradingStatuses={gradingStatuses}
          isLoading={assignmentsLoading}
          error={assignmentsError}
          onSelectAssignment={(a) => {
            const course = a.courseID ? courseMap.get(a.courseID) : undefined;
            if (course) onSelectAssignment(course, a);
          }}
          onGradeByStudent={(a) => {
            const course = a.courseID ? courseMap.get(a.courseID) : undefined;
            if (course) onGradeByStudent(course, a);
          }}
          onGradeByQuestion={(a) => {
            const course = a.courseID ? courseMap.get(a.courseID) : undefined;
            if (course) onGradeByQuestion(course, a);
          }}
        />
      </div>

      {/* Sidebar: recent activity */}
      <RecentActivity assignments={recentAssignments} courseMap={courseMap} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Courses Cards
// ---------------------------------------------------------------------------

function CoursesCards({
  courses,
  assignmentCounts,
  onSelect,
  onRefresh,
}: {
  courses: Course[];
  assignmentCounts: Map<string, number>;
  onSelect: (course: Course) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="home-courses-section">
      <div className="home-section-bar">
        CLASSES
        <button onClick={onRefresh} className="home-section-refresh" title="Refresh all data">&#x21bb;</button>
      </div>
      <div className="home-courses-grid">
        {courses.map((course) => {
          const color = courseColor(course.colorHex);
          const aCount = assignmentCounts.get(course.id) ?? 0;
          return (
            <div
              key={course.id}
              className="home-course-card"
              onClick={() => onSelect(course)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(course);
                }
              }}
            >
              <div className="home-course-card-stripe" style={{ background: color }} />
              <div className="home-course-card-body">
                <div className="home-course-card-name">{course.name}</div>
                <div className="home-course-card-stats">
                  <div className="home-course-card-stat">
                    <div className="home-course-card-stat-value">{course.studentIDs.length}</div>
                    <div className="home-course-card-stat-label">STUDENTS</div>
                  </div>
                  <div className="home-course-card-stat-divider" />
                  <div className="home-course-card-stat">
                    <div className="home-course-card-stat-value">{aCount}</div>
                    <div className="home-course-card-stat-label">ASSIGNMENTS</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Assignments
// ---------------------------------------------------------------------------


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

function RecentAssignments({
  assignments,
  courseMap,
  gradingStatuses,
  isLoading,
  error,
  onSelectAssignment,
  onGradeByStudent,
  onGradeByQuestion,
}: {
  assignments: QuestionAssignment[];
  courseMap: Map<string, Course>;
  gradingStatuses: Map<string, import('../../hooks/useAssignmentGradingStatuses').AssignmentGradingStatus>;
  isLoading: boolean;
  error: string | null;
  onSelectAssignment: (a: QuestionAssignment) => void;
  onGradeByStudent: (a: QuestionAssignment) => void;
  onGradeByQuestion: (a: QuestionAssignment) => void;
}) {
  return (
    <div className="home-assignments-section">
      <div className="home-section-bar">RECENT ASSIGNMENTS</div>
      <div className="home-assignment-list">
        {isLoading && assignments.length === 0 ? (
          <div className="home-assign-loading">
            <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            <span>Loading assignments...</span>
          </div>
        ) : error ? (
          <div className="home-assign-loading">
            <span>{error}</span>
          </div>
        ) : assignments.length === 0 ? (
          <div className="home-assign-loading">
            <span>No assignments yet. Create one in the iOS app.</span>
          </div>
        ) : (
          assignments.map((a) => {
            const course = a.courseID ? courseMap.get(a.courseID) : undefined;
            const color = course ? courseColor(course.colorHex) : '#5002F7';
            const status = gradingStatuses.get(a.id) ?? (a.scanIDs.length === 0 ? 'new' : 'loading');
            const scanCount = a.scanIDs.length;
            const questionCount = a.questions.length;

            return (
              <div
                key={a.id}
                className="acard acard-clickable"
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
                    <StatusBadge status={status} />
                  </div>
                  {scanCount > 0 && (
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
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Activity (derived from assignment data)
// ---------------------------------------------------------------------------

interface ActivityItem {
  id: string;
  text: string;
  highlight: string;
  color: string;
  time: string;
}

function RecentActivity({
  assignments,
  courseMap,
}: {
  assignments: QuestionAssignment[];
  courseMap: Map<string, Course>;
}) {
  // Derive activity from assignment data
  const activities: ActivityItem[] = useMemo(() => {
    return assignments.slice(0, 8).map((a) => {
      const course = a.courseID ? courseMap.get(a.courseID) : undefined;
      const color = course ? courseColor(course.colorHex) : '#9e9e9e';
      const scanCount = a.scanIDs.length;

      let text: string;
      let highlight: string;

      if (scanCount === 0) {
        text = 'Created assignment';
        highlight = a.title;
      } else {
        text = `${scanCount} scans in`;
        highlight = a.title;
      }

      return {
        id: a.id,
        text,
        highlight,
        color,
        time: timeAgo(a.updatedDate),
      };
    });
  }, [assignments, courseMap]);

  if (activities.length === 0) return null;

  return (
    <aside className="home-sidebar">
      <div className="home-sidebar-label">RECENT ACTIVITY</div>
      <div className="home-feed">
        {activities.map((item) => (
          <div key={item.id} className="home-feed-item">
            <div className="home-feed-dot" style={{ background: item.color }} />
            <div className="home-feed-content">
              <div className="home-feed-text">
                {item.text} <strong>{item.highlight}</strong>
              </div>
              <div className="home-feed-time">{item.time}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
