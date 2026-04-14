import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAssignments } from '../../hooks/useAssignments';
import { useStudents } from '../../hooks/useStudents';
import {
  useAssignmentGradingStatuses,
  type AssignmentGradingStatus,
} from '../../hooks/useAssignmentGradingStatuses';
import {
  useCourseAnalytics,
  type StudentTrend,
  type RiskSeverity,
  type TrendDirection,
} from '../../hooks/useCourseAnalytics';
import type { QuestionAssignment, Course, Student } from '../../types/cloudkit';

interface CourseDetailViewProps {
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

export function CourseDetailView({
  course,
  onSelectAssignment,
  onGradeByStudent,
  onGradeByQuestion,
  onBack,
}: CourseDetailViewProps) {
  const color = courseColor(course.colorHex);

  const { assignments, isLoading: assignmentsLoading, error: assignmentsError, refresh: refreshAssignments } = useAssignments(course.id);
  const { students, isLoading: studentsLoading, error: studentsError } = useStudents(course.id);
  const gradingStatuses = useAssignmentGradingStatuses(assignments);
  const { analytics: courseAnalytics, isLoading: analyticsLoading } = useCourseAnalytics(assignments, students);

  // Section grouping for students
  const groupedStudents = useMemo(() => {
    const groups = new Map<string, Student[]>();
    for (const s of students) {
      const section = s.courseSections[course.id] ?? 'No Section';
      const list = groups.get(section) ?? [];
      list.push(s);
      groups.set(section, list);
    }
    for (const [, list] of groups) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, [students, course.id]);

  const sortedSections = useMemo(() => {
    const sections = Array.from(groupedStudents.keys());
    return sections.sort((a, b) => {
      if (a === 'No Section') return 1;
      if (b === 'No Section') return -1;
      return a.localeCompare(b);
    });
  }, [groupedStudents]);

  // Per-course scan counts for students (intersect student scanIDs with course assignment scanIDs)
  const courseScanIDSet = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      for (const sid of a.scanIDs) set.add(sid);
    }
    return set;
  }, [assignments]);

  const studentCourseScanCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of students) {
      const count = s.scanIDs.filter((id) => courseScanIDSet.has(id)).length;
      counts.set(s.id, count);
    }
    return counts;
  }, [students, courseScanIDSet]);

  // Basic counts
  const totalScans = useMemo(
    () => assignments.reduce((sum, a) => sum + a.scanIDs.length, 0),
    [assignments],
  );

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of students) {
      const section = s.courseSections[course.id] ?? 'No Section';
      counts.set(section, (counts.get(section) ?? 0) + 1);
    }
    return counts;
  }, [students, course.id]);

  const statusCounts = useMemo(() => {
    const c = { done: 0, progress: 0, new: 0 };
    for (const a of assignments) {
      const status = gradingStatuses.get(a.id);
      if (status === 'done') c.done++;
      else if (status === 'progress') c.progress++;
      else c.new++;
    }
    return c;
  }, [assignments, gradingStatuses]);

  // Assignments sorted newest first (for display list) and chronologically (for timeline)
  const sortedAssignmentsNewest = useMemo(
    () => [...assignments].sort((a, b) => new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime()),
    [assignments],
  );
  const sortedAssignmentsChronological = useMemo(
    () => [...assignments].sort((a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()),
    [assignments],
  );

  const hasSections = sortedSections.length > 1 || (sortedSections.length === 1 && sortedSections[0] !== 'No Section');

  if (assignmentsLoading && studentsLoading) {
    return (
      <div className="list-loading">
        <div className="spinner" />
        <p>Loading course data...</p>
      </div>
    );
  }

  if (assignmentsError) {
    return (
      <div className="list-error">
        <p>{assignmentsError}</p>
        <button onClick={refreshAssignments} className="btn-secondary">Retry</button>
      </div>
    );
  }

  return (
    <div className="adv-container" style={{ '--cc': color } as React.CSSProperties}>
      {/* Header */}
      <div className="adv-header">
        <div className="adv-header-accent" />
        <div className="adv-header-content">
          <div className="adv-header-top">
            <div className="adv-header-meta">
              <span className="adv-meta-item">{students.length} student{students.length !== 1 ? 's' : ''}</span>
              <span className="adv-meta-sep">·</span>
              <span className="adv-meta-item">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</span>
              <span className="adv-meta-sep">·</span>
              <span className="adv-meta-item">{totalScans} scan{totalScans !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <h1 className="adv-title">{course.name}</h1>
          {/* Trend delta from analytics */}
          {courseAnalytics?.trendDelta != null && (
            <div className="adv-header-dates">
              <span className={`cd-trend-indicator ${trendClass(courseAnalytics.trendDelta)}`}>
                {trendArrow(courseAnalytics.trendDelta)} {Math.abs(courseAnalytics.trendDelta).toFixed(1)}% from last assignment
              </span>
            </div>
          )}
        </div>
        <CourseToolbarMenu
          course={course}
          students={students}
          studentCourseScanCounts={studentCourseScanCounts}
          color={color}
        />
      </div>

      {/* Progress bar — class average, median, students, assignments */}
      <div className="adv-progress-bar">
        <div className="adv-progress-stat" style={{ '--stat-color': '#34C759' } as React.CSSProperties}>
          <div className="adv-progress-stat-icon" style={{ background: 'rgba(52, 199, 89, 0.12)', color: '#34C759' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 12l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="adv-progress-value">
            {courseAnalytics ? `${courseAnalytics.classAverage.toFixed(1)}%` : '—'}
          </span>
          <span className="adv-progress-label">CLASS AVERAGE</span>
        </div>
        <div className="adv-progress-stat" style={{ '--stat-color': '#007AFF' } as React.CSSProperties}>
          <div className="adv-progress-stat-icon" style={{ background: 'rgba(0, 122, 255, 0.1)', color: '#007AFF' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 10h12M5 6h6M7 2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="adv-progress-value">
            {courseAnalytics ? `${courseAnalytics.classMedian.toFixed(0)}%` : '—'}
          </span>
          <span className="adv-progress-label">MEDIAN</span>
        </div>
        <div className="adv-progress-stat" style={{ '--stat-color': color } as React.CSSProperties}>
          <div className="adv-progress-stat-icon" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 14c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="adv-progress-value">{students.length}</span>
          <span className="adv-progress-label">STUDENTS</span>
        </div>
        <div className="adv-progress-stat" style={{ '--stat-color': '#FF9500' } as React.CSSProperties}>
          <div className="adv-progress-stat-icon" style={{ background: 'rgba(255, 149, 0, 0.1)', color: '#FF9500' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="6" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="6" y1="8.5" x2="9" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="adv-progress-value">{assignments.length}</span>
          <span className="adv-progress-label">ASSIGNMENTS</span>
        </div>
      </div>

      {/* Row 1: Needs Attention + Grading Progress */}
      {/* Row 1: Grading Progress + Needs Attention (side by side) */}
      {assignments.length > 0 && (
        <div className="adv-widget-row">
          <Section title="GRADING PROGRESS">
            <div className="cd-analytics-progress">
              <ProgressRow label="Complete" count={statusCounts.done} total={assignments.length} barColor="#34C759" />
              <ProgressRow label="In Progress" count={statusCounts.progress} total={assignments.length} barColor="#FF9500" />
              <ProgressRow label="Not Started" count={statusCounts.new} total={assignments.length} barColor="#c7c7cc" />
            </div>
          </Section>

          {(courseAnalytics?.atRiskStudents.length ?? 0) > 0 ? (
            <NeedsAttentionSection
              atRiskStudents={courseAnalytics!.atRiskStudents}
            />
          ) : hasSections ? (
            <Section title="STUDENTS BY SECTION">
              <div className="cd-analytics-progress">
                {Array.from(sectionCounts.entries())
                  .sort(([a], [b]) => {
                    if (a === 'No Section') return 1;
                    if (b === 'No Section') return -1;
                    return a.localeCompare(b);
                  })
                  .map(([section, count]) => (
                    <ProgressRow key={section} label={section} count={count} total={students.length} barColor={color} />
                  ))}
              </div>
            </Section>
          ) : null}
        </div>
      )}

      {/* Students by Section (if Needs Attention took the right slot and sections exist) */}
      {assignments.length > 0 && (courseAnalytics?.atRiskStudents.length ?? 0) > 0 && hasSections && (
        <Section title="STUDENTS BY SECTION">
          <div className="cd-analytics-progress">
            {Array.from(sectionCounts.entries())
              .sort(([a], [b]) => {
                if (a === 'No Section') return 1;
                if (b === 'No Section') return -1;
                return a.localeCompare(b);
              })
              .map(([section, count]) => (
                <ProgressRow key={section} label={section} count={count} total={students.length} barColor={color} />
              ))}
          </div>
        </Section>
      )}

      {/* Student Performance */}
      {courseAnalytics && courseAnalytics.studentTrends.length > 0 && (
        <StudentPerformanceSection
          trends={courseAnalytics.studentTrends}
          color={color}
          isLoading={analyticsLoading}
        />
      )}

      {/* Student Trends Chart */}
      {courseAnalytics && courseAnalytics.studentTrends.length > 0 && (
        <Section title="STUDENT TRENDS">
          <MultiLineTrendChartContent
            trends={courseAnalytics.studentTrends}
            color={color}
          />
        </Section>
      )}

      {/* Assignments section */}
      <Section title="ASSIGNMENTS">
        {assignments.length === 0 ? (
          <div className="cd-empty-state">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="8" y="6" width="24" height="28" rx="3" stroke="#c7c7cc" strokeWidth="2" />
              <line x1="14" y1="14" x2="26" y2="14" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" />
              <line x1="14" y1="20" x2="22" y2="20" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" />
              <line x1="14" y1="26" x2="24" y2="26" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="cd-empty-title">No assignments yet</p>
            <p className="cd-empty-subtitle">Create an assignment in the iOS app and it will appear here.</p>
          </div>
        ) : (
          <div className="acard-list">
            {sortedAssignmentsNewest.map((a) => {
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
        )}
      </Section>

      {/* Roster import reminder */}
      {!studentsLoading && students.length > 0 && students.length < 3 && (
        <RosterReminderBanner color={color} studentCount={students.length} />
      )}

      {/* Students section */}
      <StudentsSection
        students={students}
        isLoading={studentsLoading}
        error={studentsError}
        color={color}
        courseID={course.id}
        groupedStudents={groupedStudents}
        sortedSections={sortedSections}
        hasSections={hasSections}
        studentCourseScanCounts={studentCourseScanCounts}
      />

      {/* Assignment Timeline */}
      {sortedAssignmentsChronological.length > 0 && (
        <Section title="ASSIGNMENT TIMELINE">
          <div className="cd-analytics-timeline">
            {sortedAssignmentsChronological.map((a) => {
              const status = gradingStatuses.get(a.id) ?? 'new';
              const dotColor = statusDotColor(status);
              const isPulse = status === 'progress' || status === 'loading';
              return (
                <div key={a.id} className="cd-timeline-row">
                  <div
                    className={`cd-timeline-dot ${isPulse ? 'cd-timeline-dot-pulse' : ''}`}
                    style={{ background: dotColor, '--dot-color': dotColor } as React.CSSProperties}
                  />
                  <div className="cd-timeline-info">
                    <span className="cd-timeline-name">{a.title}</span>
                    <span className="cd-timeline-meta">
                      {formatDate(a.createdDate)} · {a.scanIDs.length} scan{a.scanIDs.length !== 1 ? 's' : ''} · {a.questions.length} Q
                    </span>
                  </div>
                  <StatusBadge status={status} />
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Course Toolbar Menu (Export CSV, etc.)
// ---------------------------------------------------------------------------

function CourseToolbarMenu({
  course,
  students,
  studentCourseScanCounts,
  color,
}: {
  course: Course;
  students: Student[];
  studentCourseScanCounts: Map<string, number>;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const exportRosterCSV = useCallback(() => {
    const rows: string[] = ['Name,Section,Alternate Names,Scans'];
    for (const s of [...students].sort((a, b) => a.name.localeCompare(b.name))) {
      const section = s.courseSections[course.id] ?? '';
      const altNames = s.alternateNames.join('; ');
      const scans = studentCourseScanCounts.get(s.id) ?? 0;
      rows.push(
        [s.name, section, altNames, String(scans)]
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(','),
      );
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${course.name} - Roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }, [course, students, studentCourseScanCounts]);

  return (
    <div className="cd-toolbar-menu" ref={menuRef}>
      <button
        className="cd-toolbar-btn"
        style={{ '--cc': color } as React.CSSProperties}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Course actions"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="3.5" r="1.5" fill="currentColor" />
          <circle cx="9" cy="9" r="1.5" fill="currentColor" />
          <circle cx="9" cy="14.5" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="cd-toolbar-dropdown">
          <button
            className="cd-toolbar-dropdown-item"
            onClick={exportRosterCSV}
            disabled={students.length === 0}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export Roster (CSV)
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Needs Attention Section (at-risk students)
// ---------------------------------------------------------------------------

function NeedsAttentionSection({
  atRiskStudents,
}: {
  atRiskStudents: StudentTrend[];
}) {
  return (
    <Section
      title="NEEDS ATTENTION"
      trailing={
        <span className="cd-attention-badge">{atRiskStudents.length}</span>
      }
    >
      <div className="adv-struggling-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>
          {atRiskStudents.length} student{atRiskStudents.length !== 1 ? 's' : ''} need additional support
        </span>
      </div>
      <div className="adv-struggling-list">
        {atRiskStudents.map((student) => (
          <div key={student.studentID} className="adv-struggling-row">
            <div className="adv-struggling-info">
              <div className="adv-struggling-name">{student.name}</div>
              <div className="adv-struggling-meta">
                <span className="adv-struggling-pct">{student.overallAverage.toFixed(0)}%</span>
                <span className="adv-meta-sep">·</span>
                <span
                  className="cd-severity-badge"
                  style={{ background: severityColor(student.riskSeverity) }}
                >
                  {severityLabel(student.riskSeverity)}
                </span>
                <span className="adv-meta-sep">·</span>
                <span className={`cd-trend-tag ${trendClass(student.trendDelta)}`}>
                  {trendArrow(student.trendDelta)} {trendLabel(student.trendDirection)}
                </span>
              </div>
            </div>
            {student.scores.length >= 2 && (
              <Sparkline
                scores={student.scores.map((s) => s.percentage)}
                color={severityColor(student.riskSeverity)}
              />
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Student Performance Section (all students ranked by average)
// ---------------------------------------------------------------------------

function StudentPerformanceSection({
  trends,
  color,
  isLoading,
}: {
  trends: StudentTrend[];
  color: string;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_LIMIT = 6;
  const needsCollapse = trends.length > COLLAPSED_LIMIT;
  const displayTrends = expanded ? trends : trends.slice(0, COLLAPSED_LIMIT);

  return (
    <Section
      title="STUDENT PERFORMANCE"
      trailing={
        isLoading ? (
          <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
        ) : undefined
      }
    >
      <div className="cd-perf-grid">
        {displayTrends.map((student) => {
          const sparkColor = student.riskSeverity
            ? severityColor(student.riskSeverity)
            : color;
          const isRisk = !!student.riskSeverity;

          return (
            <div
              key={student.studentID}
              className={`cd-perf-card ${isRisk ? 'cd-perf-card-risk' : ''}`}
            >
              {student.scores.length >= 2 && (
                <PerfSparklineBg scores={student.scores.map((s) => s.percentage)} color={sparkColor} />
              )}
              <div className="cd-perf-overlay">
                <div className="cd-perf-top">
                  <span className="cd-perf-name">{student.name}</span>
                  {student.scores.length >= 2 && (
                    <span className={`cd-perf-pill ${trendClass(student.trendDelta)}`}>
                      {trendArrow(student.trendDelta)} {student.trendDelta > 0 ? '+' : ''}{student.trendDelta.toFixed(1)}%
                    </span>
                  )}
                </div>
                <span
                  className="cd-perf-score"
                  style={isRisk ? { color: sparkColor } : undefined}
                >
                  {student.overallAverage.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {needsCollapse && (
        <button
          className="cd-show-more"
          style={{ '--cc': color } as React.CSSProperties}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Show Less' : `Show All ${trends.length} Students`}
        </button>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Mini Ring (40x40 circular progress for at-risk students)
// ---------------------------------------------------------------------------

function MiniRing({
  percentage,
  severity,
}: {
  percentage: number;
  severity: RiskSeverity | null;
}) {
  const size = 40;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, percentage / 100));
  const dashArray = `${circumference * ratio} ${circumference}`;
  const ringColor = severityColor(severity);

  return (
    <div className="cd-mini-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#e5e5ea" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={ringColor} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="cd-mini-ring-label">{Math.round(percentage)}%</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline (mini line chart for score history)
// ---------------------------------------------------------------------------

function Sparkline({ scores, color }: { scores: number[]; color: string }) {
  const w = 56;
  const h = 20;
  const pad = 2;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const points = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (w - pad * 2);
    const y = h - pad - ((s - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="cd-sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Full-bleed sparkline background for performance cards
// ---------------------------------------------------------------------------

function PerfSparklineBg({ scores, color }: { scores: number[]; color: string }) {
  const w = 300;
  const h = 80;
  const pad = 0;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const coords = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (w - pad * 2);
    const y = h - 10 - ((s - min) / range) * (h - 20);
    return { x, y };
  });

  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPath = `M${coords[0].x},${coords[0].y} ${coords.slice(1).map((c) => `L${c.x},${c.y}`).join(' ')} L${w},${h} L0,${h}Z`;

  // Unique gradient ID per student (use color hash to avoid collisions)
  const gradId = `pfg-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg className="cd-perf-bg-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Students Section (grouped roster)
// ---------------------------------------------------------------------------

function StudentsSection({
  students,
  isLoading,
  error,
  color,
  courseID,
  groupedStudents,
  sortedSections,
  hasSections,
  studentCourseScanCounts,
}: {
  students: Student[];
  isLoading: boolean;
  error: string | null;
  color: string;
  courseID: string;
  groupedStudents: Map<string, Student[]>;
  sortedSections: string[];
  hasSections: boolean;
  studentCourseScanCounts: Map<string, number>;
}) {
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'scans'>('name');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const COLLAPSED_LIMIT = 4;

  const filteredSections = sectionFilter
    ? sortedSections.filter((s) => s === sectionFilter)
    : sortedSections;

  // Sort students within each section
  const sortedGroupedStudents = useMemo(() => {
    if (sortBy === 'name') return groupedStudents; // already sorted by name
    const sorted = new Map<string, Student[]>();
    for (const [section, list] of groupedStudents) {
      sorted.set(
        section,
        [...list].sort((a, b) => {
          const aScans = studentCourseScanCounts.get(a.id) ?? 0;
          const bScans = studentCourseScanCounts.get(b.id) ?? 0;
          return bScans - aScans; // descending by scan count
        }),
      );
    }
    return sorted;
  }, [groupedStudents, sortBy, studentCourseScanCounts]);

  const allVisibleStudents = useMemo(() => {
    const result: { student: Student; sectionName: string }[] = [];
    for (const sectionName of filteredSections) {
      for (const student of sortedGroupedStudents.get(sectionName) ?? []) {
        result.push({ student, sectionName });
      }
    }
    return result;
  }, [filteredSections, sortedGroupedStudents]);

  const totalVisible = allVisibleStudents.length;
  const needsCollapse = totalVisible > COLLAPSED_LIMIT;
  const displayStudents = expanded ? allVisibleStudents : allVisibleStudents.slice(0, COLLAPSED_LIMIT);

  const displayGrouped = useMemo(() => {
    const groups = new Map<string, Student[]>();
    for (const { student, sectionName } of displayStudents) {
      const list = groups.get(sectionName) ?? [];
      list.push(student);
      groups.set(sectionName, list);
    }
    return groups;
  }, [displayStudents]);

  const displaySections = filteredSections.filter((s) => displayGrouped.has(s));

  const toggleStudent = useCallback((id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedStudents(new Set());
  }, []);

  return (
    <Section
      title="STUDENTS"
      trailing={
        isLoading ? (
          <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
        ) : students.length > 0 ? (
          <div className="cd-students-toolbar">
            {/* Sort control */}
            <button
              className={`cd-sort-btn ${sortBy === 'scans' ? 'cd-sort-btn-active' : ''}`}
              style={{ '--cc': color } as React.CSSProperties}
              onClick={() => setSortBy((prev) => (prev === 'name' ? 'scans' : 'name'))}
              title={`Sort by ${sortBy === 'name' ? 'scan count' : 'name'}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {sortBy === 'name' ? 'A-Z' : 'Scans'}
            </button>

            {/* Selection mode toggle */}
            <button
              className={`cd-select-btn ${selectionMode ? 'cd-select-btn-active' : ''}`}
              style={{ '--cc': color } as React.CSSProperties}
              onClick={selectionMode ? exitSelectionMode : () => setSelectionMode(true)}
            >
              {selectionMode ? 'Done' : 'Select'}
            </button>
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <p className="adv-empty-hint">Loading students...</p>
      ) : error ? (
        <p className="adv-empty-hint">{error}</p>
      ) : students.length === 0 ? (
        <div className="cd-empty-state">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="14" r="6" stroke="#c7c7cc" strokeWidth="2" />
            <path d="M8 34c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="cd-empty-title">No students enrolled yet</p>
          <p className="cd-empty-subtitle">Add students in the iOS app to see them here.</p>
        </div>
      ) : (
        <>
          {/* Selection bar */}
          {selectionMode && (
            <div className="cd-selection-bar" style={{ '--cc': color } as React.CSSProperties}>
              <span className="cd-selection-count">
                {selectedStudents.size} selected
              </span>
              {selectedStudents.size > 0 && (
                <button className="cd-selection-clear" onClick={() => setSelectedStudents(new Set())}>
                  Clear
                </button>
              )}
            </div>
          )}

          {hasSections && (
            <div className="cd-filter-bar">
              <button
                className={`cd-filter-chip ${sectionFilter === null ? 'cd-filter-chip-active' : ''}`}
                style={{ '--cc': color } as React.CSSProperties}
                onClick={() => setSectionFilter(null)}
              >
                All ({students.length})
              </button>
              {sortedSections.map((section) => (
                <button
                  key={section}
                  className={`cd-filter-chip ${sectionFilter === section ? 'cd-filter-chip-active' : ''}`}
                  style={{ '--cc': color } as React.CSSProperties}
                  onClick={() => setSectionFilter(section)}
                >
                  {section} ({groupedStudents.get(section)?.length ?? 0})
                </button>
              ))}
            </div>
          )}

          <div className="cd-student-list">
            {displaySections.map((sectionName) => {
              const sectionStudents = displayGrouped.get(sectionName) ?? [];
              return (
                <div key={sectionName} className="cd-student-section">
                  {hasSections && (
                    <div className="cd-section-header">
                      <span className="cd-section-name">{sectionName}</span>
                      <span className="cd-section-count">({sortedGroupedStudents.get(sectionName)?.length ?? 0})</span>
                      {selectionMode && (
                        <button
                          className="cd-section-select-all"
                          style={{ color }}
                          onClick={() => {
                            const allInSection = sortedGroupedStudents.get(sectionName) ?? [];
                            setSelectedStudents((prev) => {
                              const next = new Set(prev);
                              const allSelected = allInSection.every((s) => next.has(s.id));
                              for (const s of allInSection) {
                                if (allSelected) next.delete(s.id);
                                else next.add(s.id);
                              }
                              return next;
                            });
                          }}
                        >
                          {(sortedGroupedStudents.get(sectionName) ?? []).every((s) => selectedStudents.has(s.id))
                            ? 'Deselect All'
                            : 'Select All'}
                        </button>
                      )}
                    </div>
                  )}
                  {sectionStudents.map((student) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      color={color}
                      scanCount={studentCourseScanCounts.get(student.id) ?? 0}
                      selectionMode={selectionMode}
                      isSelected={selectedStudents.has(student.id)}
                      onToggle={() => toggleStudent(student.id)}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {needsCollapse && (
            <button
              className="cd-show-more"
              style={{ '--cc': color } as React.CSSProperties}
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? 'Show Less' : `Show All ${totalVisible} Students`}
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function StudentRow({
  student,
  color,
  scanCount,
  selectionMode,
  isSelected,
  onToggle,
}: {
  student: Student;
  color: string;
  scanCount: number;
  selectionMode: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const initials = getInitials(student.name);

  return (
    <div
      className={`cd-student-row ${selectionMode ? 'cd-student-row-selectable' : ''} ${isSelected ? 'cd-student-row-selected' : ''}`}
      onClick={selectionMode ? onToggle : undefined}
      role={selectionMode ? 'button' : undefined}
      tabIndex={selectionMode ? 0 : undefined}
      onKeyDown={selectionMode ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } } : undefined}
    >
      {selectionMode && (
        <div className={`cd-student-checkbox ${isSelected ? 'cd-student-checkbox-checked' : ''}`} style={{ '--cc': color } as React.CSSProperties}>
          {isSelected && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}
      <div className="cd-student-avatar" style={{ background: color }}>
        {initials}
      </div>
      <div className="cd-student-info">
        <span className="cd-student-name">{student.name}</span>
        {student.alternateNames.length > 0 && (
          <span className="cd-student-alt-names">
            aka {student.alternateNames.join(', ')}
          </span>
        )}
      </div>
      <span className="cd-student-scan-count">
        {scanCount} scan{scanCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roster Reminder Banner (#6)
// ---------------------------------------------------------------------------

function RosterReminderBanner({ color, studentCount }: { color: string; studentCount: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="cd-roster-banner" style={{ '--cc': color } as React.CSSProperties}>
      <div className="cd-roster-banner-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M15 4l2 2m0-2l-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="cd-roster-banner-content">
        <span className="cd-roster-banner-title">
          Only {studentCount} student{studentCount !== 1 ? 's' : ''} enrolled
        </span>
        <span className="cd-roster-banner-subtitle">
          Import your class roster in the iOS app to add students quickly.
        </span>
      </div>
      <button className="cd-roster-banner-dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 3.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-Line Trend Chart Content (used inside tabbed section)
// ---------------------------------------------------------------------------

function MultiLineTrendChartContent({
  trends,
  color,
}: {
  trends: StudentTrend[];
  color: string;
}) {
  const [hoveredStudent, setHoveredStudent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const chartStudents = useMemo(
    () => trends.filter((t) => t.scores.length >= 2),
    [trends],
  );

  if (chartStudents.length === 0) {
    return <p className="adv-empty-hint">Need at least 2 graded assignments to show trends.</p>;
  }

  const maxAssignments = Math.max(...chartStudents.map((t) => t.scores.length));
  const LEGEND_LIMIT = 8;
  const showLegendToggle = chartStudents.length > LEGEND_LIMIT;
  const legendStudents = expanded ? chartStudents : chartStudents.slice(0, LEGEND_LIMIT);

  const w = 600;
  const h = 200;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const yTicks = [0, 25, 50, 75, 100];
  const threshold = 60;

  function yPos(pct: number) {
    return padT + chartH - (pct / 100) * chartH;
  }
  function xPos(i: number) {
    return padL + (i / (maxAssignments - 1)) * chartW;
  }

  const studentColors = useMemo(() => {
    const palette = [
      color, '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF',
      '#FF9F1C', '#7B68EE', '#E84393', '#00B894', '#6C5CE7',
      '#FD79A8', '#0984E3', '#FDCB6E', '#E17055', '#00CEC9',
    ];
    const map = new Map<string, string>();
    chartStudents.forEach((s, i) => {
      map.set(s.studentID, palette[i % palette.length]);
    });
    return map;
  }, [chartStudents, color]);

  return (
    <div className="cd-trend-chart-container">
      <svg
        className="cd-trend-chart-svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL} y1={yPos(tick)} x2={w - padR} y2={yPos(tick)}
              stroke="#f0f0f0" strokeWidth="1"
            />
            <text
              x={padL - 8} y={yPos(tick) + 4}
              textAnchor="end" fontSize="10" fill="#9e9e9e" fontWeight="500"
            >
              {tick}%
            </text>
          </g>
        ))}

        <line
          x1={padL} y1={yPos(threshold)} x2={w - padR} y2={yPos(threshold)}
          stroke="#FF1C36" strokeWidth="1" strokeDasharray="4 3" opacity="0.4"
        />
        <text
          x={w - padR + 4} y={yPos(threshold) + 4}
          fontSize="9" fill="#FF1C36" fontWeight="600" opacity="0.6"
        >
          {threshold}%
        </text>

        {Array.from({ length: maxAssignments }, (_, i) => (
          <text
            key={i}
            x={xPos(i)} y={h - 6}
            textAnchor="middle" fontSize="10" fill="#9e9e9e" fontWeight="500"
          >
            A{i + 1}
          </text>
        ))}

        {chartStudents.map((student) => {
          const isHovered = hoveredStudent === student.studentID;
          const isOtherHovered = hoveredStudent !== null && !isHovered;
          const lineColor = studentColors.get(student.studentID) ?? '#c7c7cc';
          const points = student.scores.map((s, i) => `${xPos(i)},${yPos(s.percentage)}`).join(' ');

          return (
            <polyline
              key={student.studentID}
              points={points}
              fill="none"
              stroke={lineColor}
              strokeWidth={isHovered ? 3 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isOtherHovered ? 0.15 : isHovered ? 1 : 0.7}
              style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}
              onMouseEnter={() => setHoveredStudent(student.studentID)}
              onMouseLeave={() => setHoveredStudent(null)}
            />
          );
        })}

        {hoveredStudent && chartStudents
          .filter((s) => s.studentID === hoveredStudent)
          .map((student) =>
            student.scores.map((s, i) => (
              <circle
                key={i}
                cx={xPos(i)} cy={yPos(s.percentage)}
                r={4}
                fill={studentColors.get(student.studentID) ?? color}
                stroke="white" strokeWidth="1.5"
              />
            )),
          )}
      </svg>

      <div className="cd-trend-legend">
        {legendStudents.map((student) => {
          const sColor = studentColors.get(student.studentID) ?? '#c7c7cc';
          const isHovered = hoveredStudent === student.studentID;
          return (
            <button
              key={student.studentID}
              className={`cd-trend-legend-item ${isHovered ? 'cd-trend-legend-item-active' : ''}`}
              onMouseEnter={() => setHoveredStudent(student.studentID)}
              onMouseLeave={() => setHoveredStudent(null)}
            >
              <span className="cd-trend-legend-dot" style={{ background: sColor }} />
              <span className="cd-trend-legend-name">{student.name}</span>
              <span className="cd-trend-legend-score">{student.overallAverage.toFixed(0)}%</span>
            </button>
          );
        })}
        {showLegendToggle && (
          <button
            className="cd-trend-legend-toggle"
            style={{ color }}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Show Less' : `+ ${chartStudents.length - LEGEND_LIMIT} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  trailing,
  className,
}: {
  title: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`adv-section ${className ?? ''}`}>
      <div className="adv-section-bar">
        <span>{title}</span>
        {trailing && <div className="adv-section-trailing">{trailing}</div>}
      </div>
      <div className="adv-section-body">{children}</div>
    </div>
  );
}

function ProgressRow({
  label,
  count,
  total,
  barColor,
}: {
  label: string;
  count: number;
  total: number;
  barColor: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="cd-progress-row">
      <span className="cd-progress-label">{label}</span>
      <div className="cd-progress-bar-track">
        <div className="cd-progress-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="cd-progress-count">{count}</span>
    </div>
  );
}

function statusDotColor(status: AssignmentGradingStatus): string {
  switch (status) {
    case 'done': return '#34C759';
    case 'progress': return '#FF9500';
    case 'loading': return '#c7c7cc';
    case 'new': return '#e0e0e0';
  }
}

function severityColor(severity: RiskSeverity | null): string {
  switch (severity) {
    case 'critical': return '#FF1C36';
    case 'high': return '#FF6B6B';
    case 'medium': return '#FF9500';
    default: return '#c7c7cc';
  }
}

function severityLabel(severity: RiskSeverity | null): string {
  switch (severity) {
    case 'critical': return 'CRITICAL';
    case 'high': return 'HIGH';
    case 'medium': return 'MEDIUM';
    default: return '';
  }
}

function trendArrow(delta: number): string {
  if (delta > 2) return '↑';
  if (delta < -2) return '↓';
  return '→';
}

function trendClass(delta: number): string {
  if (delta > 2) return 'cd-trend-up';
  if (delta < -2) return 'cd-trend-down';
  return 'cd-trend-stable';
}

function trendLabel(direction: TrendDirection): string {
  switch (direction) {
    case 'improving': return 'Improving';
    case 'declining': return 'Declining';
    case 'stable': return 'Stable';
  }
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
