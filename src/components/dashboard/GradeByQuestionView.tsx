import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useStudentScans, type StudentScanEntry } from '../../hooks/useStudentScans';
import { useScanPages, prefetchScanPages } from '../../hooks/useScanPages';
import type { Scan, QuestionAssignment, AssignmentQuestion, ScanQuestionResponse, ScanPage, QuickFeedbackItem } from '../../types/cloudkit';
import { isAssignmentEditable } from '../../types/cloudkit';
import { saveGrades, saveAssignmentQuickFeedback, type SaveStatus } from '../../lib/cloudkit/save';

function swiftTimestamp(): number {
  return (Date.now() / 1000) - 978307200;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GradingFilter = 'all' | 'graded' | 'ungraded';

interface QuestionStats {
  gradedCount: number;
  submittedCount: number;
  totalCount: number;
  isComplete: boolean;
}

interface GradeByQuestionViewProps {
  assignment: QuestionAssignment;
  courseColor?: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AI_CONFIDENCE_THRESHOLD = 0.6;

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

function getResponseForQuestion(scan: Scan, questionID: string): ScanQuestionResponse | null {
  return scan.questionResponses.find((r) => r.questionID === questionID) ?? null;
}

// ---------------------------------------------------------------------------
// Keyword Highlighting
// ---------------------------------------------------------------------------

interface KeywordMatchData {
  keyword: string;
  matchedString: string;
  rangeLocation: number;
  rangeLength: number;
  isFuzzy: boolean;
  isContextual: boolean;
  score: number | null;
}

type MatchSource = 'keyword' | 'contextual';

interface HighlightSpan {
  start: number;
  end: number;
  source: MatchSource;
  isFuzzy: boolean;
  score: number | null;
  keyword: string;
}

const SOURCE_COLORS: Record<MatchSource, string> = {
  keyword: '255, 210, 76',    // #FFD24C — primaryYellow (all keywords are per-question after IMP-053)
  contextual: '56, 128, 245', // #3880F5 — buttonBlue (AI contextual: blue text on faint blue bg)
};

function parseKeywordMatches(raw: unknown): KeywordMatchData[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is KeywordMatchData =>
    m && typeof m === 'object' &&
    typeof m.rangeLocation === 'number' &&
    typeof m.rangeLength === 'number'
  );
}

function buildHighlightSpans(response: ScanQuestionResponse, transcription: string): HighlightSpan[] {
  const keywordMatches = parseKeywordMatches(response.questionKeywordMatches);

  const spans: HighlightSpan[] = [];

  for (const m of keywordMatches) {
    spans.push({
      start: m.rangeLocation,
      end: m.rangeLocation + m.rangeLength,
      source: 'keyword',
      isFuzzy: m.isFuzzy,
      score: m.score,
      keyword: m.keyword,
    });
  }

  // Contextual matches use phrase-based location finding
  const contextualRaw = response.contextualMatches as Array<{ keyword: string; phrase: string; confidence: number }> | undefined;
  if (Array.isArray(contextualRaw)) {
    for (const cm of contextualRaw) {
      if (!cm.phrase) continue;
      const idx = transcription.toLowerCase().indexOf(cm.phrase.toLowerCase());
      if (idx >= 0) {
        spans.push({
          start: idx,
          end: idx + cm.phrase.length,
          source: 'contextual',
          isFuzzy: false,
          score: cm.confidence,
          keyword: cm.keyword,
        });
      }
    }
  }

  // iOS priority: exact (3) > fuzzy (2) > contextual (1)
  // Non-contextual exact matches win over fuzzy, fuzzy wins over contextual
  function spanPriority(s: HighlightSpan): number {
    if (s.source === 'contextual') return 1;
    return s.isFuzzy ? 2 : 3;
  }

  spans.sort((a, b) => a.start - b.start || spanPriority(b) - spanPriority(a));

  // Remove overlaps — higher priority wins
  const resolved: HighlightSpan[] = [];
  for (const span of spans) {
    const overlaps = resolved.some(
      (r) => span.start < r.end && span.end > r.start
    );
    if (!overlaps) resolved.push(span);
  }

  return resolved;
}

function HighlightedTranscription({ text, spans }: { text: string; spans: HighlightSpan[] }) {
  const [popoverSpan, setPopoverSpan] = useState<{ span: HighlightSpan; rect: DOMRect } | null>(null);

  if (spans.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      parts.push(<span key={`t-${cursor}`}>{text.slice(cursor, span.start)}</span>);
    }

    const isContextual = span.source === 'contextual';
    const hasPopover = isContextual || span.isFuzzy;
    const rgb = SOURCE_COLORS[span.source];

    // iOS styling:
    // - Question/assignment: colored bg at 30% (fuzzy: score * 0.3)
    // - Contextual: faint blue bg (8%), blue text at confidence opacity
    let style: React.CSSProperties;
    if (isContextual) {
      const textOpacity = span.score != null ? span.score : 1.0;
      style = {
        backgroundColor: `rgba(${rgb}, 0.08)`,
        color: `rgba(${rgb}, ${textOpacity})`,
        borderBottom: `1px solid rgba(${rgb}, 0.2)`,
      };
    } else {
      const bgOpacity = span.isFuzzy && span.score != null
        ? Math.max(0.08, span.score * 0.3)
        : 0.3;
      style = {
        backgroundColor: `rgba(${rgb}, ${bgOpacity})`,
        borderBottom: `2px solid rgba(${rgb}, 0.6)`,
      };
    }

    parts.push(
      <span
        key={`h-${span.start}`}
        className={`kw-highlight ${hasPopover ? 'kw-highlight-interactive' : ''}`}
        style={style}
        onMouseEnter={hasPopover ? (e) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          setPopoverSpan({ span, rect });
        } : undefined}
        onMouseLeave={hasPopover ? () => setPopoverSpan(null) : undefined}
      >
        {text.slice(span.start, span.end)}
      </span>
    );
    cursor = span.end;
  }

  if (cursor < text.length) {
    parts.push(<span key={`t-${cursor}`}>{text.slice(cursor)}</span>);
  }

  const popoverLabel = popoverSpan?.span.source === 'contextual'
    ? 'AI Contextual Match'
    : 'Fuzzy Keyword Match';

  return (
    <span className="kw-container">
      {parts}
      {popoverSpan && (
        <div
          className="kw-popover"
          style={{
            position: 'fixed',
            left: popoverSpan.rect.left + popoverSpan.rect.width / 2,
            top: popoverSpan.rect.top - 8,
          }}
        >
          <div className="kw-popover-type">{popoverLabel}</div>
          <div className="kw-popover-keyword">
            Keyword: &ldquo;{popoverSpan.span.keyword}&rdquo;
          </div>
          {popoverSpan.span.score != null && (
            <div className="kw-popover-confidence">
              Confidence: {Math.round(popoverSpan.span.score * 100)}%
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Quick Feedback — helpers
// ---------------------------------------------------------------------------

function getQuickFeedbackForQuestion(assignment: QuestionAssignment, questionID: string): QuickFeedbackItem[] {
  return assignment.quickFeedback
    .filter((item) => item.questionID === questionID)
    .sort((a, b) => {
      const aDate = new Date(a.lastUsedDate ?? a.createdDate).getTime();
      const bDate = new Date(b.lastUsedDate ?? b.createdDate).getTime();
      return bDate - aDate; // descending
    });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GradeByQuestionView({ assignment, courseColor, onBack }: GradeByQuestionViewProps) {
  const { entries, isLoading, error, refresh } = useStudentScans(assignment.id);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [currentStudentIndex, setCurrentStudentIndex] = useState(0);
  const [filter, setFilter] = useState<GradingFilter>('all');
  const [scansDict, setScansDict] = useState<Map<string, Scan>>(new Map());
  const [showMissingScans, setShowMissingScans] = useState(false);
  const [showStudentJump, setShowStudentJump] = useState(false);
  const [hideStudentNames, setHideStudentNames] = useState(false);
  const [isColorInverted, setIsColorInverted] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const questions = assignment.questions;
  const currentQuestion = questions[selectedQuestionIndex] ?? null;
  const chipColor = courseColor ?? '#5002F7';

  // Build scans dict from entries
  useEffect(() => {
    const dict = new Map<string, Scan>();
    for (const entry of entries) {
      dict.set(entry.scan.id, entry.scan);
    }
    setScansDict(dict);
  }, [entries]);

  // Sorted entries (alphabetical by student name)
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const nameA = a.student?.name ?? 'Unknown Student';
      const nameB = b.student?.name ?? 'Unknown Student';
      return nameA.localeCompare(nameB);
    });
  }, [entries]);

  // Split entries: those with uploaded pages vs those without (matches iOS BUG-022 filter)
  const entriesWithPages = useMemo(() => {
    return sortedEntries.filter((e) => e.hasPages);
  }, [sortedEntries]);

  const entriesWithoutPages = useMemo(() => {
    return sortedEntries.filter((e) => !e.hasPages);
  }, [sortedEntries]);

  // Compute question stats (only for entries with uploaded pages)
  const questionStats = useMemo(() => {
    const stats = new Map<string, QuestionStats>();
    for (const q of questions) {
      let gradedCount = 0;
      let submittedCount = 0;
      for (const entry of entriesWithPages) {
        const scan = scansDict.get(entry.scan.id) ?? entry.scan;
        const resp = getResponseForQuestion(scan, q.id);
        if (resp) {
          submittedCount++;
          if (resp.pointsEarned != null) gradedCount++;
        }
      }
      stats.set(q.id, {
        gradedCount,
        submittedCount,
        totalCount: entriesWithPages.length,
        isComplete: submittedCount > 0 && submittedCount === gradedCount,
      });
    }
    return stats;
  }, [questions, entriesWithPages, scansDict]);

  // Filter entries for current question (only entries with pages)
  const filteredEntries = useMemo(() => {
    if (!currentQuestion) return [];
    return entriesWithPages.filter((entry) => {
      const scan = scansDict.get(entry.scan.id) ?? entry.scan;
      const resp = getResponseForQuestion(scan, currentQuestion.id);
      if (!resp) return filter === 'all';
      if (filter === 'graded') return resp.pointsEarned != null;
      if (filter === 'ungraded') return resp.pointsEarned == null;
      return true;
    });
  }, [sortedEntries, currentQuestion, filter, scansDict]);

  // Clamp student index when filtered list changes
  useEffect(() => {
    if (currentStudentIndex >= filteredEntries.length) {
      setCurrentStudentIndex(Math.max(0, filteredEntries.length - 1));
    }
  }, [filteredEntries.length, currentStudentIndex]);

  // Jump to first ungraded when question changes
  useEffect(() => {
    if (!currentQuestion || filteredEntries.length === 0) return;
    for (let i = 0; i < filteredEntries.length; i++) {
      const scan = scansDict.get(filteredEntries[i].scan.id) ?? filteredEntries[i].scan;
      const resp = getResponseForQuestion(scan, currentQuestion.id);
      if (!resp || resp.pointsEarned == null) {
        setCurrentStudentIndex(i);
        return;
      }
    }
    setCurrentStudentIndex(0);
  }, [selectedQuestionIndex]); // intentionally only on question change

  const handleQuestionSelect = useCallback((index: number) => {
    setSelectedQuestionIndex(index);
  }, []);

  const handlePrevStudent = useCallback(() => {
    setCurrentStudentIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNextStudent = useCallback(() => {
    setCurrentStudentIndex((prev) => {
      if (prev >= filteredEntries.length - 1) {
        // At last student — advance to next question if available
        if (selectedQuestionIndex < questions.length - 1) {
          setSelectedQuestionIndex(selectedQuestionIndex + 1);
          // Jump-to-first-ungraded effect will set student index via useEffect
        }
        return prev;
      }
      return prev + 1;
    });
  }, [filteredEntries.length, selectedQuestionIndex, questions.length]);

  const handlePrevQuestion = useCallback(() => {
    setSelectedQuestionIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNextQuestion = useCallback(() => {
    setSelectedQuestionIndex((i) => Math.min(questions.length - 1, i + 1));
  }, [questions.length]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrevStudent(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNextStudent(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); handlePrevQuestion(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); handleNextQuestion(); }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showStudentJump) setShowStudentJump(false);
        else onBack();
      }
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); setShowStudentJump(true); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handlePrevStudent, handleNextStudent, handlePrevQuestion, handleNextQuestion, onBack, showStudentJump]);

  // Jump to a specific student by index
  const handleStudentJump = useCallback((index: number) => {
    setCurrentStudentIndex(index);
    setShowStudentJump(false);
  }, []);

  // Update scansDict optimistically after grading
  const handleScanUpdated = useCallback((updatedScan: Scan) => {
    setScansDict((prev) => {
      const next = new Map(prev);
      next.set(updatedScan.id, updatedScan);
      return next;
    });
  }, []);

  // Bulk grade all ungraded for current question
  const handleBulkGrade = useCallback(async (points: number) => {
    if (!currentQuestion || !isAssignmentEditable(assignment)) return;
    const toGrade: { entry: StudentScanEntry; scan: Scan }[] = [];
    for (const entry of filteredEntries) {
      const scan = scansDict.get(entry.scan.id) ?? entry.scan;
      const resp = getResponseForQuestion(scan, currentQuestion.id);
      if (!resp || resp.pointsEarned == null) {
        toGrade.push({ entry, scan });
      }
    }
    if (toGrade.length === 0) return;
    if (!confirm(`Apply ${points} points to ${toGrade.length} ungraded responses?`)) return;

    for (const { scan } of toGrade) {
      const updatedResponses = updateResponseGrade(scan.questionResponses, currentQuestion, points);
      const updatedScan = { ...scan, questionResponses: updatedResponses };
      handleScanUpdated(updatedScan);
      saveGrades(scan.id, scan.recordChangeTag, updatedResponses, scan.feedback ?? null);
    }
  }, [currentQuestion, filteredEntries, scansDict, handleScanUpdated]);

  // Clear all grades for current question
  const handleClearAll = useCallback(async () => {
    if (!currentQuestion) return;
    const toClear: { entry: StudentScanEntry; scan: Scan }[] = [];
    for (const entry of filteredEntries) {
      const scan = scansDict.get(entry.scan.id) ?? entry.scan;
      const resp = getResponseForQuestion(scan, currentQuestion.id);
      if (resp && resp.pointsEarned != null) {
        toClear.push({ entry, scan });
      }
    }
    if (toClear.length === 0) return;
    if (!confirm(`Clear grades for ${toClear.length} responses?`)) return;

    for (const { scan } of toClear) {
      const updatedResponses = updateResponseGrade(scan.questionResponses, currentQuestion, null);
      const updatedScan = { ...scan, questionResponses: updatedResponses };
      handleScanUpdated(updatedScan);
      saveGrades(scan.id, scan.recordChangeTag, updatedResponses, scan.feedback ?? null);
    }
  }, [currentQuestion, filteredEntries, scansDict, handleScanUpdated]);

  if (isLoading) {
    return (
      <div className="list-loading">
        <div className="spinner" />
        <p>Loading submissions...</p>
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

  if (questions.length === 0) {
    return (
      <div className="list-empty">
        <p>No questions found for this assignment.</p>
        <button onClick={onBack} className="btn-secondary">Back</button>
      </div>
    );
  }

  const currentEntry = filteredEntries[currentStudentIndex] ?? null;
  const currentScan = currentEntry ? (scansDict.get(currentEntry.scan.id) ?? currentEntry.scan) : null;
  const stats = currentQuestion ? questionStats.get(currentQuestion.id) : null;
  const hasPrev = currentStudentIndex > 0;
  const isLastStudent = currentStudentIndex >= filteredEntries.length - 1;
  const hasNextQuestion = selectedQuestionIndex < questions.length - 1;
  const hasNext = !isLastStudent || hasNextQuestion;

  return (
    <div className="gbq-container">
      {/* Top bar: question info + actions */}
      <div className="gbq-top-bar">
        <div className="gbq-top-bar-left">
          <span className="gbq-top-title">GRADE BY QUESTION</span>
          <span className="gbq-top-stats">
            {stats ? `${stats.gradedCount} / ${stats.submittedCount} GRADED` : ''}
          </span>
        </div>
        <div className="gbq-top-bar-right">
          {/* Filter */}
          <div className="gbq-filter-group">
            {(['all', 'graded', 'ungraded'] as GradingFilter[]).map((f) => (
              <button
                key={f}
                className={`gbq-filter-btn ${filter === f ? 'gbq-filter-active' : ''}`}
                style={{ '--filter-color': chipColor } as React.CSSProperties}
                onClick={() => setFilter(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Bulk actions */}
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              const pts = prompt(`Bulk grade: enter points (0–${currentQuestion?.pointValue ?? 0})`);
              if (pts !== null) {
                const n = parseFloat(pts);
                if (!isNaN(n) && n >= 0 && n <= (currentQuestion?.pointValue ?? 0)) handleBulkGrade(n);
              }
            }}
          >
            BULK GRADE
          </button>
          <button className="btn-secondary btn-sm" onClick={handleClearAll}>CLEAR ALL</button>
          <button
            className={`btn-secondary btn-sm ${hideStudentNames ? 'gbq-toggle-active' : ''}`}
            style={hideStudentNames ? { '--toggle-color': chipColor } as React.CSSProperties : undefined}
            onClick={() => setHideStudentNames(!hideStudentNames)}
            title={hideStudentNames ? 'Show student names' : 'Hide student names for blind grading'}
          >
            {hideStudentNames ? 'SHOW NAMES' : 'BLIND'}
          </button>
          <button
            className={`btn-secondary btn-sm ${isColorInverted ? 'gbq-toggle-active' : ''}`}
            style={isColorInverted ? { '--toggle-color': chipColor } as React.CSSProperties : undefined}
            onClick={() => setIsColorInverted(!isColorInverted)}
            title={isColorInverted ? 'Normal colors' : 'Invert scan image colors'}
          >
            {isColorInverted ? 'NORMAL' : 'INVERT'}
          </button>
          <div className="gbq-shortcuts-wrapper">
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className="btn-icon"
              title="Keyboard shortcuts"
            >
              &#x2139;
            </button>
            {showShortcuts && (
              <div className="gbq-shortcuts-popover">
                <div className="gbq-shortcuts-title">Keyboard Shortcuts</div>
                <div className="gbq-shortcut-row"><kbd>&larr;</kbd><span>Previous student</span></div>
                <div className="gbq-shortcut-row"><kbd>&rarr;</kbd><span>Next student</span></div>
                <div className="gbq-shortcut-row"><kbd>&uarr;</kbd><span>Previous question</span></div>
                <div className="gbq-shortcut-row"><kbd>&darr;</kbd><span>Next question</span></div>
                <div className="gbq-shortcut-row"><kbd>J</kbd><span>Jump to student</span></div>
                <div className="gbq-shortcut-row"><kbd>Esc</kbd><span>Back / Close</span></div>
              </div>
            )}
          </div>
          <button onClick={refresh} className="btn-icon" title="Refresh">&#x21bb;</button>
        </div>
      </div>

      <div className="gbq-layout">
        {/* Left sidebar: question list */}
        <div className="gbq-sidebar">
          <div className="gbq-sidebar-header">QUESTIONS</div>
          <div className="gbq-sidebar-list">
            {questions.map((q, index) => {
              const qStats = questionStats.get(q.id);
              const isSelected = index === selectedQuestionIndex;
              return (
                <button
                  key={q.id}
                  className={`gbq-question-row ${isSelected ? 'gbq-question-selected' : ''}`}
                  style={isSelected ? { '--q-color': chipColor } as React.CSSProperties : undefined}
                  onClick={() => handleQuestionSelect(index)}
                >
                  <span
                    className="gbq-question-badge"
                    style={{ background: isSelected ? chipColor : '#e0e0e0', color: isSelected ? 'white' : '#616161' }}
                  >
                    {index + 1}
                  </span>
                  <div className="gbq-question-info">
                    <span className="gbq-question-label">{q.label}</span>
                    <span className="gbq-question-pts">{q.pointValue} PTS</span>
                  </div>
                  <span className={`gbq-question-status ${qStats?.isComplete ? 'gbq-status-complete' : ''}`}>
                    {qStats?.isComplete ? '✓' : `${qStats?.gradedCount ?? 0}/${qStats?.submittedCount ?? 0}`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Missing scans section — students with scan records but no uploaded pages */}
          {entriesWithoutPages.length > 0 && (
            <>
              <button
                className="gbq-missing-header"
                onClick={() => setShowMissingScans(!showMissingScans)}
              >
                <span>NO SCAN ({entriesWithoutPages.length})</span>
                <span className="gbq-missing-chevron">{showMissingScans ? '▾' : '▸'}</span>
              </button>
              {showMissingScans && (
                <div className="gbq-missing-list">
                  {entriesWithoutPages.map((entry) => (
                    <div key={entry.scan.id} className="gbq-missing-row">
                      <div className="gbq-missing-avatar">
                        {initial(entry.student?.name)}
                      </div>
                      <span className="gbq-missing-name">{entry.student?.name ?? 'Unknown Student'}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: student card */}
        <div className="gbq-main">
          {currentEntry && currentScan && currentQuestion ? (
            <StudentQuestionCard
              key={`${currentScan.id}-${currentQuestion.id}`}
              entry={currentEntry}
              scan={currentScan}
              question={currentQuestion}
              assignment={assignment}
              chipColor={chipColor}
              studentIndex={currentStudentIndex}
              totalStudents={filteredEntries.length}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={handlePrevStudent}
              onNext={handleNextStudent}
              onScanUpdated={handleScanUpdated}
              hideStudentNames={hideStudentNames}
              isColorInverted={isColorInverted}
              isLastStudentInQuestion={isLastStudent}
              onStudentNameClick={() => setShowStudentJump(true)}
            />
          ) : (
            <div className="list-empty">
              <p>
                {filteredEntries.length === 0 && filter !== 'all'
                  ? `No ${filter} students for this question.`
                  : 'No students found.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Student Jump Selector Modal */}
      {showStudentJump && currentQuestion && (
        <StudentJumpSelector
          entries={filteredEntries}
          scansDict={scansDict}
          questionID={currentQuestion.id}
          maxPoints={currentQuestion.pointValue}
          currentIndex={currentStudentIndex}
          chipColor={chipColor}
          hideStudentNames={hideStudentNames}
          onSelect={handleStudentJump}
          onClose={() => setShowStudentJump(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student Jump Selector
// ---------------------------------------------------------------------------

interface StudentJumpSelectorProps {
  entries: StudentScanEntry[];
  scansDict: Map<string, Scan>;
  questionID: string;
  maxPoints: number;
  currentIndex: number;
  chipColor: string;
  hideStudentNames: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
}

function StudentJumpSelector({
  entries,
  scansDict,
  questionID,
  maxPoints,
  currentIndex,
  chipColor,
  hideStudentNames,
  onSelect,
  onClose,
}: StudentJumpSelectorProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return entries.map((e, i) => ({ entry: e, originalIndex: i }));
    const query = search.toLowerCase();
    return entries
      .map((e, i) => ({ entry: e, originalIndex: i }))
      .filter(({ entry }) => {
        const name = entry.student?.name ?? 'Unknown Student';
        return name.toLowerCase().includes(query);
      });
  }, [entries, search]);

  return (
    <div className="jump-overlay" onClick={onClose}>
      <div className="jump-modal" onClick={(e) => e.stopPropagation()}>
        <div className="jump-header">
          <span className="jump-title">Select Student</span>
          <button className="jump-cancel" onClick={onClose}>Cancel</button>
        </div>
        <div className="jump-search">
          <input
            ref={searchRef}
            type="text"
            className="jump-search-input"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filteredStudents.length === 1) {
                onSelect(filteredStudents[0].originalIndex);
              }
            }}
          />
        </div>
        <div className="jump-list">
          {filteredStudents.length === 0 ? (
            <div className="jump-empty">
              <span className="jump-empty-icon">&#x1F50D;</span>
              <span className="jump-empty-text">No students found</span>
              <span className="jump-empty-hint">Try a different search term</span>
            </div>
          ) : (
            filteredStudents.map(({ entry, originalIndex }) => {
              const scan = scansDict.get(entry.scan.id) ?? entry.scan;
              const resp = getResponseForQuestion(scan, questionID);
              const isCurrent = originalIndex === currentIndex;
              const isGraded = resp?.pointsEarned != null;
              const displayName = hideStudentNames
                ? `Student ${originalIndex + 1}`
                : (entry.student?.name ?? 'Unknown Student');

              return (
                <button
                  key={entry.scan.id}
                  className={`jump-row ${isCurrent ? 'jump-row-current' : ''}`}
                  onClick={() => onSelect(originalIndex)}
                >
                  <span className={`jump-status ${isCurrent ? 'jump-status-current' : isGraded ? 'jump-status-graded' : 'jump-status-ungraded'}`}>
                    {isCurrent ? '→' : isGraded ? '✓' : '○'}
                  </span>
                  <span className="jump-name">{displayName}</span>
                  <span className="jump-right">
                    {isCurrent ? (
                      <span className="jump-badge" style={{ background: `color-mix(in srgb, ${chipColor} 15%, transparent)`, color: chipColor }}>Current</span>
                    ) : isGraded ? (
                      <span className="jump-score">
                        {formatScore(resp!.pointsEarned!)}/{formatScore(maxPoints)}
                      </span>
                    ) : (
                      <span className="jump-ungraded">Not graded</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

// ---------------------------------------------------------------------------
// Update response helper
// ---------------------------------------------------------------------------

function updateResponseGrade(
  responses: ScanQuestionResponse[],
  question: AssignmentQuestion,
  value: number | null,
): ScanQuestionResponse[] {
  let found = false;
  const updated = responses.map((r) => {
    if (r.questionID !== question.id) return r;
    found = true;
    return {
      ...r,
      pointsEarned: value,
      gradedAt: value !== null ? swiftTimestamp() : null,
      lastUpdated: swiftTimestamp(),
    };
  });
  if (!found && value !== null) {
    updated.push({
      id: crypto.randomUUID(),
      questionID: question.id,
      questionLabel: question.label,
      fragments: [],
      feedback: null,
      pointsEarned: value,
      gradedAt: swiftTimestamp(),
      aiEvaluation: null,
      lastUpdated: swiftTimestamp(),
      pageNumber: null,
    });
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Student Question Card
// ---------------------------------------------------------------------------

interface StudentQuestionCardProps {
  entry: StudentScanEntry;
  scan: Scan;
  question: AssignmentQuestion;
  assignment: QuestionAssignment;
  chipColor: string;
  studentIndex: number;
  totalStudents: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onScanUpdated: (scan: Scan) => void;
  hideStudentNames: boolean;
  isColorInverted: boolean;
  isLastStudentInQuestion: boolean;
  onStudentNameClick: () => void;
}

function StudentQuestionCard({
  entry,
  scan,
  question,
  assignment,
  chipColor,
  studentIndex,
  totalStudents,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onScanUpdated,
  hideStudentNames,
  isColorInverted,
  isLastStudentInQuestion,
  onStudentNameClick,
}: StudentQuestionCardProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fullPointsOnly, setFullPointsOnly] = useState(true);
  const [localFeedback, setLocalFeedback] = useState('');
  const [imgFailed, setImgFailed] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [manualPageIndex, setManualPageIndex] = useState<number | null>(null);
  const [quickFeedbackItems, setQuickFeedbackItems] = useState<QuickFeedbackItem[]>([]);
  const [questionExpanded, setQuestionExpanded] = useState(true);
  const [transcriptionExpanded, setTranscriptionExpanded] = useState(true);
  const [gradingKeyExpanded, setGradingKeyExpanded] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(true);
  const changeTagRef = useRef(scan.recordChangeTag);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const response = getResponseForQuestion(scan, question.id);
  const studentName = hideStudentNames
    ? `Student ${studentIndex + 1}`
    : (entry.student?.name ?? 'Unknown Student');

  // Load scan pages for this student's scan
  const { pages } = useScanPages(scan.id);

  // Sort pages by pageNumber for consistent ordering
  const sortedPages = useMemo(() => {
    return [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  }, [pages]);

  // Determine which page to show — manual override or template-based
  const defaultPageIndex = useMemo(() => {
    if (sortedPages.length === 0) return 0;
    if (question.templatePageNumber != null) {
      const targetPageNum = question.templatePageNumber + 1;
      const idx = sortedPages.findIndex((p) => p.pageNumber === targetPageNum);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [sortedPages, question.templatePageNumber]);

  const currentPageIndex = manualPageIndex ?? defaultPageIndex;
  const relevantPage: ScanPage | null = sortedPages[currentPageIndex] ?? null;

  // Prefetch adjacent students' scan pages
  useEffect(() => {
    // Prefetch is handled via the parent — but we can trigger for neighbors
  }, [studentIndex]);

  // Load quick feedback from assignment (synced via CloudKit)
  useEffect(() => {
    setQuickFeedbackItems(getQuickFeedbackForQuestion(assignment, question.id));
  }, [assignment.id, assignment.quickFeedback, question.id]);

  // Reset local state when student/question changes
  useEffect(() => {
    setLocalFeedback(response?.feedback ?? '');
    changeTagRef.current = scan.recordChangeTag;
    setSaveStatus('idle');
    setSaveError(null);
    setImgFailed(false);
    setShowZoom(false);
    setManualPageIndex(null);
  }, [scan.id, question.id]);

  // Sync feedback from response (after save updates scan)
  useEffect(() => {
    setLocalFeedback(response?.feedback ?? '');
  }, [response?.feedback]);

  const doSave = useCallback(
    async (updatedResponses: ScanQuestionResponse[]) => {
      setSaveStatus('saving');
      setSaveError(null);
      const result = await saveGrades(scan.id, changeTagRef.current, updatedResponses, scan.feedback ?? null);
      if (result.success) {
        if (result.newChangeTag) changeTagRef.current = result.newChangeTag;
        setSaveStatus('saved');
        onScanUpdated({
          ...scan,
          questionResponses: updatedResponses,
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
    (updatedResponses: ScanQuestionResponse[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSave(updatedResponses), 500);
    },
    [doSave],
  );

  const handleGradeChange = useCallback(
    (value: number | null) => {
      if (value !== null) {
        if (value < 0 || value > question.pointValue) return;
      }
      const updatedResponses = updateResponseGrade(scan.questionResponses, question, value);
      onScanUpdated({ ...scan, questionResponses: updatedResponses });
      scheduleSave(updatedResponses);
    },
    [scan, question, onScanUpdated, scheduleSave],
  );

  const applyFeedbackToScan = useCallback(
    (feedback: string) => {
      const updated = scan.questionResponses.map((r) => {
        if (r.questionID !== question.id) return r;
        return { ...r, feedback: feedback || null, lastUpdated: swiftTimestamp() };
      });
      // If no response exists yet, create one with just feedback
      if (!updated.find((r) => r.questionID === question.id)) {
        updated.push({
          id: crypto.randomUUID(),
          questionID: question.id,
          questionLabel: question.label,
          fragments: [],
          feedback: feedback || null,
          pointsEarned: null,
          gradedAt: null,
          aiEvaluation: null,
          lastUpdated: swiftTimestamp(),
          pageNumber: null,
        });
      }
      onScanUpdated({ ...scan, questionResponses: updated });
      scheduleSave(updated);
    },
    [scan, question, onScanUpdated, scheduleSave],
  );

  const handleFeedbackChange = useCallback(
    (feedback: string) => {
      if (feedback.length > 500) return;
      setLocalFeedback(feedback);
      applyFeedbackToScan(feedback);
    },
    [applyFeedbackToScan],
  );

  // Quick feedback handlers
  const handleQuickFeedbackTap = useCallback(
    (text: string) => {
      const separator = localFeedback.length > 0 ? ' ' : '';
      const newFeedback = (localFeedback + separator + text).slice(0, 500);
      setLocalFeedback(newFeedback);
      applyFeedbackToScan(newFeedback);
    },
    [localFeedback, applyFeedbackToScan],
  );

  const handleSaveAsQuickFeedback = useCallback(() => {
    const trimmed = localFeedback.trim();
    if (!trimmed) return;
    if (quickFeedbackItems.some((item) => item.text === trimmed)) return;
    const now = new Date().toISOString();
    const newItem: QuickFeedbackItem = {
      id: crypto.randomUUID(),
      questionID: question.id,
      text: trimmed,
      createdDate: now,
      lastModifiedDate: now,
      lastUsedDate: null,
    };
    const updatedForQuestion = [...quickFeedbackItems, newItem];
    setQuickFeedbackItems(updatedForQuestion);
    // Write the full assignment quickFeedback array (other questions' items + this question's updated items)
    const otherItems = assignment.quickFeedback.filter((item) => item.questionID !== question.id);
    const fullArray = [...otherItems, ...updatedForQuestion];
    assignment.quickFeedback = fullArray;
    saveAssignmentQuickFeedback(assignment.id, assignment.recordChangeTag, fullArray).then((result) => {
      if (result.newChangeTag) assignment.recordChangeTag = result.newChangeTag;
    });
  }, [localFeedback, quickFeedbackItems, assignment, question.id]);

  const handleDeleteQuickFeedback = useCallback(
    (id: string) => {
      const updatedForQuestion = quickFeedbackItems.filter((item) => item.id !== id);
      setQuickFeedbackItems(updatedForQuestion);
      const otherItems = assignment.quickFeedback.filter((item) => item.questionID !== question.id);
      const fullArray = [...otherItems, ...updatedForQuestion];
      assignment.quickFeedback = fullArray;
      saveAssignmentQuickFeedback(assignment.id, assignment.recordChangeTag, fullArray).then((result) => {
        if (result.newChangeTag) assignment.recordChangeTag = result.newChangeTag;
      });
    },
    [quickFeedbackItems, assignment, question.id],
  );

  // Grade chips
  const chips: number[] = [];
  const increment = fullPointsOnly ? 1 : 0.5;
  for (let i = 0; i <= question.pointValue; i += increment) chips.push(i);

  const handleChipClick = (value: number) => {
    if (response?.pointsEarned === value) handleGradeChange(null);
    else handleGradeChange(value);
  };

  const transcription = response?.fragments
    ?.map((f: { text?: string }) => f.text)
    .filter(Boolean)
    .join(' ') || null;

  const highlightSpans = useMemo(() => {
    if (!transcription || !response) return [];
    return buildHighlightSpans(response, transcription);
  }, [transcription, response]);

  const ai = response?.aiEvaluation;
  const showAI = ai && ai.confidence >= AI_CONFIDENCE_THRESHOLD;

  return (
    <div className="gbq-card-wrapper">
      {/* Student nav bar */}
      <div className="student-nav-bar">
        <button onClick={onPrev} disabled={!hasPrev} className="nav-btn">
          &larr; PREV
        </button>
        <div className="nav-center">
          <div className="student-avatar" style={{ background: chipColor }}>
            {hideStudentNames ? '#' : initial(entry.student?.name)}
          </div>
          <button className="nav-name-btn" onClick={onStudentNameClick} title="Jump to student (J)">
            <span className="nav-name">{studentName}</span>
            <span className="nav-pos">{studentIndex + 1} / {totalStudents}</span>
          </button>
          <span className="nav-score">
            {response?.pointsEarned != null ? response.pointsEarned : '—'} / {question.pointValue} PTS
          </span>
          <NavSaveIndicator status={saveStatus} error={saveError} />
        </div>
        <button onClick={onNext} disabled={!hasNext} className="nav-btn">
          {isLastStudentInQuestion && hasNext ? 'NEXT Q' : 'NEXT'} &rarr;
        </button>
      </div>

      {/* Two-column: image left, grading right */}
      <div className="gbq-card-layout">
        {/* Left: Student scan image */}
        <div className="gbq-image-panel">
          <div className="grade-card-standalone">
            <div className="grade-card-header">
              <span className="grade-card-q">STUDENT</span>
              <span className="grade-card-header-spacer" />
              {sortedPages.length > 1 ? (
                <div className="page-nav">
                  <button
                    className="page-nav-btn"
                    disabled={currentPageIndex <= 0}
                    onClick={() => { setManualPageIndex(Math.max(0, currentPageIndex - 1)); setImgFailed(false); }}
                  >
                    &lsaquo;
                  </button>
                  <span className="page-nav-label">PAGE {currentPageIndex + 1} / {sortedPages.length}</span>
                  <button
                    className="page-nav-btn"
                    disabled={currentPageIndex >= sortedPages.length - 1}
                    onClick={() => { setManualPageIndex(Math.min(sortedPages.length - 1, currentPageIndex + 1)); setImgFailed(false); }}
                  >
                    &rsaquo;
                  </button>
                </div>
              ) : (
                <span className="grade-card-pts">
                  {relevantPage ? `PAGE ${relevantPage.pageNumber}` : 'IMAGE'}
                </span>
              )}
            </div>
            <div className="gbq-image-body">
              {relevantPage?.imageUrl && !imgFailed ? (
                <img
                  src={relevantPage.imageUrl}
                  alt={`Page ${relevantPage.pageNumber}`}
                  className="scan-image scan-image-clickable"
                  style={isColorInverted ? { filter: 'invert(1)' } : undefined}
                  onClick={() => setShowZoom(true)}
                  onError={() => setImgFailed(true)}
                />
              ) : relevantPage?.transcript ? (
                <div className="scan-transcript-fallback">
                  <p className="transcript-fallback-note">
                    Image not available — showing OCR transcript
                  </p>
                  <pre>{relevantPage.transcript}</pre>
                </div>
              ) : pages.length === 0 ? (
                <div className="scan-image-placeholder">
                  <p>Loading scan...</p>
                </div>
              ) : (
                <div className="scan-image-placeholder">
                  <p>No image available</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Grading card */}
        <div className="gbq-grade-panel">
          <div className="grade-card-standalone">
            <div className="grade-card-header">
              <span className="grade-card-q">{question.label}</span>
              <span className="grade-card-header-spacer" />
              <span className="grade-card-pts">{question.pointValue} PTS</span>
            </div>

            <div className="grade-card-body">
              {/* Question prompt — collapsible */}
              <button className="collapse-header" onClick={() => setQuestionExpanded(!questionExpanded)}>
                <span className="collapse-title">Question</span>
                <span className={`collapse-chevron ${questionExpanded ? 'collapse-open' : ''}`}>&#x276F;</span>
              </button>
              {questionExpanded && (
                <div className="grade-card-prompt">{question.prompt}</div>
              )}

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

              {/* STUDENT: Transcription — collapsible */}
              {transcription && (
                <>
                  <div className="grade-card-divider" />
                  <button className="voice-row voice-row-collapsible" onClick={() => setTranscriptionExpanded(!transcriptionExpanded)}>
                    <span className="voice-pill" style={{ background: chipColor }}>STUDENT</span>
                    <span className="voice-label" style={{ color: chipColor }}>Transcription</span>
                    <span className={`collapse-chevron ${transcriptionExpanded ? 'collapse-open' : ''}`}>&#x276F;</span>
                  </button>
                  {transcriptionExpanded && (
                    <div className="voice-body">
                      <HighlightedTranscription text={transcription} spans={highlightSpans} />
                    </div>
                  )}
                </>
              )}

              {/* TEACHER: Grading Key — collapsible, collapsed by default */}
              {question.gradingKey && (
                <>
                  <div className="grade-card-divider" />
                  <button className="voice-row voice-row-collapsible" onClick={() => setGradingKeyExpanded(!gradingKeyExpanded)}>
                    <span className="voice-pill voice-pill-teacher">TEACHER</span>
                    <span className="voice-label voice-label-teacher">Grading Key</span>
                    <span className={`collapse-chevron ${gradingKeyExpanded ? 'collapse-open' : ''}`}>&#x276F;</span>
                  </button>
                  {gradingKeyExpanded && (
                    <div className="voice-body voice-body-italic">{question.gradingKey}</div>
                  )}
                </>
              )}

              {/* AI: Evaluation — collapsible */}
              {showAI && (
                <>
                  <div className="grade-card-divider" />
                  <button className="voice-row voice-row-collapsible" onClick={() => setAiExpanded(!aiExpanded)}>
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
                    <span className={`collapse-chevron ${aiExpanded ? 'collapse-open' : ''}`}>&#x276F;</span>
                  </button>
                  {aiExpanded && (
                    <div className="voice-body">
                      {ai!.reasoning}
                      <div className="voice-ai-advisory">AI evaluation is advisory only.</div>
                    </div>
                  )}
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
                  onChange={(e) => handleFeedbackChange(e.target.value)}
                  placeholder="Type feedback..."
                  maxLength={500}
                  rows={2}
                />
              </div>

              {/* Save as Quick Feedback button */}
              <button
                className="btn-save-quick-feedback"
                onClick={handleSaveAsQuickFeedback}
                disabled={!localFeedback.trim()}
              >
                + Save Quick Feedback
              </button>

              {/* Quick Feedback Chips */}
              {quickFeedbackItems.length > 0 && (
                <div className="quick-feedback-chips">
                  {quickFeedbackItems.map((item) => (
                    <span key={item.id} className="quick-chip-wrapper">
                      <button
                        className="quick-chip"
                        onClick={() => handleQuickFeedbackTap(item.text)}
                        title={`Click to insert: "${item.text}"`}
                      >
                        {item.text}
                      </button>
                      <button
                        className="quick-chip-delete"
                        onClick={() => handleDeleteQuickFeedback(item.id)}
                        title="Remove"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image Zoom Overlay */}
      {showZoom && relevantPage?.imageUrl && (
        <div className="zoom-overlay" onClick={() => setShowZoom(false)}>
          <div className="zoom-controls">
            <span className="zoom-page-label">Page {relevantPage.pageNumber}</span>
            <button className="zoom-close" onClick={() => setShowZoom(false)}>&times;</button>
          </div>
          <img
            src={relevantPage.imageUrl}
            alt={`Page ${relevantPage.pageNumber} (zoomed)`}
            className="zoom-image"
            style={isColorInverted ? { filter: 'invert(1)' } : undefined}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
