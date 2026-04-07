/**
 * CloudKit configuration for the GradeVine web dashboard.
 *
 * SETUP REQUIRED:
 * 1. Go to https://icloud.developer.apple.com/dashboard
 * 2. Select "iCloud.com.moses.harding.gradevine"
 * 3. Create an API token:
 *    - Allowed origins: https://gradevine.app
 *    - (For dev, also add http://localhost:4321)
 * 4. Paste the token below as CLOUDKIT_API_TOKEN
 */

export const CLOUDKIT_CONTAINER = 'iCloud.com.moses.harding.gradevine';
export const CLOUDKIT_ZONE = 'GradeVineSync';
export const CLOUDKIT_ENVIRONMENT: 'production' | 'development' = 'development';

// TODO: Replace with your actual API token from CloudKit Dashboard
export const CLOUDKIT_API_TOKEN = 'e416d888128cdafb2b1f72c87eab97e482a7da17feb5c8d731dbbbd0cc4dd761';

/**
 * CloudKit REST API base URL.
 * See: https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/CloudKitWebServicesReference/
 */
export const CLOUDKIT_BASE_URL = 'https://api.apple-cloudkit.com';

/**
 * Build the full URL path for a CloudKit REST API endpoint.
 *
 * @param path - The API path after /database/1/, e.g. "records/query"
 * @param database - "private" or "public" (default: "private")
 */
export function cloudKitUrl(path: string, database: 'private' | 'public' = 'private'): string {
  return [
    CLOUDKIT_BASE_URL,
    'database',
    '1',
    CLOUDKIT_CONTAINER,
    CLOUDKIT_ENVIRONMENT,
    database,
    path,
  ].join('/');
}

/**
 * CloudKit record type names as used in the iOS app's CKSyncEngine.
 */
export const RecordTypes = {
  Course: 'Course',
  Student: 'Student',
  Assignment: 'Assignment',
  Scan: 'Scan',
  ScanPage: 'ScanPage',
} as const;
