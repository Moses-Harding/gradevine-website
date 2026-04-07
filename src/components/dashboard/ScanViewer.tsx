import { useState, useCallback, useEffect, useMemo } from 'react';
import { useScanPages, prefetchScanPages } from '../../hooks/useScanPages';
import type { Scan, QuestionAssignment } from '../../types/cloudkit';
import type { StudentScanEntry } from '../../hooks/useStudentScans';
import type { SaveStatus } from '../../lib/cloudkit/save';
import { GradingPanel } from './GradingPanel';

interface ScanViewerProps {
  entry: StudentScanEntry;
  assignment: QuestionAssignment;
  allEntries: StudentScanEntry[];
  courseColor?: string;
  onBack: () => void;
  onNavigate: (entry: StudentScanEntry) => void;
}

function initial(name: string | undefined): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

export function ScanViewer({ entry, assignment, allEntries, courseColor, onBack, onNavigate }: ScanViewerProps) {
  const { pages, isLoading, error, refresh } = useScanPages(entry.scan.id);
  const [currentPage, setCurrentPage] = useState(0);
  type ViewMode = 'image' | 'transcript' | 'both';
  const [viewMode, setViewMode] = useState<ViewMode>('image');
  const [zoom, setZoom] = useState(1);
  const [imgFailed, setImgFailed] = useState(false);
  const [currentScan, setCurrentScan] = useState<Scan>(entry.scan);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const studentName = entry.student?.name ?? 'Unknown Student';
  const avatarColor = courseColor ?? '#5002F7';

  const totalEarned = useMemo(
    () => currentScan.questionResponses.reduce((sum, r) => sum + (r.pointsEarned ?? 0), 0),
    [currentScan.questionResponses],
  );
  const totalPossible = useMemo(
    () => assignment.questions.reduce((sum, q) => sum + q.pointValue, 0),
    [assignment.questions],
  );

  const currentIndex = allEntries.findIndex((e) => e.scan.id === entry.scan.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allEntries.length - 1;

  useEffect(() => {
    if (hasNext) prefetchScanPages(allEntries[currentIndex + 1].scan.id);
    if (hasPrev) prefetchScanPages(allEntries[currentIndex - 1].scan.id);
  }, [currentIndex, allEntries, hasNext, hasPrev]);

  useEffect(() => {
    setCurrentPage(0);
    setImgFailed(false);
    setCurrentScan(entry.scan);
  }, [entry.scan.id]);

  const handlePrevStudent = useCallback(() => {
    if (hasPrev) onNavigate(allEntries[currentIndex - 1]);
  }, [hasPrev, allEntries, currentIndex, onNavigate]);

  const handleNextStudent = useCallback(() => {
    if (hasNext) onNavigate(allEntries[currentIndex + 1]);
  }, [hasNext, allEntries, currentIndex, onNavigate]);

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

  const handlePagePrev = useCallback(() => { setCurrentPage((p) => Math.max(0, p - 1)); setImgFailed(false); }, []);
  const handlePageNext = useCallback(
    () => { setCurrentPage((p) => Math.min(pages.length - 1, p + 1)); setImgFailed(false); },
    [pages.length],
  );
  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(3, z + 0.25)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(0.5, z - 0.25)), []);
  const handleFitWidth = useCallback(() => setZoom(1), []);

  const handleScanUpdated = useCallback((updatedScan: Scan) => {
    setCurrentScan(updatedScan);
  }, []);

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
          <div className="student-avatar" style={{ background: avatarColor }}>
            {initial(entry.student?.name)}
          </div>
          <span className="nav-name">{studentName}</span>
          <span className="nav-pos">{currentIndex + 1} / {allEntries.length}</span>
          <span className="nav-score">{totalEarned} / {totalPossible} PTS</span>
          <NavSaveIndicator status={saveStatus} error={saveError} />
        </div>
        <button onClick={handleNextStudent} disabled={!hasNext} className="nav-btn">
          NEXT &rarr;
        </button>
      </div>

      <div className="scan-viewer-layout">
        {/* Left: Scan image with STUDENT voice label */}
        <div className="scan-viewer-image-panel">
          <div className="scan-image-header">
            <div className="voice-row">
              <span className="voice-pill" style={{ background: avatarColor }}>STUDENT</span>
              <span className="voice-label" style={{ color: avatarColor }}>
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
                <button
                  className={`view-mode-btn ${viewMode === 'image' ? 'view-mode-active' : ''}`}
                  onClick={() => setViewMode('image')}
                  title="Image only"
                >
                  IMG
                </button>
                <button
                  className={`view-mode-btn ${viewMode === 'both' ? 'view-mode-active' : ''}`}
                  onClick={() => setViewMode('both')}
                  title="Image and transcript"
                >
                  BOTH
                </button>
                <button
                  className={`view-mode-btn ${viewMode === 'transcript' ? 'view-mode-active' : ''}`}
                  onClick={() => setViewMode('transcript')}
                  title="Transcript only"
                >
                  TXT
                </button>
              </div>
            </div>
          </div>

          {pages.length > 0 ? (
            <>
              {/* Image */}
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
                      <p className="transcript-fallback-note">
                        Image not available — showing OCR transcript
                      </p>
                      <pre>{page.transcript}</pre>
                    </div>
                  ) : (
                    <div className="scan-image-placeholder">
                      <p>Image not available</p>
                    </div>
                  )}
                </div>
              )}

              {/* Transcript */}
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
                  <span className="page-indicator">
                    Page {currentPage + 1} of {pages.length}
                  </span>
                  <button
                    onClick={handlePageNext}
                    disabled={currentPage === pages.length - 1}
                    className="btn-secondary btn-sm"
                  >
                    Next &rarr;
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="list-empty">
              <p>No pages found for this scan.</p>
            </div>
          )}
        </div>

        {/* Right: Grading — individual question cards, no wrapper */}
        <div className="scan-viewer-grade-panel">
          <GradingPanel
            scan={currentScan}
            assignment={assignment}
            courseColor={courseColor}
            onScanUpdated={handleScanUpdated}
            onSaveStatusChange={(s, e) => { setSaveStatus(s); setSaveError(e); }}
          />
        </div>
      </div>
    </div>
  );
}

function NavSaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  switch (status) {
    case 'idle': return null;
    case 'saving': return <span className="nav-save-status nav-save-saving">SAVING...</span>;
    case 'saved': return <span className="nav-save-status nav-save-saved">SAVED</span>;
    case 'error': return <span className="nav-save-status nav-save-error" title={error ?? ''}>SAVE FAILED</span>;
    case 'conflict': return <span className="nav-save-status nav-save-error">CONFLICT</span>;
  }
}
