import { useMemo } from 'react';
import { useCourses } from '../../hooks/useCourses';
import { useAllAssignments } from '../../hooks/useAllAssignments';
import { useAuth } from '../../hooks/useAuth';
import type { Course, QuestionAssignment } from '../../types/cloudkit';

function courseColor(colorHex: string | null): string {
  if (!colorHex) return '#5002F7';
  return colorHex.startsWith('#') ? colorHex : `#${colorHex}`;
}

interface HomeViewProps {
  onSelectCourse: (course: Course) => void;
  onSelectAssignment: (course: Course, assignment: QuestionAssignment) => void;
  onGradeByQuestion: (course: Course, assignment: QuestionAssignment) => void;
}

export function HomeView({ onSelectCourse, onSelectAssignment, onGradeByQuestion }: HomeViewProps) {
  const { auth } = useAuth();
  const { courses, isLoading: coursesLoading, error: coursesError, errorType, refresh: refreshCourses } = useCourses(auth.isSignedIn);
  const { assignments, isLoading: assignmentsLoading, error: assignmentsError } = useAllAssignments(auth.isSignedIn);

  // Build a course lookup map
  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    for (const c of courses) map.set(c.id, c);
    return map;
  }, [courses]);

  // Sort assignments by updatedDate descending, limit to 10
  const recentAssignments = useMemo(() => {
    return [...assignments]
      .sort((a, b) => new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime())
      .slice(0, 10);
  }, [assignments]);

  // Count assignments per course
  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assignments) {
      if (a.courseID) counts.set(a.courseID, (counts.get(a.courseID) ?? 0) + 1);
    }
    return counts;
  }, [assignments]);

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

  return (
    <div className="home-layout">
      {/* Main column: courses table + recent assignments */}
      <div className="home-main">
        <CoursesTable
          courses={courses}
          assignmentCounts={assignmentCounts}
          onSelect={onSelectCourse}
        />

        <RecentAssignments
          assignments={recentAssignments}
          courseMap={courseMap}
          isLoading={assignmentsLoading}
          error={assignmentsError}
          onGradeByStudent={(a) => {
            const course = a.courseID ? courseMap.get(a.courseID) : undefined;
            if (course) onSelectAssignment(course, a);
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
// Courses Table
// ---------------------------------------------------------------------------

function CoursesTable({
  courses,
  assignmentCounts,
  onSelect,
}: {
  courses: Course[];
  assignmentCounts: Map<string, number>;
  onSelect: (course: Course) => void;
}) {
  return (
    <div className="home-courses-section">
      <div className="home-section-bar">YOUR COURSES</div>
      <table className="home-table">
        <thead>
          <tr>
            <th className="home-th-narrow"></th>
            <th className="home-th-left">CLASS</th>
            <th>STUDENTS</th>
            <th>ASSIGNMENTS</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr
              key={course.id}
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
              <td>
                <span
                  className="home-dot"
                  style={{ background: courseColor(course.colorHex) }}
                />
              </td>
              <td className="home-td-name">{course.name}</td>
              <td>{course.studentIDs.length}</td>
              <td>{assignmentCounts.get(course.id) ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Assignments
// ---------------------------------------------------------------------------

function gradingStatus(a: QuestionAssignment): 'new' | 'progress' | 'done' {
  if (a.scanIDs.length === 0) return 'new';
  // We don't have scan data here, so use scanIDs count vs 0 as a proxy
  // A more accurate check would need scan grading data
  return 'progress';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'new': return 'NEW';
    case 'done': return 'COMPLETE';
    default: return 'IN PROGRESS';
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'new': return 'home-status-new';
    case 'done': return 'home-status-done';
    default: return 'home-status-progress';
  }
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

function RecentAssignments({
  assignments,
  courseMap,
  isLoading,
  error,
  onGradeByStudent,
  onGradeByQuestion,
}: {
  assignments: QuestionAssignment[];
  courseMap: Map<string, Course>;
  isLoading: boolean;
  error: string | null;
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
            const status = gradingStatus(a);
            const scanCount = a.scanIDs.length;
            const questionCount = a.questions.length;

            return (
              <div
                key={a.id}
                className={`home-assign-row ${status === 'new' && scanCount === 0 ? 'home-assign-urgent' : ''}`}
              >
                <span
                  className="home-assign-dot"
                  style={{
                    background:
                      status === 'done' ? '#248a3d' :
                      status === 'new' ? '#9e9e9e' : '#946800',
                  }}
                />
                <div className="home-assign-accent" style={{ background: color }} />
                <div className="home-assign-info">
                  <div className="home-assign-name">{a.title}</div>
                  <div className="home-assign-course">
                    {a.courseName}
                    {questionCount > 0 && ` · ${questionCount} questions`}
                  </div>
                </div>
                <div className="home-assign-status">
                  <span className={`home-status-tag ${statusClass(status)}`}>
                    {statusLabel(status)}
                  </span>
                </div>
                <div className="home-assign-scans">
                  <span className="home-assign-scan-count">{scanCount}</span>
                  <span className="home-assign-scan-label">SCANS</span>
                </div>
                <span className="home-assign-time">{timeAgo(a.updatedDate)}</span>
                <div className="home-assign-actions">
                  <button
                    className="home-assign-btn"
                    onClick={(e) => { e.stopPropagation(); onGradeByStudent(a); }}
                  >
                    BY STUDENT
                  </button>
                  <button
                    className="home-assign-btn home-assign-btn-primary"
                    onClick={(e) => { e.stopPropagation(); onGradeByQuestion(a); }}
                  >
                    BY QUESTION
                  </button>
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
