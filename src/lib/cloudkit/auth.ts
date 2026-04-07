/**
 * CloudKit JS authentication and container access.
 *
 * Uses Apple's CloudKit JS library (loaded via CDN) for Apple ID sign-in
 * and data operations on the user's private database.
 */

import { CLOUDKIT_CONTAINER, CLOUDKIT_API_TOKEN, CLOUDKIT_ENVIRONMENT } from './config';

// ---------------------------------------------------------------------------
// CloudKit JS type declarations (loaded from CDN)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    CloudKit: CloudKitStatic;
  }
}

interface CloudKitStatic {
  configure(options: CloudKitConfig): void;
  getDefaultContainer(): CloudKitContainer;
}

interface CloudKitConfig {
  containers: Array<{
    containerIdentifier: string;
    apiTokenAuth: {
      apiToken: string;
      persist: boolean;
      signInButton: { id: string; theme: string };
      signOutButton: { id: string; theme: string };
    };
    environment: string;
  }>;
}

export interface CloudKitContainer {
  setUpAuth(): Promise<CloudKitUserIdentity | null>;
  whenUserSignsIn(): Promise<CloudKitUserIdentity>;
  whenUserSignsOut(): Promise<void>;
  privateCloudDatabase: CloudKitDatabase;
  publicCloudDatabase: CloudKitDatabase;
}

export interface CloudKitDatabase {
  performQuery(query: CKJSQuery): Promise<CKJSQueryResponse>;
  fetchRecords(
    recordNames: string | string[],
    options?: { zoneID?: CKJSZoneID },
  ): Promise<CKJSFetchResponse>;
  saveRecords(
    records: CKJSRecordToSave | CKJSRecordToSave[],
    options?: { zoneID?: CKJSZoneID },
  ): Promise<CKJSSaveResponse>;
}

export interface CKJSQuery {
  recordType: string;
  filterBy?: CKJSFilter[];
  sortBy?: Array<{ fieldName: string; ascending: boolean }>;
  zoneID?: CKJSZoneID;
  continuationMarker?: string;
  resultsLimit?: number;
}

export interface CKJSFilter {
  fieldName: string;
  comparator: string;
  fieldValue: { value: unknown; type?: string };
}

export interface CKJSZoneID {
  zoneName: string;
  ownerRecordName?: string;
}

export interface CKJSQueryResponse {
  records: CKJSRecord[];
  continuationMarker?: string;
  hasErrors?: boolean;
}

export interface CKJSFetchResponse {
  records: CKJSRecord[];
  hasErrors?: boolean;
}

export interface CKJSSaveResponse {
  records: CKJSRecord[];
  hasErrors?: boolean;
}

export interface CKJSRecord {
  recordName: string;
  recordType: string;
  recordChangeTag: string;
  fields: Record<string, CKJSFieldValue>;
  // Error info when individual record fails
  serverErrorCode?: string;
  reason?: string;
}

export interface CKJSFieldValue {
  value: unknown;
  type?: string;
}

export interface CKJSRecordToSave {
  recordName: string;
  recordType: string;
  recordChangeTag?: string;
  fields: Record<string, { value: unknown }>;
}

interface CloudKitUserIdentity {
  userRecordName: string;
  nameComponents?: {
    givenName?: string;
    familyName?: string;
  };
}

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------

export interface AuthState {
  isSignedIn: boolean;
  userRecordName: string | null;
  displayName: string | null;
}

let container: CloudKitContainer | null = null;
let currentAuthState: AuthState = {
  isSignedIn: false,
  userRecordName: null,
  displayName: null,
};

type AuthListener = (state: AuthState) => void;
const listeners: AuthListener[] = [];

export function onAuthStateChange(listener: AuthListener): () => void {
  listeners.push(listener);
  listener(currentAuthState);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notifyListeners() {
  for (const listener of listeners) {
    listener(currentAuthState);
  }
}

function displayNameFrom(identity: CloudKitUserIdentity | null): string | null {
  if (!identity?.nameComponents) return null;
  const { givenName, familyName } = identity.nameComponents;
  return [givenName, familyName].filter(Boolean).join(' ') || null;
}

// ---------------------------------------------------------------------------
// Init & sign-in
// ---------------------------------------------------------------------------

export async function initAuth(): Promise<AuthState> {
  if (!window.CloudKit) {
    throw new Error('CloudKit JS not loaded. Ensure the CDN script is in the page head.');
  }

  window.CloudKit.configure({
    containers: [
      {
        containerIdentifier: CLOUDKIT_CONTAINER,
        apiTokenAuth: {
          apiToken: CLOUDKIT_API_TOKEN,
          persist: true,
          signInButton: { id: 'apple-sign-in-button', theme: 'black' },
          signOutButton: { id: 'apple-sign-out-button', theme: 'black' },
        },
        environment: CLOUDKIT_ENVIRONMENT,
      },
    ],
  });

  container = window.CloudKit.getDefaultContainer();

  const identity = await container.setUpAuth();

  if (identity) {
    currentAuthState = {
      isSignedIn: true,
      userRecordName: identity.userRecordName,
      displayName: displayNameFrom(identity),
    };
  }

  container.whenUserSignsIn().then(handleSignIn);
  container.whenUserSignsOut().then(handleSignOut);

  notifyListeners();
  return currentAuthState;
}

function handleSignIn(identity: CloudKitUserIdentity) {
  currentAuthState = {
    isSignedIn: true,
    userRecordName: identity.userRecordName,
    displayName: displayNameFrom(identity),
  };
  notifyListeners();
  container?.whenUserSignsOut().then(handleSignOut);
}

function handleSignOut() {
  currentAuthState = {
    isSignedIn: false,
    userRecordName: null,
    displayName: null,
  };
  notifyListeners();
  container?.whenUserSignsIn().then(handleSignIn);
}

// ---------------------------------------------------------------------------
// Container access (for data operations)
// ---------------------------------------------------------------------------

/**
 * Get the CloudKit container. Throws if not initialized.
 */
export function getContainer(): CloudKitContainer {
  if (!container) {
    throw new Error('CloudKit not initialized. Call initAuth() first.');
  }
  return container;
}

export function getAuthState(): AuthState {
  return currentAuthState;
}
