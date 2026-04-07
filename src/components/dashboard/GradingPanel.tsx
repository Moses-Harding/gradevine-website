import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Scan, QuestionAssignment, ScanQuestionResponse, AssignmentQuestion } from '../../types/cloudkit';
import { saveGrades, type SaveStatus } from '../../lib/cloudkit/save';

/**
 * Convert current time to Swift's timeIntervalSinceReferenceDate.
 * Swift reference date: Jan 1, 2001 00:00:00 UTC (978307200 seconds after Unix epoch).
 */
function swiftTimestamp(): number {
  return (Date.now() / 1000) - 978307200;
}

interface GradingPanelProps {
  scan: Scan;
  assignment: QuestionAssignment;
  onScanUpdated: (updatedScan: Scan) => void;
}

const AI_CONFIDENCE_THRESHOLD = 0.6;

export function GradingPanel({ scan, assignment, onScanUpdated }: GradingPanelProps) {
  // Local copy of responses for optimistic updates
  const [responses, setResponses] = useState<ScanQuestionResponse[]>(scan.questionResponses);
  const [scanFeedback, setScanFeedback] = useState(scan.feedback ?? '');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const changeTagRef = useRef(scan.recordChangeTag);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when scan changes
  useEffect(() => {
    setResponses(scan.questionResponses);
    setScanFeedback(scan.feedback ?? '');
    changeTagRef.current = scan.recordChangeTag;
    setSaveStatus('idle');
    setSaveError(null);
  }, [scan.id]);

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

      const result = await saveGrades(
        scan.id,
        changeTagRef.current,
        updatedResponses,
        feedback || null,
      );

      if (result.success) {
        if (result.newChangeTag) {
          changeTagRef.current = result.newChangeTag;
        }
        setSaveStatus('saved');
        // Notify parent of updated scan
        onScanUpdated({
          ...scan,
          questionResponses: updatedResponses,
          feedback: feedback || null,
          recordChangeTag: result.newChangeTag ?? changeTagRef.current,
        });
        // Reset to idle after 2s
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
    (questionID: string, value: string) => {
      const numValue = value === '' ? null : Number(value);
      // Find the question to validate bounds
      const question = assignment.questions.find((q) => q.id === questionID);
      if (numValue !== null && question) {
        if (numValue < 0 || numValue > question.pointValue) return;
      }

      const updated = responses.map((r) => {
        if (r.questionID !== questionID) return r;
        return {
          ...r,
          pointsEarned: numValue,
          gradedAt: numValue !== null ? swiftTimestamp() : null,
          lastUpdated: swiftTimestamp(),
        };
      });

      // If no response exists for this question, create one
      if (!updated.find((r) => r.questionID === questionID) && question) {
        updated.push({
          id: crypto.randomUUID(),
          questionID,
          questionLabel: question.label,
          fragments: [],
          feedback: null,
          pointsEarned: numValue,
          gradedAt: numValue !== null ? swiftTimestamp() : null,
          aiEvaluation: null,
          lastUpdated: swiftTimestamp(),
          pageNumber: null,
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

  const handleClearGrade = useCallback(
    (questionID: string) => {
      handleGradeChange(questionID, '');
    },
    [handleGradeChange],
  );

  return (
    <div className="grading-panel">
      <div className="grading-panel-header">
        <h3>Grading</h3>
        <div className="grading-panel-status">
          <span className="grading-total">
            {totalEarned} / {totalPossible}
          </span>
          <SaveIndicator status={saveStatus} error={saveError} />
        </div>
      </div>

      <div className="grading-questions">
        {assignment.questions.map((q) => (
          <QuestionGradeRow
            key={q.id}
            question={q}
            response={responses.find((r) => r.questionID === q.id) ?? null}
            onGradeChange={(val) => handleGradeChange(q.id, val)}
            onFeedbackChange={(val) => handleFeedbackChange(q.id, val)}
            onClear={() => handleClearGrade(q.id)}
          />
        ))}
      </div>

      {/* Scan-level feedback */}
      <div className="scan-feedback-section">
        <label className="scan-feedback-label">
          Overall Feedback
          <span className="char-count">{scanFeedback.length}/500</span>
        </label>
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
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QuestionGradeRow({
  question,
  response,
  onGradeChange,
  onFeedbackChange,
  onClear,
}: {
  question: AssignmentQuestion;
  response: ScanQuestionResponse | null;
  onGradeChange: (value: string) => void;
  onFeedbackChange: (value: string) => void;
  onClear: () => void;
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const ai = response?.aiEvaluation;
  const showAI = ai && ai.confidence >= AI_CONFIDENCE_THRESHOLD;

  return (
    <div className="grade-question">
      <div className="grade-question-header">
        <div className="grade-question-info">
          <span className="grade-question-label">{question.label}</span>
          <span className="grade-question-prompt">{question.prompt}</span>
        </div>
        <div className="grade-input-group">
          <input
            type="number"
            className="grade-input"
            value={response?.pointsEarned ?? ''}
            onChange={(e) => onGradeChange(e.target.value)}
            min={0}
            max={question.pointValue}
            step="any"
            placeholder="—"
          />
          <span className="grade-max">/ {question.pointValue}</span>
          {response?.pointsEarned != null && (
            <button className="btn-clear-grade" onClick={onClear} title="Clear grade">
              ×
            </button>
          )}
        </div>
      </div>

      {/* AI evaluation hint */}
      {showAI && (
        <div className={`ai-hint ai-hint-${ai!.status}`}>
          <span className="ai-hint-label">AI: {ai!.status}</span>
          <span className="ai-hint-reasoning">{ai!.reasoning}</span>
        </div>
      )}

      {/* Grading key reference */}
      {question.gradingKey && (
        <div className="grading-key">
          <span className="grading-key-label">Key:</span> {question.gradingKey}
        </div>
      )}

      {/* Feedback toggle + input */}
      <div className="grade-feedback-row">
        <button
          className="btn-feedback-toggle"
          onClick={() => setShowFeedback(!showFeedback)}
        >
          {showFeedback ? 'Hide feedback' : response?.feedback ? 'Edit feedback' : 'Add feedback'}
        </button>
        {showFeedback && (
          <div className="grade-feedback-input-container">
            <textarea
              className="grade-feedback-input"
              value={response?.feedback ?? ''}
              onChange={(e) => onFeedbackChange(e.target.value)}
              placeholder="Feedback for this question..."
              maxLength={500}
              rows={2}
            />
            <span className="char-count">{(response?.feedback ?? '').length}/500</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  switch (status) {
    case 'idle':
      return null;
    case 'saving':
      return <span className="save-status save-saving">Saving...</span>;
    case 'saved':
      return <span className="save-status save-saved">Saved</span>;
    case 'error':
      return <span className="save-status save-error" title={error ?? ''}>Save failed</span>;
    case 'conflict':
      return <span className="save-status save-error">Conflict — refreshing</span>;
  }
}
