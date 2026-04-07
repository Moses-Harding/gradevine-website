import { useState, useEffect } from 'react';

const SHORTCUTS = [
  { keys: '← →', desc: 'Previous / next student' },
  { keys: 'Tab', desc: 'Next question' },
  { keys: 'Shift+Tab', desc: 'Previous question' },
  { keys: '0–9', desc: 'Enter points (when input focused)' },
  { keys: 'Enter', desc: 'Confirm and advance to next question' },
  { keys: 'Esc', desc: 'Clear focus' },
  { keys: '?', desc: 'Toggle this help' },
];

export function KeyboardShortcutsOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?') {
        e.preventDefault();
        setVisible((v) => !v);
      }
      if (e.key === 'Escape' && visible) {
        setVisible(false);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="shortcuts-overlay" onClick={() => setVisible(false)}>
      <div className="shortcuts-card" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard Shortcuts</h3>
        <div className="shortcuts-list">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="shortcut-row">
              <kbd className="shortcut-key">{s.keys}</kbd>
              <span className="shortcut-desc">{s.desc}</span>
            </div>
          ))}
        </div>
        <p className="shortcuts-hint">Press ? or Esc to close</p>
      </div>
    </div>
  );
}
