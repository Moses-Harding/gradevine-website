/**
 * Sign-in screen shown when the teacher is not authenticated.
 *
 * The CloudKit JS sign-in button is rendered once into #apple-sign-in-button
 * by CloudKit JS's `configure()` call (which happens in DashboardApp).
 * Re-creating that node would lose CloudKit's injected anchor, so on mount
 * we physically MOVE the existing node into our slot via appendChild. On
 * unmount (sign-in successful), we move it back to its original parent.
 */

import { useEffect, useRef } from 'react';

export function AuthGate() {
  const slotRef = useRef<HTMLDivElement | null>(null);

  // Move the existing #apple-sign-in-button DOM node into our slot on mount,
  // and move it back on unmount. Re-parenting preserves CloudKit JS state.
  useEffect(() => {
    const button = document.getElementById('apple-sign-in-button');
    const slot = slotRef.current;
    if (!button || !slot) return;

    const originalParent = button.parentElement;
    slot.appendChild(button);

    return () => {
      if (originalParent) originalParent.appendChild(button);
    };
  }, []);

  return (
    <div className="auth-gate">
      <div className="auth-shell">
        {/* Left: brand + pitch */}
        <aside className="auth-hero">
          <a href="/" className="auth-brand">
            <span className="auth-brand-mark">G</span>
            <span className="auth-brand-text">GRADEVINE</span>
          </a>

          <div className="auth-hero-body">
            <h1 className="auth-hero-title">
              Grade faster<br />
              <span className="auth-hero-accent">on the big screen.</span>
            </h1>
            <p className="auth-hero-sub">
              Pick up where your iPhone left off. Review scans, grade by question,
              and give feedback — all from your browser.
            </p>

            <ul className="auth-feature-list">
              <li>
                <span className="auth-feature-bullet">01</span>
                <span>Scans and students sync automatically from the iOS app</span>
              </li>
              <li>
                <span className="auth-feature-bullet">02</span>
                <span>Grade by student or jump question-by-question across the class</span>
              </li>
              <li>
                <span className="auth-feature-bullet">03</span>
                <span>Reuse saved quick feedback to write comments in a single click</span>
              </li>
            </ul>
          </div>

          <div className="auth-hero-footer">
            <a href="/" className="auth-hero-link">&larr; Back to gradevine.app</a>
          </div>
        </aside>

        {/* Right: sign-in card */}
        <div className="auth-panel">
          <div className="auth-card">
            <div className="auth-card-eyebrow">TEACHER LOGIN</div>
            <h2 className="auth-card-title">Sign in to your dashboard</h2>
            <p className="auth-card-sub">
              Use the Apple ID connected to your GradeVine iOS app to access
              your courses and assignments.
            </p>

            <div className="auth-card-divider" />

            {/* Slot that will host the CloudKit JS-rendered sign-in button */}
            <div className="auth-apple-wrap">
              <div ref={slotRef} className="auth-apple-slot" />
              <p className="auth-card-hint">
                A popup will open to complete sign-in with Apple.
              </p>
            </div>

            <div className="auth-card-divider" />

            <div className="auth-card-privacy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>
                Your data stays in your private iCloud account.
                Nothing is stored on our servers.
              </span>
            </div>
          </div>

          <div className="auth-app-store">
            <span>Don't have the iOS app yet?</span>
            <a
              href="https://apps.apple.com/app/id6755069483"
              className="auth-app-link"
            >
              Download GradeVine for iOS &rarr;
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
