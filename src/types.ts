export interface ImportedRow {
  rowNumber: number;
  cells: string[];
  fields: Record<string, string>;
}

export type HttpMethod = 'GET' | 'POST';
export type BodyMode = 'RAW' | 'JSON';
export type AuthorizationScheme = 'NONE' | 'BASIC';
export type FavoriteEnvironment = 'DEV' | 'QA' | 'PROD';

export interface RequestPreview {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  bodyMode: BodyMode;
  body?: unknown;
}

export interface PostRequestPayload {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  bodyMode: BodyMode;
  body?: unknown;
  timeoutMs: number;
  allowInsecureTls?: boolean;
}

export interface PostResponsePayload {
  ok: boolean;
  method: HttpMethod;
  status: number;
  statusText: string;
  durationMs: number;
  finalUrl: string;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
  errorDetail: string | null;
}

export interface SecretMutationResult {
  ok: boolean;
  secrets: SecretDescriptor[];
  error?: string;
}

export type SecretScope = 'temporary' | 'local';

export interface SecretDescriptor {
  key: string;
  scope: SecretScope;
}

export interface DispatchResult extends PostResponsePayload {
  rowNumber: number;
  row: ImportedRow;
  requestPreview: RequestPreview;
}

export type HistoryEntryOrigin = 'runtime' | 'collection-import';

export interface RequestHistoryEntry {
  id: string;
  name: string;
  origin: HistoryEntryOrigin;
  sentAt: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  bodyMode: BodyMode;
  body?: unknown;
  row?: ImportedRow;
  ok?: boolean;
  status?: number;
  statusText?: string;
  durationMs?: number;
  finalUrl?: string;
  errorDetail?: string | null;
}

export interface FavoriteEndpointEntry {
  id: string;
  name: string;
  description: string;
  url: string;
  method: HttpMethod;
  environment: FavoriteEnvironment;
  createdAt: string;
}

export interface FavoriteBaseEndpointEntry {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  method: HttpMethod;
  environment: FavoriteEnvironment;
  createdAt: string;
}

export interface FavoriteCommandEntry {
  id: string;
  name: string;
  description: string;
  command: string;
  defaultRawBody?: string;
  postResponseScript?: string;
  method: HttpMethod;
  environment: FavoriteEnvironment;
  createdAt: string;
}

export interface FavoriteRequestEntry {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  source: 'composer' | 'history';
  environment: FavoriteEnvironment;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  bodyMode: BodyMode;
  body?: unknown;
  timeoutMs: number;
  allowInsecureTls: boolean;
}