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

  return (
    <>
      <KeyboardShortcutsOverlay />

      {/* CloudKit JS button containers — must always be in the DOM */}
      <div
        id="apple-sign-in-button"
        style={{ display: auth.isSignedIn ? 'none' : undefined }}
        className="auth-button-container"
      />
      <div
        id="apple-sign-out-button"
        style={{ display: !auth.isSignedIn ? 'none' : undefined }}
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
              <h1>GradeVine Dashboard</h1>
              <div className="user-info">
                <span>{auth.displayName ?? 'Teacher'}</span>
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
  const items = [{ label: 'Courses', onClick: () => setView({ type: 'courses' }) }];

  if (view.type === 'assignments' || view.type === 'students' || view.type === 'scan') {
    items.push({
      label: view.course.name,
      onClick: () => setView({ type: 'assignments', course: view.course }),
    });
  }

  if (view.type === 'students' || view.type === 'scan') {
    items.push({
      label: view.assignment.title,
      onClick: () =>
        setView({
          type: 'students',
          course: view.course,
          assignment: view.assignment,
        }),
    });
  }

  if (view.type === 'scan') {
    items.push({ label: view.entry.student?.name ?? 'Unknown Student' });
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
