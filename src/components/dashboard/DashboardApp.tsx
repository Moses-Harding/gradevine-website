import { memo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AuthGate } from './AuthGate';
import { Breadcrumb } from './Breadcrumb';
import { HomeView } from './HomeView';
import { AssignmentList } from './AssignmentList';
import { AssignmentDetailView } from './AssignmentDetailView';
import { GradeByStudentView } from './GradeByStudentView';
import { GradeByQuestionView } from './GradeByQuestionView';
import type { Course, QuestionAssignment } from '../../types/cloudkit';
import { KeyboardShortcutsOverlay } from './KeyboardShortcuts';

type View =
  | { type: 'courses' }
  | { type: 'assignments'; course: Course }
  | { type: 'assignmentDetail'; course: Course; assignment: QuestionAssignment }
  | { type: 'gradeByStudent'; course: Course; assignment: QuestionAssignment }
  | { type: 'gradeByQuestion'; course: Course; assignment: QuestionAssignment };

export function DashboardApp() {
  const { auth, isLoading, error, retry } = useAuth();
  const [view, setView] = useState<View>({ type: 'courses' });

  const breadcrumbItems = buildBreadcrumb(view, setView);
  const viewName = viewNameFor(view);

  // Extract course color for theming
  const courseColor = (view.type !== 'courses' ? view.course.colorHex : null);
  const courseColorCss = courseColor ? (courseColor.startsWith('#') ? courseColor : `#${courseColor}`) : undefined;

  return (
    <>
      <KeyboardShortcutsOverlay />

      {/* CloudKit JS sign-in button — must always be in DOM */}
      <div
        id="apple-sign-in-button"
        style={{ display: auth.isSignedIn ? 'none' : undefined }}
        className="auth-button-container"
      />

      {isLoading ? (
        <div className="dashboard-loading">
          <div className="spinner" />
          <p>Connecting to iCloud...</p>
        </div>
      ) : error ? (
        <div className="dashboard-error">
          <p>{error}</p>
          <button onClick={retry} className="btn-primary">Try Again</button>
        </div>
      ) : !auth.isSignedIn ? (
        <AuthGate />
      ) : (
        <div className="dashboard">
          <DashboardHeader displayName={auth.displayName ?? 'Teacher'} />

          <main className="dashboard-main">
            <div className="view-name-label">{viewName}</div>
            <Breadcrumb items={breadcrumbItems} />

            {view.type === 'courses' && (
              <HomeView
                onSelectCourse={(course) => setView({ type: 'assignments', course })}
                onSelectAssignment={(course, assignment) =>
                  setView({ type: 'assignmentDetail', course, assignment })
                }
                onGradeByStudent={(course, assignment) =>
                  setView({ type: 'gradeByStudent', course, assignment })
                }
                onGradeByQuestion={(course, assignment) =>
                  setView({ type: 'gradeByQuestion', course, assignment })
                }
              />
            )}

            {view.type === 'assignments' && (
              <AssignmentList
                course={view.course}
                onSelectAssignment={(assignment) =>
                  setView({ type: 'assignmentDetail', course: view.course, assignment })
                }
                onGradeByStudent={(assignment) =>
                  setView({ type: 'gradeByStudent', course: view.course, assignment })
                }
                onGradeByQuestion={(assignment) =>
                  setView({ type: 'gradeByQuestion', course: view.course, assignment })
                }
                onBack={() => setView({ type: 'courses' })}
              />
            )}

            {view.type === 'assignmentDetail' && (
              <AssignmentDetailView
                assignment={view.assignment}
                courseColor={courseColorCss}
                onGradeByStudent={() =>
                  setView({ type: 'gradeByStudent', course: view.course, assignment: view.assignment })
                }
                onGradeByQuestion={() =>
                  setView({ type: 'gradeByQuestion', course: view.course, assignment: view.assignment })
                }
              />
            )}

            {view.type === 'gradeByStudent' && (
              <GradeByStudentView
                assignment={view.assignment}
                courseColor={courseColorCss}
                onBack={() =>
                  setView({ type: 'assignmentDetail', course: view.course, assignment: view.assignment })
                }
              />
            )}

            {view.type === 'gradeByQuestion' && (
              <GradeByQuestionView
                assignment={view.assignment}
                courseColor={courseColorCss}
                onBack={() =>
                  setView({ type: 'assignmentDetail', course: view.course, assignment: view.assignment })
                }
              />
            )}
          </main>
        </div>
      )}
    </>
  );
}

const DashboardHeader = memo(function DashboardHeader({ displayName }: { displayName: string }) {
  return (
    <header className="dashboard-header">
      <div className="dashboard-header-inner">
        <div className="header-brand">
          <span className="header-logo">G</span>
          <span className="header-title">GRADEVINE</span>
        </div>
        <div className="header-right">
          <span className="header-user">{displayName.toUpperCase()}</span>
          {/* apple-sign-out-button lives in Astro template, positioned here via CSS */}
        </div>
      </div>
    </header>
  );
});

function viewNameFor(view: View): string {
  switch (view.type) {
    case 'courses': return 'HomeView';
    case 'assignments': return 'AssignmentList';
    case 'assignmentDetail': return 'AssignmentDetailView';
    case 'gradeByStudent': return 'GradeByStudentView';
    case 'gradeByQuestion': return 'GradeByQuestionView';
  }
}

function buildBreadcrumb(view: View, setView: (v: View) => void) {
  const items: Array<{ label: string; onClick?: () => void }> = [
    { label: 'COURSES', onClick: () => setView({ type: 'courses' }) },
  ];

  if (view.type !== 'courses') {
    items.push({
      label: view.course.name.toUpperCase(),
      onClick: () => setView({ type: 'assignments', course: view.course }),
    });
  }

  if (
    view.type === 'assignmentDetail' ||
    view.type === 'gradeByStudent' ||
    view.type === 'gradeByQuestion'
  ) {
    items.push({
      label: view.assignment.title.toUpperCase(),
      onClick: () => setView({ type: 'assignmentDetail', course: view.course, assignment: view.assignment }),
    });
  }

  if (view.type === 'gradeByStudent') {
    items.push({ label: 'GRADE BY STUDENT' });
  } else if (view.type === 'gradeByQuestion') {
    items.push({ label: 'GRADE BY QUESTION' });
  }

  // Last item has no onClick (it's the current page)
  if (items.length > 0) {
    const last = items[items.length - 1];
    delete last.onClick;
  }

  return items;
}
