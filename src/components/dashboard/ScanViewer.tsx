import { useState, useCallback } from 'react';
import { useScanPages } from '../../hooks/useScanPages';
import type { Scan, QuestionAssignment } from '../../types/cloudkit';
import type { StudentScanEntry } from '../../hooks/useStudentScans';
import { GradingPanel } from './GradingPanel';

interface ScanViewerProps {
  entry: StudentScanEntry;
  assignment: QuestionAssignment;
  /** All entries for prev/next navigation */
  allEntries: StudentScanEntry[];
  onBack: () => void;
  onNavigate: (entry: StudentScanEntry) => void;
}

export function ScanViewer({ entry, assignment, allEntries, onBack, onNavigate }: ScanViewerProps) {
  const { pages, isLoading, error, refresh } = useScanPages(entry.scan.id);
  const [currentPage, setCurrentPage] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [imgFailed, setImgFailed] = useState(false);
  const [currentScan, setCurrentScan] = useState<Scan>(entry.scan);

  const studentName = entry.student?.name ?? 'Unknown Student';

  // Student navigation
  const currentIndex = allEntries.findIndex((e) => e.scan.id === entry.scan.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allEntries.length - 1;

  const handlePrevStudent = useCallback(() => {
    if (hasPrev) onNavigate(allEntries[currentIndex - 1]);
  }, [hasPrev, allEntries, currentIndex, onNavigate]);

  const handleNextStudent = useCallback(() => {
    if (hasNext) onNavigate(allEntries[currentIndex + 1]);
  }, [hasNext, allEntries, currentIndex, onNavigate]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && hasPrev) handlePrevStudent();
      if (e.key === 'ArrowRight' && hasNext) handleNextStudent();
    },
    [hasPrev, hasNext, handlePrevStudent, handleNextStudent],
  );

  const handlePagePrev = useCallback(() => { setCurrentPage((p) => Math.max(0, p - 1)); setImgFailed(false); }, []);
  const handlePageNext = useCallback(
    () => setCurrentPage((p) => Math.min(pages.length - 1, p + 1)),
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
    <div className="scan-viewer" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Student navigation bar */}
      <div className="student-nav-bar">
        <button onClick={handlePrevStudent} disabled={!hasPrev} className="btn-secondary btn-sm">
          ← Prev Student
        </button>
        <span className="student-nav-name">
          {studentName} ({currentIndex + 1} / {allEntries.length})
        </span>
        <button onClick={handleNextStudent} disabled={!hasNext} className="btn-secondary btn-sm">
          Next Student →
        </button>
      </div>

      <div className="scan-viewer-layout">
        {/* Left: Scan image */}
        <div className="scan-viewer-image-panel">
          <div className="scan-viewer-controls">
            <button onClick={handleZoomOut} className="btn-icon" title="Zoom out">−</button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn} className="btn-icon" title="Zoom in">+</button>
            <button onClick={handleFitWidth} className="btn-icon" title="Fit width">⊡</button>
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className={`btn-icon ${showTranscript ? 'btn-icon-active' : ''}`}
              title="Toggle transcript"
            >
              T
            </button>
          </div>

          {pages.length > 0 ? (
            <>
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

              {showTranscript && page && (
                <div className="scan-transcript">
                  <h3>OCR Transcript — Page {page.pageNumber}</h3>
                  <pre>{page.transcript || '(No transcript available)'}</pre>
                </div>
              )}

              {pages.length > 1 && (
                <div className="page-nav">
                  <button onClick={handlePagePrev} disabled={currentPage === 0} className="btn-secondary btn-sm">
                    ← Prev
                  </button>
                  <span className="page-indicator">
                    Page {currentPage + 1} of {pages.length}
                  </span>
                  <button
                    onClick={handlePageNext}
                    disabled={currentPage === pages.length - 1}
                    className="btn-secondary btn-sm"
                  >
                    Next →
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

        {/* Right: Grading panel */}
        <div className="scan-viewer-grade-panel">
          <GradingPanel
            scan={currentScan}
            assignment={assignment}
            onScanUpdated={handleScanUpdated}
          />
        </div>
      </div>
    </div>
  );
}
