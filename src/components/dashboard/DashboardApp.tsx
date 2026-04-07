import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AuthGate } from './AuthGate';
import { Breadcrumb } from './Breadcrumb';
import { CourseList } from './CourseList';
import { AssignmentList } from './AssignmentList';
import { StudentScanList } from './StudentScanList';
import { ScanViewer } from './ScanViewer';
import type { Course, QuestionAssignment } from '../../types/cloudkit';
import type { StudentScanEntry } from '../../hooks/useStudentScans';
import { KeyboardShortcutsOverlay } from './KeyboardShortcuts';

type View =
  | { type: 'courses' }
  | { type: 'assignments'; course: Course }
  | { type: 'students'; course: Course; assignment: QuestionAssignment }
  | { type: 'scan'; course: Course; assignment: QuestionAssignment; entry: StudentScanEntry; allEntries: StudentScanEntry[] };

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
                  setView({ type: 'students', course: view.course, assignment })
                }
                onBack={() => setView({ type: 'courses' })}
              />
            )}

            {view.type === 'students' && (
              <StudentScanList
                assignment={view.assignment}
                courseColor={courseColorCss}
                onSelectScan={(entry, allEntries) =>
                  setView({
                    type: 'scan',
                    course: view.course,
                    assignment: view.assignment,
                    entry,
                    allEntries,
                  })
                }
                onBack={() => setView({ type: 'assignments', course: view.course })}
              />
            )}

            {view.type === 'scan' && (
              <ScanViewer
                entry={view.entry}
                assignment={view.assignment}
                allEntries={view.allEntries}
                courseColor={courseColorCss}
                onBack={() =>
                  setView({
                    type: 'students',
                    course: view.course,
                    assignment: view.assignment,
                  })
                }
                onNavigate={(entry) =>
                  setView({
                    ...view,
                    entry,
                  })
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

  if (view.type === 'assignments' || view.type === 'students' || view.type === 'scan') {
    items.push({
      label: view.course.name.toUpperCase(),
      onClick: () => setView({ type: 'assignments', course: view.course }),
    });
  }

  if (view.type === 'students' || view.type === 'scan') {
    items.push({
      label: view.assignment.title.toUpperCase(),
      onClick: () =>
        setView({
          type: 'students',
          course: view.course,
          assignment: view.assignment,
        }),
    });
  }

  if (view.type === 'scan') {
    items.push({ label: (view.entry.student?.name ?? 'Unknown Student').toUpperCase() });
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
