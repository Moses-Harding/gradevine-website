import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Scan, QuestionAssignment, ScanQuestionResponse, AssignmentQuestion } from '../../types/cloudkit';
import { saveGrades, type SaveStatus } from '../../lib/cloudkit/save';

function swiftTimestamp(): number {
  return (Date.now() / 1000) - 978307200;
}

interface GradingPanelProps {
  scan: Scan;
  assignment: QuestionAssignment;
  courseColor?: string;
  onScanUpdated: (updatedScan: Scan) => void;
  onSaveStatusChange?: (status: SaveStatus, error: string | null) => void;
}

const AI_CONFIDENCE_THRESHOLD = 0.6;

export function GradingPanel({ scan, assignment, courseColor, onScanUpdated, onSaveStatusChange }: GradingPanelProps) {
  const [responses, setResponses] = useState<ScanQuestionResponse[]>(scan.questionResponses);
  const [scanFeedback, setScanFeedback] = useState(scan.feedback ?? '');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const changeTagRef = useRef(scan.recordChangeTag);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setResponses(scan.questionResponses);
    setScanFeedback(scan.feedback ?? '');
    changeTagRef.current = scan.recordChangeTag;
    setSaveStatus('idle');
    setSaveError(null);
  }, [scan.id]);

  useEffect(() => {
    onSaveStatusChange?.(saveStatus, saveError);
  }, [saveStatus, saveError]);

  const totalEarned = useMemo(
    () => responses.reduce((sum, r) => sum + (r.pointsEarned ?? 0), 0),
    [responses],
  );
  const totalPossible = useMemo(
    () => assignment.questions.reduce((sum, q) => sum + q.pointValue, 0),
    [assignment.questions],
  );

  const doSave = useCallback(
    async (updatedResponses: ScanQuestionResponse[], feedback: string) => {
      setSaveStatus('saving');
      setSaveError(null);
      const result = await saveGrades(scan.id, changeTagRef.current, updatedResponses, feedback || null);
      if (result.success) {
        if (result.newChangeTag) changeTagRef.current = result.newChangeTag;
        setSaveStatus('saved');
        onScanUpdated({
          ...scan,
          questionResponses: updatedResponses,
          feedback: feedback || null,
          recordChangeTag: result.newChangeTag ?? changeTagRef.current,
        });
        setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
      } else {
        setSaveStatus('error');
        setSaveError(result.error ?? 'Save failed');
      }
    },
    [scan, onScanUpdated],
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
      const question = assignment.questions.find((q) => q.id === questionID);
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
    [responses, assignment.questions, scanFeedback, scheduleSave],
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

  const chipColor = courseColor ?? '#5002F7';

  return (
    <div className="grading-panel-stack">
      {assignment.questions.map((q) => {
        const resp = responses.find((r) => r.questionID === q.id) ?? null;
        return (
          <QuestionCard
            key={q.id}
            question={q}
            response={resp}
            chipColor={chipColor}
            onGradeChange={(val) => handleGradeChange(q.id, val)}
            onFeedbackChange={(val) => handleFeedbackChange(q.id, val)}
          />
        );
      })}

      {/* Overall feedback card */}
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
  );
}

// ---------------------------------------------------------------------------

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

function QuestionCard({
  question,
  response,
  chipColor,
  onGradeChange,
  onFeedbackChange,
}: {
  question: AssignmentQuestion;
  response: ScanQuestionResponse | null;
  chipColor: string;
  onGradeChange: (value: number | null) => void;
  onFeedbackChange: (value: string) => void;
}) {
  const [fullPointsOnly, setFullPointsOnly] = useState(true);
  const ai = response?.aiEvaluation;
  const showAI = ai && ai.confidence >= AI_CONFIDENCE_THRESHOLD;

  const chips: number[] = [];
  const increment = fullPointsOnly ? 1 : 0.5;
  for (let i = 0; i <= question.pointValue; i += increment) chips.push(i);

  const handleChipClick = (value: number) => {
    if (response?.pointsEarned === value) onGradeChange(null);
    else onGradeChange(value);
  };

  const scoreText = response?.pointsEarned != null
    ? `${response.pointsEarned}/${question.pointValue}`
    : '';

  const transcription = response?.fragments
    ?.map((f: { text?: string }) => f.text)
    .filter(Boolean)
    .join(' ') || null;

  return (
    <div className="grade-card-standalone">
      {/* Dark header */}
      <div className="grade-card-header">
        <span className="grade-card-q">{question.label}</span>
        <span className="grade-card-header-spacer" />
        <span className="grade-card-pts">{question.pointValue} PTS</span>
      </div>

      <div className="grade-card-body">
        {/* Question prompt */}
        <div className="grade-card-prompt">{question.prompt}</div>

        <div className="grade-card-divider" />

        {/* Points line + full/half toggle */}
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

        {/* AI: Evaluation with color-coded status pill */}
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
          {response?.feedback && (
            <span className="feedback-char-count">{response.feedback.length}/500</span>
          )}
        </div>
        <div className="voice-feedback-area">
          <textarea
            className="grade-feedback-input"
            value={response?.feedback ?? ''}
            onChange={(e) => onFeedbackChange(e.target.value)}
            placeholder="Type feedback..."
            maxLength={500}
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  switch (status) {
    case 'idle': return null;
    case 'saving': return <span className="save-status save-saving">SAVING...</span>;
    case 'saved': return <span className="save-status save-saved">SAVED</span>;
    case 'error': return <span className="save-status save-error" title={error ?? ''}>SAVE FAILED</span>;
    case 'conflict': return <span className="save-status save-error">CONFLICT</span>;
  }
}
