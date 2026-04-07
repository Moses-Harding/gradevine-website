/**
 * CloudKit data operations via CloudKit JS.
 *
 * Uses the CloudKit JS container's privateCloudDatabase for all queries
 * and mutations. Auth is handled automatically by CloudKit JS.
 */

import { CLOUDKIT_ZONE } from './config';
import { getContainer, type CKJSRecord, type CKJSFilter, type CKJSQuery } from './auth';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class CloudKitError extends Error {
  constructor(
    message: string,
    public readonly serverErrorCode: string,
  ) {
    super(message);
    this.name = 'CloudKitError';
  }
}

export class AuthExpiredError extends CloudKitError {
  constructor() {
    super('Authentication expired. Please sign in again.', 'AUTHENTICATION_REQUIRED');
    this.name = 'AuthExpiredError';
  }
}

export class ZoneNotFoundError extends CloudKitError {
  constructor() {
    super(
      'GradeVineSync zone not found. Have you opened the iOS app at least once?',
      'ZONE_NOT_FOUND',
    );
    this.name = 'ZoneNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function checkForErrors(records: CKJSRecord[]): void {
  for (const record of records) {
    if (record.serverErrorCode) {
      if (record.serverErrorCode === 'AUTHENTICATION_REQUIRED') {
        throw new AuthExpiredError();
      }
      if (record.serverErrorCode === 'ZONE_NOT_FOUND') {
        throw new ZoneNotFoundError();
      }
      throw new CloudKitError(
        record.reason ?? 'CloudKit operation failed',
        record.serverErrorCode,
      );
    }
  }
}

export interface QueryFilter {
  fieldName: string;
  comparator: 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'BEGINS_WITH';
  fieldValue: { value: unknown; type?: string };
}

/**
 * Query records in the GradeVineSync zone via CloudKit JS.
 * Automatically handles pagination via continuationMarker.
 */
export async function queryRecords(
  recordType: string,
  filters: QueryFilter[] = [],
  maxRecords?: number,
): Promise<CKJSRecord[]> {
  const db = getContainer().privateCloudDatabase;
  const allRecords: CKJSRecord[] = [];
  let continuationMarker: string | undefined;

  do {
    const query: CKJSQuery = {
      recordType,
      filterBy: filters as CKJSFilter[],
      zoneID: { zoneName: CLOUDKIT_ZONE },
      resultsLimit: 200,
    };

    if (continuationMarker) {
      query.continuationMarker = continuationMarker;
    }

    let response;
    try {
      response = await db.performQuery(query);
    } catch (err: unknown) {
      const ckErr = err as { serverErrorCode?: string; reason?: string };
      if (ckErr.serverErrorCode === 'AUTHENTICATION_REQUIRED') {
        throw new AuthExpiredError();
      }
      if (ckErr.serverErrorCode === 'ZONE_NOT_FOUND') {
        throw new ZoneNotFoundError();
      }
      throw err;
    }

    if (response.hasErrors) {
      checkForErrors(response.records);
    }

    const validRecords = response.records.filter((r) => !r.serverErrorCode);
    allRecords.push(...validRecords);
    continuationMarker = response.continuationMarker;

    if (maxRecords && allRecords.length >= maxRecords) {
      return allRecords.slice(0, maxRecords);
    }
  } while (continuationMarker);

  return allRecords;
}

/**
 * Fetch specific records by their record names (IDs).
 */
export async function lookupRecords(recordNames: string[]): Promise<CKJSRecord[]> {
  if (recordNames.length === 0) return [];

  const db = getContainer().privateCloudDatabase;

  let response;
  try {
    response = await db.fetchRecords(recordNames, {
      zoneID: { zoneName: CLOUDKIT_ZONE },
    });
  } catch (err: unknown) {
    const ckErr = err as { serverErrorCode?: string };
    if (ckErr.serverErrorCode === 'AUTHENTICATION_REQUIRED') throw new AuthExpiredError();
    if (ckErr.serverErrorCode === 'ZONE_NOT_FOUND') throw new ZoneNotFoundError();
    throw err;
  }

  if (response.hasErrors) {
    checkForErrors(response.records);
  }

  return response.records.filter((r) => !r.serverErrorCode);
}

/**
 * Fetch a single record by its record name.
 */
export async function lookupRecord(recordName: string): Promise<CKJSRecord | null> {
  const records = await lookupRecords([recordName]);
  return records[0] ?? null;
}

// ---------------------------------------------------------------------------
// Field extraction helpers
// ---------------------------------------------------------------------------

export function stringField(record: CKJSRecord, fieldName: string): string | null {
  const field = record.fields[fieldName];
  if (!field || field.value == null) return null;
  return String(field.value);
}

export function numberField(record: CKJSRecord, fieldName: string): number | null {
  const field = record.fields[fieldName];
  if (!field || field.value == null) return null;
  return Number(field.value);
}

export function stringListField(record: CKJSRecord, fieldName: string): string[] {
  const field = record.fields[fieldName];
  if (!field || !Array.isArray(field.value)) return [];
  return field.value as string[];
}

export function timestampField(record: CKJSRecord, fieldName: string): string | null {
  const field = record.fields[fieldName];
  if (!field || field.value == null) return null;
  // CloudKit timestamps are milliseconds since epoch
  return new Date(field.value as number).toISOString();
}

/**
 * Extract an asset download URL from a CKRecord.
 * CloudKit JS returns URL templates with ${f} as a filename placeholder.
 * The filename must match the original uploaded filename for the
 * download to succeed (400 Bad Request otherwise).
 */
export function assetUrl(record: CKJSRecord, fieldName: string, filename: string): string | null {
  const field = record.fields[fieldName];
  if (!field || field.value == null) return null;
  const asset = field.value as { downloadURL?: string };
  const url = asset.downloadURL ?? null;
  if (!url) return null;
  return url
    .replace('${f}', filename)
    .replace('$%7Bf%7D', filename)
    .replace('%24%7Bf%7D', filename);
}
