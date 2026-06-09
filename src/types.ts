export interface ImportedRow {
  rowNumber: number;
  cells: string[];
  fields: Record<string, string>;
}

export type HttpMethod = 'GET' | 'POST';
export type BodyMode = 'RAW' | 'JSON';

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