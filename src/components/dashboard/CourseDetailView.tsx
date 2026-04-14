import { useState, useMemo } from 'react';
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

  const sortedAssignments = useMemo(
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
      </div>

      {/* Progress bar — class average, median, students, assignments */}
      <div className="adv-progress-bar">
        <div className="adv-progress-stat">
          <span className="adv-progress-value">
            {courseAnalytics ? `${courseAnalytics.classAverage.toFixed(1)}%` : '—'}
          </span>
          <span className="adv-progress-label">CLASS AVERAGE</span>
        </div>
        <div className="adv-progress-stat">
          <span className="adv-progress-value">
            {courseAnalytics ? `${courseAnalytics.classMedian.toFixed(0)}%` : '—'}
          </span>
          <span className="adv-progress-label">MEDIAN</span>
        </div>
        <div className="adv-progress-stat">
          <span className="adv-progress-value">{students.length}</span>
          <span className="adv-progress-label">STUDENTS</span>
        </div>
        <div className="adv-progress-stat">
          <span className="adv-progress-value">{assignments.length}</span>
          <span className="adv-progress-label">ASSIGNMENTS</span>
        </div>
      </div>

      {/* Row 1: Needs Attention + Grading Progress */}
      {(courseAnalytics?.atRiskStudents.length ?? 0) > 0 && (
        <NeedsAttentionSection
          atRiskStudents={courseAnalytics!.atRiskStudents}
          color={color}
        />
      )}

      {assignments.length > 0 && (
        <div className="adv-widget-row">
          <Section title="GRADING PROGRESS">
            <div className="cd-analytics-progress">
              <ProgressRow label="Complete" count={statusCounts.done} total={assignments.length} barColor="#34C759" />
              <ProgressRow label="In Progress" count={statusCounts.progress} total={assignments.length} barColor="#FF9500" />
              <ProgressRow label="Not Started" count={statusCounts.new} total={assignments.length} barColor="#c7c7cc" />
            </div>
          </Section>

          {hasSections && (
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
        </div>
      )}

      {/* Student Performance (from real analytics) */}
      {courseAnalytics && courseAnalytics.studentTrends.length > 0 && (
        <StudentPerformanceSection
          trends={courseAnalytics.studentTrends}
          color={color}
          isLoading={analyticsLoading}
        />
      )}

      {/* Assignments section */}
      <Section title="ASSIGNMENTS">
        {assignments.length === 0 ? (
          <p className="adv-empty-hint">No assignments yet. Create one in the iOS app.</p>
        ) : (
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
      />

      {/* Assignment Timeline */}
      {sortedAssignments.length > 0 && (
        <Section title="ASSIGNMENT TIMELINE">
          <div className="cd-analytics-timeline">
            {sortedAssignments.map((a) => {
              const status = gradingStatuses.get(a.id) ?? 'new';
              return (
                <div key={a.id} className="cd-timeline-row">
                  <div className="cd-timeline-dot" style={{ background: statusDotColor(status) }} />
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
// Needs Attention Section (at-risk students)
// ---------------------------------------------------------------------------

function NeedsAttentionSection({
  atRiskStudents,
  color,
}: {
  atRiskStudents: StudentTrend[];
  color: string;
}) {
  return (
    <Section
      title="NEEDS ATTENTION"
      trailing={
        <span className="cd-attention-badge">{atRiskStudents.length}</span>
      }
    >
      <div className="cd-attention-list">
        {atRiskStudents.map((student) => (
          <div key={student.studentID} className="cd-attention-row">
            {/* Mini progress ring */}
            <MiniRing
              percentage={student.overallAverage}
              severity={student.riskSeverity}
            />

            <div className="cd-attention-info">
              <span className="cd-attention-name">{student.name}</span>
              <div className="cd-attention-meta">
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

            {/* Sparkline */}
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
              {/* Background sparkline */}
              {student.scores.length >= 2 && (
                <PerfSparklineBg scores={student.scores.map((s) => s.percentage)} color={sparkColor} />
              )}

              {/* Foreground content */}
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
}: {
  students: Student[];
  isLoading: boolean;
  error: string | null;
  color: string;
  courseID: string;
  groupedStudents: Map<string, Student[]>;
  sortedSections: string[];
  hasSections: boolean;
}) {
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_LIMIT = 4;

  const filteredSections = sectionFilter
    ? sortedSections.filter((s) => s === sectionFilter)
    : sortedSections;

  const allVisibleStudents = useMemo(() => {
    const result: { student: Student; sectionName: string }[] = [];
    for (const sectionName of filteredSections) {
      for (const student of groupedStudents.get(sectionName) ?? []) {
        result.push({ student, sectionName });
      }
    }
    return result;
  }, [filteredSections, groupedStudents]);

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

  return (
    <Section
      title="STUDENTS"
      trailing={
        isLoading ? (
          <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
        ) : undefined
      }
    >
      {isLoading ? (
        <p className="adv-empty-hint">Loading students...</p>
      ) : error ? (
        <p className="adv-empty-hint">{error}</p>
      ) : students.length === 0 ? (
        <p className="adv-empty-hint">No students enrolled yet. Add students in the iOS app.</p>
      ) : (
        <>
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
                      <span className="cd-section-count">({groupedStudents.get(sectionName)?.length ?? 0})</span>
                    </div>
                  )}
                  {sectionStudents.map((student) => (
                    <StudentRow key={student.id} student={student} color={color} courseID={courseID} />
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
  courseID,
}: {
  student: Student;
  color: string;
  courseID: string;
}) {
  const initials = getInitials(student.name);
  const scanCount = student.scanIDs.length;

  return (
    <div className="cd-student-row">
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
}: {
  title: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="adv-section">
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
