/**
 * Save grades back to CloudKit.
 *
 * Updates the Scan record's questionResponsesData, feedback, and lastModifiedDate.
 * Handles conflict resolution via recordChangeTag.
 */

import { CLOUDKIT_ZONE } from './config';
import { getContainer, type CKJSRecord } from './auth';
import type { Scan, ScanQuestionResponse, QuickFeedbackItem } from '../../types/cloudkit';
import { invalidateCachePrefix } from './cache';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface SaveResult {
  success: boolean;
  status: SaveStatus;
  error?: string;
}

/**
 * Save updated grade data for a scan back to CloudKit.
 *
 * @param scanRecordName - The CloudKit record name (scan ID)
 * @param recordChangeTag - The last known change tag (for conflict detection)
 * @param questionResponses - The full updated question responses array
 * @param feedback - Scan-level feedback (or null to leave unchanged)
 */
export async function saveGrades(
  scanRecordName: string,
  recordChangeTag: string,
  questionResponses: ScanQuestionResponse[],
  feedback: string | null,
): Promise<{ success: boolean; newChangeTag?: string; error?: string }> {
  const db = getContainer().privateCloudDatabase;

  // JSON-encode question responses to match iOS format (JSONEncoder → Data)
  const responsesJson = JSON.stringify(questionResponses);
  // Convert UTF-8 string to base64 (matching iOS JSONEncoder → Data → CKRecord BYTES)
  const responsesBytes = new TextEncoder().encode(responsesJson);
  const responsesBase64 = btoa(String.fromCharCode(...responsesBytes));

  const recordToSave = {
    recordName: scanRecordName,
    recordType: 'Scan',
    recordChangeTag,
    fields: {
      questionResponsesData: { value: responsesBase64, type: 'BYTES' },
      lastModifiedDate: { value: Date.now(), type: 'TIMESTAMP' },
      // Only include feedback when non-empty — the field may not exist in the
      // CloudKit schema yet (e.g. after a dev environment reset).
      ...(feedback ? { feedback: { value: feedback, type: 'STRING' } } : {}),
    },
  };

  try {
    const response = await db.saveRecords(recordToSave, {
      zoneID: { zoneName: CLOUDKIT_ZONE },
    });

    if (response.hasErrors) {
      const errorRecord = response.records.find((r: CKJSRecord) => r.serverErrorCode);
      if (errorRecord) {
        if (errorRecord.serverErrorCode === 'CONFLICT') {
          return { success: false, error: 'Record was modified by another device. Refreshing...' };
        }
        return { success: false, error: errorRecord.reason ?? 'Save failed' };
      }
      // CloudKit JS may report hasErrors with errors in _errors instead of records
      return { success: false, error: 'Save failed' };
    }

    // Invalidate cached scans so next fetch gets fresh data
    invalidateCachePrefix('scans-');

    const savedRecord = response.records[0];
    return {
      success: true,
      newChangeTag: savedRecord?.recordChangeTag,
    };
  } catch (err: unknown) {
    const ckErr = err as { serverErrorCode?: string; reason?: string };
    if (ckErr.serverErrorCode === 'CONFLICT') {
      return { success: false, error: 'Record was modified by another device. Refreshing...' };
    }
    return {
      success: false,
      error: ckErr.reason ?? (err instanceof Error ? err.message : 'Save failed'),
    };
  }
}

/**
 * Save updated quick feedback for an assignment back to CloudKit.
 *
 * Writes the full quickFeedback array as a JSON blob (BYTES field)
 * on the Assignment record. Last-write-wins — no per-item merge.
 */
export async function saveAssignmentQuickFeedback(
  assignmentRecordName: string,
  recordChangeTag: string,
  quickFeedback: QuickFeedbackItem[],
): Promise<{ success: boolean; newChangeTag?: string; error?: string }> {
  const db = getContainer().privateCloudDatabase;

  const feedbackJson = JSON.stringify(quickFeedback);
  const feedbackBytes = new TextEncoder().encode(feedbackJson);
  const feedbackBase64 = btoa(String.fromCharCode(...feedbackBytes));

  const recordToSave = {
    recordName: assignmentRecordName,
    recordType: 'Assignment',
    recordChangeTag,
    fields: {
      quickFeedbackData: { value: feedbackBase64, type: 'BYTES' },
      updatedDate: { value: Date.now(), type: 'TIMESTAMP' },
    },
  };

  try {
    const response = await db.saveRecords(recordToSave, {
      zoneID: { zoneName: CLOUDKIT_ZONE },
    });

    if (response.hasErrors) {
      const errorRecord = response.records.find((r: CKJSRecord) => r.serverErrorCode);
      if (errorRecord) {
        return { success: false, error: errorRecord.reason ?? 'Save failed' };
      }
      // CloudKit JS may report hasErrors with errors in _errors instead of records
      return { success: false, error: 'Save failed' };
    }

    invalidateCachePrefix('assignments-');
    const savedRecord = response.records[0];
    return { success: true, newChangeTag: savedRecord?.recordChangeTag };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Save failed',
    };
  }
}
