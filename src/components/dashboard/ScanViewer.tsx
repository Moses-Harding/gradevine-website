import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useScanPages, prefetchScanPages } from '../../hooks/useScanPages';
import type { Scan, QuestionAssignment, ScanQuestionResponse } from '../../types/cloudkit';
import type { StudentScanEntry } from '../../hooks/useStudentScans';
import { saveGrades, type SaveStatus } from '../../lib/cloudkit/save';

function swiftTimestamp(): number {
  return (Date.now() / 1000) - 978307200;
}

const AI_CONFIDENCE_THRESHOLD = 0.6;

interface ScanViewerProps {
  entry: StudentScanEntry;
  assignment: QuestionAssignment;
  allEntries: StudentScanEntry[];
  courseColor?: string;
  onBack: () => void;
  onNavigate: (entry: StudentScanEntry) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initial(name: string | undefined): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function aiStatusColor(status: string): string {
  switch (status) {
    case 'correct': return '#34c759';
    case 'partial': return '#FFD24C';
    case 'incorrect': return '#FF1C36';
    default: return '#9e9e9e';
  }
}

function aiStatusLabel(status: string): string {
  switch (status) {
    case 'correct': return 'Correct';
    case 'partial': return 'Partial Credit';
    case 'incorrect': return 'Incorrect';
    default: return 'Unclear';
  }
}

function statusLabel(status: StudentScanEntry['gradingStatus']): string {
  switch (status) {
    case 'graded': return 'GRADED';
    case 'partial': return 'PARTIAL';
    case 'ungraded': return 'UNGRADED';
  }
}

function statusClass(status: StudentScanEntry['gradingStatus']): string {
  switch (status) {
    case 'graded': return 'status-graded';
    case 'partial': return 'status-partial';
    case 'ungraded': return 'status-ungraded';
  }
}

// Quick feedback — localStorage
function qfKey(assignmentID: string, questionID: string): string {
  return `gbs-feedback-${assignmentID}-${questionID}`;
}
function loadQF(assignmentID: string, questionID: string): { id: string; text: string }[] {
  try {
    const raw = localStorage.getItem(qfKey(assignmentID, questionID));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistQF(assignmentID: string, questionID: string, items: { id: string; text: string }[]): void {
  localStorage.setItem(qfKey(assignmentID, questionID), JSON.stringify(items));
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ScanViewer({ entry, assignment, allEntries, courseColor, onBack, onNavigate }: ScanViewerProps) {
  const { pages, isLoading, error, refresh } = useScanPages(entry.scan.id);
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<'image' | 'transcript' | 'both'>('image');
  const [zoom, setZoom] = useState(1);
  const [imgFailed, setImgFailed] = useState(false);
  const [currentScan, setCurrentScan] = useState<Scan>(entry.scan);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const changeTagRef = useRef(entry.scan.recordChangeTag);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scan-level feedback
  const [scanFeedback, setScanFeedback] = useState(entry.scan.feedback ?? '');
  // Per-question responses (local optimistic state)
  const [responses, setResponses] = useState<ScanQuestionResponse[]>(entry.scan.questionResponses);

  const questions = assignment.questions;
  const studentName = entry.student?.name ?? 'Unknown Student';
  const chipColor = courseColor ?? '#5002F7';

  const currentIndex = allEntries.findIndex((e) => e.scan.id === entry.scan.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allEntries.length - 1;

  const totalPointsPossible = useMemo(
    () => questions.reduce((sum, q) => sum + q.pointValue, 0),
    [questions],
  );
  const totalEarned = useMemo(
    () => responses.reduce((sum, r) => sum + (r.pointsEarned ?? 0), 0),
    [responses],
  );

  // Prefetch adjacent students
  useEffect(() => {
    if (hasNext) prefetchScanPages(allEntries[currentIndex + 1].scan.id);
    if (hasPrev) prefetchScanPages(allEntries[currentIndex - 1].scan.id);
  }, [currentIndex, allEntries, hasNext, hasPrev]);

  // Reset on student change
  useEffect(() => {
    setCurrentPage(0);
    setImgFailed(false);
    setCurrentScan(entry.scan);
    setResponses(entry.scan.questionResponses);
    setScanFeedback(entry.scan.feedback ?? '');
    changeTagRef.current = entry.scan.recordChangeTag;
    setSaveStatus('idle');
    setSaveError(null);
  }, [entry.scan.id]);

  // Navigation
  const handlePrevStudent = useCallback(() => {
    if (hasPrev) onNavigate(allEntries[currentIndex - 1]);
  }, [hasPrev, allEntries, currentIndex, onNavigate]);

  const handleNextStudent = useCallback(() => {
    if (hasNext) onNavigate(allEntries[currentIndex + 1]);
  }, [hasNext, allEntries, currentIndex, onNavigate]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && hasPrev) { e.preventDefault(); handlePrevStudent(); }
      if (e.key === 'ArrowRight' && hasNext) { e.preventDefault(); handleNextStudent(); }
      if (e.key === 'Escape') { e.preventDefault(); onBack(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasPrev, hasNext, handlePrevStudent, handleNextStudent, onBack]);

  // Zoom / page
  const handlePagePrev = useCallback(() => { setCurrentPage((p) => Math.max(0, p - 1)); setImgFailed(false); }, []);
  const handlePageNext = useCallback(() => { setCurrentPage((p) => Math.min(pages.length - 1, p + 1)); setImgFailed(false); }, [pages.length]);
  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(3, z + 0.25)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(0.5, z - 0.25)), []);
  const handleFitWidth = useCallback(() => setZoom(1), []);

  // Save logic
  const doSave = useCallback(
    async (updatedResponses: ScanQuestionResponse[], feedback: string) => {
      setSaveStatus('saving');
      setSaveError(null);
      const result = await saveGrades(currentScan.id, changeTagRef.current, updatedResponses, feedback || null);
      if (result.success) {
        if (result.newChangeTag) changeTagRef.current = result.newChangeTag;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
      } else {
        setSaveStatus('error');
        setSaveError(result.error ?? 'Save failed');
      }
    },
    [currentScan.id],
  );

  const scheduleSave = useCallback(
    (updatedResponses: ScanQuestionResponse[], feedback: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSave(updatedResponses, feedback), 500);
    },
    [doSave],
  );

  const handleGradeChange = useCallback(
    (questionID: string, value: number | null) => {
      const question = questions.find((q) => q.id === questionID);
      if (value !== null && question) {
        if (value < 0 || value > question.pointValue) return;
      }
      let updated = responses.map((r) => {
        if (r.questionID !== questionID) return r;
        return { ...r, pointsEarned: value, gradedAt: value !== null ? swiftTimestamp() : null, lastUpdated: swiftTimestamp() };
      });
      if (!updated.find((r) => r.questionID === questionID) && question) {
        updated.push({
          id: crypto.randomUUID(), questionID, questionLabel: question.label,
          fragments: [], feedback: null, pointsEarned: value,
          gradedAt: value !== null ? swiftTimestamp() : null,
          aiEvaluation: null, lastUpdated: swiftTimestamp(), pageNumber: null,
        });
      }
      setResponses(updated);
      scheduleSave(updated, scanFeedback);
    },
    [responses, questions, scanFeedback, scheduleSave],
  );

  const handleFeedbackChange = useCallback(
    (questionID: string, feedback: string) => {
      if (feedback.length > 500) return;
      const updated = responses.map((r) => {
        if (r.questionID !== questionID) return r;
        return { ...r, feedback: feedback || null, lastUpdated: swiftTimestamp() };
      });
      setResponses(updated);
      scheduleSave(updated, scanFeedback);
    },
    [responses, scanFeedback, scheduleSave],
  );

  const handleScanFeedbackChange = useCallback(
    (feedback: string) => {
      if (feedback.length > 500) return;
      setScanFeedback(feedback);
      scheduleSave(responses, feedback);
    },
    [responses, scheduleSave],
  );

  if (isLoading) {
    return (
      <div className="list-loading">
        <div className="spinner" />
        <p>Loading scan pages...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="list-error">
        <p>{error}</p>
        <button onClick={refresh} className="btn-secondary">Retry</button>
      </div>
    );
  }

  const page = pages[currentPage];

  return (
    <div className="scan-viewer">
      {/* Student navigation bar — pinned */}
      <div className="student-nav-bar">
        <button onClick={handlePrevStudent} disabled={!hasPrev} className="nav-btn">
          &larr; PREV
        </button>
        <div className="nav-center">
          <div className="student-avatar" style={{ background: chipColor }}>
            {initial(entry.student?.name)}
          </div>
          <span className="nav-name">{studentName}</span>
          <span className="nav-pos">{currentIndex + 1} / {allEntries.length}</span>
          <span className="nav-score">{totalEarned} / {totalPointsPossible} PTS</span>
          <NavSaveIndicator status={saveStatus} error={saveError} />
        </div>
        <button onClick={handleNextStudent} disabled={!hasNext} className="nav-btn">
          NEXT &rarr;
        </button>
      </div>

      <div className="gbs-layout">
        {/* Left: Student sidebar */}
        <div className="gbs-student-sidebar">
          <div className="gbq-sidebar-header">
            STUDENTS
            <span className="gbq-sidebar-count">{allEntries.length}</span>
          </div>
          <div className="gbs-student-list">
            {allEntries.map((e, index) => {
              const isSelected = e.scan.id === entry.scan.id;
              return (
                <button
                  key={e.scan.id}
                  className={`gbs-student-row ${isSelected ? 'gbs-student-selected' : ''}`}
                  style={isSelected ? { '--s-color': chipColor } as React.CSSProperties : undefined}
                  onClick={() => onNavigate(e)}
                >
                  <div
                    className="student-avatar"
                    style={{ background: isSelected ? chipColor : '#bdbdbd', width: 24, height: 24, fontSize: 10 }}
                  >
                    {initial(e.student?.name)}
                  </div>
                  <span className="gbs-student-name">{e.student?.name ?? 'Unknown'}</span>
                  <span className={`gbs-student-status ${statusClass(e.gradingStatus)}`}>
                    {statusLabel(e.gradingStatus)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Scan image */}
        <div className="gbs-image-panel">
          <div className="scan-image-header">
            <div className="voice-row">
              <span className="voice-pill" style={{ background: chipColor }}>STUDENT</span>
              <span className="voice-label" style={{ color: chipColor }}>
                {viewMode === 'image' ? 'Image' : viewMode === 'transcript' ? 'Transcript' : 'Image & Transcript'}
              </span>
            </div>
            <div className="scan-viewer-controls">
              {viewMode !== 'transcript' && (
                <>
                  <button onClick={handleZoomOut} className="btn-icon" title="Zoom out">&minus;</button>
                  <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                  <button onClick={handleZoomIn} className="btn-icon" title="Zoom in">+</button>
                  <button onClick={handleFitWidth} className="btn-icon" title="Fit width">&#x25A3;</button>
                </>
              )}
              <div className="view-mode-toggle">
                {(['image', 'both', 'transcript'] as const).map((m) => (
                  <button
                    key={m}
                    className={`view-mode-btn ${viewMode === m ? 'view-mode-active' : ''}`}
                    onClick={() => setViewMode(m)}
                  >
                    {m === 'image' ? 'IMG' : m === 'both' ? 'BOTH' : 'TXT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {pages.length > 0 ? (
            <>
              {viewMode !== 'transcript' && (
                <div className="scan-image-container">
                  {page?.imageUrl && !imgFailed ? (
                    <img
                      src={page.imageUrl}
                      alt={`Page ${page.pageNumber}`}
                      className="scan-image"
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                      onError={() => setImgFailed(true)}
                    />
                  ) : page?.transcript ? (
                    <div className="scan-transcript-fallback">
                      <p className="transcript-fallback-note">Image not available — showing OCR transcript</p>
                      <pre>{page.transcript}</pre>
                    </div>
                  ) : (
                    <div className="scan-image-placeholder"><p>Image not available</p></div>
                  )}
                </div>
              )}
              {viewMode !== 'image' && page && (
                <div className="scan-transcript">
                  <h3>OCR Transcript — Page {page.pageNumber}</h3>
                  <pre>{page.transcript || '(No transcript available)'}</pre>
                </div>
              )}
              {pages.length > 1 && (
                <div className="page-nav">
                  <button onClick={handlePagePrev} disabled={currentPage === 0} className="btn-secondary btn-sm">
                    &larr; Prev
                  </button>
                  <span className="page-indicator">Page {currentPage + 1} of {pages.length}</span>
                  <button onClick={handlePageNext} disabled={currentPage === pages.length - 1} className="btn-secondary btn-sm">
                    Next &rarr;
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="list-empty"><p>No pages found for this scan.</p></div>
          )}
        </div>

        {/* Right: All question cards, scrollable */}
        <div className="gbs-grade-panel">
          <div className="grading-panel-stack">
            {questions.map((q) => {
              const resp = responses.find((r) => r.questionID === q.id) ?? null;
              return (
                <QuestionCard
                  key={q.id}
                  question={q}
                  response={resp}
                  chipColor={chipColor}
                  assignmentID={assignment.id}
                  onGradeChange={(val) => handleGradeChange(q.id, val)}
                  onFeedbackChange={(val) => handleFeedbackChange(q.id, val)}
                />
              );
            })}

            {/* Overall feedback */}
            <div className="grade-card-standalone">
              <div className="grade-card-header">
                <span className="grade-card-q">OVERALL FEEDBACK</span>
              </div>
              <div className="grade-card-body">
                <textarea
                  className="scan-feedback-input"
                  value={scanFeedback}
                  onChange={(e) => handleScanFeedbackChange(e.target.value)}
                  placeholder="General feedback for this student..."
                  maxLength={500}
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Card (with quick feedback)
// ---------------------------------------------------------------------------

function QuestionCard({
  question,
  response,
  chipColor,
  assignmentID,
  onGradeChange,
  onFeedbackChange,
}: {
  question: { id: string; label: string; prompt: string; pointValue: number; gradingKey: string | null };
  response: ScanQuestionResponse | null;
  chipColor: string;
  assignmentID: string;
  onGradeChange: (value: number | null) => void;
  onFeedbackChange: (value: string) => void;
}) {
  const [fullPointsOnly, setFullPointsOnly] = useState(true);
  const [localFeedback, setLocalFeedback] = useState(response?.feedback ?? '');
  const [qfItems, setQfItems] = useState<{ id: string; text: string }[]>([]);

  // Sync feedback from parent
  useEffect(() => {
    setLocalFeedback(response?.feedback ?? '');
  }, [response?.feedback]);

  // Load quick feedback
  useEffect(() => {
    setQfItems(loadQF(assignmentID, question.id));
  }, [assignmentID, question.id]);

  const ai = response?.aiEvaluation;
  const showAI = ai && ai.confidence >= AI_CONFIDENCE_THRESHOLD;

  const chips: number[] = [];
  const increment = fullPointsOnly ? 1 : 0.5;
  for (let i = 0; i <= question.pointValue; i += increment) chips.push(i);

  const handleChipClick = (value: number) => {
    if (response?.pointsEarned === value) onGradeChange(null);
    else onGradeChange(value);
  };

  const handleLocalFeedbackChange = (text: string) => {
    if (text.length > 500) return;
    setLocalFeedback(text);
    onFeedbackChange(text);
  };

  const handleQFTap = (text: string) => {
    const separator = localFeedback.length > 0 ? '\n' : '';
    const updated = (localFeedback + separator + text).slice(0, 500);
    setLocalFeedback(updated);
    onFeedbackChange(updated);
  };

  const handleSaveQF = () => {
    const trimmed = localFeedback.trim();
    if (!trimmed) return;
    if (qfItems.some((item) => item.text === trimmed)) return;
    const newItem = { id: crypto.randomUUID(), text: trimmed };
    const updated = [...qfItems, newItem];
    setQfItems(updated);
    persistQF(assignmentID, question.id, updated);
  };

  const handleDeleteQF = (id: string) => {
    const updated = qfItems.filter((item) => item.id !== id);
    setQfItems(updated);
    persistQF(assignmentID, question.id, updated);
  };

  const transcription = response?.fragments
    ?.map((f: { text?: string }) => f.text)
    .filter(Boolean)
    .join(' ') || null;

  return (
    <div className="grade-card-standalone">
      <div className="grade-card-header">
        <span className="grade-card-q">{question.label}</span>
        <span className="grade-card-header-spacer" />
        <span className="grade-card-pts">{question.pointValue} PTS</span>
      </div>

      <div className="grade-card-body">
        <div className="grade-card-prompt">{question.prompt}</div>
        <div className="grade-card-divider" />

        {/* Points + toggle */}
        <div className="grade-points-line">
          <span className="grade-points-label">
            Points: {response?.pointsEarned != null ? response.pointsEarned : '—'}
          </span>
          <button
            className={`grade-points-toggle ${fullPointsOnly ? 'grade-points-toggle-active' : ''}`}
            style={{ '--toggle-color': chipColor } as React.CSSProperties}
            onClick={() => setFullPointsOnly(!fullPointsOnly)}
          >
            Full points only
          </button>
        </div>
        <div className="grade-chips">
          {chips.map((val) => (
            <button
              key={val}
              className={`grade-chip ${response?.pointsEarned === val ? 'grade-chip-selected' : ''}`}
              style={{ '--chip-color': chipColor } as React.CSSProperties}
              onClick={() => handleChipClick(val)}
            >
              {val}
            </button>
          ))}
        </div>

        {/* STUDENT: Transcription */}
        {transcription && (
          <>
            <div className="grade-card-divider" />
            <div className="voice-row">
              <span className="voice-pill" style={{ background: chipColor }}>STUDENT</span>
              <span className="voice-label" style={{ color: chipColor }}>Transcription</span>
            </div>
            <div className="voice-body">{transcription}</div>
          </>
        )}

        {/* TEACHER: Grading Key */}
        {question.gradingKey && (
          <>
            <div className="grade-card-divider" />
            <div className="voice-row">
              <span className="voice-pill voice-pill-teacher">TEACHER</span>
              <span className="voice-label voice-label-teacher">Grading Key</span>
            </div>
            <div className="voice-body voice-body-italic">{question.gradingKey}</div>
          </>
        )}

        {/* AI: Evaluation */}
        {showAI && (
          <>
            <div className="grade-card-divider" />
            <div className="voice-row">
              <span className="voice-pill voice-pill-ai">AI</span>
              <span className="voice-label voice-label-ai">Evaluation</span>
              <span
                className="ai-status-pill"
                style={{
                  color: aiStatusColor(ai!.status),
                  background: `color-mix(in srgb, ${aiStatusColor(ai!.status)} 12%, white)`,
                }}
              >
                {aiStatusLabel(ai!.status)}
              </span>
            </div>
            <div className="voice-body">
              {ai!.reasoning}
              <div className="voice-ai-advisory">AI evaluation is advisory only.</div>
            </div>
          </>
        )}

        {/* TEACHER: Feedback */}
        <div className="grade-card-divider" />
        <div className="voice-row">
          <span className="voice-pill voice-pill-teacher">TEACHER</span>
          <span className="voice-label voice-label-teacher">Feedback</span>
          {localFeedback && (
            <span className="feedback-char-count">{localFeedback.length}/500</span>
          )}
        </div>
        <div className="voice-feedback-area">
          <textarea
            className="grade-feedback-input"
            value={localFeedback}
            onChange={(e) => handleLocalFeedbackChange(e.target.value)}
            placeholder="Type feedback..."
            maxLength={500}
            rows={2}
          />
        </div>

        {/* Save as Quick Feedback */}
        <button
          className="btn-save-quick-feedback"
          onClick={handleSaveQF}
          disabled={!localFeedback.trim()}
        >
          + Save Quick Feedback
        </button>

        {/* Quick Feedback Chips */}
        {qfItems.length > 0 && (
          <div className="quick-feedback-chips">
            {qfItems.map((item) => (
              <span key={item.id} className="quick-chip-wrapper">
                <button className="quick-chip" onClick={() => handleQFTap(item.text)} title={`Click to insert: "${item.text}"`}>
                  {item.text}
                </button>
                <button className="quick-chip-delete" onClick={() => handleDeleteQF(item.id)} title="Remove">
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save indicator
// ---------------------------------------------------------------------------

function NavSaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  switch (status) {
    case 'idle': return null;
    case 'saving': return <span className="nav-save-status nav-save-saving">SAVING...</span>;
    case 'saved': return <span className="nav-save-status nav-save-saved">SAVED</span>;
    case 'error': return <span className="nav-save-status nav-save-error" title={error ?? ''}>SAVE FAILED</span>;
    case 'conflict': return <span className="nav-save-status nav-save-error">CONFLICT</span>;
  }
}
