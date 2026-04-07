/**
 * Sign-in screen shown when the teacher is not authenticated.
 *
 * The actual Apple sign-in button is rendered by CloudKit JS into
 * #apple-sign-in-button, which lives in DashboardApp (always in DOM).
 * This component provides the surrounding UI chrome.
 */

export function AuthGate() {
  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/favicon.png" alt="GradeVine" width={64} height={64} />
        </div>
        <h1>GradeVine Dashboard</h1>
        <p className="auth-subtitle">
          View scanned assignments and grade from your browser.
        </p>
        <p className="auth-instructions">
          Sign in with the Apple ID you use on the GradeVine iOS app.
        </p>

        <p className="auth-note">
          Your data stays in your private iCloud account. Nothing is shared with us.
        </p>
      </div>
    </div>
  );
}
