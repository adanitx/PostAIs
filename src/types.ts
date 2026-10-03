export interface ImportedRow {
  rowNumber: number;
  cells: string[];
  fields: Record<string, string>;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
  receivedAt?: string;
}

export type HistoryEntryOrigin = 'runtime' | 'collection-import';

export interface BatchRequestEntry {
  rowNumber: number;
  receivedAt?: string;
  fields: Record<string, string>;
  endpoint: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  errorDetail?: string | null;
  durationMs?: number;
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
}

export interface BatchHistorySummary {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  endpoints: string[];
  sourceFileName?: string;
  sourceColumns?: string[];
  sourceHasHeaderRow?: boolean;
  requests: BatchRequestEntry[];
  requestsComplete: boolean;
  truncated?: boolean;
}

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
  scriptOutput?: unknown;
  scriptCommandId?: string;
  scriptCommandLabel?: string;
  batchSummary?: BatchHistorySummary;
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
  environment?: FavoriteEnvironment;
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