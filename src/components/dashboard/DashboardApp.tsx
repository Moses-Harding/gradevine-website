import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AuthGate } from './AuthGate';
import { Breadcrumb } from './Breadcrumb';
import { CourseList } from './CourseList';
import { AssignmentList } from './AssignmentList';
import { GradeByStudentView } from './GradeByStudentView';
import { GradeByQuestionView } from './GradeByQuestionView';
import type { Course, QuestionAssignment } from '../../types/cloudkit';
import { KeyboardShortcutsOverlay } from './KeyboardShortcuts';

type View =
  | { type: 'courses' }
  | { type: 'assignments'; course: Course }
  | { type: 'gradeByStudent'; course: Course; assignment: QuestionAssignment }
  | { type: 'gradeByQuestion'; course: Course; assignment: QuestionAssignment };

export function DashboardApp() {
  const { auth, isLoading, error, retry } = useAuth();
  const [view, setView] = useState<View>({ type: 'courses' });

  const breadcrumbItems = buildBreadcrumb(view, setView);

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
          <header className="dashboard-header">
            <div className="dashboard-header-inner">
              <div className="header-brand">
                <span className="header-logo">G</span>
                <span className="header-title">GRADEVINE</span>
              </div>
              <div className="header-right">
                <span className="header-user">{(auth.displayName ?? 'Teacher').toUpperCase()}</span>
                <div id="apple-sign-out-button" />
              </div>
            </div>
          </header>

          <main className="dashboard-main">
            {breadcrumbItems.length > 1 && <Breadcrumb items={breadcrumbItems} />}

            {view.type === 'courses' && (
              <CourseList
                onSelect={(course) => setView({ type: 'assignments', course })}
              />
            )}

            {view.type === 'assignments' && (
              <AssignmentList
                course={view.course}
                onSelect={(assignment) =>
                  setView({ type: 'gradeByStudent', course: view.course, assignment })
                }
                onGradeByQuestion={(assignment) =>
                  setView({ type: 'gradeByQuestion', course: view.course, assignment })
                }
                onBack={() => setView({ type: 'courses' })}
              />
            )}

            {view.type === 'gradeByStudent' && (
              <GradeByStudentView
                assignment={view.assignment}
                courseColor={courseColorCss}
                onBack={() =>
                  setView({ type: 'assignments', course: view.course })
                }
              />
            )}

            {view.type === 'gradeByQuestion' && (
              <GradeByQuestionView
                assignment={view.assignment}
                courseColor={courseColorCss}
                onBack={() =>
                  setView({ type: 'assignments', course: view.course })
                }
              />
            )}
          </main>
        </div>
      )}
    </>
  );
}

function buildBreadcrumb(view: View, setView: (v: View) => void) {
  const items = [{ label: 'COURSES', onClick: () => setView({ type: 'courses' }) }];

  if (view.type !== 'courses') {
    items.push({
      label: view.course.name.toUpperCase(),
      onClick: () => setView({ type: 'assignments', course: view.course }),
    });
  }

  if (view.type === 'gradeByStudent' || view.type === 'gradeByQuestion') {
    items.push({
      label: view.assignment.title.toUpperCase(),
    });
  }

  // Last item has no onClick (it's the current page)
  if (items.length > 0) {
    const last = items[items.length - 1];
    if (view.type === 'courses') {
      delete (last as { onClick?: () => void }).onClick;
    }
  }

  return items;
}
