type AuthSelectionSource = 'auto' | 'manual' | null;
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type {
  AuthorizationScheme,
  BodyMode,
  DispatchResult,
  FavoriteBaseEndpointEntry,
  FavoriteCommandEntry,
  FavoriteEndpointEntry,
  FavoriteEnvironment,
  FavoriteRequestEntry,
  HttpMethod,
  ImportedRow,
  PostRequestPayload,
  RequestHistoryEntry,
  RequestPreview,
  SecretDescriptor,
  SecretScope,
} from './types';

const defaultHeaders = JSON.stringify(
  {},
  null,
  2,
);

const defaultQuery = JSON.stringify({}, null, 2);

const defaultBodyTemplate = JSON.stringify(
  {
    phone: '{{col1}}',
    message: '{{col2}}',
  },
  null,
  2,
);

const exactPlaceholderPattern = /^\s*{{\s*([^{}]+?)\s*}}\s*$/;
const genericPlaceholderPattern = /{{\s*([^{}]+?)\s*}}/g;
const TLS_PREF_STORAGE_KEY = 'postais.allowInsecureTls';
const THEME_PREF_STORAGE_KEY = 'postais.theme';
const METHOD_PREF_STORAGE_KEY = 'postais.method';
const FAVORITE_ENV_PREF_STORAGE_KEY = 'postais.favoriteEnvironment';
const AUTHORIZATION_SCHEME_PREF_STORAGE_KEY = 'postais.authorizationScheme';
const BASIC_AUTH_USERNAME_PREF_STORAGE_KEY = 'postais.basicAuthUsernameSecretKey';
const BASIC_AUTH_PASSWORD_PREF_STORAGE_KEY = 'postais.basicAuthPasswordSecretKey';
const REQUEST_HISTORY_STORAGE_KEY = 'postais.requestHistory.v1';
const FAVORITE_ENDPOINTS_STORAGE_KEY = 'postais.favoriteEndpoints.v1';
const FAVORITE_BASE_ENDPOINTS_STORAGE_KEY = 'postais.favoriteBaseEndpoints.v1';
const FAVORITE_COMMANDS_STORAGE_KEY = 'postais.favoriteCommands.v1';
const FAVORITE_REQUESTS_STORAGE_KEY = 'postais.favoriteRequests.v1';
const MAX_REQUEST_HISTORY_ENTRIES = 150;
const MAX_FAVORITE_NAME_LENGTH = 40;
const MAX_REST_DESCRIPTION_LENGTH = 50;
const MAX_RESPONSE_PREVIEW_LINES = 50;
const MAX_POST_RESPONSE_INPUT_SIZE = 250000;
const POST_RESPONSE_BLOCKED_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(?:window|document|globalThis|global|self)\b/i, reason: 'No se permite acceder al DOM ni al contexto global.' },
  { pattern: /\b(?:Function|eval)\b/i, reason: 'No se permite ejecutar codigo dinamico dentro del script.' },
  { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\b/i, reason: 'No se permiten llamadas de red desde el script.' },
  { pattern: /\b(?:localStorage|sessionStorage|indexedDB|caches)\b/i, reason: 'No se permite acceder al almacenamiento del navegador.' },
  { pattern: /\b(?:setTimeout|setInterval|requestAnimationFrame)\b/i, reason: 'No se permiten temporizadores en el script post-respuesta.' },
];

type TemplateMode = 'keep-secret-placeholders' | 'mask-secrets';
type AppSection = 'composer' | 'history' | 'favorites';
type InterfaceMode = 'basic' | 'advanced';

interface PostResponseScriptContext {
  meta: {
    method: HttpMethod;
    status: number;
    statusText: string;
    finalUrl: string;
    durationMs: number;
    ok: boolean;
    errorDetail: string | null;
  };
  headers: Record<string, string>;
  body: unknown;
}

interface ConfirmDialogState {
  title: string;
  description: string;
  detailLines: string[];
  confirmLabel: string;
  sessionKey?: string;
}

interface FavoriteRequestsExportFile {
  schema: 'postais.favoriteRequests.v1';
  exportedAt: string;
  items: FavoriteRequestEntry[];
}

interface FavoriteBaseEndpointsExportFile {
  schema: 'postais.favoriteBaseEndpoints.v1';
  exportedAt: string;
  items: FavoriteBaseEndpointEntry[];
}

interface FavoriteCommandsExportFile {
  schema: 'postais.favoriteCommands.v1';
  exportedAt: string;
  items: FavoriteCommandEntry[];
}

interface DescriptionDialogState {
  favoriteId: string;
  currentValue: string;
  title: string;
}

interface SampleScriptDialogState {
  mode: 'create' | 'edit';
  commandId: string;
  commandLabel: string;
  suggestedPaths: string[];
  selectedPaths: string[];
  preservedColumnNames: Record<string, string>;
  context: PostResponseScriptContext;
}

interface EndpointParamGroupDialogState {
  tupleIndex: number;
  tupleId: string;
  endpoint: string;
  tokens: string[];
  selectedToken: string;
  blockText: string;
}

interface PostmanHeader {
  key?: string;
  value?: string;
}

interface PostmanQueryParam {
  key?: string;
  value?: string;
}

interface PostmanUrlDefinition {
  raw?: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: PostmanQueryParam[];
}

interface PostmanBodyDefinition {
  mode?: string;
  raw?: string;
}

interface PostmanRequestDefinition {
  method?: string;
  header?: PostmanHeader[];
  body?: PostmanBodyDefinition;
  url?: string | PostmanUrlDefinition;
}

interface PostmanCollectionItem {
  name?: string;
  item?: PostmanCollectionItem[];
  request?: PostmanRequestDefinition;
}

interface PostmanCollectionDefinition {
  info?: {
    name?: string;
    schema?: string;
  };
  item?: PostmanCollectionItem[];
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getResponseDetailsText(result: DispatchResult): string {
  return formatJson({
    finalUrl: result.finalUrl,
    headers: result.responseHeaders,
    body: result.responseBody,
    errorDetail: result.errorDetail,
  });
}

function countTextLines(value: string): number {
  return value === '' ? 0 : value.split(/\r?\n/).length;
}

function trimTextToLines(value: string, maxLines: number): string {
  return value.split(/\r?\n/).slice(0, maxLines).join('\n');
}

function getValueAtPath(source: unknown, path: string): unknown {
  if (!path.trim()) {
    return source;
  }

  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  const segments = normalized.split('.').filter(Boolean);

  return segments.reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }

      return current[index];
    }

    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, source);
}

function collectResponsePaths(source: unknown, maxPaths = 14): string[] {
  const paths: string[] = [];

  function walk(node: unknown, prefix: string) {
    if (paths.length >= maxPaths) {
      return;
    }

    if (Array.isArray(node)) {
      if (node.length === 0 && prefix) {
        paths.push(prefix);
        return;
      }

      node.slice(0, 4).forEach((item, index) => {
        const nextPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
        walk(item, nextPrefix);
      });
      return;
    }

    if (isRecord(node)) {
      const entries = Object.entries(node).slice(0, 12);
      if (entries.length === 0 && prefix) {
        paths.push(prefix);
        return;
      }

      entries.forEach(([key, value]) => {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        walk(value, nextPrefix);
      });
      return;
    }

    if (prefix) {
      paths.push(prefix);
    }
  }

  walk(source, '');
  return Array.from(new Set(paths)).slice(0, maxPaths);
}

function buildPostResponseContext(result: DispatchResult): PostResponseScriptContext {
  return {
    meta: {
      method: result.method,
      status: result.status,
      statusText: result.statusText,
      finalUrl: result.finalUrl,
      durationMs: result.durationMs,
      ok: result.ok,
      errorDetail: result.errorDetail,
    },
    headers: result.responseHeaders,
    body: result.responseBody,
  };
}

function isRootArrayBody(body: unknown): boolean {
  return Array.isArray(body) && body.length > 0;
}

function normalizePathForArrayItem(path: string): string {
  return path.replace(/^(\[\d+\])+\./g, '').replace(/\[(\d+)\]/g, '.$1');
}

function createPostResponseSuggestedPaths(context: PostResponseScriptContext): string[] {
  const metaPaths = [
    'meta.status',
    'meta.statusText',
    'meta.finalUrl',
    'meta.durationMs',
    'meta.ok',
    'meta.errorDetail',
  ];
  const headerPaths = collectResponsePaths(context.headers, 10).map((path) => `headers.${path}`);
  
  let bodyPaths: string[] = [];
  if (isRootArrayBody(context.body)) {
    const firstItem = (context.body as unknown[])[0];
    bodyPaths = collectResponsePaths(firstItem, 20).map((path) => `body.[*].${normalizePathForArrayItem(path)}`);
  } else {
    bodyPaths = collectResponsePaths(context.body, 20).map((path) => `body.${path}`);
  }

  return Array.from(new Set([...metaPaths, ...headerPaths, ...bodyPaths]));
}

function getColumnKeyForSelectedPath(path: string): string {
  return path.startsWith('body.[*].') ? path.slice('body.[*].'.length) : path;
}

function extractScriptColumnNames(script: string): Record<string, string> {
  const match = script.match(/columnNames:\s*(\{[\s\S]*?\})\s*,/);
  if (!match) {
    return {};
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (!isRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]));
  } catch {
    return {};
  }
}

function extractSelectedPathsFromScript(script: string, fallbackSuggestedPaths: string[]): string[] {
  const selectedPathsMatch = script.match(/selectedPaths:\s*\[([\s\S]*?)\]/);
  if (selectedPathsMatch) {
    const matches = [...selectedPathsMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    const unique = Array.from(new Set(matches));
    if (unique.length > 0) {
      return unique;
    }
  }

  const rowMapMatch = script.match(/map\(item\s*=>\s*\(\{([\s\S]*?)\}\)\)/);
  if (rowMapMatch) {
    const keys = [...rowMapMatch[1].matchAll(/"([^"]+)"\s*:/g)].map((match) => match[1]);
    const normalized = keys.map((key) => {
      if (key.startsWith('meta.') || key.startsWith('headers.') || key.startsWith('body.')) {
        return key;
      }

      return `body.[*].${key}`;
    });
    const unique = Array.from(new Set(normalized));
    if (unique.length > 0) {
      return unique;
    }
  }

  return fallbackSuggestedPaths.slice(0, 8);
}

function extractColumnOrderFromScript(script: string): string[] {
  const columnOrderMatch = script.match(/columnOrder:\s*\[([\s\S]*?)\]/);
  if (columnOrderMatch) {
    const matches = [...columnOrderMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    if (matches.length > 0) {
      return matches;
    }
  }

  return [];
}

function createPostResponseSampleScript(paths: string[], columnNames: Record<string, string> = {}): string {
  const serializedColumnNames = JSON.stringify(columnNames);
  const isArrayIteration = paths.some((path) => path.includes('[*]'));
  
  if (isArrayIteration) {
    const bodyArrayPaths = paths.filter((path) => path.startsWith('body.[*]'));
    const nonBodyPaths = paths.filter((path) => !path.startsWith('body.[*]'));
    const cleanPaths = bodyArrayPaths
      .map((path) => path.replace('body.[*].', ''))
      .map((path) => path.replace(/^\[\d+\]\./, ''))
      .filter((path) => path.length > 0);
    
    const fields = cleanPaths.map((path) => {
      const parts = path.split(/[\.\[\]]/).filter(Boolean);
      let accessor = '';
      for (let i = 0; i < parts.length; i++) {
        if (i === 0) accessor = 'item?.' + parts[i];
        else accessor += /^\d+$/.test(parts[i]) ? '?.[' + parts[i] + ']' : '?.' + parts[i];
      }
      return '      "' + path + '": ' + accessor;
    }).join(',\n');

    const extraFields = nonBodyPaths.map((path) => `      "${path}": helpers.get("${path}")`).join(',\n');
    const mergedFields = [fields, extraFields].filter((part) => part.trim() !== '').join(',\n');
    const selectedPaths = paths.map((path) => `"${path}"`).join(', ');

    return [
      '// Itera sobre todos los elementos del array',
      'const rows = helpers.context.body.map(item => ({',
      mergedFields,
      '}));',
      'return {',
      '  title: "custom-table-view",',
      `  columnNames: ${serializedColumnNames},`,
      '  selectedPaths: [',
      `    ${selectedPaths}`,
      '  ],',
      '  rows,',
      '};',
    ].join('\n');
  }

  const scriptLines = paths.map((path) => `      "${path}": helpers.get("${path}"),`);
  const selectedPaths = paths.map((path) => `"${path}"`).join(', ');

  return [
    '// return any structure you want to visualize later.',
    '// available helpers: helpers.get(path), helpers.pick(paths), helpers.context',
    'return {',
    '  title: "custom-table-view",',
    `  columnNames: ${serializedColumnNames},`,
    '  selectedPaths: [',
    `    ${selectedPaths}`,
    '  ],',
    '  values: {',
    ...scriptLines,
    '  },',
    '};',
  ].join('\n');
}

function getApproximateSerializedSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return MAX_POST_RESPONSE_INPUT_SIZE + 1;
  }
}

function cloneForScriptRuntime<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fallback below.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function stripScriptLiteralsAndComments(script: string): string {
  const withoutBlockComments = script.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  return withoutLineComments.replace(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, '""');
}

function createTableFromPaths(source: unknown, paths: string[]): { columns: string[]; rows: Array<Record<string, unknown>> } {
  const cleanedPaths = paths.map((path) => path.trim()).filter((path) => path !== '');
  const row = Object.fromEntries(cleanedPaths.map((path) => [path, getValueAtPath(source, path)]));
  return {
    columns: cleanedPaths,
    rows: [row],
  };
}

function stringifyTableCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return String(value);
}

function escapeTsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.replace(/\t/g, ' ');
}

function tableToTsv(
  columns: string[],
  rows: Array<Record<string, unknown>>,
  columnLabels: Record<string, string> = {},
): string {
  const header = columns.map((column) => escapeTsvCell(columnLabels[column] ?? column)).join('\t');
  const body = rows.map((row) => columns.map((column) => escapeTsvCell(stringifyTableCell(row[column]))).join('\t'));
  return [header, ...body].join('\n');
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const success = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!success) {
    throw new Error('No se pudo copiar al portapapeles.');
  }
}

function isScriptTableOutput(value: unknown): value is { columns: string[]; rows: Array<Record<string, unknown>> } {
  if (!isRecord(value) || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
    return false;
  }

  return value.columns.every((column) => typeof column === 'string')
    && value.rows.every((row) => isRecord(row));
}

function formatPathPreviewValue(source: unknown, path: string): string {
  const value = getValueAtPath(source, path);
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 120 ? `${json.substring(0, 117)}...` : json;
    } catch {
      return '[complex object]';
    }
  }

  if (typeof value === 'string') {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized;
  } catch {
    return '[unserializable]';
  }
}

function validatePostResponseScript(script: string, response: unknown): string | null {
  const normalizedScript = script.trim();
  if (!normalizedScript) {
    return 'El script post-respuesta esta vacio.';
  }

  if (!/\breturn\b/.test(normalizedScript)) {
    return 'El script debe incluir al menos un return con los datos a visualizar.';
  }

  const scriptForValidation = stripScriptLiteralsAndComments(normalizedScript);
  const blocked = POST_RESPONSE_BLOCKED_PATTERNS.find(({ pattern }) => pattern.test(scriptForValidation));
  if (blocked) {
    return blocked.reason;
  }

  const responseSize = getApproximateSerializedSize(response);
  if (responseSize > MAX_POST_RESPONSE_INPUT_SIZE) {
    return `La respuesta es demasiado grande para ejecutar scripts de forma segura (${responseSize} caracteres serializados).`;
  }

  return null;
}

function executePostResponseScript(script: string, response: unknown): { output: unknown; error: string | null } {
  const validationError = validatePostResponseScript(script, response);
  if (validationError) {
    return { output: null, error: validationError };
  }

  try {
    const safeResponse = cloneForScriptRuntime(response);
    const runner = new Function(
      'response',
      'helpers',
      'window',
      'document',
      'globalThis',
      'global',
      'self',
      'Function',
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'caches',
      'setTimeout',
      'setInterval',
      'requestAnimationFrame',
      `'use strict';\n${script}`,
    );

    const helpers = {
      context: safeResponse,
      response: safeResponse,
      body: getValueAtPath(safeResponse, 'body'),
      headers: getValueAtPath(safeResponse, 'headers'),
      meta: getValueAtPath(safeResponse, 'meta'),
      get: (path: string) => getValueAtPath(safeResponse, path),
      pick: (paths: string[]) => Object.fromEntries(paths.map((path) => [path, getValueAtPath(safeResponse, path)])),
      table: (paths: string[]) => createTableFromPaths(safeResponse, paths),
    };

    const output = runner(
      safeResponse,
      helpers,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    return { output, error: null };
  } catch (error) {
    return {
      output: null,
      error: error instanceof Error ? error.message : 'Error ejecutando el script post-respuesta.',
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isHttpMethod(value: unknown): value is HttpMethod {
  return value === 'GET' || value === 'POST';
}

function isBodyMode(value: unknown): value is BodyMode {
  return value === 'RAW' || value === 'JSON';
}

function createHistoryId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `history-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isFavoriteEnvironment(value: unknown): value is FavoriteEnvironment {
  return value === 'DEV' || value === 'QA' || value === 'PROD';
}

function getFavoriteEnvironmentSortOrder(value: FavoriteEnvironment): number {
  switch (value) {
    case 'DEV':
      return 0;
    case 'PROD':
      return 1;
    case 'QA':
      return 2;
    default:
      return 99;
  }
}

function compareFavoriteEnvironment(left: FavoriteEnvironment, right: FavoriteEnvironment): number {
  return getFavoriteEnvironmentSortOrder(left) - getFavoriteEnvironmentSortOrder(right);
}

function compareHttpMethod(left: HttpMethod, right: HttpMethod): number {
  return left.localeCompare(right);
}

function normalizeFavoriteEndpoint(value: string): string {
  return value.trim();
}

function normalizeFavoriteBaseEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function normalizeFavoriteCommand(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+/g, '/');
}

function buildEndpointFromBaseAndCommand(baseEndpoint: string, command: string): string {
  const normalizedBase = normalizeFavoriteBaseEndpoint(baseEndpoint);
  const normalizedCommand = normalizeFavoriteCommand(command);

  if (!normalizedBase || !normalizedCommand) {
    return '';
  }

  const baseWithoutTrailingSlash = normalizedBase.replace(/\/+$/, '');
  const commandWithoutLeadingSlash = normalizedCommand.replace(/^\/+/, '');
  return `${baseWithoutTrailingSlash}/${commandWithoutLeadingSlash}`;
}

function extractPathParams(url: string): string[] {
  const matches = url.match(/:([A-Za-z_][A-Za-z0-9_]*)/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}

function applyPathParams(url: string, params: Record<string, string>): string {
  return url.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => {
    return params[name] !== undefined && params[name] !== '' ? encodeURIComponent(params[name]) : `:${name}`;
  });
}

function applyEndpointTemplateParams(url: string, params: Record<string, string>): string {
  return url.replace(genericPlaceholderPattern, (_match, rawToken: string) => {
    const token = rawToken.trim();

    if (token.startsWith('secret:')) {
      return `{{${token}}}`;
    }

    if (params[token] !== undefined && params[token] !== '') {
      return encodeURIComponent(params[token]);
    }

    return `{{${token}}}`;
  });
}

function extractEndpointRuntimeParams(url: string): Array<{ name: string; kind: 'path' | 'template' }> {
  const pathParams = extractPathParams(url);
  const templateParams = extractPlaceholders(url).filter((token) => !pathParams.includes(token));

  return [
    ...pathParams.map((name) => ({ name, kind: 'path' as const })),
    ...templateParams.map((name) => ({ name, kind: 'template' as const })),
  ];
}

function parseParameterGroupBlock(blockText: string): string[] {
  const values = blockText
    .split(/\r?\n/)
    .map((line) => line.replace(/\t+/g, ' ').trim())
    .filter((line) => line !== '')
    .map((line) => {
      const withoutIndex = line.replace(/^\d+[\).:-]?\s+/, '').trim();
      const primaryColumn = withoutIndex.split('|')[0]?.trim() ?? '';
      const firstToken = primaryColumn.split(/\s+/).filter(Boolean)[0] ?? '';
      return firstToken.replace(/[|;,]+$/g, '').trim();
    });

  const unique: string[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  });

  return unique;
}

function createDefaultFavoriteBaseEndpointName(baseUrl: string): string {
  try {
    const parsedUrl = new URL(baseUrl);
    const route = parsedUrl.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? parsedUrl.hostname;
    return route ? `${parsedUrl.hostname} / ${route}` : parsedUrl.hostname;
  } catch {
    return baseUrl;
  }
}

function createDefaultFavoriteCommandName(command: string): string {
  const normalized = normalizeFavoriteCommand(command);
  if (!normalized) {
    return command;
  }

  const lastSegment = normalized.split('/').filter(Boolean).pop() ?? normalized;
  return lastSegment;
}

function createDefaultFavoriteEndpointName(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const route = parsedUrl.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? parsedUrl.hostname;
    return route ? `${parsedUrl.hostname} / ${route}` : parsedUrl.hostname;
  } catch {
    return url;
  }
}

function normalizeFavoriteName(value: string): string {
  return value.trim().slice(0, MAX_FAVORITE_NAME_LENGTH);
}

function normalizeFavoriteNameOnSave(value: string): string {
  return value.trimEnd().slice(0, MAX_FAVORITE_NAME_LENGTH);
}

function normalizeRestDescription(value: string): string {
  return value.slice(0, MAX_REST_DESCRIPTION_LENGTH);
}

function toFavoriteEndpointEntry(value: string | FavoriteEndpointEntry): FavoriteEndpointEntry | null {
  if (typeof value === 'string') {
    const normalizedUrl = normalizeFavoriteEndpoint(value);
    if (!normalizedUrl) {
      return null;
    }

    return {
      id: createHistoryId(),
      name: normalizeFavoriteName(createDefaultFavoriteEndpointName(normalizedUrl)),
      description: '',
      url: normalizedUrl,
      method: 'GET',
      environment: 'DEV',
      createdAt: new Date().toISOString(),
    };
  }

  if (!isRecord(value) || typeof value.url !== 'string') {
    return null;
  }

  const normalizedUrl = normalizeFavoriteEndpoint(value.url);
  if (!normalizedUrl) {
    return null;
  }

  return {
    id: typeof value.id === 'string' ? value.id : createHistoryId(),
    name: normalizeFavoriteName(typeof value.name === 'string' && value.name.trim() ? value.name.trim() : createDefaultFavoriteEndpointName(normalizedUrl)),
    description: typeof value.description === 'string' ? normalizeRestDescription(value.description) : '',
    url: normalizedUrl,
    method: isHttpMethod(value.method) ? value.method : 'GET',
    environment: isFavoriteEnvironment(value.environment) ? value.environment : 'DEV',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  };
}

function loadStoredFavoriteEndpoints(): FavoriteEndpointEntry[] {
  try {
    const raw = window.localStorage.getItem(FAVORITE_ENDPOINTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalizedEntries = parsed
      .map((entry) => toFavoriteEndpointEntry(entry as string | FavoriteEndpointEntry))
      .filter((entry): entry is FavoriteEndpointEntry => entry !== null);

    return normalizedEntries.filter((entry, index, array) => array.findIndex((candidate) => candidate.url === entry.url && candidate.method === entry.method && candidate.environment === entry.environment) === index);
  } catch {
    return [];
  }
}

function toFavoriteBaseEndpointEntry(value: FavoriteBaseEndpointEntry | string): FavoriteBaseEndpointEntry | null {
  if (typeof value === 'string') {
    const normalizedBase = normalizeFavoriteBaseEndpoint(value);
    if (!normalizedBase) {
      return null;
    }

    return {
      id: createHistoryId(),
      name: normalizeFavoriteName(createDefaultFavoriteBaseEndpointName(normalizedBase)),
      description: '',
      baseUrl: normalizedBase,
      method: 'GET',
      environment: 'DEV',
      createdAt: new Date().toISOString(),
    };
  }

  if (!isRecord(value) || typeof value.baseUrl !== 'string') {
    return null;
  }

  const normalizedBase = normalizeFavoriteBaseEndpoint(value.baseUrl);
  if (!normalizedBase) {
    return null;
  }

  return {
    id: typeof value.id === 'string' ? value.id : createHistoryId(),
    name: normalizeFavoriteName(typeof value.name === 'string' && value.name.trim() ? value.name.trim() : createDefaultFavoriteBaseEndpointName(normalizedBase)),
    description: typeof value.description === 'string' ? normalizeRestDescription(value.description) : '',
    baseUrl: normalizedBase,
    method: isHttpMethod(value.method) ? value.method : 'GET',
    environment: isFavoriteEnvironment(value.environment) ? value.environment : 'DEV',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  };
}

function loadStoredFavoriteBaseEndpoints(): FavoriteBaseEndpointEntry[] {
  try {
    const raw = window.localStorage.getItem(FAVORITE_BASE_ENDPOINTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalizedEntries = parsed
      .map((entry) => toFavoriteBaseEndpointEntry(entry as FavoriteBaseEndpointEntry | string))
      .filter((entry): entry is FavoriteBaseEndpointEntry => entry !== null);

    return normalizedEntries.filter(
      (entry, index, array) => array.findIndex((candidate) => candidate.baseUrl === entry.baseUrl && candidate.environment === entry.environment) === index,
    );
  } catch {
    return [];
  }
}

function toFavoriteCommandEntry(value: FavoriteCommandEntry | string): FavoriteCommandEntry | null {
  if (typeof value === 'string') {
    const normalizedCommand = normalizeFavoriteCommand(value);
    if (!normalizedCommand) {
      return null;
    }

    return {
      id: createHistoryId(),
      name: normalizeFavoriteName(createDefaultFavoriteCommandName(normalizedCommand)),
      description: '',
      command: normalizedCommand,
      defaultRawBody: '',
      postResponseScript: '',
      method: 'GET',
      environment: 'DEV',
      createdAt: new Date().toISOString(),
    };
  }

  if (!isRecord(value) || typeof value.command !== 'string') {
    return null;
  }

  const normalizedCommand = normalizeFavoriteCommand(value.command);
  if (!normalizedCommand) {
    return null;
  }

  return {
    id: typeof value.id === 'string' ? value.id : createHistoryId(),
    name: normalizeFavoriteName(typeof value.name === 'string' && value.name.trim() ? value.name.trim() : createDefaultFavoriteCommandName(normalizedCommand)),
    description: typeof value.description === 'string' ? normalizeRestDescription(value.description) : '',
    command: normalizedCommand,
    defaultRawBody: typeof value.defaultRawBody === 'string' ? value.defaultRawBody : '',
    postResponseScript: typeof value.postResponseScript === 'string' ? value.postResponseScript : '',
    method: isHttpMethod(value.method) ? value.method : 'GET',
    environment: isFavoriteEnvironment(value.environment) ? value.environment : 'DEV',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  };
}

function loadStoredFavoriteCommands(): FavoriteCommandEntry[] {
  try {
    const raw = window.localStorage.getItem(FAVORITE_COMMANDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalizedEntries = parsed
      .map((entry) => toFavoriteCommandEntry(entry as FavoriteCommandEntry | string))
      .filter((entry): entry is FavoriteCommandEntry => entry !== null);

    return normalizedEntries.filter(
      (entry, index, array) => array.findIndex((candidate) => (
        candidate.command === entry.command
        && candidate.method === entry.method
        && candidate.environment === entry.environment
        && (candidate.defaultRawBody ?? '') === (entry.defaultRawBody ?? '')
        && normalizeRestDescription(candidate.description ?? '') === normalizeRestDescription(entry.description ?? '')
        && (candidate.postResponseScript ?? '') === (entry.postResponseScript ?? '')
      )) === index,
    );
  } catch {
    return [];
  }
}

function getMatchingFavoriteEndpoints(query: string, favorites: FavoriteEndpointEntry[]): FavoriteEndpointEntry[] {
  const normalizedQuery = normalizeFavoriteEndpoint(query).toLowerCase();
  if (normalizedQuery.length < 3) {
    return [];
  }

  return favorites
    .filter((favorite) =>
      favorite.url.toLowerCase().includes(normalizedQuery)
      || favorite.name.toLowerCase().includes(normalizedQuery)
      || favorite.description.toLowerCase().includes(normalizedQuery),
    )
    .sort((left, right) => {
      const leftStarts = left.url.toLowerCase().startsWith(normalizedQuery) || left.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      const rightStarts = right.url.toLowerCase().startsWith(normalizedQuery) || right.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      if (leftStarts !== rightStarts) {
        return leftStarts - rightStarts;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 8);
}

function getMatchingFavoriteBaseEndpoints(query: string, favorites: FavoriteBaseEndpointEntry[]): FavoriteBaseEndpointEntry[] {
  const normalizedQuery = normalizeFavoriteBaseEndpoint(query).toLowerCase();
  if (normalizedQuery.length < 1) {
    return [];
  }

  return favorites
    .filter((favorite) =>
      favorite.baseUrl.toLowerCase().includes(normalizedQuery)
      || favorite.name.toLowerCase().includes(normalizedQuery)
      || favorite.description.toLowerCase().includes(normalizedQuery),
    )
    .sort((left, right) => {
      const leftStarts = left.baseUrl.toLowerCase().startsWith(normalizedQuery) || left.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      const rightStarts = right.baseUrl.toLowerCase().startsWith(normalizedQuery) || right.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      if (leftStarts !== rightStarts) {
        return leftStarts - rightStarts;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 8);
}

function getMatchingFavoriteCommands(query: string, favorites: FavoriteCommandEntry[]): FavoriteCommandEntry[] {
  const normalizedQuery = normalizeFavoriteCommand(query).toLowerCase();
  if (normalizedQuery.length < 1) {
    return [];
  }

  return favorites
    .filter((favorite) =>
      favorite.command.toLowerCase().includes(normalizedQuery)
      || favorite.name.toLowerCase().includes(normalizedQuery)
      || favorite.description.toLowerCase().includes(normalizedQuery),
    )
    .sort((left, right) => {
      const leftStarts = left.command.toLowerCase().startsWith(normalizedQuery) || left.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      const rightStarts = right.command.toLowerCase().startsWith(normalizedQuery) || right.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      if (leftStarts !== rightStarts) {
        return leftStarts - rightStarts;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 8);
}

function createFavoriteRequestName(method: HttpMethod, url: string): string {
  return deriveRequestName(method, url);
}

function loadStoredFavoriteRequests(): FavoriteRequestEntry[] {
  try {
    const raw = window.localStorage.getItem(FAVORITE_REQUESTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((candidate) => {
      if (!isRecord(candidate)) {
        return [];
      }

      const method = isHttpMethod(candidate.method) ? candidate.method : null;
      const bodyMode = isBodyMode(candidate.bodyMode) ? candidate.bodyMode : 'RAW';
      if (!method || typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.url !== 'string') {
        return [];
      }

      return [{
        id: candidate.id,
        name: normalizeFavoriteName(candidate.name),
        description: typeof candidate.description === 'string' ? normalizeRestDescription(candidate.description) : '',
        createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
        source: candidate.source === 'history' ? 'history' : 'composer',
        environment: isFavoriteEnvironment(candidate.environment) ? candidate.environment : 'DEV',
        method,
        url: candidate.url,
        headers: isRecord(candidate.headers) ? Object.fromEntries(Object.entries(candidate.headers).map(([key, value]) => [key, String(value ?? '')])) : {},
        query: isRecord(candidate.query) ? Object.fromEntries(Object.entries(candidate.query).map(([key, value]) => [key, String(value ?? '')])) : {},
        bodyMode,
        body: candidate.body,
        timeoutMs: typeof candidate.timeoutMs === 'number' ? candidate.timeoutMs : 15000,
        allowInsecureTls: typeof candidate.allowInsecureTls === 'boolean' ? candidate.allowInsecureTls : true,
      } satisfies FavoriteRequestEntry];
    });
  } catch {
    return [];
  }
}

function toSafeImportedRow(value: unknown): ImportedRow | undefined {
  if (!isRecord(value) || !Array.isArray(value.cells) || !isRecord(value.fields)) {
    return undefined;
  }

  return {
    rowNumber: typeof value.rowNumber === 'number' ? value.rowNumber : 1,
    cells: value.cells.map((cell) => String(cell ?? '')),
    fields: Object.fromEntries(Object.entries(value.fields).map(([key, entryValue]) => [key, String(entryValue ?? '')])),
  };
}

function loadStoredHistory(): RequestHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((candidate) => {
      if (!isRecord(candidate)) {
        return [];
      }

      const entry = candidate;
        const method = isHttpMethod(entry.method) ? entry.method : null;
        const bodyMode = isBodyMode(entry.bodyMode) ? entry.bodyMode : 'RAW';

        if (!method || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.url !== 'string' || typeof entry.sentAt !== 'string') {
          return [];
        }

        return [{
          id: entry.id,
          name: entry.name,
          origin: entry.origin === 'collection-import' ? 'collection-import' : 'runtime',
          sentAt: entry.sentAt,
          method,
          url: entry.url,
          headers: isRecord(entry.headers) ? Object.fromEntries(Object.entries(entry.headers).map(([key, value]) => [key, String(value ?? '')])) : {},
          query: isRecord(entry.query) ? Object.fromEntries(Object.entries(entry.query).map(([key, value]) => [key, String(value ?? '')])) : {},
          bodyMode,
          body: entry.body,
          row: toSafeImportedRow(entry.row),
          ok: typeof entry.ok === 'boolean' ? entry.ok : undefined,
          status: typeof entry.status === 'number' ? entry.status : undefined,
          statusText: typeof entry.statusText === 'string' ? entry.statusText : undefined,
          durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : undefined,
          finalUrl: typeof entry.finalUrl === 'string' ? entry.finalUrl : undefined,
          errorDetail: typeof entry.errorDetail === 'string' || entry.errorDetail === null ? entry.errorDetail : undefined,
        } satisfies RequestHistoryEntry];
      })
      .slice(0, MAX_REQUEST_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function deriveRequestName(method: HttpMethod, url: string, fallback?: string): string {
  if (fallback?.trim()) {
    return fallback.trim();
  }

  try {
    const parsedUrl = new URL(url);
    const route = parsedUrl.pathname.replace(/\/+$/, '') || '/';
    return `${method} ${parsedUrl.hostname}${route}`;
  } catch {
    return `${method} ${url}`;
  }
}

function toBaseUrl(rawUrl: string): string {
  try {
    const parsedUrl = new URL(rawUrl);
    parsedUrl.search = '';
    return parsedUrl.toString();
  } catch {
    return rawUrl;
  }
}

function flattenPostmanItems(items: PostmanCollectionItem[] | undefined): PostmanCollectionItem[] {
  if (!items) {
    return [];
  }

  return items.flatMap((item) => (item.item && item.item.length > 0 ? flattenPostmanItems(item.item) : [item]));
}

function resolvePostmanUrlDefinition(url: string | PostmanUrlDefinition | undefined): string {
  if (typeof url === 'string') {
    return url;
  }

  if (!url) {
    return '';
  }

  if (url.raw) {
    return url.raw;
  }

  const protocol = url.protocol ? `${url.protocol}://` : '';
  const host = Array.isArray(url.host) ? url.host.join('.') : '';
  const path = Array.isArray(url.path) ? `/${url.path.join('/')}` : '';
  const queryString = Array.isArray(url.query)
    ? url.query
        .filter((entry) => entry.key)
        .map((entry) => `${encodeURIComponent(String(entry.key ?? ''))}=${encodeURIComponent(String(entry.value ?? ''))}`)
        .join('&')
    : '';

  return `${protocol}${host}${path}${queryString ? `?${queryString}` : ''}`;
}

function extractQueryMap(rawUrl: string, fallbackUrl?: PostmanUrlDefinition): Record<string, string> {
  try {
    const parsedUrl = new URL(rawUrl);
    return Object.fromEntries(parsedUrl.searchParams.entries());
  } catch {
    if (!fallbackUrl?.query) {
      return {};
    }

    return Object.fromEntries(
      fallbackUrl.query
        .filter((entry) => entry.key)
        .map((entry) => [String(entry.key), String(entry.value ?? '')]),
    );
  }
}

function parseImportedBody(rawBody: string): { bodyMode: BodyMode; body: unknown } {
  const trimmed = rawBody.trim();

  if (!trimmed) {
    return { bodyMode: 'RAW', body: '' };
  }

  try {
    return { bodyMode: 'JSON', body: JSON.parse(rawBody) };
  } catch {
    return { bodyMode: 'RAW', body: rawBody };
  }
}

function buildPostmanUrlDefinition(rawUrl: string): string | PostmanUrlDefinition {
  try {
    const parsedUrl = new URL(rawUrl);
    return {
      raw: rawUrl,
      protocol: parsedUrl.protocol.replace(':', ''),
      host: parsedUrl.hostname.split('.'),
      path: parsedUrl.pathname.split('/').filter(Boolean),
      query: [...parsedUrl.searchParams.entries()].map(([key, value]) => ({ key, value })),
    };
  } catch {
    return rawUrl;
  }
}

function toPostmanCollection(entries: RequestHistoryEntry[]): PostmanCollectionDefinition {
  return {
    info: {
      name: 'PostAIS request history',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: entries.map((entry) => ({
      name: entry.name,
      request: {
        method: entry.method,
        header: Object.entries(entry.headers).map(([key, value]) => ({ key, value })),
        body:
          entry.method === 'POST'
            ? {
                mode: 'raw',
                raw: typeof entry.body === 'string' ? entry.body : formatJson(entry.body ?? {}),
              }
            : {
                mode: 'raw',
                raw: '',
              },
        url: buildPostmanUrlDefinition(entry.url),
      },
    })),
  };
}

function fromPostmanCollection(collection: PostmanCollectionDefinition): RequestHistoryEntry[] {
  return flattenPostmanItems(collection.item).flatMap((item) => {
      if (!item.request) {
        return [];
      }

      const method = String(item.request.method ?? '').toUpperCase();
      if (!isHttpMethod(method)) {
        return [];
      }

      const rawUrl = resolvePostmanUrlDefinition(item.request.url);
      if (!rawUrl) {
        return [];
      }

      const headers = Object.fromEntries(
        (item.request.header ?? [])
          .filter((header) => header.key)
          .map((header) => [String(header.key), String(header.value ?? '')]),
      );

      const parsedBody = parseImportedBody(item.request.body?.raw ?? '');

      return [{
        id: createHistoryId(),
        name: deriveRequestName(method, rawUrl, item.name),
        origin: 'collection-import',
        sentAt: new Date().toISOString(),
        method,
        url: rawUrl,
        headers,
        query: extractQueryMap(rawUrl, typeof item.request.url === 'string' ? undefined : item.request.url),
        bodyMode: method === 'POST' ? parsedBody.bodyMode : 'RAW',
        body: method === 'POST' ? parsedBody.body : undefined,
        statusText: 'Importado',
      } satisfies RequestHistoryEntry];
    });
}

function parseJsonInput(source: string, label: string): unknown {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} no es un JSON valido: ${error instanceof Error ? error.message : 'error desconocido'}`);
  }
}

function normalizeStringMap(value: unknown, label: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} debe ser un objeto JSON clave/valor.`);
  }

  return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, String(entryValue ?? '')]));
}

function coerceScalar(value: string): string | number | boolean | null {
  const normalized = value.trim();

  if (normalized === '') {
    return '';
  }

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  if (normalized === 'null') {
    return null;
  }

  const numericValue = Number(normalized);

  if (!Number.isNaN(numericValue) && /^-?\d+(\.\d+)?$/.test(normalized)) {
    return numericValue;
  }

  return value;
}

function applyStringTemplate(input: string, fields: Record<string, string>, mode: TemplateMode): string {
  return input.replace(genericPlaceholderPattern, (_match, rawToken: string) => {
    const token = rawToken.trim();

    if (token.startsWith('secret:')) {
      return mode === 'mask-secrets' ? `[secret:${token.slice(7).trim()}]` : `{{${token}}}`;
    }

    return fields[token] ?? '';
  });
}

function applyValueTemplate(value: unknown, fields: Record<string, string>, mode: TemplateMode): unknown {
  if (typeof value === 'string') {
    const placeholderMatch = value.match(exactPlaceholderPattern);

    if (placeholderMatch) {
      const token = placeholderMatch[1].trim();

      if (token.startsWith('secret:')) {
        return mode === 'mask-secrets' ? `[secret:${token.slice(7).trim()}]` : `{{${token}}}`;
      }

      return coerceScalar(fields[token] ?? '');
    }

    return applyStringTemplate(value, fields, mode);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => applyValueTemplate(entry, fields, mode));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, applyValueTemplate(entryValue, fields, mode)]));
  }

  return value;
}

function extractPlaceholders(...sources: string[]): string[] {
  const tokens = new Set<string>();

  sources.forEach((source) => {
    Array.from(source.matchAll(genericPlaceholderPattern)).forEach((match) => {
      const token = match[1].trim();
      if (!token.startsWith('secret:')) {
        tokens.add(token);
      }
    });
  });

  return [...tokens].sort();
}

function buildFieldMap(cells: string[], headers: string[] | null): Record<string, string> {
  if (headers && headers.length > 0) {
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  }

  return Object.fromEntries(cells.map((cell, index) => [`col${index + 1}`, cell]));
}

function buildRawBody(cells: string[], delimiter: string): string {
  return cells.join(delimiter);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toVisualValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} item(s)` : '[]';
  }

  if (typeof value === 'object') {
    return '{...}';
  }

  return String(value);
}

function extractVisualPairs(value: unknown): Array<{ key: string; value: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value)
    .slice(0, 10)
    .map(([key, item]) => ({ key, value: toVisualValue(item) }));
}

function normalizeSecretKey(value: string): string {
  return value.trim().toUpperCase();
}

function hasUsernameSecretSignal(key: string): boolean {
  return /(user(name)?|usuario|login|mail|email)/i.test(key);
}

function hasPasswordSecretSignal(key: string): boolean {
  return /(pass(word)?|pwd|contrasena|contraseña|secret|credential)/i.test(key);
}

function scoreSecretForRole(key: string, targetRole: 'username' | 'password'): number {
  const hasUserSignal = hasUsernameSecretSignal(key);
  const hasPassSignal = hasPasswordSecretSignal(key);

  if (targetRole === 'username') {
    if (hasUserSignal && !hasPassSignal) {
      return 3;
    }
    if (hasUserSignal) {
      return 1;
    }
    if (hasPassSignal) {
      return -2;
    }
    return 0;
  }

  if (hasPassSignal && !hasUserSignal) {
    return 3;
  }
  if (hasPassSignal) {
    return 1;
  }
  if (hasUserSignal) {
    return -2;
  }
  return 0;
}

function getSecretsSortedForRole(available: string[], targetRole: 'username' | 'password'): string[] {
  return [...available].sort((left, right) => {
    const byScore = scoreSecretForRole(right, targetRole) - scoreSecretForRole(left, targetRole);
    if (byScore !== 0) {
      return byScore;
    }

    return left.localeCompare(right);
  });
}

function resolveApplicableBasicAuthSecretPair(available: string[]): { usernameKey: string; passwordKey: string } {
  const userSorted = getSecretsSortedForRole(available, 'username');
  const passSorted = getSecretsSortedForRole(available, 'password');
  const preferredUser = userSorted[0] ?? '';
  const preferredPass = passSorted.find((key) => key !== preferredUser) ?? '';

  if (
    preferredUser
    && preferredPass
    && scoreSecretForRole(preferredUser, 'username') > 0
    && scoreSecretForRole(preferredPass, 'password') > 0
  ) {
    return {
      usernameKey: preferredUser,
      passwordKey: preferredPass,
    };
  }

  return {
    usernameKey: '',
    passwordKey: '',
  };
}

function getNextSecretNameSuggestion(available: string[]): string {
  const hasUserSecret = available.some((key) => hasUsernameSecretSignal(key));
  const hasPasswordSecret = available.some((key) => hasPasswordSecretSignal(key));

  if (!hasUserSecret) {
    return 'USERNAME';
  }

  if (!hasPasswordSecret) {
    return 'PASSWORD';
  }

  return '';
}

function triggerJsonDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1200);
}

function sortFavoriteRequestEntries(entries: FavoriteRequestEntry[]): FavoriteRequestEntry[] {
  return [...entries].sort((left, right) => {
    const byEnvironment = compareFavoriteEnvironment(left.environment, right.environment);
    if (byEnvironment !== 0) {
      return byEnvironment;
    }

    const byMethod = compareHttpMethod(left.method, right.method);
    if (byMethod !== 0) {
      return byMethod;
    }

    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) {
      return byName;
    }

    return left.url.localeCompare(right.url);
  });
}

function sortHistoryEntries(entries: RequestHistoryEntry[]): RequestHistoryEntry[] {
  return [...entries].sort((left, right) => {
    const byMethod = compareHttpMethod(left.method, right.method);
    if (byMethod !== 0) {
      return byMethod;
    }

    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) {
      return byName;
    }

    return left.url.localeCompare(right.url);
  });
}

function App() {
  const showFavoriteRequestsSection = false;
  const [activeSection, setActiveSection] = useState<AppSection>('composer');
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>('basic');
  const [method, setMethod] = useState<HttpMethod>(() => {
    try {
      const stored = window.localStorage.getItem(METHOD_PREF_STORAGE_KEY);
      return isHttpMethod(stored) ? stored : 'POST';
    } catch {
      return 'POST';
    }
  });
  const [bodyMode, setBodyMode] = useState<BodyMode>('RAW');
  const [endpoint, setEndpoint] = useState('https://httpbin.org/anything');
  const [baseEndpoint, setBaseEndpoint] = useState('');
  const [commandEndpoint, setCommandEndpoint] = useState('');
  const [getEndpointTuples, setGetEndpointTuples] = useState<string[]>(['https://httpbin.org/get']);
  const [selectedGetEndpointIndex, setSelectedGetEndpointIndex] = useState(0);
  const [postEndpointTuples, setPostEndpointTuples] = useState<string[]>(['https://httpbin.org/anything']);
  const [selectedPostEndpointIndex, setSelectedPostEndpointIndex] = useState(0);
  const [postEndpointTupleIds, setPostEndpointTupleIds] = useState<string[]>([createHistoryId()]);
  const [headersText, setHeadersText] = useState(defaultHeaders);
  const [queryText, setQueryText] = useState(defaultQuery);
  const [bodyTemplateText, setBodyTemplateText] = useState(defaultBodyTemplate);
  const [rawBodyText, setRawBodyText] = useState('');
  // Draft RAW for the endpoint being composed in the constructor (null = not composing)
  const [composerDraftRawBody, setComposerDraftRawBody] = useState<string | null>(null);
  const [rawDelimiter, setRawDelimiter] = useState('|');
  const [firstRowAsHeaders, setFirstRowAsHeaders] = useState(false);
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [fileName, setFileName] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [results, setResults] = useState<DispatchResult[]>([]);
  const [statusMessage, setStatusMessage] = useState('Importa un Excel o CSV para comenzar.');
  const [savedSecrets, setSavedSecrets] = useState<SecretDescriptor[]>([]);
  const [secretsHydrated, setSecretsHydrated] = useState(false);
  const [secretName, setSecretName] = useState('');
  const [secretScope, setSecretScope] = useState<SecretScope>('temporary');
  const [showSecretValueInput, setShowSecretValueInput] = useState(false);
  const [authorizationScheme, setAuthorizationScheme] = useState<AuthorizationScheme>(() => {
    try {
      const stored = window.localStorage.getItem(AUTHORIZATION_SCHEME_PREF_STORAGE_KEY);
      return stored === 'BASIC' ? 'BASIC' : 'NONE';
    } catch {
      return 'NONE';
    }
  });
  const [basicAuthUsernameSecretKey, setBasicAuthUsernameSecretKey] = useState(() => {
    try {
      return window.localStorage.getItem(BASIC_AUTH_USERNAME_PREF_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [basicAuthPasswordSecretKey, setBasicAuthPasswordSecretKey] = useState(() => {
    try {
      return window.localStorage.getItem(BASIC_AUTH_PASSWORD_PREF_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [delayMs, setDelayMs] = useState(0);
  const [timeoutMs, setTimeoutMs] = useState(15000);
  const [showSecretsMenu, setShowSecretsMenu] = useState(false);
  const [isNightMode, setIsNightMode] = useState(() => {
    try {
      return window.localStorage.getItem(THEME_PREF_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });
  const [allowInsecureTls, setAllowInsecureTls] = useState(() => {
    try {
      const stored = window.localStorage.getItem(TLS_PREF_STORAGE_KEY);
      if (stored === null) {
        return true;
      }

      return stored === 'true';
    } catch {
      return true;
    }
  });
  const [stopOnError, setStopOnError] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [focusedGetEndpointIndex, setFocusedGetEndpointIndex] = useState<number | null>(null);
  const [hideGetEndpointMatchesByIndex, setHideGetEndpointMatchesByIndex] = useState<Record<number, boolean>>({});
  const [focusedPostEndpointIndex, setFocusedPostEndpointIndex] = useState<number | null>(null);
  const [hidePostEndpointMatchesByIndex, setHidePostEndpointMatchesByIndex] = useState<Record<number, boolean>>({});
  const [isBaseEndpointFocused, setIsBaseEndpointFocused] = useState(false);
  const [isCommandEndpointFocused, setIsCommandEndpointFocused] = useState(false);
  const [hideBaseEndpointMatchesUntilEdit, setHideBaseEndpointMatchesUntilEdit] = useState(false);
  const [hideCommandMatchesUntilEdit, setHideCommandMatchesUntilEdit] = useState(false);
  const [selectedFavoriteCommandIdsOrdered, setSelectedFavoriteCommandIdsOrdered] = useState<string[]>([]);
  const [showFavoriteCommandsSelector, setShowFavoriteCommandsSelector] = useState(false);
  const [expandedGetResponsesByKey, setExpandedGetResponsesByKey] = useState<Record<string, boolean>>({});
  const [dispatchErrors, setDispatchErrors] = useState<string[]>([]);
  const [requestHistory, setRequestHistory] = useState<RequestHistoryEntry[]>(() => loadStoredHistory());
  const [favoriteEndpoints, setFavoriteEndpoints] = useState<FavoriteEndpointEntry[]>(() => loadStoredFavoriteEndpoints());
  const [favoriteBaseEndpoints, setFavoriteBaseEndpoints] = useState<FavoriteBaseEndpointEntry[]>(() => loadStoredFavoriteBaseEndpoints());
  const [favoriteCommands, setFavoriteCommands] = useState<FavoriteCommandEntry[]>(() => loadStoredFavoriteCommands());
  const [favoriteRequests, setFavoriteRequests] = useState<FavoriteRequestEntry[]>(() => loadStoredFavoriteRequests());
  const [favoriteEnvironment, setFavoriteEnvironment] = useState<FavoriteEnvironment>(() => {
    try {
      const stored = window.localStorage.getItem(FAVORITE_ENV_PREF_STORAGE_KEY);
      return isFavoriteEnvironment(stored) ? stored : 'DEV';
    } catch {
      return 'DEV';
    }
  });
  const [historySearch, setHistorySearch] = useState('');
  const [historyMethodFilter, setHistoryMethodFilter] = useState<'ALL' | HttpMethod>('ALL');
  const [favoriteEndpointSearch, setFavoriteEndpointSearch] = useState('');
  const [favoriteEndpointMethodFilter, setFavoriteEndpointMethodFilter] = useState<'ALL' | HttpMethod>('ALL');
  const [favoriteEndpointEnvironmentFilter, setFavoriteEndpointEnvironmentFilter] = useState<'ALL' | FavoriteEnvironment>('ALL');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [descriptionDialog, setDescriptionDialog] = useState<DescriptionDialogState | null>(null);
  const [sampleScriptDialog, setSampleScriptDialog] = useState<SampleScriptDialogState | null>(null);
  const [pathParamValues, setPathParamValues] = useState<Record<string, Record<string, string>>>({});
  const [endpointRuntimeParamsByTupleId, setEndpointRuntimeParamsByTupleId] = useState<Record<string, Record<string, string>>>({});
  const [endpointRawBodiesByTupleId, setEndpointRawBodiesByTupleId] = useState<Record<string, string>>({});
  const [endpointParamGroupDialog, setEndpointParamGroupDialog] = useState<EndpointParamGroupDialogState | null>(null);
  const [postResponseColumnNameDrafts, setPostResponseColumnNameDrafts] = useState<Record<string, Record<string, string>>>({});
  const [postResponseColumnOrders, setPostResponseColumnOrders] = useState<Record<string, string[]>>({});
  const [draggedColumnInfo, setDraggedColumnInfo] = useState<{ scriptId: string; columnKey: string } | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [showBasicAuthFieldErrors, setShowBasicAuthFieldErrors] = useState(false);
  const [authSelectionSource, setAuthSelectionSource] = useState<AuthSelectionSource>(null);
  const [skipConfirmSessionKeys, setSkipConfirmSessionKeys] = useState<string[]>([]);
  const [skipCurrentDialogForSession, setSkipCurrentDialogForSession] = useState(false);

  const stopRequestedRef = useRef(false);
  const secretValueRef = useRef<HTMLInputElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const resultsPanelRef = useRef<HTMLElement | null>(null);
  const historyImportInputRef = useRef<HTMLInputElement | null>(null);
  const favoriteRequestsImportInputRef = useRef<HTMLInputElement | null>(null);
  const favoriteBaseEndpointsImportInputRef = useRef<HTMLInputElement | null>(null);
  const favoriteCommandsImportInputRef = useRef<HTMLInputElement | null>(null);
  const pendingConfirmActionRef = useRef<null | (() => void)>(null);
  const authBootstrapDoneRef = useRef(false);

  const selectedGetEndpoint = getEndpointTuples[selectedGetEndpointIndex] ?? '';
  const focusedGetEndpoint = focusedGetEndpointIndex === null ? '' : (getEndpointTuples[focusedGetEndpointIndex] ?? '');
  const selectedPostEndpoint = postEndpointTuples[selectedPostEndpointIndex] ?? '';
  const focusedPostEndpoint = focusedPostEndpointIndex === null ? '' : (postEndpointTuples[focusedPostEndpointIndex] ?? '');
  const selectedPostEndpointTupleId = postEndpointTupleIds[selectedPostEndpointIndex] ?? '';
  const previewRow = rows[selectedRowIndex] ?? null;
  const previewRawBody = previewRow
    ? (resolveRawBodyForEndpoint(selectedPostEndpoint || endpoint).trim()
      ? applyStringTemplate(resolveRawBodyForEndpoint(selectedPostEndpoint || endpoint), previewRow.fields, 'mask-secrets')
      : buildRawBody(previewRow.cells, rawDelimiter))
    : '';
  const savedSecretKeys = useMemo(() => savedSecrets.map((secret) => secret.key), [savedSecrets]);
  const usernameSecretOptions = useMemo(() => getSecretsSortedForRole(savedSecretKeys, 'username'), [savedSecretKeys]);
  const passwordSecretOptions = useMemo(() => getSecretsSortedForRole(savedSecretKeys, 'password'), [savedSecretKeys]);
  const normalizedBaseEndpoint = normalizeFavoriteBaseEndpoint(baseEndpoint);
  const normalizedCommandEndpoint = normalizeFavoriteCommand(commandEndpoint);
  const composedEndpoint = useMemo(
    () => buildEndpointFromBaseAndCommand(normalizedBaseEndpoint, normalizedCommandEndpoint),
    [normalizedBaseEndpoint, normalizedCommandEndpoint],
  );
  const contextualFavoriteEndpoints = useMemo(
    () => favoriteEndpoints.filter((entry) => entry.environment === favoriteEnvironment && entry.method === method),
    [favoriteEndpoints, favoriteEnvironment, method],
  );
  const contextualFavoriteBaseEndpoints = useMemo(
    () => favoriteBaseEndpoints.filter((entry) => entry.environment === favoriteEnvironment),
    [favoriteBaseEndpoints, favoriteEnvironment],
  );
  const contextualFavoriteCommands = useMemo(
    () => favoriteCommands.filter((entry) => entry.environment === favoriteEnvironment && entry.method === method),
    [favoriteCommands, favoriteEnvironment, method],
  );
  const getFavoriteCommandsForEnvironment = useMemo(
    () => favoriteCommands.filter((entry) => entry.environment === favoriteEnvironment && entry.method === 'GET'),
    [favoriteCommands, favoriteEnvironment],
  );
  const baseEndpointMatches = useMemo(
    () => getMatchingFavoriteBaseEndpoints(baseEndpoint, contextualFavoriteBaseEndpoints),
    [baseEndpoint, contextualFavoriteBaseEndpoints],
  );
  const commandMatches = useMemo(
    () => getMatchingFavoriteCommands(commandEndpoint, contextualFavoriteCommands),
    [commandEndpoint, contextualFavoriteCommands],
  );
  const selectedFavoriteCommandsOrdered = useMemo(
    () => selectedFavoriteCommandIdsOrdered
      .map((id) => contextualFavoriteCommands.find((entry) => entry.id === id) ?? null)
      .filter((entry): entry is FavoriteCommandEntry => entry !== null),
    [contextualFavoriteCommands, selectedFavoriteCommandIdsOrdered],
  );
  const composedEndpointsFromSelection = useMemo(() => {
    if (!normalizedBaseEndpoint) {
      return [];
    }

    if (selectedFavoriteCommandsOrdered.length > 0) {
      return selectedFavoriteCommandsOrdered
        .map((entry) => buildEndpointFromBaseAndCommand(normalizedBaseEndpoint, entry.command))
        .filter((value): value is string => value.trim() !== '');
    }

    if (!normalizedCommandEndpoint) {
      return [];
    }

    const singleComposed = buildEndpointFromBaseAndCommand(normalizedBaseEndpoint, normalizedCommandEndpoint);
    return singleComposed ? [singleComposed] : [];
  }, [normalizedBaseEndpoint, normalizedCommandEndpoint, selectedFavoriteCommandsOrdered]);
  const canApplyComposedEndpoints = composedEndpointsFromSelection.length > 0;
  const postEndpointMatches = useMemo(
    () => getMatchingFavoriteEndpoints(focusedPostEndpoint, favoriteEndpoints.filter((entry) => entry.environment === favoriteEnvironment && entry.method === 'POST')),
    [favoriteEndpoints, favoriteEnvironment, focusedPostEndpoint],
  );
  const getEndpointMatches = useMemo(
    () => getMatchingFavoriteEndpoints(focusedGetEndpoint, favoriteEndpoints.filter((entry) => entry.environment === favoriteEnvironment && entry.method === 'GET')),
    [favoriteEndpoints, favoriteEnvironment, focusedGetEndpoint],
  );
  const filteredFavoriteEndpoints = useMemo(
    () => favoriteEndpoints
      .filter((entry) => {
        const matchesMethod = favoriteEndpointMethodFilter === 'ALL' || entry.method === favoriteEndpointMethodFilter;
        const matchesEnvironment = favoriteEndpointEnvironmentFilter === 'ALL' || entry.environment === favoriteEndpointEnvironmentFilter;
        if (!matchesMethod || !matchesEnvironment) {
          return false;
        }

        const query = favoriteEndpointSearch.trim().toLowerCase();
        if (!query) {
          return true;
        }

        return [entry.name, entry.description, entry.url, entry.method, entry.environment].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        const byEnvironment = compareFavoriteEnvironment(left.environment, right.environment);
        if (byEnvironment !== 0) {
          return byEnvironment;
        }

        const byMethod = left.method.localeCompare(right.method);
        if (byMethod !== 0) {
          return byMethod;
        }

        return left.name.localeCompare(right.name);
      }),
    [favoriteEndpointEnvironmentFilter, favoriteEndpointMethodFilter, favoriteEndpointSearch, favoriteEndpoints],
  );
  const savedSecretsByKey = useMemo(
    () => Object.fromEntries(savedSecrets.map((secret) => [secret.key, secret.scope] as const)),
    [savedSecrets],
  );
  const csvColumns = rows[0] ? Object.keys(rows[0].fields) : [];

  const filteredHistory = useMemo(
    () =>
      requestHistory.filter((entry) => {
        const matchesMethod = historyMethodFilter === 'ALL' || entry.method === historyMethodFilter;
        if (!matchesMethod) {
          return false;
        }

        const query = historySearch.trim().toLowerCase();
        if (!query) {
          return true;
        }

        return [entry.name, entry.url, entry.finalUrl ?? '', entry.statusText ?? '', entry.errorDetail ?? '']
          .some((value) => value.toLowerCase().includes(query));
      }),
    [historyMethodFilter, historySearch, requestHistory],
  );

  const filteredFavoriteRequests = useMemo(
    () =>
      favoriteRequests
        .filter((entry) => entry.method === method && entry.environment === favoriteEnvironment)
        .sort((left, right) => {
          const byEnvironment = compareFavoriteEnvironment(left.environment, right.environment);
          if (byEnvironment !== 0) {
            return byEnvironment;
          }

          const byMethod = left.method.localeCompare(right.method);
          if (byMethod !== 0) {
            return byMethod;
          }

          return left.name.localeCompare(right.name);
        }),
    [favoriteEnvironment, favoriteRequests, method],
  );

  const expectedVariables = useMemo(
    () =>
      method === 'GET'
        ? []
        :
      extractPlaceholders(
        method === 'POST' ? (selectedPostEndpoint || endpoint) : endpoint,
        headersText,
        queryText,
        ...(method === 'POST' && bodyMode === 'JSON' ? [bodyTemplateText] : []),
        ...(method === 'POST' && bodyMode === 'RAW' ? [resolveRawBodyForEndpoint(selectedPostEndpoint || endpoint)] : []),
      ),
    [bodyMode, bodyTemplateText, endpoint, headersText, method, queryText, rawBodyText, selectedPostEndpoint],
  );

  const preflightIssues = useMemo(() => {
    const issues: string[] = [];

    const currentEndpoint = method === 'GET' ? selectedGetEndpoint : (selectedPostEndpoint || endpoint);
    if (!currentEndpoint.trim()) {
      issues.push('Falta definir un endpoint.');
    }

    if (method === 'POST' && bodyMode === 'RAW' && rows.length === 0 && resolveRawBodyForEndpoint(currentEndpoint).trim() === '') {
      issues.push('Se enviara POST con body RAW vacio (sin CSV y sin contenido manual).');
    }

    if (method === 'POST' && bodyMode === 'JSON') {
      try {
        parseJsonInput(bodyTemplateText, 'El body');
      } catch (error) {
        issues.push(error instanceof Error ? error.message : 'El body JSON no es valido.');
      }
    }

    if (method !== 'GET') {
      try {
        parseJsonInput(headersText, 'Las cabeceras');
      } catch (error) {
        issues.push(error instanceof Error ? error.message : 'Las cabeceras no son validas.');
      }

      try {
        parseJsonInput(queryText, 'Los query params');
      } catch (error) {
        issues.push(error instanceof Error ? error.message : 'Los query params no son validos.');
      }
    }

    if (authorizationScheme === 'BASIC' && (!basicAuthUsernameSecretKey || !basicAuthPasswordSecretKey)) {
      issues.push('Basic Auth necesita Username y Password privados.');
    }

    return issues;
  }, [authorizationScheme, basicAuthPasswordSecretKey, basicAuthUsernameSecretKey, bodyMode, bodyTemplateText, endpoint, headersText, method, queryText, rawBodyText, rows.length, selectedGetEndpoint, selectedPostEndpoint]);

  useEffect(() => {
    if (!window.postais?.listSecrets) {
      setSecretsHydrated(true);
      return;
    }

    window.postais.listSecrets()
      .then(setSavedSecrets)
      .catch(() => {
        setSavedSecrets([]);
      })
      .finally(() => {
        setSecretsHydrated(true);
      });
  }, []);

  useEffect(() => {
    if (!secretsHydrated) {
      return;
    }

    const applicablePair = resolveApplicableBasicAuthSecretPair(savedSecretKeys);
    const hasPersistedBasicPair = authorizationScheme === 'BASIC'
      && basicAuthUsernameSecretKey !== ''
      && basicAuthPasswordSecretKey !== ''
      && savedSecretKeys.includes(basicAuthUsernameSecretKey)
      && savedSecretKeys.includes(basicAuthPasswordSecretKey);

    if (!authBootstrapDoneRef.current) {
      authBootstrapDoneRef.current = true;

      if (hasPersistedBasicPair) {
        setAuthSelectionSource('auto');
        return;
      }

      if (applicablePair.usernameKey && applicablePair.passwordKey) {
        setAuthorizationScheme('BASIC');
        setBasicAuthUsernameSecretKey(applicablePair.usernameKey);
        setBasicAuthPasswordSecretKey(applicablePair.passwordKey);
        setAuthSelectionSource('auto');
      } else {
        setInterfaceMode('advanced');
      }

      return;
    }

    if (savedSecretKeys.length === 0) {
      setBasicAuthUsernameSecretKey('');
      setBasicAuthPasswordSecretKey('');
      return;
    }

    if (!basicAuthUsernameSecretKey || !savedSecretKeys.includes(basicAuthUsernameSecretKey)) {
      setBasicAuthUsernameSecretKey(applicablePair.usernameKey);
    }

    if (!basicAuthPasswordSecretKey || !savedSecretKeys.includes(basicAuthPasswordSecretKey)) {
      setBasicAuthPasswordSecretKey(applicablePair.passwordKey);
    }

    if (authorizationScheme === 'BASIC' && applicablePair.usernameKey && applicablePair.passwordKey) {
      setAuthSelectionSource('auto');
    }
  }, [authorizationScheme, basicAuthPasswordSecretKey, basicAuthUsernameSecretKey, savedSecretKeys, secretsHydrated]);

  useEffect(() => {
    if (authorizationScheme !== 'BASIC' || !basicAuthUsernameSecretKey || !basicAuthPasswordSecretKey) {
      return;
    }

    try {
      window.localStorage.setItem(AUTHORIZATION_SCHEME_PREF_STORAGE_KEY, 'BASIC');
      window.localStorage.setItem(BASIC_AUTH_USERNAME_PREF_STORAGE_KEY, basicAuthUsernameSecretKey);
      window.localStorage.setItem(BASIC_AUTH_PASSWORD_PREF_STORAGE_KEY, basicAuthPasswordSecretKey);
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }
  }, [authorizationScheme, basicAuthPasswordSecretKey, basicAuthUsernameSecretKey]);

  useEffect(() => {
    if (!secretsHydrated) {
      return;
    }

    if (secretName.trim() !== '') {
      return;
    }

    setSecretName(getNextSecretNameSuggestion(savedSecretKeys));
  }, [savedSecretKeys, secretName, secretsHydrated]);

  useEffect(() => {
    if (!sliderRef.current) {
      return;
    }

    const card = sliderRef.current.querySelector<HTMLElement>(`[data-row-card='${selectedRowIndex}']`);
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedRowIndex, rows.length]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TLS_PREF_STORAGE_KEY, allowInsecureTls ? 'true' : 'false');
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }
  }, [allowInsecureTls]);

  useEffect(() => {
    const theme = isNightMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);

    try {
      window.localStorage.setItem(THEME_PREF_STORAGE_KEY, theme);
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }
  }, [isNightMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(REQUEST_HISTORY_STORAGE_KEY, JSON.stringify(requestHistory));
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }
  }, [requestHistory]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITE_ENDPOINTS_STORAGE_KEY, JSON.stringify(favoriteEndpoints));
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }
  }, [favoriteEndpoints]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITE_BASE_ENDPOINTS_STORAGE_KEY, JSON.stringify(favoriteBaseEndpoints));
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }
  }, [favoriteBaseEndpoints]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITE_COMMANDS_STORAGE_KEY, JSON.stringify(favoriteCommands));
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }
  }, [favoriteCommands]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITE_REQUESTS_STORAGE_KEY, JSON.stringify(favoriteRequests));
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }
  }, [favoriteRequests]);

  useEffect(() => {
    try {
      window.localStorage.setItem(METHOD_PREF_STORAGE_KEY, method);
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }

    setBaseEndpoint('');
    setCommandEndpoint('');
    setSelectedFavoriteCommandIdsOrdered([]);
    setShowFavoriteCommandsSelector(false);
    setHideBaseEndpointMatchesUntilEdit(false);
    setHideCommandMatchesUntilEdit(false);

    if (method !== 'GET') {
      setFocusedGetEndpointIndex(null);
    } else {
      setFocusedPostEndpointIndex(null);
    }
  }, [method]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITE_ENV_PREF_STORAGE_KEY, favoriteEnvironment);
    } catch {
      // Ignore persistence failures (private mode / restricted storage).
    }
  }, [favoriteEnvironment]);

  useEffect(() => {
    if (focusedGetEndpointIndex !== null && focusedGetEndpointIndex >= getEndpointTuples.length) {
      setFocusedGetEndpointIndex(null);
    }
  }, [focusedGetEndpointIndex, getEndpointTuples.length]);

  useEffect(() => {
    if (focusedPostEndpointIndex !== null && focusedPostEndpointIndex >= postEndpointTuples.length) {
      setFocusedPostEndpointIndex(null);
    }
  }, [focusedPostEndpointIndex, postEndpointTuples.length]);

  useEffect(() => {
    setPostEndpointTupleIds((current) => {
      if (current.length === postEndpointTuples.length) {
        return current;
      }

      if (current.length > postEndpointTuples.length) {
        return current.slice(0, postEndpointTuples.length);
      }

      const next = [...current];
      while (next.length < postEndpointTuples.length) {
        next.push(createHistoryId());
      }
      return next;
    });
  }, [postEndpointTuples.length]);

  useEffect(() => {
    setEndpointRawBodiesByTupleId((prev) => {
      let changed = false;
      const next = { ...prev };

      postEndpointTupleIds.forEach((tupleId) => {
        if (!(tupleId in next)) {
          next[tupleId] = '';
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    setEndpointRuntimeParamsByTupleId((prev) => {
      let changed = false;
      const next = { ...prev };

      postEndpointTupleIds.forEach((tupleId) => {
        if (!(tupleId in next)) {
          next[tupleId] = {};
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [postEndpointTupleIds]);

  // Cancel the composer draft whenever the user switches to an existing tuple,
  // so the textarea shows that tuple's real RAW body and not a stale draft.
  useEffect(() => {
    setComposerDraftRawBody(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPostEndpointIndex]);

  useEffect(() => {
    if (method !== 'POST') {
      return;
    }

    const activeEndpoint = postEndpointTuples[selectedPostEndpointIndex] ?? '';
    if (endpoint !== activeEndpoint) {
      setEndpoint(activeEndpoint);
    }
  }, [endpoint, method, postEndpointTuples, selectedPostEndpointIndex]);

  useEffect(() => {
    const availableIds = new Set(contextualFavoriteCommands.map((entry) => entry.id));
    setSelectedFavoriteCommandIdsOrdered((current) => current.filter((id) => availableIds.has(id)));
  }, [contextualFavoriteCommands]);

  function isFavoriteEndpoint(value: string, endpointMethod: HttpMethod) {
    const normalized = normalizeFavoriteEndpoint(value);
    return normalized !== '' && favoriteEndpoints.some((entry) => entry.url === normalized && entry.method === endpointMethod && entry.environment === favoriteEnvironment);
  }

  function isFavoriteBaseEndpoint(value: string) {
    const normalized = normalizeFavoriteBaseEndpoint(value);
    return normalized !== '' && favoriteBaseEndpoints.some((entry) => entry.baseUrl === normalized && entry.environment === favoriteEnvironment);
  }

  function isFavoriteCommand(value: string, endpointMethod: HttpMethod) {
    const normalized = normalizeFavoriteCommand(value);
    if (normalized === '') return false;
    const currentRaw = endpointMethod === 'POST' && bodyMode === 'RAW'
      ? (composerDraftRawBody !== null ? composerDraftRawBody : resolveRawBodyForPostTuple(selectedPostEndpointTupleId))
      : '';
    return favoriteCommands.some((entry) =>
      entry.command === normalized &&
      entry.method === endpointMethod &&
      entry.environment === favoriteEnvironment &&
      (entry.defaultRawBody ?? '') === currentRaw
    );
  }

  function toggleFavoriteBaseEndpoint(value: string, endpointMethod: HttpMethod) {
    const normalized = normalizeFavoriteBaseEndpoint(value);
    if (!normalized) {
      setStatusMessage('Escribe un endpoint base valido antes de anadirlo a favoritos.');
      return;
    }

    setFavoriteBaseEndpoints((current) => {
      const existing = current.find((entry) => entry.baseUrl === normalized && entry.environment === favoriteEnvironment);
      if (existing) {
        setStatusMessage(`Endpoint base eliminado de favoritos: ${normalized}`);
        return current.filter((entry) => !(entry.baseUrl === normalized && entry.environment === favoriteEnvironment));
      }

      setStatusMessage(`Endpoint base guardado en favoritos: ${normalized}`);
      return [{
        id: createHistoryId(),
        name: normalizeFavoriteName(createDefaultFavoriteBaseEndpointName(normalized)),
        description: '',
        baseUrl: normalized,
        method: endpointMethod,
        environment: favoriteEnvironment,
        createdAt: new Date().toISOString(),
      }, ...current.filter((entry) => !(entry.baseUrl === normalized && entry.environment === favoriteEnvironment))];
    });
  }

  function toggleFavoriteCommand(value: string, endpointMethod: HttpMethod) {
    const normalized = normalizeFavoriteCommand(value);
    if (!normalized) {
      setStatusMessage('Escribe un comando valido antes de anadirlo a favoritos.');
      return;
    }

    const currentRaw = endpointMethod === 'POST' && bodyMode === 'RAW'
      ? (composerDraftRawBody !== null ? composerDraftRawBody : resolveRawBodyForPostTuple(selectedPostEndpointTupleId))
      : '';

    setFavoriteCommands((current) => {
      const exactMatch = current.find((entry) =>
        entry.command === normalized &&
        entry.method === endpointMethod &&
        entry.environment === favoriteEnvironment &&
        (entry.defaultRawBody ?? '') === currentRaw
      );

      if (exactMatch) {
        setStatusMessage(`Comando eliminado de favoritos (${endpointMethod}/${favoriteEnvironment}): ${normalized}`);
        return current.filter((entry) => entry.id !== exactMatch.id);
      }

      setStatusMessage(`Comando guardado en favoritos (${endpointMethod}/${favoriteEnvironment}): ${normalized}`);
      return [{
        id: createHistoryId(),
        name: normalizeFavoriteName(createDefaultFavoriteCommandName(normalized)),
        description: '',
        command: normalized,
        defaultRawBody: currentRaw,
        postResponseScript: '',
        method: endpointMethod,
        environment: favoriteEnvironment,
        createdAt: new Date().toISOString(),
      }, ...current];
    });
  }

  function updateBaseEndpoint(value: string) {
    setBaseEndpoint(value);
    setHideBaseEndpointMatchesUntilEdit(false);
    setComposerDraftRawBody((current) => current ?? '');
  }

  function updateCommandEndpoint(value: string) {
    setCommandEndpoint(value);
    setHideCommandMatchesUntilEdit(false);
    setSelectedFavoriteCommandIdsOrdered([]);
    setComposerDraftRawBody((current) => current ?? '');
  }

  function applyFavoriteBaseEndpoint(value: string) {
    setBaseEndpoint(value);
    setHideBaseEndpointMatchesUntilEdit(true);
    setComposerDraftRawBody((current) => current ?? '');
    setStatusMessage(`Endpoint base cargado en el constructor: ${value}`);
  }

  function applyFavoriteCommand(entry: FavoriteCommandEntry) {
    setCommandEndpoint(entry.command);
    if (entry.method === 'POST') {
      const raw = entry.defaultRawBody ?? '';
      setBodyMode('RAW');
      setRawBodyText(raw);
      // Store in draft (not in active tuple) — the active tuple's RAW must not be overwritten here
      setComposerDraftRawBody(raw);
    }
    setHideCommandMatchesUntilEdit(true);
    setStatusMessage(`Comando cargado en el constructor: ${entry.command}`);
  }

  function resolveRawBodyForPostTuple(tupleId?: string): string {
    if (method === 'POST' && tupleId !== undefined) {
      // Strict tuple resolution: missing mapping means empty raw for that tuple.
      return endpointRawBodiesByTupleId[tupleId] ?? '';
    }
    return rawBodyText;
  }

  function resolveRawBodyForEndpoint(_endpointUrl?: string): string {
    return rawBodyText;
  }

  function toggleSelectedFavoriteCommand(commandId: string) {
    setSelectedFavoriteCommandIdsOrdered((current) => {
      if (current.includes(commandId)) {
        return current.filter((id) => id !== commandId);
      }

      return [...current, commandId];
    });
  }

  function applyComposedEndpointsToCurrentMethod(mode: 'add' | 'replace') {
    if (!canApplyComposedEndpoints) {
      setStatusMessage('Completa endpoint base y comando para construir la URL.');
      return;
    }

    const endpointsToApply = composedEndpointsFromSelection;
    const firstComposedEndpoint = endpointsToApply[0] ?? '';
    const firstSelectedCommand = selectedFavoriteCommandsOrdered[0];
    const defaultRawFromCommand = firstSelectedCommand?.method === 'POST' && method === 'POST' ? (firstSelectedCommand.defaultRawBody ?? '') : '';

    if (method === 'GET') {
      setGetEndpointTuples((current) => {
        const hasOnlyBlankTuple = current.length === 1 && current[0].trim() === '';
        if (mode === 'replace') {
          return endpointsToApply;
        }

        return hasOnlyBlankTuple ? endpointsToApply : [...current, ...endpointsToApply];
      });

      const selectedIndexForGet = mode === 'replace'
        ? 0
        : ((getEndpointTuples.length === 1 && getEndpointTuples[0].trim() === '') ? 0 : getEndpointTuples.length);

      setSelectedGetEndpointIndex(selectedIndexForGet);
      setHideGetEndpointMatchesByIndex((current) => {
        const next = mode === 'replace' ? {} : { ...current };
        const baseIndex = mode === 'replace'
          ? 0
          : ((getEndpointTuples.length === 1 && getEndpointTuples[0].trim() === '') ? 0 : getEndpointTuples.length);

        next[baseIndex] = true;
        for (let offset = 1; offset < endpointsToApply.length; offset += 1) {
          next[baseIndex + offset] = true;
        }

        return next;
      });

      if (mode === 'replace') {
        setStatusMessage(`${endpointsToApply.length} endpoint(s) aplicados sustituyendo todas las tuplas GET.`);
      } else if (endpointsToApply.length === 1) {
        setStatusMessage(`Endpoint compuesto anadido como nueva tupla GET: ${firstComposedEndpoint}`);
      } else {
        setStatusMessage(`${endpointsToApply.length} endpoints anadidos como nuevas tuplas GET.`);
      }
    } else {
      // Use the composer draft as the RAW source so existing tuples are never overwritten
      const currentRawBody = composerDraftRawBody ?? '';
      const hasOnlyBlankTuple = postEndpointTuples.length === 1 && postEndpointTuples[0].trim() === '';
      const baseIndex = mode === 'replace'
        ? 0
        : (hasOnlyBlankTuple ? 0 : postEndpointTuples.length);

      const newCount = mode === 'replace' ? endpointsToApply.length : (hasOnlyBlankTuple ? endpointsToApply.length : postEndpointTupleIds.length + endpointsToApply.length);
      // When adding to a blank-only tuple list, generate fresh IDs (don't reuse the blank tuple's ID)
      const newIds = (mode === 'replace' || hasOnlyBlankTuple) ? [] : [...postEndpointTupleIds];
      while (newIds.length < newCount) {
        newIds.push(createHistoryId());
      }

      setPostEndpointTuples((current) => {
        if (mode === 'replace') {
          return endpointsToApply;
        }
        return hasOnlyBlankTuple ? endpointsToApply : [...current, ...endpointsToApply];
      });
      
      setPostEndpointTupleIds(newIds);
      
      setSelectedPostEndpointIndex(baseIndex);
      setFocusedPostEndpointIndex(baseIndex);
      setEndpoint(firstComposedEndpoint);
      
      setEndpointRawBodiesByTupleId((prev) => {
        const next = mode === 'replace' ? {} : { ...prev };
        for (let idx = 0; idx < endpointsToApply.length; idx += 1) {
          const tupleIndex = baseIndex + idx;
          const tupleId = newIds[tupleIndex];
          if (tupleId) {
            const selectedCommand = selectedFavoriteCommandsOrdered[idx];
            const commandRaw = selectedCommand?.method === 'POST' ? (selectedCommand.defaultRawBody ?? '') : '';
            const resolvedRaw = commandRaw || currentRawBody || defaultRawFromCommand;
            next[tupleId] = resolvedRaw;
          }
        }
        return next;
      });

      setEndpointRuntimeParamsByTupleId((prev) => {
        const next = mode === 'replace' ? {} : { ...prev };
        for (let idx = 0; idx < endpointsToApply.length; idx += 1) {
          const tupleIndex = baseIndex + idx;
          const tupleId = newIds[tupleIndex];
          if (tupleId) {
            next[tupleId] = next[tupleId] ?? {};
          }
        }
        return next;
      });
      
      setHidePostEndpointMatchesByIndex((current) => {
        const next = mode === 'replace' ? {} : { ...current };
        next[baseIndex] = true;
        for (let offset = 1; offset < endpointsToApply.length; offset += 1) {
          next[baseIndex + offset] = true;
        }

        return next;
      });
      if (mode === 'replace') {
        setStatusMessage(`${endpointsToApply.length} endpoint(s) POST aplicados sustituyendo todas las tuplas.`);
      } else if (endpointsToApply.length === 1) {
        setStatusMessage(`Endpoint compuesto anadido como nueva tupla POST: ${firstComposedEndpoint}`);
      } else {
        setStatusMessage(`${endpointsToApply.length} endpoints anadidos como nuevas tuplas POST.`);
      }
    }

    // Exit draft mode: the new tuples now own their RAW independently
    setComposerDraftRawBody(null);

    setShowFavoriteCommandsSelector(false);

    setActiveSection('composer');
  }

  function doesResultMatchFavoriteCommand(result: DispatchResult, commandEntry: FavoriteCommandEntry): boolean {
    const normalizedCommand = normalizeFavoriteCommand(commandEntry.command);
    if (!normalizedCommand) {
      return false;
    }

    const candidates = [result.finalUrl, result.requestPreview.url]
      .map((value) => value.trim())
      .filter((value) => value !== '');

    return candidates.some((urlValue) => {
      try {
        const pathname = new URL(urlValue).pathname.replace(/\/+$/, '');
        return pathname.endsWith(normalizedCommand) || pathname.includes(normalizedCommand);
      } catch {
        const normalizedUrl = urlValue.replace(/\/+$/, '');
        return normalizedUrl.endsWith(normalizedCommand) || normalizedUrl.includes(normalizedCommand);
      }
    });
  }

  function resolveFavoriteCommandForResult(result: DispatchResult): FavoriteCommandEntry | null {
    const matches = getFavoriteCommandsForEnvironment.filter((entry) => doesResultMatchFavoriteCommand(result, entry));
    if (matches.length === 0) {
      return null;
    }

    return matches.sort((left, right) => right.command.length - left.command.length)[0] ?? null;
  }

  function findLatestGetResultForCommand(commandEntry: FavoriteCommandEntry): DispatchResult | null {
    for (let index = results.length - 1; index >= 0; index -= 1) {
      const candidate = results[index];
      if (candidate.method !== 'GET') {
        continue;
      }

      if (doesResultMatchFavoriteCommand(candidate, commandEntry)) {
        return candidate;
      }
    }

    return null;
  }

  function generateSampleScriptForCommand(commandEntry: FavoriteCommandEntry, responseContext: PostResponseScriptContext) {
    const suggestedPaths = createPostResponseSuggestedPaths(responseContext);
    if (suggestedPaths.length === 0) {
      setStatusMessage('No se encontraron campos estructurados para generar un sample de script.');
      return;
    }

    const defaultSelection = suggestedPaths.slice(0, 8);
    setSampleScriptDialog({
      mode: 'create',
      commandId: commandEntry.id,
      commandLabel: commandEntry.command,
      suggestedPaths,
      selectedPaths: defaultSelection,
      preservedColumnNames: {},
      context: responseContext,
    });
  }

  function editActiveScriptForCommand(commandEntry: FavoriteCommandEntry, responseContext: PostResponseScriptContext) {
    const script = commandEntry.postResponseScript?.trim();
    if (!script) {
      setStatusMessage(`El comando ${commandEntry.command} no tiene script activo. Genera uno primero.`);
      return;
    }

    const suggestedPaths = createPostResponseSuggestedPaths(responseContext);
    const preservedColumnNames = extractScriptColumnNames(script);
    const selectedPathsFromScript = extractSelectedPathsFromScript(script, suggestedPaths);
    const columnOrderFromScript = extractColumnOrderFromScript(script);
    const mergedSuggestedPaths = Array.from(new Set([...selectedPathsFromScript, ...suggestedPaths]));

    if (columnOrderFromScript.length > 0) {
      setPostResponseColumnOrders((current) => ({
        ...current,
        [commandEntry.id]: columnOrderFromScript,
      }));
    }

    setSampleScriptDialog({
      mode: 'edit',
      commandId: commandEntry.id,
      commandLabel: commandEntry.command,
      suggestedPaths: mergedSuggestedPaths,
      selectedPaths: selectedPathsFromScript,
      preservedColumnNames,
      context: responseContext,
    });
  }

  function toggleSampleScriptPath(path: string) {
    setSampleScriptDialog((current) => {
      if (!current) {
        return current;
      }

      const isSelected = current.selectedPaths.includes(path);
      return {
        ...current,
        selectedPaths: isSelected
          ? current.selectedPaths.filter((candidate) => candidate !== path)
          : [...current.selectedPaths, path],
      };
    });
  }

  function toggleAllSampleScriptPaths() {
    setSampleScriptDialog((current) => {
      if (!current) {
        return current;
      }

      const allSelected = current.suggestedPaths.length > 0
        && current.selectedPaths.length === current.suggestedPaths.length;

      return {
        ...current,
        selectedPaths: allSelected ? [] : [...current.suggestedPaths],
      };
    });
  }

  function selectSampleScriptPathsByPrefix(prefix: 'meta.' | 'headers.' | 'body.') {
    setSampleScriptDialog((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        selectedPaths: current.suggestedPaths.filter((path) => path.startsWith(prefix)),
      };
    });
  }

  function closeSampleScriptDialog() {
    setSampleScriptDialog(null);
  }

  function saveSampleScriptDialog() {
    if (!sampleScriptDialog) {
      return;
    }

    if (sampleScriptDialog.selectedPaths.length === 0) {
      setStatusMessage('Selecciona al menos un campo para generar el script.');
      return;
    }

    const nextColumnNames = Object.fromEntries(
      sampleScriptDialog.selectedPaths
        .map((path) => {
          const key = getColumnKeyForSelectedPath(path);
          const preservedName = sampleScriptDialog.preservedColumnNames[key] ?? sampleScriptDialog.preservedColumnNames[path];
          if (!preservedName) {
            return null;
          }

          return [key, preservedName] as const;
        })
        .filter((entry): entry is readonly [string, string] => entry !== null),
    );

    const sampleScript = createPostResponseSampleScript(sampleScriptDialog.selectedPaths, nextColumnNames);
    setFavoriteCommands((current) => current.map((entry) => (
      entry.id === sampleScriptDialog.commandId
        ? { ...entry, postResponseScript: sampleScript }
        : entry
    )));
    setStatusMessage(sampleScriptDialog.mode === 'edit'
      ? `Script post-respuesta actualizado para ${sampleScriptDialog.commandLabel}.`
      : `Sample de script post-respuesta generado para ${sampleScriptDialog.commandLabel}.`);
    closeSampleScriptDialog();
  }

  function toggleGetResponseExpanded(key: string) {
    setExpandedGetResponsesByKey((current) => ({ ...current, [key]: !current[key] }));
  }

  async function copyAllResultsToClipboard() {
    if (results.length === 0) {
      setStatusMessage('No hay respuestas para copiar.');
      return;
    }

    const payload = results.map((result, index) => [
      `#${index + 1}`,
      `method=${result.method}`,
      `status=${result.status} ${result.statusText}`,
      `durationMs=${result.durationMs}`,
      getResponseDetailsText(result),
    ].join('\n')).join('\n\n');

    const copied = await copyTextToClipboard(payload);
    if (copied) {
      setStatusMessage(`Se copiaron ${results.length} respuesta(s) al portapapeles.`);
    } else {
      setStatusMessage('No se pudo copiar al portapapeles.');
    }
  }

  async function copyTextToClipboard(value: string): Promise<boolean> {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      return false;
    }

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  function markBasicAuthFieldsAsInvalidForUnauthorized() {
    setActiveSection('composer');
    setInterfaceMode('advanced');
    setAuthorizationScheme('BASIC');
    setShowBasicAuthFieldErrors(true);
  }

  function isUnauthorizedResult(result: { status: number; statusText?: string; errorDetail?: string | null }): boolean {
    if (result.status === 401) {
      return true;
    }

    const statusText = (result.statusText ?? '').toLowerCase();
    const errorDetail = (result.errorDetail ?? '').toLowerCase();
    return statusText.includes('unauthorized') || errorDetail.includes('unauthorized');
  }

  function renderEndpointMatches(
    matches: FavoriteEndpointEntry[],
    queryValue: string,
    targetMethod: HttpMethod,
    shouldShow: boolean,
    applyIndex?: number,
  ) {
    if (!shouldShow) {
      return null;
    }

    if (matches.length === 0) {
      if (targetMethod === 'POST' && queryValue.trim().length >= 3 && contextualFavoriteEndpoints.length > 0) {
        return <p className="muted-small">No hay coincidencias con el texto actual.</p>;
      }

      return null;
    }

    return (
      <div className="endpoint-favorites-panel">
        <div className="endpoint-favorites-block">
          <span className="muted-small">Coincidencias</span>
          <div className={`endpoint-favorites-scroll${matches.length >= 3 ? ' endpoint-favorites-scroll-min' : ''}`}>
            {matches.map((favorite) => (
              <div key={`${targetMethod.toLowerCase()}-favorite-${favorite.id}`} className="favorite-match-card">
                <div className="favorite-match-header">
                  <button
                    type="button"
                    className="favorite-description-button"
                    onClick={() => openFavoriteDescriptionDialog(favorite)}
                    title={favorite.description || 'Anadir descripcion REST'}
                  >
                    {favorite.description || 'Anadir descripcion REST'}
                  </button>
                  <span className={`env-badge env-badge-${favorite.environment.toLowerCase()}`}>{favorite.environment}</span>
                </div>
                <button
                  type="button"
                  className="favorite-match-button favorite-summary-surface"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyFavoriteEndpoint(favorite.url, targetMethod, applyIndex)}
                  title={favorite.url}
                >
                  <span className="favorite-match-url">{favorite.url}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderBaseEndpointMatches() {
    if (!isBaseEndpointFocused || hideBaseEndpointMatchesUntilEdit) {
      return null;
    }

    if (baseEndpointMatches.length === 0) {
      if (normalizedBaseEndpoint.length > 0 && contextualFavoriteBaseEndpoints.length > 0) {
        return <p className="muted-small">No hay coincidencias de endpoint base.</p>;
      }

      return null;
    }

    return (
      <div className="endpoint-favorites-panel">
        <div className="endpoint-favorites-block">
          <span className="muted-small">Coincidencias endpoint base</span>
          <div className={`endpoint-favorites-scroll${baseEndpointMatches.length >= 3 ? ' endpoint-favorites-scroll-min' : ''}`}>
            {baseEndpointMatches.map((entry) => (
              <button
                key={`base-endpoint-match-${entry.id}`}
                type="button"
                className="favorite-match-button favorite-summary-surface"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFavoriteBaseEndpoint(entry.baseUrl)}
                title={entry.baseUrl}
              >
                <span>{entry.name}</span>
                <span className="favorite-match-url">{entry.baseUrl}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderCommandMatches() {
    if (!isCommandEndpointFocused || hideCommandMatchesUntilEdit) {
      return null;
    }

    if (commandMatches.length === 0) {
      if (normalizedCommandEndpoint.length > 0 && contextualFavoriteCommands.length > 0) {
        return <p className="muted-small">No hay coincidencias de comando.</p>;
      }

      return null;
    }

    return (
      <div className="endpoint-favorites-panel">
        <div className="endpoint-favorites-block">
          <span className="muted-small">Coincidencias comando</span>
          <div className={`endpoint-favorites-scroll${commandMatches.length >= 3 ? ' endpoint-favorites-scroll-min' : ''}`}>
            {commandMatches.map((entry) => (
              <button
                key={`command-match-${entry.id}`}
                type="button"
                className="favorite-match-button favorite-summary-surface"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyFavoriteCommand(entry)}
                title={entry.command}
              >
                <span>{entry.name}</span>
                <span className="favorite-match-url">{entry.command}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderFavoriteCommandsSelection() {
    if (contextualFavoriteCommands.length === 0) {
      return <p className="muted-small">No hay comandos favoritos para este metodo y entorno.</p>;
    }

    return (
      <div className="favorite-commands-selector">
        {contextualFavoriteCommands.map((entry) => {
          const orderIndex = selectedFavoriteCommandIdsOrdered.indexOf(entry.id);
          const isSelected = orderIndex >= 0;

          return (
            <label key={`favorite-command-selector-${entry.id}`} className={`favorite-command-selector-item${isSelected ? ' favorite-command-selector-item-selected' : ''}`}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelectedFavoriteCommand(entry.id)}
              />
              <span className="favorite-command-selector-order">{isSelected ? orderIndex + 1 : '-'}</span>
              <span className="favorite-command-selector-text">
                <strong>{entry.name}</strong>
                <small>{entry.command}</small>
                {entry.method === 'POST' && (entry.defaultRawBody ?? '').trim() ? (
                  <small>RAW: {entry.defaultRawBody}</small>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  function toggleFavoriteEndpoint(value: string, endpointMethod: HttpMethod) {
    const normalized = normalizeFavoriteEndpoint(value);
    if (!normalized) {
      setStatusMessage('Escribe un endpoint valido antes de anadirlo a favoritos.');
      return;
    }

    setFavoriteEndpoints((current) => {
      const existing = current.find((entry) => entry.url === normalized && entry.method === endpointMethod && entry.environment === favoriteEnvironment);
      if (existing) {
        setStatusMessage(`Endpoint eliminado de favoritos: ${normalized}`);
        return current.filter((entry) => !(entry.url === normalized && entry.method === endpointMethod && entry.environment === favoriteEnvironment));
      }

      setStatusMessage(`Endpoint guardado en favoritos: ${normalized}`);
      return [{
        id: createHistoryId(),
        name: normalizeFavoriteName(createDefaultFavoriteEndpointName(normalized)),
        description: '',
        url: normalized,
        method: endpointMethod,
        environment: favoriteEnvironment,
        createdAt: new Date().toISOString(),
      }, ...current.filter((entry) => !(entry.url === normalized && entry.method === endpointMethod && entry.environment === favoriteEnvironment))];
    });
  }

  function applyFavoriteEndpoint(value: string, target: 'POST' | 'GET', index?: number) {
    if (target === 'POST') {
      const targetIndex = index ?? focusedPostEndpointIndex ?? selectedPostEndpointIndex;
      setMethod('POST');
      setPostEndpointTuples((current) => current.map((entry, entryIndex) => (entryIndex === targetIndex ? value : entry)));
      setSelectedPostEndpointIndex(targetIndex);
      setFocusedPostEndpointIndex(targetIndex);
      setEndpoint(value);
      setHidePostEndpointMatchesByIndex((current) => ({ ...current, [targetIndex]: true }));
      setActiveSection('composer');
      setStatusMessage('Endpoint favorito cargado en Inicio (POST).');
      return;
    }

    const targetIndex = index ?? focusedGetEndpointIndex ?? selectedGetEndpointIndex;
    setMethod('GET');
    setGetEndpointTuples((current) => current.map((entry, entryIndex) => (entryIndex === targetIndex ? value : entry)));
    setHideGetEndpointMatchesByIndex((current) => ({ ...current, [targetIndex]: true }));
    setActiveSection('composer');
    setStatusMessage('Endpoint favorito cargado en Inicio (GET).');
  }

  function updatePostEndpoint(value: string) {
    setPostEndpointTuples((current) => current.map((item, itemIndex) => (itemIndex === selectedPostEndpointIndex ? value : item)));
    setEndpoint(value);
    setHidePostEndpointMatchesByIndex((current) => ({ ...current, [selectedPostEndpointIndex]: false }));
  }

  function addPostEndpointTuple() {
    const newTupleId = createHistoryId();
    setPostEndpointTuples((current) => [...current, '']);
    setPostEndpointTupleIds((current) => [...current, newTupleId]);
    setEndpointRuntimeParamsByTupleId((prev) => ({
      ...prev,
      [newTupleId]: prev[newTupleId] ?? {},
    }));
    setEndpointRawBodiesByTupleId((prev) => ({
      ...prev,
      [newTupleId]: prev[newTupleId] ?? '',
    }));
    setSelectedPostEndpointIndex(postEndpointTuples.length);
    setFocusedPostEndpointIndex(postEndpointTuples.length);
  }

  function removePostEndpointTuple(index: number) {
    setPostEndpointTuples((current) => {
      if (current.length <= 1) {
        setSelectedPostEndpointIndex(0);
        setFocusedPostEndpointIndex(null);
        setEndpoint('');
        return [''];
      }

      const next = current.filter((_, itemIndex) => itemIndex !== index);
      setSelectedPostEndpointIndex((selected) => Math.min(selected, next.length - 1));
      setFocusedPostEndpointIndex((selected) => {
        if (selected === null) {
          return null;
        }

        if (selected === index) {
          return null;
        }

        return selected > index ? selected - 1 : selected;
      });
      setHidePostEndpointMatchesByIndex((currentHidden) => {
        const remapped: Record<number, boolean> = {};
        Object.entries(currentHidden).forEach(([key, value]) => {
          const parsed = Number(key);
          if (!Number.isInteger(parsed) || parsed === index) {
            return;
          }

          const nextIndex = parsed > index ? parsed - 1 : parsed;
          remapped[nextIndex] = value;
        });
        return remapped;
      });

      return next;
    });
    setPostEndpointTupleIds((current) => {
      if (current.length <= 1) {
        return current;
      }
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      setEndpointRuntimeParamsByTupleId((prev) => {
        const nextParams = { ...prev };
        delete nextParams[current[index]];
        return nextParams;
      });
      setEndpointRawBodiesByTupleId((prev) => {
        const next2 = { ...prev };
        delete next2[current[index]];
        return next2;
      });
      return next;
    });
  }

  function openEndpointParamGroupDialog(index: number) {
    const tupleEndpoint = postEndpointTuples[index] ?? '';
    const tupleId = postEndpointTupleIds[index] ?? '';
    const templateTokens = extractEndpointRuntimeParams(tupleEndpoint)
      .filter((param) => param.kind === 'template')
      .map((param) => param.name);

    if (!tupleEndpoint.trim() || !tupleId) {
      setStatusMessage('No se pudo abrir el grupo de parametros: tupla POST no valida.');
      return;
    }

    if (templateTokens.length === 0) {
      setStatusMessage('Esta tupla no tiene placeholders {{token}} para agrupar parametros.');
      return;
    }

    setEndpointParamGroupDialog({
      tupleIndex: index,
      tupleId,
      endpoint: tupleEndpoint,
      tokens: templateTokens,
      selectedToken: templateTokens[0],
      blockText: '',
    });
  }

  function closeEndpointParamGroupDialog() {
    setEndpointParamGroupDialog(null);
  }

  function applyEndpointParamGroupDialog() {
    if (!endpointParamGroupDialog) {
      return;
    }

    const groupedValues = parseParameterGroupBlock(endpointParamGroupDialog.blockText);
    if (groupedValues.length === 0) {
      setStatusMessage('El bloque no contiene valores validos para generar tuplas.');
      return;
    }

    const sourceIndex = endpointParamGroupDialog.tupleIndex;
    const sourceEndpoint = postEndpointTuples[sourceIndex] ?? '';
    const sourceTupleId = postEndpointTupleIds[sourceIndex] ?? '';

    if (!sourceEndpoint || !sourceTupleId) {
      setStatusMessage('La tupla origen ya no esta disponible.');
      closeEndpointParamGroupDialog();
      return;
    }

    const sourceRaw = resolveRawBodyForPostTuple(sourceTupleId);
    const sourceParams = endpointRuntimeParamsByTupleId[sourceTupleId] ?? pathParamValues[sourceEndpoint] ?? {};
    const sourceTokenValue = (sourceParams[endpointParamGroupDialog.selectedToken] ?? '').trim();
    const shouldDropSourceTuple = sourceTokenValue === '';
    const newTupleIds = groupedValues.map(() => createHistoryId());
    const newEndpoints = groupedValues.map(() => sourceEndpoint);

    setPostEndpointTuples((current) => {
      if (shouldDropSourceTuple) {
        return [...current.filter((_, idx) => idx !== sourceIndex), ...newEndpoints];
      }

      return [...current, ...newEndpoints];
    });

    setPostEndpointTupleIds((current) => {
      if (shouldDropSourceTuple) {
        return [...current.filter((_, idx) => idx !== sourceIndex), ...newTupleIds];
      }

      return [...current, ...newTupleIds];
    });

    setEndpointRawBodiesByTupleId((prev) => {
      const next = { ...prev };

      if (shouldDropSourceTuple) {
        delete next[sourceTupleId];
      }

      newTupleIds.forEach((tupleId) => {
        next[tupleId] = sourceRaw;
      });

      return next;
    });

    setEndpointRuntimeParamsByTupleId((prev) => {
      const next = { ...prev };

      if (shouldDropSourceTuple) {
        delete next[sourceTupleId];
      }

      newTupleIds.forEach((tupleId, valueIndex) => {
        next[tupleId] = {
          ...sourceParams,
          [endpointParamGroupDialog.selectedToken]: groupedValues[valueIndex],
        };
      });

      return next;
    });

    const nextSelectedIndex = shouldDropSourceTuple ? Math.max(0, postEndpointTuples.length - 1) : postEndpointTuples.length;
    setSelectedPostEndpointIndex(nextSelectedIndex);
    setFocusedPostEndpointIndex(nextSelectedIndex);

    setStatusMessage(`Se generaron ${groupedValues.length} tuplas para {{${endpointParamGroupDialog.selectedToken}}}.${shouldDropSourceTuple ? ' Se elimino la tupla origen incompleta.' : ''}`);
    closeEndpointParamGroupDialog();
  }

  function renameFavoriteBaseEndpoint(id: string, name: string) {
    setFavoriteBaseEndpoints((current) => current.map((entry) => (
      entry.id === id ? { ...entry, name: name.slice(0, MAX_FAVORITE_NAME_LENGTH) } : entry
    )));
  }

  function commitFavoriteBaseEndpointName(id: string) {
    setFavoriteBaseEndpoints((current) => current.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }

      const normalizedName = normalizeFavoriteNameOnSave(entry.name);
      if (!normalizedName.trim()) {
        setStatusMessage('El endpoint base favorito necesita un nombre visible.');
        return entry;
      }

      return { ...entry, name: normalizedName };
    }));
  }

  function renameFavoriteCommand(id: string, name: string) {
    setFavoriteCommands((current) => current.map((entry) => (
      entry.id === id ? { ...entry, name: name.slice(0, MAX_FAVORITE_NAME_LENGTH) } : entry
    )));
  }

  function commitFavoriteCommandName(id: string) {
    setFavoriteCommands((current) => current.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }

      const normalizedName = normalizeFavoriteNameOnSave(entry.name);
      if (!normalizedName.trim()) {
        setStatusMessage('El comando favorito necesita un nombre visible.');
        return entry;
      }

      return { ...entry, name: normalizedName };
    }));
  }

  function renameFavoriteEndpoint(id: string, name: string) {
    setFavoriteEndpoints((current) => current.map((entry) => (
      entry.id === id ? { ...entry, name: name.slice(0, MAX_FAVORITE_NAME_LENGTH) } : entry
    )));
  }

  function commitFavoriteEndpointName(id: string) {
    setFavoriteEndpoints((current) => current.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }

      const normalizedName = normalizeFavoriteNameOnSave(entry.name);
      if (!normalizedName.trim()) {
        setStatusMessage('El favorito necesita un nombre visible.');
        return entry;
      }

      return { ...entry, name: normalizedName };
    }));
  }

  function updateFavoriteEndpointDescription(id: string, description: string) {
    setFavoriteEndpoints((current) => current.map((entry) => (entry.id === id ? { ...entry, description } : entry)));
  }

  function clampFavoriteEndpointDescription(id: string) {
    setFavoriteEndpoints((current) => {
      let truncated = false;
      const next = current.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }

        if (entry.description.length <= MAX_REST_DESCRIPTION_LENGTH) {
          return entry;
        }

        truncated = true;
        return { ...entry, description: normalizeRestDescription(entry.description) };
      });

      if (truncated) {
        setStatusMessage(`La descripcion se recorto a ${MAX_REST_DESCRIPTION_LENGTH} caracteres.`);
      }

      return next;
    });
  }

  function openFavoriteDescriptionDialog(favorite: FavoriteEndpointEntry) {
    setDescriptionDialog({
      favoriteId: favorite.id,
      currentValue: favorite.description,
      title: 'Anadir descripcion REST',
    });
    setDescriptionDraft(favorite.description);
  }

  function closeFavoriteDescriptionDialog() {
    setDescriptionDialog(null);
    setDescriptionDraft('');
  }

  function saveFavoriteDescriptionDialog() {
    if (!descriptionDialog) {
      return;
    }

    const trimmedDraft = descriptionDraft.trim();
    const normalizedDescription = normalizeRestDescription(trimmedDraft);
    updateFavoriteEndpointDescription(descriptionDialog.favoriteId, normalizedDescription);
    if (trimmedDraft.length > MAX_REST_DESCRIPTION_LENGTH) {
      setStatusMessage(`La descripcion se recorto a ${MAX_REST_DESCRIPTION_LENGTH} caracteres.`);
    } else {
      setStatusMessage('Descripcion del favorito actualizada.');
    }
    closeFavoriteDescriptionDialog();
  }

  function setFavoriteEndpointEnvironment(id: string, environment: FavoriteEnvironment) {
    setFavoriteEndpoints((current) => current.map((entry) => (entry.id === id ? { ...entry, environment } : entry)));
  }

  function buildFavoriteRequestEntryFromPreview(preview: RequestPreview, source: FavoriteRequestEntry['source']): FavoriteRequestEntry {
    return {
      id: createHistoryId(),
      name: normalizeFavoriteName(createFavoriteRequestName(preview.method, preview.url)),
      description: '',
      createdAt: new Date().toISOString(),
      source,
      environment: favoriteEnvironment,
      method: preview.method,
      url: preview.url,
      headers: preview.headers,
      query: preview.query,
      bodyMode: preview.bodyMode,
      body: preview.body,
      timeoutMs,
      allowInsecureTls,
    };
  }

  function appendFavoriteRequest(entry: FavoriteRequestEntry) {
    setFavoriteRequests((current) => [entry, ...current.filter((item) => item.url !== entry.url || item.method !== entry.method || item.name !== entry.name)]);
  }

  function saveCurrentRequestAsFavorite() {
    try {
      const preview = method === 'GET'
        ? createRequestPreview({ rowNumber: 1, cells: [selectedGetEndpoint], fields: { endpoint: selectedGetEndpoint, col1: selectedGetEndpoint } }, selectedGetEndpoint)
        : previewRow
          ? createRequestPreview(previewRow)
          : null;

      if (!preview) {
        throw new Error('No hay una solicitud concreta lista para guardar como favorita.');
      }

      const favorite = buildFavoriteRequestEntryFromPreview(preview, 'composer');
      appendFavoriteRequest(favorite);
      setStatusMessage(`Peticion favorita guardada: ${favorite.name}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo guardar la peticion favorita.');
    }
  }

  function saveHistoryEntryAsFavorite(entry: RequestHistoryEntry) {
    const favorite: FavoriteRequestEntry = {
      id: createHistoryId(),
      name: normalizeFavoriteName(entry.name),
      description: '',
      createdAt: new Date().toISOString(),
      source: 'history',
      environment: favoriteEnvironment,
      method: entry.method,
      url: entry.url,
      headers: entry.headers,
      query: entry.query,
      bodyMode: entry.bodyMode,
      body: entry.body,
      timeoutMs,
      allowInsecureTls,
    };

    appendFavoriteRequest(favorite);
    setStatusMessage(`Peticion del historial guardada en favoritos: ${entry.name}`);
  }

  function removeFavoriteRequest(id: string) {
    setFavoriteRequests((current) => current.filter((entry) => entry.id !== id));
  }

  function renameFavoriteRequest(id: string, name: string) {
    setFavoriteRequests((current) => current.map((entry) => (
      entry.id === id ? { ...entry, name: name.slice(0, MAX_FAVORITE_NAME_LENGTH) } : entry
    )));
  }

  function commitFavoriteRequestName(id: string) {
    setFavoriteRequests((current) => current.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }

      const normalizedName = normalizeFavoriteNameOnSave(entry.name);
      if (!normalizedName.trim()) {
        setStatusMessage('La peticion favorita necesita un nombre visible.');
        return entry;
      }

      return { ...entry, name: normalizedName };
    }));
  }

  function updateFavoriteRequestDescription(id: string, description: string) {
    setFavoriteRequests((current) => current.map((entry) => (entry.id === id ? { ...entry, description } : entry)));
  }

  function clampFavoriteRequestDescription(id: string) {
    setFavoriteRequests((current) => {
      let truncated = false;
      const next = current.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }

        if (entry.description.length <= MAX_REST_DESCRIPTION_LENGTH) {
          return entry;
        }

        truncated = true;
        return { ...entry, description: normalizeRestDescription(entry.description) };
      });

      if (truncated) {
        setStatusMessage(`La descripcion se recorto a ${MAX_REST_DESCRIPTION_LENGTH} caracteres.`);
      }

      return next;
    });
  }

  function renderDescriptionCounter(value: string) {
    const currentLength = value.length;
    const overflow = currentLength > MAX_REST_DESCRIPTION_LENGTH ? value.slice(MAX_REST_DESCRIPTION_LENGTH) : '';
    const visibleOverflow = overflow.length > 28 ? `${overflow.slice(0, 28)}...` : overflow;

    return (
      <p className={`description-counter${overflow ? ' description-counter-warning' : ''}`}>
        <span>{Math.min(currentLength, MAX_REST_DESCRIPTION_LENGTH)}/{MAX_REST_DESCRIPTION_LENGTH}</span>
        {overflow ? (
          <span className="description-counter-overflow" title={overflow} aria-label="Caracteres excedidos">
            {visibleOverflow}
          </span>
        ) : null}
      </p>
    );
  }

  function setFavoriteRequestEnvironment(id: string, environment: FavoriteEnvironment) {
    setFavoriteRequests((current) => current.map((entry) => (entry.id === id ? { ...entry, environment } : entry)));
  }

  async function exportFavoriteRequests() {
    if (favoriteRequests.length === 0) {
      setStatusMessage('No hay peticiones favoritas para exportar.');
      return;
    }

    const payload: FavoriteRequestsExportFile = {
      schema: 'postais.favoriteRequests.v1',
      exportedAt: new Date().toISOString(),
      items: sortFavoriteRequestEntries(favoriteRequests),
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `postais-favorite-requests-${stamp}.json`;
    const serialized = JSON.stringify(payload, null, 2);

    try {
      if (window.postais?.saveTextFile) {
        const saved = await window.postais.saveTextFile({
          suggestedName: filename,
          title: 'Exportar peticiones favoritas JSON',
          content: serialized,
        });

        if (saved.ok) {
          setStatusMessage(`${favoriteRequests.length} peticion(es) favorita(s) exportadas.`);
          return;
        }

        if (saved.canceled) {
          setStatusMessage('Exportacion cancelada por el usuario.');
          return;
        }

        throw new Error(saved.error || 'No se pudo guardar el archivo JSON.');
      }

      triggerJsonDownload(serialized, filename);
      setStatusMessage(`${favoriteRequests.length} peticion(es) favorita(s) exportadas.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudieron exportar las peticiones favoritas.');
    }
  }

  async function importFavoriteRequests(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as FavoriteRequestsExportFile;
      if (parsed.schema !== 'postais.favoriteRequests.v1' || !Array.isArray(parsed.items)) {
        throw new Error('El archivo no corresponde al formato de favoritos de peticiones de PostAIS.');
      }

      let trimmedDescriptionCount = 0;

      const imported = parsed.items
        .filter((item): item is FavoriteRequestEntry => !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string' && isHttpMethod(item.method) && typeof item.url === 'string' && isBodyMode(item.bodyMode))
        .map((item) => {
          const sourceDescription = typeof item.description === 'string' ? item.description : '';
          const normalizedDescription = normalizeRestDescription(sourceDescription);
          if (sourceDescription.length > MAX_REST_DESCRIPTION_LENGTH) {
            trimmedDescriptionCount += 1;
          }

          return {
            ...item,
            id: createHistoryId(),
            createdAt: new Date().toISOString(),
            description: normalizedDescription,
            environment: isFavoriteEnvironment(item.environment) ? item.environment : 'DEV',
          };
        });

      if (imported.length === 0) {
        throw new Error('No se detectaron peticiones favoritas validas en el archivo.');
      }

      setFavoriteRequests((current) => [...imported, ...current]);
      if (trimmedDescriptionCount > 0) {
        setStatusMessage(`${imported.length} peticion(es) favorita(s) importadas. ${trimmedDescriptionCount} descripcion(es) se recortaron a ${MAX_REST_DESCRIPTION_LENGTH} caracteres.`);
      } else {
        setStatusMessage(`${imported.length} peticion(es) favorita(s) importadas.`);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudieron importar los favoritos de peticiones.');
    } finally {
      event.target.value = '';
    }
  }

  async function exportFavoriteBaseEndpoints() {
    if (favoriteBaseEndpoints.length === 0) {
      setStatusMessage('No hay endpoints base favoritos para exportar.');
      return;
    }

    const payload: FavoriteBaseEndpointsExportFile = {
      schema: 'postais.favoriteBaseEndpoints.v1',
      exportedAt: new Date().toISOString(),
      items: favoriteBaseEndpoints,
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `postais-favorite-base-endpoints-${stamp}.json`;
    const serialized = JSON.stringify(payload, null, 2);

    try {
      if (window.postais?.saveTextFile) {
        const saved = await window.postais.saveTextFile({
          suggestedName: filename,
          title: 'Exportar endpoints base favoritos JSON',
          content: serialized,
        });

        if (saved.ok) {
          setStatusMessage(`${favoriteBaseEndpoints.length} endpoint(s) base favorito(s) exportados.`);
          return;
        }

        if (saved.canceled) {
          setStatusMessage('Exportacion cancelada por el usuario.');
          return;
        }

        throw new Error(saved.error || 'No se pudo guardar el archivo JSON.');
      }

      triggerJsonDownload(serialized, filename);
      setStatusMessage(`${favoriteBaseEndpoints.length} endpoint(s) base favorito(s) exportados.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudieron exportar los endpoints base favoritos.');
    }
  }

  async function importFavoriteBaseEndpoints(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as FavoriteBaseEndpointsExportFile;
      if (parsed.schema !== 'postais.favoriteBaseEndpoints.v1' || !Array.isArray(parsed.items)) {
        throw new Error('El archivo no corresponde al formato de endpoints base favoritos de PostAIS.');
      }

      const imported = parsed.items
        .filter((item): item is FavoriteBaseEndpointEntry => !!item && typeof item === 'object' && typeof item.baseUrl === 'string' && isHttpMethod(item.method) && isFavoriteEnvironment(item.environment))
        .map((item) => ({
          ...item,
          id: createHistoryId(),
          createdAt: new Date().toISOString(),
          name: normalizeFavoriteName(item.name || createDefaultFavoriteBaseEndpointName(item.baseUrl)),
          description: normalizeRestDescription(typeof item.description === 'string' ? item.description : ''),
          baseUrl: normalizeFavoriteBaseEndpoint(item.baseUrl),
        }))
        .filter((item) => item.baseUrl !== '');

      if (imported.length === 0) {
        throw new Error('No se detectaron endpoints base favoritos validos en el archivo.');
      }

      const buildKey = (entry: FavoriteBaseEndpointEntry) => [
        entry.environment,
        normalizeFavoriteBaseEndpoint(entry.baseUrl),
        normalizeRestDescription(entry.description ?? ''),
      ].join('|');

      const existingKeys = new Set(favoriteBaseEndpoints.map(buildKey));
      const uniqueImported: FavoriteBaseEndpointEntry[] = [];
      let skippedDuplicates = 0;

      imported.forEach((entry) => {
        const key = buildKey(entry);
        if (existingKeys.has(key)) {
          skippedDuplicates += 1;
          return;
        }

        existingKeys.add(key);
        uniqueImported.push(entry);
      });

      if (uniqueImported.length === 0) {
        throw new Error('No se importaron endpoints base: todos ya existian como favoritos duplicados.');
      }

      setFavoriteBaseEndpoints((current) => [...uniqueImported, ...current]);
      setStatusMessage(`${uniqueImported.length} endpoint(s) base favorito(s) importados. ${skippedDuplicates} duplicado(s) omitido(s).`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudieron importar los endpoints base favoritos.');
    } finally {
      event.target.value = '';
    }
  }

  async function exportFavoriteCommands() {
    if (favoriteCommands.length === 0) {
      setStatusMessage('No hay comandos favoritos para exportar.');
      return;
    }

    const payload: FavoriteCommandsExportFile = {
      schema: 'postais.favoriteCommands.v1',
      exportedAt: new Date().toISOString(),
      items: favoriteCommands,
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `postais-favorite-commands-${stamp}.json`;
    const serialized = JSON.stringify(payload, null, 2);

    try {
      if (window.postais?.saveTextFile) {
        const saved = await window.postais.saveTextFile({
          suggestedName: filename,
          title: 'Exportar comandos favoritos JSON',
          content: serialized,
        });

        if (saved.ok) {
          setStatusMessage(`${favoriteCommands.length} comando(s) favorito(s) exportados.`);
          return;
        }

        if (saved.canceled) {
          setStatusMessage('Exportacion cancelada por el usuario.');
          return;
        }

        throw new Error(saved.error || 'No se pudo guardar el archivo JSON.');
      }

      triggerJsonDownload(serialized, filename);
      setStatusMessage(`${favoriteCommands.length} comando(s) favorito(s) exportados.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudieron exportar los comandos favoritos.');
    }
  }

  async function importFavoriteCommands(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as FavoriteCommandsExportFile;
      if (parsed.schema !== 'postais.favoriteCommands.v1' || !Array.isArray(parsed.items)) {
        throw new Error('El archivo no corresponde al formato de comandos favoritos de PostAIS.');
      }

      const imported = parsed.items
        .filter((item): item is FavoriteCommandEntry => !!item && typeof item === 'object' && typeof item.command === 'string' && isHttpMethod(item.method) && isFavoriteEnvironment(item.environment))
        .map((item) => ({
          ...item,
          id: createHistoryId(),
          createdAt: new Date().toISOString(),
          name: normalizeFavoriteName(item.name || createDefaultFavoriteCommandName(item.command)),
          description: normalizeRestDescription(typeof item.description === 'string' ? item.description : ''),
          command: normalizeFavoriteCommand(item.command),
          defaultRawBody: typeof item.defaultRawBody === 'string' ? item.defaultRawBody : '',
          postResponseScript: typeof item.postResponseScript === 'string' ? item.postResponseScript : '',
        }))
        .filter((item) => item.command !== '');

      if (imported.length === 0) {
        throw new Error('No se detectaron comandos favoritos validos en el archivo.');
      }

      const buildKey = (entry: FavoriteCommandEntry) => [
        entry.method,
        entry.environment,
        normalizeFavoriteCommand(entry.command),
        entry.defaultRawBody ?? '',
        normalizeRestDescription(entry.description ?? ''),
        entry.postResponseScript ?? '',
      ].join('|');

      const existingKeys = new Set(favoriteCommands.map(buildKey));
      const uniqueImported: FavoriteCommandEntry[] = [];
      let skippedDuplicates = 0;

      imported.forEach((entry) => {
        const key = buildKey(entry);
        if (existingKeys.has(key)) {
          skippedDuplicates += 1;
          return;
        }

        existingKeys.add(key);
        uniqueImported.push(entry);
      });

      if (uniqueImported.length === 0) {
        throw new Error('No se importaron comandos: todos ya existian como favoritos duplicados.');
      }

      setFavoriteCommands((current) => [...uniqueImported, ...current]);
      setStatusMessage(`${uniqueImported.length} comando(s) favorito(s) importados. ${skippedDuplicates} duplicado(s) omitido(s).`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudieron importar los comandos favoritos.');
    } finally {
      event.target.value = '';
    }
  }

  function applyFavoriteRequest(entry: FavoriteRequestEntry) {
    setAuthorizationScheme('NONE');
    setHeadersText(formatJson(entry.headers));
    setQueryText(formatJson(entry.query));
    setTimeoutMs(entry.timeoutMs);
    setAllowInsecureTls(entry.allowInsecureTls);
    setShowImportPanel(true);
    setShowPreviewPanel(true);
    setResults([]);
    setDispatchErrors([]);

    if (entry.method === 'GET') {
      setMethod('GET');
      setGetEndpointTuples([entry.url]);
      setSelectedGetEndpointIndex(0);
    } else {
      const newTupleId = createHistoryId();
      setMethod('POST');
      setBodyMode(entry.bodyMode);
      setPostEndpointTuples([toBaseUrl(entry.url)]);
      setPostEndpointTupleIds([newTupleId]);
      setEndpointRuntimeParamsByTupleId({
        [newTupleId]: {},
      });
      setSelectedPostEndpointIndex(0);
      setFocusedPostEndpointIndex(0);
      setEndpoint(toBaseUrl(entry.url));
      const restoredRow = {
        rowNumber: 1,
        cells: [typeof entry.body === 'string' ? entry.body : formatJson(entry.body ?? {})],
        fields: { col1: typeof entry.body === 'string' ? entry.body : formatJson(entry.body ?? {}) },
      } satisfies ImportedRow;
      setRows([restoredRow]);
      setSelectedRowIndex(0);
      setRawDelimiter('');
      setBodyTemplateText(entry.bodyMode === 'JSON' ? formatJson(entry.body ?? {}) : String(entry.body ?? ''));
      setEndpointRawBodiesByTupleId((prev) => ({
        ...prev,
        [newTupleId]: entry.bodyMode === 'RAW' ? String(entry.body ?? '') : '',
      }));
    }

    setActiveSection('composer');
    setStatusMessage(`Peticion favorita cargada: ${entry.name}`);
  }

  function openConfirmDialog(dialog: ConfirmDialogState, action: () => void) {
    if (dialog.sessionKey && skipConfirmSessionKeys.includes(dialog.sessionKey)) {
      action();
      return;
    }

    setSkipCurrentDialogForSession(dialog.sessionKey ? skipConfirmSessionKeys.includes(dialog.sessionKey) : false);
    pendingConfirmActionRef.current = action;
    setConfirmDialog(dialog);
  }

  function closeConfirmDialog() {
    pendingConfirmActionRef.current = null;
    setConfirmDialog(null);
    setSkipCurrentDialogForSession(false);
  }

  function confirmDialogAction() {
    if (confirmDialog?.sessionKey && skipCurrentDialogForSession && !skipConfirmSessionKeys.includes(confirmDialog.sessionKey)) {
      setSkipConfirmSessionKeys((current) => [...current, confirmDialog.sessionKey as string]);
    }

    const action = pendingConfirmActionRef.current;
    closeConfirmDialog();
    action?.();
  }

  function appendHistoryEntry(entry: RequestHistoryEntry) {
    setRequestHistory((current) => [entry, ...current].slice(0, MAX_REQUEST_HISTORY_ENTRIES));
  }

  function registerHistoryEntry(row: ImportedRow | undefined, requestPreview: RequestPreview, response: DispatchResult | Omit<DispatchResult, 'rowNumber' | 'row' | 'requestPreview'>) {
    appendHistoryEntry({
      id: createHistoryId(),
      name: deriveRequestName(requestPreview.method, requestPreview.url),
      origin: 'runtime',
      sentAt: new Date().toISOString(),
      method: requestPreview.method,
      url: requestPreview.url,
      headers: requestPreview.headers,
      query: requestPreview.query,
      bodyMode: requestPreview.bodyMode,
      body: requestPreview.body,
      row,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: response.durationMs,
      finalUrl: response.finalUrl,
      errorDetail: response.errorDetail,
    });
  }

  function applyHistoryEntry(entry: RequestHistoryEntry) {
    setAuthorizationScheme('NONE');
    setHeadersText(formatJson(entry.headers));
    setQueryText(formatJson(entry.query));
    setDispatchErrors([]);
    setResults([]);
    setShowImportPanel(true);
    setShowPreviewPanel(true);

    if (entry.method === 'GET') {
      setMethod('GET');
      setGetEndpointTuples([entry.url]);
      setSelectedGetEndpointIndex(0);
      setStatusMessage(`Solicitud GET cargada desde historial: ${entry.name}.`);
      setActiveSection('composer');
      return;
    }

    const restoredRow = entry.row ?? {
      rowNumber: 1,
      cells: [typeof entry.body === 'string' ? entry.body : formatJson(entry.body ?? {})],
      fields: {
        col1: typeof entry.body === 'string' ? entry.body : formatJson(entry.body ?? {}),
      },
    };

    const newTupleId = createHistoryId();
    setMethod('POST');
    setBodyMode(entry.bodyMode);
    setPostEndpointTuples([toBaseUrl(entry.url)]);
    setPostEndpointTupleIds([newTupleId]);
    setEndpointRuntimeParamsByTupleId({
      [newTupleId]: {},
    });
    setSelectedPostEndpointIndex(0);
    setFocusedPostEndpointIndex(0);
    setEndpoint(toBaseUrl(entry.url));
    setRows([restoredRow]);
    setSelectedRowIndex(0);
    setFileName(`historial-${entry.id}.json`);
    setRawDelimiter('');

    if (entry.bodyMode === 'JSON') {
      setBodyTemplateText(formatJson(entry.body ?? {}));
    } else {
      const rawBody = typeof entry.body === 'string' ? entry.body : formatJson(entry.body ?? {});
      setBodyTemplateText(rawBody);
      setEndpointRawBodiesByTupleId((prev) => ({
        ...prev,
        [newTupleId]: rawBody,
      }));
    }

    setStatusMessage(`Solicitud POST cargada desde historial: ${entry.name}.`);
    setActiveSection('composer');
  }

  function removeHistoryEntry(id: string) {
    setRequestHistory((current) => current.filter((entry) => entry.id !== id));
  }

  function clearHistory() {
    setRequestHistory([]);
    setStatusMessage('Historial de solicitudes vaciado.');
  }

  function exportHistory() {
    if (requestHistory.length === 0) {
      setStatusMessage('No hay solicitudes en el historial para exportar.');
      return;
    }

    const collection = toPostmanCollection(sortHistoryEntries(requestHistory));
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    link.href = url;
    link.download = `postais-history-${stamp}.postman_collection.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage(`${requestHistory.length} solicitud(es) exportadas a JSON.`);
  }

  async function importHistoryCollection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as PostmanCollectionDefinition;
      const importedEntries = fromPostmanCollection(parsed);

      if (importedEntries.length === 0) {
        throw new Error('El JSON no contiene solicitudes GET/POST importables.');
      }

      setRequestHistory((current) => [...importedEntries, ...current].slice(0, MAX_REQUEST_HISTORY_ENTRIES));
      setActiveSection('history');
      setStatusMessage(`${importedEntries.length} solicitud(es) importadas desde ${file.name}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo importar el JSON de solicitudes.');
    } finally {
      event.target.value = '';
    }
  }

  function buildAuthorizationHeaderValue(mode: TemplateMode): string | null {
    if (authorizationScheme !== 'BASIC') {
      return null;
    }

    const usernameKey = basicAuthUsernameSecretKey.trim();
    const passwordKey = basicAuthPasswordSecretKey.trim();

    if (!usernameKey || !passwordKey) {
      return null;
    }

    if (mode === 'mask-secrets') {
      return `Basic [secret:${usernameKey}]:[secret:${passwordKey}]`;
    }

    return `{{basic-auth:${usernameKey}:${passwordKey}}}`;
  }

  function applyAuthorizationToHeaders(headers: Record<string, string>, mode: TemplateMode): Record<string, string> {
    const authorizationHeader = buildAuthorizationHeaderValue(mode);

    if (!authorizationHeader) {
      return headers;
    }

    return {
      ...headers,
      Authorization: authorizationHeader,
    };
  }

  function scrollToResultsPanel() {
    resultsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resolveEndpointWithPathParams(rawEndpoint: string, tupleId?: string): string {
    const normalizedTupleId = (tupleId ?? '').trim();
    const tupleScopedParams = normalizedTupleId ? endpointRuntimeParamsByTupleId[normalizedTupleId] : undefined;
    const params = tupleScopedParams ?? pathParamValues[rawEndpoint] ?? {};
    const withPathParams = applyPathParams(rawEndpoint, params);
    return applyEndpointTemplateParams(withPathParams, params);
  }

  function createRequestPreview(row: ImportedRow, endpointOverride?: string, tupleId?: string): RequestPreview {
    const parsedHeaders = method === 'GET' ? {} : parseJsonInput(headersText, 'Las cabeceras');
    const parsedQuery = method === 'GET' ? {} : parseJsonInput(queryText, 'Los query params');
    const parsedBody = method === 'POST' && bodyMode === 'JSON' ? parseJsonInput(bodyTemplateText, 'El body') : undefined;
    const endpointSource = resolveEndpointWithPathParams(endpointOverride ?? (composedEndpoint || endpoint), tupleId);
    const finalUrl = new URL(applyStringTemplate(endpointSource, row.fields, 'mask-secrets'));
    const query = normalizeStringMap(applyValueTemplate(parsedQuery, row.fields, 'mask-secrets'), 'Los query params');

    Object.entries(query).forEach(([key, value]) => {
      finalUrl.searchParams.set(key, value);
    });

    const headers = applyAuthorizationToHeaders(
      normalizeStringMap(applyValueTemplate(parsedHeaders, row.fields, 'mask-secrets'), 'Las cabeceras'),
      'mask-secrets',
    );
    const resolvedRaw = tupleId !== undefined
      ? resolveRawBodyForPostTuple(tupleId)
      : resolveRawBodyForEndpoint(endpointOverride ?? (composedEndpoint || endpoint));
    const resolvedRawBody = tupleId !== undefined
      ? applyStringTemplate(resolvedRaw, row.fields, 'mask-secrets')
      : (resolvedRaw.trim()
        ? applyStringTemplate(resolvedRaw, row.fields, 'mask-secrets')
        : buildRawBody(row.cells, rawDelimiter));

    return {
      method,
      url: finalUrl.toString(),
      headers,
      query,
      bodyMode,
      body:
        method !== 'POST'
          ? undefined
          : bodyMode === 'RAW'
            ? resolvedRawBody
            : parsedBody === undefined
              ? undefined
              : applyValueTemplate(parsedBody, row.fields, 'mask-secrets'),
    };
  }

  function buildPayload(row: ImportedRow, endpointOverride?: string, tupleId?: string): PostRequestPayload {
    const parsedHeaders = method === 'GET' ? {} : parseJsonInput(headersText, 'Las cabeceras');
    const parsedQuery = method === 'GET' ? {} : parseJsonInput(queryText, 'Los query params');
    const parsedBody = method === 'POST' && bodyMode === 'JSON' ? parseJsonInput(bodyTemplateText, 'El body') : undefined;
    const endpointSource = resolveEndpointWithPathParams(endpointOverride ?? (composedEndpoint || endpoint), tupleId);
    const finalUrl = new URL(applyStringTemplate(endpointSource, row.fields, 'keep-secret-placeholders'));

    const headers = applyAuthorizationToHeaders(
      normalizeStringMap(applyValueTemplate(parsedHeaders, row.fields, 'keep-secret-placeholders'), 'Las cabeceras'),
      'keep-secret-placeholders',
    );
    const resolvedRaw = tupleId !== undefined
      ? resolveRawBodyForPostTuple(tupleId)
      : resolveRawBodyForEndpoint(endpointOverride ?? (composedEndpoint || endpoint));
    const resolvedRawBody = tupleId !== undefined
      ? applyStringTemplate(resolvedRaw, row.fields, 'keep-secret-placeholders')
      : (resolvedRaw.trim()
        ? applyStringTemplate(resolvedRaw, row.fields, 'keep-secret-placeholders')
        : buildRawBody(row.cells, rawDelimiter));

    return {
      method,
      url: finalUrl.toString(),
      headers,
      query: normalizeStringMap(applyValueTemplate(parsedQuery, row.fields, 'keep-secret-placeholders'), 'Los query params'),
      bodyMode,
      body:
        method !== 'POST'
          ? undefined
          : bodyMode === 'RAW'
            ? resolvedRawBody
            : parsedBody === undefined
              ? undefined
              : applyValueTemplate(parsedBody, row.fields, 'keep-secret-placeholders'),
      timeoutMs,
      allowInsecureTls,
    };
  }

  const previewState = useMemo(() => {
    if (!previewRow) {
      return { payload: null, error: null };
    }

    try {
      return { payload: createRequestPreview(previewRow), error: null };
    } catch (error) {
      return {
        payload: null,
        error: error instanceof Error ? error.message : 'No se pudo generar la vista previa.',
      };
    }
  }, [bodyMode, bodyTemplateText, composedEndpoint, endpoint, headersText, method, previewRow, queryText, rawBodyText, rawDelimiter]);

  const groupedGetResults = useMemo(() => {
    if (method !== 'GET') {
      return [] as Array<{ endpoint: string; items: DispatchResult[] }>;
    }

    const groups = new Map<string, DispatchResult[]>();
    results.forEach((result) => {
      const key = result.requestPreview.url;
      const current = groups.get(key) ?? [];
      current.push(result);
      groups.set(key, current);
    });

    return [...groups.entries()].map(([endpointValue, items]) => ({
      endpoint: endpointValue,
      items,
    }));
  }, [method, results]);

  function renderResultVisualSummary(result: DispatchResult) {
    const bodyPairs = extractVisualPairs(result.responseBody);
    const headerPairs = Object.entries(result.responseHeaders)
      .slice(0, 6)
      .map(([key, value]) => ({ key, value: String(value) }));

    return (
      <div className="result-visual">
        <div className="result-kpis">
          <div className="result-kpi">
            <span>Estado</span>
            <strong>{result.ok ? 'OK' : 'ERROR'}</strong>
          </div>
          <div className="result-kpi">
            <span>HTTP</span>
            <strong>
              {result.status} {result.statusText}
            </strong>
          </div>
          <div className="result-kpi">
            <span>Tiempo</span>
            <strong>{result.durationMs} ms</strong>
          </div>
          <div className="result-kpi result-kpi-wide">
            <span>Endpoint final</span>
            <strong>{result.finalUrl}</strong>
          </div>
        </div>

        {result.errorDetail ? <p className="result-error-hint">Detalle: {result.errorDetail}</p> : null}

        <div className="result-visual-grid">
          <div className="result-visual-card">
            <h3>Campos clave del body</h3>
            {bodyPairs.length > 0 ? (
              <div className="result-mini-table">
                {bodyPairs.map((pair) => (
                  <div key={`body-pair-${pair.key}`} className="result-mini-row">
                    <span>{pair.key}</span>
                    <strong>{pair.value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Body no estructurado o vacio.</p>
            )}
          </div>

          <div className="result-visual-card">
            <h3>Headers de respuesta</h3>
            {headerPairs.length > 0 ? (
              <div className="result-mini-table">
                {headerPairs.map((pair) => (
                  <div key={`header-pair-${pair.key}`} className="result-mini-row">
                    <span>{pair.key}</span>
                    <strong>{pair.value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Sin headers disponibles.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderPostResponseOutput(output: unknown, scriptStorageKey?: string) {
    if (isRecord(output) && Array.isArray(output.rows)) {
      const rows = output.rows as Array<Record<string, unknown>>;
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      const baseColumnNames = isRecord(output.columnNames)
        ? Object.fromEntries(Object.entries(output.columnNames).map(([key, value]) => [key, String(value ?? '')])) as Record<string, string>
        : {};
      const outputColumnOrder = Array.isArray(output.columnOrder) ? output.columnOrder.filter((col) => typeof col === 'string') : [];
      const draftColumnNames = scriptStorageKey ? (postResponseColumnNameDrafts[scriptStorageKey] ?? {}) : {};
      const resolvedColumnNames = { ...baseColumnNames, ...draftColumnNames };

      const getColumnTooltip = (column: string): string => {
        const customName = resolvedColumnNames[column] ?? column;
        if (customName.trim() !== '' && customName !== column) {
          return `Nombre original: ${column}`;
        }

        return 'Click para renombrar encabezado';
      };

      const updateColumnName = (column: string, nextValue: string) => {
        if (!scriptStorageKey) {
          return;
        }

        setPostResponseColumnNameDrafts((current) => ({
          ...current,
          [scriptStorageKey]: {
            ...(current[scriptStorageKey] ?? resolvedColumnNames),
            [column]: nextValue,
          },
        }));
      };

      const saveColumnNames = () => {
        if (!scriptStorageKey) {
          return;
        }

        const draft = postResponseColumnNameDrafts[scriptStorageKey] ?? resolvedColumnNames;
        const normalized = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, String(value ?? '')])) as Record<string, string>;

        setFavoriteCommands((current) => current.map((entry) => {
          if (entry.id !== scriptStorageKey || !entry.postResponseScript) {
            return entry;
          }

          const serialized = JSON.stringify(normalized);
          let updatedScript = entry.postResponseScript;

          if (/columnNames:\s*\{[\s\S]*?\},/.test(updatedScript)) {
            updatedScript = updatedScript.replace(/columnNames:\s*\{[\s\S]*?\},/, `columnNames: ${serialized},`);
          } else if (updatedScript.includes('title: "custom-table-view",')) {
            updatedScript = updatedScript.replace('title: "custom-table-view",', `title: "custom-table-view",\n  columnNames: ${serialized},`);
          }

          return { ...entry, postResponseScript: updatedScript };
        }));

        setStatusMessage('Nombres de columna guardados en el script.');
      };

      const saveColumnOrder = (newOrder: string[]) => {
        if (!scriptStorageKey) {
          return;
        }

        setPostResponseColumnOrders((current) => ({
          ...current,
          [scriptStorageKey]: newOrder,
        }));

        setFavoriteCommands((current) => current.map((entry) => {
          if (entry.id !== scriptStorageKey || !entry.postResponseScript) {
            return entry;
          }

          const serialized = JSON.stringify(newOrder);
          let updatedScript = entry.postResponseScript;

          if (/columnOrder:\s*\[([\s\S]*?)\]/.test(updatedScript)) {
            updatedScript = updatedScript.replace(/columnOrder:\s*\[([\s\S]*?)\]/, `columnOrder: ${serialized}`);
          } else if (updatedScript.includes('columnNames:')) {
            updatedScript = updatedScript.replace(/columnNames:\s*(\{[\s\S]*?\}),/, `columnNames: $1,\n  columnOrder: ${serialized},`);
          } else if (updatedScript.includes('title: "custom-table-view",')) {
            updatedScript = updatedScript.replace('title: "custom-table-view",', `title: "custom-table-view",\n  columnOrder: ${serialized},`);
          }

          return { ...entry, postResponseScript: updatedScript };
        }));

        setStatusMessage('Orden de columnas guardado en el script.');
      };

      const getOrderedColumns = (): string[] => {
        // Prioridad 1: Usar columnOrder del output devuelto por el script
        if (outputColumnOrder.length > 0) {
          return outputColumnOrder.filter((col) => columns.includes(col)).concat(columns.filter((col) => !outputColumnOrder.includes(col)));
        }

        // Prioridad 2: Usar orden guardado en el estado
        const savedOrder = scriptStorageKey ? (postResponseColumnOrders[scriptStorageKey] ?? []) : [];
        if (savedOrder.length > 0) {
          return savedOrder.filter((col) => columns.includes(col)).concat(columns.filter((col) => !savedOrder.includes(col)));
        }

        // Prioridad 3: Usar orden original
        return columns;
      };

      const handleColumnDragStart = (e: React.DragEvent<HTMLTableCellElement>, column: string) => {
        if (!scriptStorageKey) return;
        e.dataTransfer.effectAllowed = 'move';
        setDraggedColumnInfo({ scriptId: scriptStorageKey, columnKey: column });
      };

      const handleColumnDragOver = (e: React.DragEvent<HTMLTableCellElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      };

      const handleColumnDrop = (e: React.DragEvent<HTMLTableCellElement>, targetColumn: string) => {
        e.preventDefault();
        if (!draggedColumnInfo || !scriptStorageKey || draggedColumnInfo.scriptId !== scriptStorageKey) {
          setDraggedColumnInfo(null);
          return;
        }

        const sourceColumn = draggedColumnInfo.columnKey;
        if (sourceColumn === targetColumn) {
          setDraggedColumnInfo(null);
          return;
        }

        const orderedColumns = getOrderedColumns();
        const sourceIndex = orderedColumns.indexOf(sourceColumn);
        const targetIndex = orderedColumns.indexOf(targetColumn);

        if (sourceIndex === -1 || targetIndex === -1) {
          setDraggedColumnInfo(null);
          return;
        }

        const newOrder = [...orderedColumns];
        newOrder.splice(sourceIndex, 1);
        newOrder.splice(targetIndex, 0, sourceColumn);

        saveColumnOrder(newOrder);
        setDraggedColumnInfo(null);
      };

      const handleColumnDragEnd = () => {
        setDraggedColumnInfo(null);
      };

      const handleCopyTableToClipboard = async () => {
        try {
          const orderedCols = getOrderedColumns();
          const tsv = tableToTsv(orderedCols, rows, resolvedColumnNames);
          await copyToClipboard(tsv);
          setStatusMessage('Tabla copiada al portapapeles. Puedes pegarla en Excel.');
        } catch (error) {
          setStatusMessage(`Error al copiar: ${error instanceof Error ? error.message : 'Desconocido'}`);
        }
      };

      const orderedColumns = getOrderedColumns();

      return (
        <div className="post-response-table-container">
          <div className="post-response-table-controls">
            <button
              type="button"
              className="ghost-button"
              onClick={handleCopyTableToClipboard}
              title="Copiar tabla en formato TSV para pegar en Excel"
            >
              Copiar tabla
            </button>
          </div>
          <div className="post-response-table-wrap">
            <table className="post-response-table">
              <thead>
                <tr>
                  {orderedColumns.map((column) => (
                    <th
                      key={`script-column-${column}`}
                      className={`post-response-table-header-editable ${draggedColumnInfo?.columnKey === column ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleColumnDragStart(e, column)}
                      onDragOver={handleColumnDragOver}
                      onDrop={(e) => handleColumnDrop(e, column)}
                      onDragEnd={handleColumnDragEnd}
                      title={getColumnTooltip(column)}
                    >
                      <input
                        type="text"
                        value={resolvedColumnNames[column] ?? column}
                        onChange={(event) => updateColumnName(column, event.target.value)}
                        onBlur={saveColumnNames}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            saveColumnNames();
                          }
                        }}
                        title={getColumnTooltip(column)}
                        draggable={false}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(orderedColumns.length, 1)}>Sin filas generadas por el script.</td>
                  </tr>
                ) : rows.map((row, rowIndex) => (
                  <tr key={`script-row-${rowIndex}`}>
                    {orderedColumns.map((column) => {
                      const value = row[column];
                      const display = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
                      return (
                        <td key={`script-row-${rowIndex}-${column}`} title={display}>{display}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (isScriptTableOutput(output)) {
      return (
        <div className="post-response-table-wrap">
          <table className="post-response-table">
            <thead>
              <tr>
                {output.columns.map((column) => (
                  <th key={`script-column-${column}`}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {output.rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(output.columns.length, 1)}>Sin filas generadas por el script.</td>
                </tr>
              ) : output.rows.map((row, rowIndex) => (
                <tr key={`script-row-${rowIndex}`}>
                  {output.columns.map((column) => (
                    <td key={`script-row-${rowIndex}-${column}`}>{String((row[column] ?? '') as string)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return <pre>{formatJson(output)}</pre>;
  }

  function finalizeImportedRows(matrix: string[][], importedFileName: string, sourceLabel: string) {
    const normalizedRows = matrix
      .map((row) => row.map((cell) => String(cell ?? '').trim()))
      .filter((row) => row.some((cell) => cell !== ''));

    if (normalizedRows.length === 0) {
      setRows([]);
      setImportErrors(['El archivo no contiene filas utilizables.']);
      setStatusMessage(`No se pudo importar ${importedFileName}: no hay filas con contenido.`);
      return;
    }

    let tupleRows = normalizedRows;
    let headers: string[] | null = null;
    const warnings: string[] = [];

    if (firstRowAsHeaders) {
      headers = normalizedRows[0].map((header, index) => header || `col${index + 1}`);
      tupleRows = normalizedRows.slice(1);

      const duplicates = headers.filter((header, index) => headers?.indexOf(header) !== index);
      if (duplicates.length > 0) {
        warnings.push(`Cabeceras duplicadas detectadas: ${Array.from(new Set(duplicates)).join(', ')}.`);
      }
    }

    const importedRows = tupleRows
      .filter((cells) => cells.some((cell) => cell !== ''))
      .map((cells, index) => {
        const expectedLength = headers ? headers.length : cells.length;

        if (cells.length !== expectedLength) {
          warnings.push(`Fila ${firstRowAsHeaders ? index + 2 : index + 1} tiene ${cells.length} valor(es); esperado ${expectedLength}.`);
        }

        return {
          rowNumber: firstRowAsHeaders ? index + 2 : index + 1,
          cells,
          fields: buildFieldMap(cells, headers),
        };
      });

    setRows(importedRows);
    setSelectedRowIndex(0);
    setResults([]);
    setImportErrors(Array.from(new Set(warnings)));
    setStatusMessage(
      importedRows.length > 0
        ? `${sourceLabel} cargado: ${importedRows.length} fila(s)${warnings.length > 0 ? ` con ${Array.from(new Set(warnings)).length} aviso(s)` : ''}.`
        : `No se pudo importar ${importedFileName}.`,
    );
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setFileName(file.name);
    setImportErrors([]);
    setStatusMessage(`Procesando ${file.name}...`);

    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const [firstSheetName] = workbook.SheetNames;
        const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

        if (!worksheet) {
          setRows([]);
          setImportErrors(['El Excel no contiene hojas con datos.']);
          setStatusMessage(`No se pudo importar ${file.name}: no hay hojas disponibles.`);
          return;
        }

        const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, {
          header: 1,
          raw: false,
          defval: '',
        });

        finalizeImportedRows(matrix, file.name, 'Excel');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido al leer el Excel.';
        setRows([]);
        setImportErrors([message]);
        setStatusMessage(`No se pudo leer el Excel: ${message}`);
      }

      event.target.value = '';
      return;
    }

    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: ({ data, errors }) => {
        if (errors.length > 0) {
          setRows([]);
          setImportErrors(errors.map((error) => `Fila ${error.row ?? '?'}: ${error.message}`));
          setStatusMessage(`El CSV contiene ${errors.length} error(es). Revisa el formato y vuelve a cargarlo.`);
          return;
        }

        finalizeImportedRows(data, file.name, 'CSV');
        event.target.value = '';
      },
      error: (error) => {
        setRows([]);
        setImportErrors([error.message]);
        setStatusMessage(`No se pudo leer el CSV: ${error.message}`);
        event.target.value = '';
      },
    });
  }

  async function saveSecret() {
    const key = normalizeSecretKey(secretName);
    const value = secretValueRef.current?.value ?? '';

    if (!window.postais?.setSecret) {
      setStatusMessage('El almacenamiento privado solo esta disponible dentro de Electron.');
      return;
    }

    const result = await window.postais.setSecret({ key, value, scope: secretScope });

    if (!result.ok) {
      setStatusMessage(result.error ?? 'No se pudo guardar la variable privada.');
      return;
    }

    setSavedSecrets(result.secrets);
    setSecretName(getNextSecretNameSuggestion(result.secrets.map((secret) => secret.key)));
    if (secretValueRef.current) {
      secretValueRef.current.value = '';
    }
    setShowSecretValueInput(false);
    setStatusMessage(`Variable privada ${key} guardada con alcance ${secretScope === 'local' ? 'local seguro' : 'temporal'}.`);
  }

  async function deleteSecret(key: string) {
    if (!window.postais?.deleteSecret) {
      return;
    }

    const result = await window.postais.deleteSecret({ key });
    setSavedSecrets(result.secrets);
    setStatusMessage(`Variable privada ${key} eliminada.`);
  }

  function validateBatch(rowsToSend: ImportedRow[], endpointOverride?: string, tupleId?: string) {
    if (!window.postais?.sendRequest) {
      throw new Error('La API nativa no esta disponible. Ejecuta la app dentro de Electron.');
    }

    const effectiveEndpoint = endpointOverride ?? (composedEndpoint || endpoint);
    const resolvedEndpoint = resolveEndpointWithPathParams(effectiveEndpoint, tupleId);
    const resolvedRawForValidation = method === 'POST' && bodyMode === 'RAW'
      ? (tupleId !== undefined
        ? resolveRawBodyForPostTuple(tupleId)
        : resolveRawBodyForEndpoint(effectiveEndpoint))
      : '';

    if (!effectiveEndpoint.trim()) {
      throw new Error('Define una URL de destino antes de enviar.');
    }


    if (authorizationScheme === 'BASIC') {
      const usernameKey = basicAuthUsernameSecretKey.trim();
      const passwordKey = basicAuthPasswordSecretKey.trim();

      if (!usernameKey || !passwordKey) {
        throw new Error('Selecciona variables privadas para Username y Password de Basic Auth.');
      }

      if (!savedSecretKeys.includes(usernameKey)) {
        throw new Error(`La variable privada ${usernameKey} (Username) no esta disponible.`);
      }

      if (!savedSecretKeys.includes(passwordKey)) {
        throw new Error(`La variable privada ${passwordKey} (Password) no esta disponible.`);
      }
    }

    const requiredVariables = extractPlaceholders(
      resolvedEndpoint,
      headersText,
      queryText,
      ...(method === 'POST' && bodyMode === 'JSON' ? [bodyTemplateText] : []),
      ...(method === 'POST' && bodyMode === 'RAW' ? [resolvedRawForValidation] : []),
    );

    const missingColumns = requiredVariables.filter((column) => !csvColumns.includes(column));

    if (missingColumns.length > 0) {
      throw new Error(`Faltan columnas requeridas en el archivo importado: ${missingColumns.join(', ')}.`);
    }

    if (savedSecretKeys.length === 0 && [
      resolvedEndpoint,
      headersText,
      queryText,
      ...(method === 'POST' && bodyMode === 'JSON' ? [bodyTemplateText] : []),
      ...(method === 'POST' && bodyMode === 'RAW' ? [resolvedRawForValidation] : []),
    ].some((source) => source.includes('{{secret:'))) {
      throw new Error('Hay placeholders privados definidos pero no existe ninguna variable privada cargada.');
    }

    createRequestPreview(rowsToSend[0], endpointOverride, tupleId);
  }

  function formatRawForValidation(raw: string): string {
    if (raw === '') {
      return '(vacio)';
    }

    const compact = raw.replace(/\s+/g, ' ').trim();
    if (compact.length <= 80) {
      return compact;
    }

    return `${compact.slice(0, 80)}...`;
  }

  function buildPostTupleValidationLines(): string[] {
    return postEndpointTuples
      .map((endpointValue, index) => ({
        endpointValue: endpointValue.trim(),
        tupleId: postEndpointTupleIds[index] ?? '',
        displayIndex: index + 1,
      }))
      .filter((item) => item.endpointValue !== '')
      .map((item) => {
        const raw = resolveRawBodyForPostTuple(item.tupleId);
        const resolvedEndpoint = resolveEndpointWithPathParams(item.endpointValue, item.tupleId);
        return `POST ${item.displayIndex}: ${resolvedEndpoint} | RAW: ${formatRawForValidation(raw)}`;
      });
  }

  async function dispatchRows(targetRows: ImportedRow[], endpointOverrides?: string[], endpointTupleIds?: string[]) {
    const rawEndpoints = endpointOverrides ?? [composedEndpoint || endpoint];
    const normalizedTargets = rawEndpoints
      .map((value, index) => ({
        endpoint: value.trim(),
        tupleId: endpointTupleIds ? ((endpointTupleIds[index] ?? '').trim() || undefined) : undefined,
      }))
      .filter((item) => item.endpoint !== '');

    if (normalizedTargets.length === 0) {
      const validationError = 'Define al menos un endpoint de destino antes de enviar.';
      setDispatchErrors([validationError]);
      setStatusMessage(validationError);
      scrollToResultsPanel();
      return;
    }

    try {
      validateBatch(targetRows, normalizedTargets[0]?.endpoint, normalizedTargets[0]?.tupleId);
    } catch (error) {
      const validationError = error instanceof Error ? error.message : 'No se pudo validar el lote.';
      setDispatchErrors([validationError]);
      setStatusMessage(validationError);
      scrollToResultsPanel();
      return;
    }

    const postais = window.postais;
    if (!postais) {
      setStatusMessage('La API nativa no esta disponible. Ejecuta la app dentro de Electron.');
      return;
    }

    setIsSending(true);
    setResults([]);
    setDispatchErrors([]);
    stopRequestedRef.current = false;

    try {
      const nextResults: DispatchResult[] = [];
      const collectedErrors: string[] = [];

      for (const [endpointIndex, target] of normalizedTargets.entries()) {
        const targetEndpoint = target.endpoint;
        const targetTupleId = target.tupleId;
        for (const [index, row] of targetRows.entries()) {
          if (stopRequestedRef.current) {
            setStatusMessage(`Envio detenido. ${nextResults.length} solicitudes procesadas.`);
            break;
          }

          setStatusMessage(`Enviando endpoint ${endpointIndex + 1}/${normalizedTargets.length} fila ${index + 1}/${targetRows.length}...`);

          let requestPreview: RequestPreview;
          let payload: PostRequestPayload;

          try {
            requestPreview = createRequestPreview(row, targetEndpoint, targetTupleId);
            payload = buildPayload(row, targetEndpoint, targetTupleId);
          } catch (error) {
            const templateError = error instanceof Error ? error.message : 'Error de plantilla';
            collectedErrors.push(`Fila ${row.rowNumber} (${targetEndpoint}): ${templateError}`);
            nextResults.push({
              ok: false,
              method,
              status: 0,
              statusText: 'Template Error',
              durationMs: 0,
              finalUrl: targetEndpoint,
              responseBody: templateError,
              responseHeaders: {},
              errorDetail: templateError,
              rowNumber: index + 1,
              row,
              requestPreview: {
                method,
                url: targetEndpoint,
                headers: {},
                query: {},
                bodyMode,
              },
            });
            setResults([...nextResults]);
            setDispatchErrors([...new Set(collectedErrors)]);

            if (stopOnError) {
              setStatusMessage('Proceso detenido por error de plantilla.');
              break;
            }

            continue;
          }

          const response = await postais.sendRequest(payload);
          nextResults.push({
            ...response,
            rowNumber: index + 1,
            row,
            requestPreview,
          });
          setResults([...nextResults]);
          registerHistoryEntry(row, requestPreview, response);

          if (!response.ok) {
            collectedErrors.push(
              `Fila ${row.rowNumber} (${targetEndpoint}): ${response.errorDetail ?? `HTTP ${response.status} ${response.statusText}`}`,
            );
            setDispatchErrors([...new Set(collectedErrors)]);
            if (isUnauthorizedResult(response)) {
              markBasicAuthFieldsAsInvalidForUnauthorized();
            }
          }

          if (!response.ok && stopOnError) {
            setStatusMessage(`Proceso detenido por error en la fila ${index + 1}.`);
            break;
          }

          if (delayMs > 0 && (index < targetRows.length - 1 || endpointIndex < normalizedTargets.length - 1)) {
            await delay(delayMs);
          }
        }

        if (stopRequestedRef.current || (stopOnError && collectedErrors.length > 0)) {
          break;
        }
      }

      if (!stopRequestedRef.current) {
        const successCount = nextResults.filter((result) => result.ok).length;
        setStatusMessage(`${method} completado. ${successCount}/${nextResults.length} solicitudes correctas.`);
      }

      const uniqueErrors = [...new Set(collectedErrors)];
      setDispatchErrors(uniqueErrors);
      if (uniqueErrors.length > 0) {
        scrollToResultsPanel();
      }
    } finally {
      setIsSending(false);
      stopRequestedRef.current = false;
    }
  }

  async function dispatchGetTuples(targetEndpoints: string[]) {
    const postais = window.postais;
    if (!postais) {
      setStatusMessage('La API nativa no esta disponible. Ejecuta la app dentro de Electron.');
      return;
    }

    const normalized = targetEndpoints.map((value) => value.trim()).filter((value) => value !== '');
    if (normalized.length === 0) {
      setDispatchErrors(['No hay endpoints GET configurados.']);
      setStatusMessage('Agrega al menos un endpoint GET antes de enviar.');
      scrollToResultsPanel();
      return;
    }

    setIsSending(true);
    setResults([]);
    setDispatchErrors([]);
    stopRequestedRef.current = false;

    try {
      const nextResults: DispatchResult[] = [];
      const collectedErrors: string[] = [];

      for (const [index, endpointTuple] of normalized.entries()) {
        if (stopRequestedRef.current) {
          setStatusMessage(`Envio GET detenido. ${nextResults.length} endpoint(s) procesado(s).`);
          break;
        }

        setStatusMessage(`Enviando GET ${index + 1} de ${normalized.length}...`);

        const tupleRow: ImportedRow = {
          rowNumber: index + 1,
          cells: [endpointTuple],
          fields: { endpoint: endpointTuple, col1: endpointTuple },
        };

        let requestPreview: RequestPreview;
        let payload: PostRequestPayload;

        try {
          requestPreview = createRequestPreview(tupleRow, endpointTuple);
          payload = buildPayload(tupleRow, endpointTuple);
        } catch (error) {
          const templateError = error instanceof Error ? error.message : 'Error de plantilla';
          collectedErrors.push(`GET ${index + 1}: ${templateError}`);
          nextResults.push({
            ok: false,
            method: 'GET',
            status: 0,
            statusText: 'Template Error',
            durationMs: 0,
            finalUrl: endpointTuple,
            responseBody: templateError,
            responseHeaders: {},
            errorDetail: templateError,
            rowNumber: index + 1,
            row: tupleRow,
            requestPreview: {
              method: 'GET',
              url: endpointTuple,
              headers: {},
              query: {},
              bodyMode: 'RAW',
            },
          });
          setResults([...nextResults]);

          if (stopOnError) {
            setStatusMessage('Proceso GET detenido por error.');
            break;
          }

          continue;
        }

        const response = await postais.sendRequest(payload);
        nextResults.push({
          ...response,
          rowNumber: index + 1,
          row: tupleRow,
          requestPreview,
        });
        setResults([...nextResults]);
        registerHistoryEntry(tupleRow, requestPreview, response);

        if (!response.ok) {
          collectedErrors.push(`GET ${index + 1}: ${response.errorDetail ?? `${response.status} ${response.statusText}`}`);
          setDispatchErrors([...new Set(collectedErrors)]);
          if (isUnauthorizedResult(response)) {
            markBasicAuthFieldsAsInvalidForUnauthorized();
          }
        }

        if (!response.ok && stopOnError) {
          setStatusMessage(`Proceso GET detenido por error en endpoint ${index + 1}.`);
          break;
        }

        if (delayMs > 0 && index < normalized.length - 1) {
          await delay(delayMs);
        }
      }

      if (!stopRequestedRef.current) {
        const successCount = nextResults.filter((result) => result.ok).length;
        setStatusMessage(`GET completado. ${successCount}/${nextResults.length} solicitudes correctas.`);
      }

      const uniqueErrors = [...new Set(collectedErrors)];
      setDispatchErrors(uniqueErrors);
      if (uniqueErrors.length > 0) {
        scrollToResultsPanel();
      }
    } finally {
      setIsSending(false);
      stopRequestedRef.current = false;
    }
  }

  function updateGetEndpointTuple(index: number, value: string) {
    setGetEndpointTuples((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
    setHideGetEndpointMatchesByIndex((current) => ({ ...current, [index]: false }));
  }

  function addGetEndpointTuple() {
    setGetEndpointTuples((current) => [...current, '']);
    setSelectedGetEndpointIndex(getEndpointTuples.length);
  }

  function removeGetEndpointTuple(index: number) {
    setGetEndpointTuples((current) => {
      if (current.length <= 1) {
        return [''];
      }

      const next = current.filter((_, itemIndex) => itemIndex !== index);
      setSelectedGetEndpointIndex((selected) => Math.min(selected, next.length - 1));
      setFocusedGetEndpointIndex((selected) => {
        if (selected === null) {
          return null;
        }

        if (selected === index) {
          return null;
        }

        return selected > index ? selected - 1 : selected;
      });
      setHideGetEndpointMatchesByIndex((currentHidden) => {
        const remapped: Record<number, boolean> = {};
        Object.entries(currentHidden).forEach(([rawIndex, hidden]) => {
          const numericIndex = Number(rawIndex);
          if (Number.isNaN(numericIndex) || numericIndex === index) {
            return;
          }

          remapped[numericIndex > index ? numericIndex - 1 : numericIndex] = hidden;
        });

        return remapped;
      });
      return next;
    });
  }

  async function executeFavoriteRequest(entry: FavoriteRequestEntry) {
    const postais = window.postais;
    if (!postais) {
      setStatusMessage('La API nativa no esta disponible. Ejecuta la app dentro de Electron.');
      return;
    }

    setIsSending(true);
    setDispatchErrors([]);
    setResults([]);

    try {
      const response = await postais.sendRequest({
        method: entry.method,
        url: entry.url,
        headers: entry.headers,
        query: entry.query,
        bodyMode: entry.bodyMode,
        body: entry.body,
        timeoutMs: entry.timeoutMs,
        allowInsecureTls: entry.allowInsecureTls,
      });

      const row: ImportedRow = {
        rowNumber: 1,
        cells: [entry.url],
        fields: { endpoint: entry.url, col1: entry.url },
      };

      const preview: RequestPreview = {
        method: entry.method,
        url: entry.url,
        headers: entry.headers,
        query: entry.query,
        bodyMode: entry.bodyMode,
        body: entry.body,
      };

      setMethod(entry.method);
      setResults([{
        ...response,
        rowNumber: 1,
        row,
        requestPreview: preview,
      }]);

      registerHistoryEntry(row, preview, response);
      if (!response.ok) {
        setDispatchErrors([response.errorDetail ?? `${response.status} ${response.statusText}`]);
        if (isUnauthorizedResult(response)) {
          markBasicAuthFieldsAsInvalidForUnauthorized();
        }
      }

      setActiveSection('history');
      setStatusMessage(`Peticion favorita ejecutada: ${entry.name}.`);
    } finally {
      setIsSending(false);
    }
  }

  function requestSendCurrentRow() {
    const selectedRow = rows[selectedRowIndex] ?? { rowNumber: 1, cells: [], fields: {} };
    const sendingWithoutRows = rows.length === 0;
    const selectedTupleRaw = method === 'POST' && bodyMode === 'RAW' ? resolveRawBodyForPostTuple(selectedPostEndpointTupleId) : '';
    const selectedResolvedEndpoint = method === 'POST'
      ? resolveEndpointWithPathParams(selectedPostEndpoint || endpoint, selectedPostEndpointTupleId)
      : (composedEndpoint || endpoint);
    const sendingEmptyRaw = method === 'POST' && bodyMode === 'RAW' && sendingWithoutRows && selectedTupleRaw.trim() === '';

    openConfirmDialog(
      {
        title: 'Confirmar envio de fila',
        description: 'Se va a enviar la fila actualmente seleccionada.',
        detailLines: [
          `Metodo: ${method}`,
          `Fila: ${selectedRow.rowNumber}`,
          `Endpoint: ${selectedResolvedEndpoint}`,
          ...(method === 'POST' && bodyMode === 'RAW' ? [`RAW asociado: ${formatRawForValidation(selectedTupleRaw)}`] : []),
          ...(sendingWithoutRows ? ['Sin CSV: se enviara una solicitud unica.'] : []),
          ...(sendingEmptyRaw ? ['Aviso: el body RAW se enviara vacio.'] : []),
        ],
        confirmLabel: 'Enviar fila',
        sessionKey: 'send-current-row',
      },
      () => {
        dispatchRows(rows.length === 0 ? [selectedRow] : rows.slice(selectedRowIndex, selectedRowIndex + 1), method === 'POST' ? [selectedPostEndpoint] : undefined, method === 'POST' ? [selectedPostEndpointTupleId] : undefined);
      },
    );
  }

  function requestSendBatch() {
    const rowsToSend = rows.length === 0 ? [{ rowNumber: 1, cells: [], fields: {} }] : rows;
    const sendingWithoutRows = rows.length === 0;
    const selectedTupleRaw = method === 'POST' && bodyMode === 'RAW' ? resolveRawBodyForPostTuple(selectedPostEndpointTupleId) : '';
    const sendingEmptyRaw = method === 'POST' && bodyMode === 'RAW' && sendingWithoutRows && selectedTupleRaw.trim() === '';
    const activePostCount = postEndpointTuples.filter((item) => item.trim() !== '').length;
    const postTupleValidationLines = method === 'POST' && bodyMode === 'RAW' ? buildPostTupleValidationLines() : [];

    openConfirmDialog(
      {
        title: 'Confirmar envio de lote',
        description: 'Se va a enviar el lote completo configurado en pantalla.',
        detailLines: [
          `Metodo: ${method}`,
          `Filas: ${rowsToSend.length}`,
          ...(method === 'POST' ? [`Endpoints POST: ${activePostCount}`] : [`Endpoint: ${composedEndpoint || endpoint}`]),
          ...postTupleValidationLines,
          ...(sendingWithoutRows ? ['Sin CSV: se enviara una solicitud unica.'] : []),
          ...(sendingEmptyRaw ? ['Aviso: el body RAW se enviara vacio.'] : []),
        ],
        confirmLabel: 'Enviar lote',
        sessionKey: 'send-post-batch',
      },
      () => {
        dispatchRows(rowsToSend, method === 'POST' ? postEndpointTuples : undefined, method === 'POST' ? postEndpointTupleIds : undefined);
      },
    );
  }

  function requestSendActiveGet() {
    openConfirmDialog(
      {
        title: 'Confirmar GET activo',
        description: 'Se va a lanzar el endpoint GET actualmente seleccionado.',
        detailLines: [`Endpoint: ${selectedGetEndpoint || '(vacio)'}`],
        confirmLabel: 'Enviar GET',
        sessionKey: 'send-get-active',
      },
      () => {
        dispatchGetTuples([selectedGetEndpoint]);
      },
    );
  }

  function requestSendGetBatch() {
    const activeCount = getEndpointTuples.filter((item) => item.trim() !== '').length;
    openConfirmDialog(
      {
        title: 'Confirmar lote GET',
        description: 'Se van a lanzar todos los endpoints GET configurados.',
        detailLines: [`Total endpoints: ${activeCount}`],
        confirmLabel: 'Enviar lote GET',
        sessionKey: 'send-get-batch',
      },
      () => {
        dispatchGetTuples(getEndpointTuples);
      },
    );
  }

  function requestExecuteFavorite(entry: FavoriteRequestEntry) {
    openConfirmDialog(
      {
        title: 'Confirmar repeticion de favorito',
        description: 'Se va a repetir una peticion favorita completa.',
        detailLines: [`Nombre: ${entry.name}`, `Metodo: ${entry.method}`, `URL: ${entry.url}`],
        confirmLabel: 'Repetir peticion',
        sessionKey: 'repeat-favorite-request',
      },
      () => {
        void executeFavoriteRequest(entry);
      },
    );
  }

  return (
    <div className="app-shell">
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
      <aside className="hero-panel">
        <p className="eyebrow">PostAIS</p>
        <h1>Mensajeria RAW por filas de Excel/CSV.</h1>
        <p className="lede">Importa tuplas, recorre filas en vista deslizable y envia cada linea como body RAW del POST.</p>
        <button
          type="button"
          className="theme-toggle-button"
          onClick={() => setIsNightMode((current) => !current)}
          aria-label={isNightMode ? 'Cambiar a modo claro' : 'Cambiar a modo noche'}
          title={isNightMode ? 'Cambiar a modo claro' : 'Cambiar a modo noche'}
        >
          <span className="theme-toggle-icon" aria-hidden="true">{isNightMode ? '☀️' : '🌙'}</span>
          {isNightMode ? 'Modo claro' : 'Modo noche'}
        </button>

        <div className="status-card">
          <span className="status-label">Estado</span>
          <strong>{statusMessage}</strong>
          <span>{fileName ? `Archivo actual: ${fileName}` : 'Sin archivo cargado'}</span>
        </div>

        <div className="section-nav" role="tablist" aria-label="Secciones principales">
          <button
            type="button"
            className={`section-nav-button ${activeSection === 'composer' ? 'section-nav-button-active' : ''}`}
            onClick={() => setActiveSection('composer')}
            aria-pressed={activeSection === 'composer'}
          >
            Inicio
          </button>
          <button
            type="button"
            className={`section-nav-button ${activeSection === 'history' ? 'section-nav-button-active' : ''}`}
            onClick={() => setActiveSection('history')}
            aria-pressed={activeSection === 'history'}
          >
            Historial ({requestHistory.length})
          </button>
          <button
            type="button"
            className={`section-nav-button ${activeSection === 'favorites' ? 'section-nav-button-active' : ''}`}
            onClick={() => setActiveSection('favorites')}
            aria-pressed={activeSection === 'favorites'}
          >
            Favoritos ({favoriteEndpoints.length})
          </button>
        </div>

        <div className="secrets-menu">
          <button type="button" className="secrets-menu-toggle" onClick={() => setShowSecretsMenu(!showSecretsMenu)}>
            <span className={`menu-arrow ${showSecretsMenu ? 'open' : ''}`}>▶</span>
            Variables privadas ({savedSecrets.length})
          </button>

          {showSecretsMenu ? (
            <div className="secrets-menu-content">
              <p className="muted-small">Guarda secretos para autenticacion sin dejarlos en el archivo importado.</p>
              <div className="secret-form-row">
                <label className="field compact-field">
                  <span>Nombre</span>
                  <input value={secretName} onChange={(event) => setSecretName(event.target.value)} placeholder="API_TOKEN" />
                </label>
                <label className="field compact-field">
                  <span>Persistencia</span>
                  <select value={secretScope} onChange={(event) => setSecretScope(event.target.value as SecretScope)}>
                    <option value="temporary">Temporal</option>
                    <option value="local">Local segura</option>
                  </select>
                </label>
                <label className="field stretch-row">
                  <span>Valor privado</span>
                  <div className="secret-value-input-row">
                    <input
                      ref={secretValueRef}
                      type={showSecretValueInput ? 'text' : 'password'}
                      placeholder="Token..."
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="ghost-button secret-visibility-button"
                      onClick={() => setShowSecretValueInput((current) => !current)}
                      aria-label={showSecretValueInput ? 'Ocultar valor privado' : 'Mostrar valor privado'}
                      title={showSecretValueInput ? 'Ocultar valor privado' : 'Mostrar valor privado'}
                    >
                      {showSecretValueInput ? (
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="secret-visibility-icon">
                          <path d="M1.5 12s3.8-6.5 10.5-6.5S22.5 12 22.5 12 18.7 18.5 12 18.5 1.5 12 1.5 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                        </svg>
                      ) : (
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="secret-visibility-icon">
                          <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          <path d="M10.6 5.8A11 11 0 0 1 12 5.5c6.7 0 10.5 6.5 10.5 6.5a17.8 17.8 0 0 1-4 4.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M6.2 6.2A18.2 18.2 0 0 0 1.5 12S5.3 18.5 12 18.5c1.8 0 3.4-.5 4.8-1.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M9.9 9.9A3.2 3.2 0 0 0 14.1 14.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>
                </label>
                <button type="button" className="primary-button compact" onClick={saveSecret}>
                  Guardar
                </button>
              </div>
              <div className="chip-row">
                {savedSecretKeys.length > 0 ? (
                  savedSecretKeys.map((key) => (
                    <button key={key} type="button" className="chip chip-button" onClick={() => deleteSecret(key)}>
                      {key} ({savedSecretsByKey[key] === 'local' ? 'local' : 'temp'}) x
                    </button>
                  ))
                ) : (
                  <span className="muted-small">No hay secretos.</span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="workspace-panel">
        <input
          ref={historyImportInputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          onChange={importHistoryCollection}
        />
        <input
          ref={favoriteRequestsImportInputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          onChange={importFavoriteRequests}
        />
        <input
          ref={favoriteBaseEndpointsImportInputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          onChange={importFavoriteBaseEndpoints}
        />
        <input
          ref={favoriteCommandsImportInputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          onChange={importFavoriteCommands}
        />

        {activeSection === 'composer' ? (
          <>
        <section className="panel grid-panel grid-panel-wide">
          <label className="field compact-field">
            <span>Vista</span>
            <select value={interfaceMode} onChange={(event) => setInterfaceMode(event.target.value as InterfaceMode)}>
              <option value="basic">Basica</option>
              <option value="advanced">Avanzada</option>
            </select>
          </label>

          <label className="field compact-field">
            <span>Entorno favorito por defecto</span>
            <select value={favoriteEnvironment} onChange={(event) => setFavoriteEnvironment(event.target.value as FavoriteEnvironment)}>
              <option value="DEV">DEV</option>
              <option value="PROD">PROD</option>
              <option value="QA">QA</option>
            </select>
          </label>

          <label className="field compact-field">
            <span>Metodo</span>
            <select value={method} onChange={(event) => setMethod(event.target.value as HttpMethod)}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </label>

          {interfaceMode === 'advanced' ? (
            <>
              <label className="field compact-field">
                <span>Autenticacion</span>
                <select value={authorizationScheme} onChange={(event) => {
                  setAuthorizationScheme(event.target.value as AuthorizationScheme);
                  setShowBasicAuthFieldErrors(false);
                  setAuthSelectionSource('manual');
                }}>
                  <option value="NONE">Sin autenticacion</option>
                  <option value="BASIC">Basic Auth</option>
                </select>
                {authorizationScheme === 'BASIC' && authSelectionSource ? (
                  <p className="muted-small">
                    {authSelectionSource === 'auto' ? 'Autodetectada desde variables privadas.' : 'Configurada manualmente.'}
                  </p>
                ) : null}
              </label>

              <label className={`field compact-field ${showBasicAuthFieldErrors && authorizationScheme === 'BASIC' ? 'auth-field-error' : ''}`}>
                <span>Username</span>
                <select
                  value={basicAuthUsernameSecretKey}
                  onChange={(event) => {
                    setBasicAuthUsernameSecretKey(event.target.value);
                    setShowBasicAuthFieldErrors(false);
                    setAuthSelectionSource('manual');
                  }}
                  disabled={authorizationScheme !== 'BASIC' || savedSecretKeys.length === 0}
                >
                  {savedSecretKeys.length > 0 ? (
                    usernameSecretOptions.map((key) => (
                      <option key={`basic-user-${key}`} value={key}>
                        {key}
                      </option>
                    ))
                  ) : (
                    <option value="">Sin variables privadas</option>
                  )}
                </select>
              </label>

              <label className={`field compact-field ${showBasicAuthFieldErrors && authorizationScheme === 'BASIC' ? 'auth-field-error' : ''}`}>
                <span>Password</span>
                <select
                  value={basicAuthPasswordSecretKey}
                  onChange={(event) => {
                    setBasicAuthPasswordSecretKey(event.target.value);
                    setShowBasicAuthFieldErrors(false);
                    setAuthSelectionSource('manual');
                  }}
                  disabled={authorizationScheme !== 'BASIC' || savedSecretKeys.length === 0}
                >
                  {savedSecretKeys.length > 0 ? (
                    passwordSecretOptions.map((key) => (
                      <option key={`basic-pass-${key}`} value={key}>
                        {key}
                      </option>
                    ))
                  ) : (
                    <option value="">Sin variables privadas</option>
                  )}
                </select>
              </label>
            </>
          ) : null}

          {method !== 'GET' ? (
            <label className="field compact-field">
              <span>Modo body</span>
              <select value={bodyMode} onChange={(event) => setBodyMode(event.target.value as BodyMode)}>
                <option value="RAW">RAW</option>
                <option value="JSON">JSON</option>
              </select>
            </label>
          ) : null}

          {method === 'GET' ? (
            <div className="field stretch-full endpoint-config-panel">
              <span>Endpoints</span>
              <div className="get-tuples-list">
                {getEndpointTuples.map((endpointTuple, index) => (
                  <div key={`get-tuple-${index}`} className="get-tuple-row">
                    <div className="endpoint-input-row">
                      <input
                        type="url"
                        value={endpointTuple}
                        onFocus={() => {
                          setFocusedGetEndpointIndex(index);
                          setSelectedGetEndpointIndex(index);
                        }}
                        onBlur={() => {
                          setFocusedGetEndpointIndex((current) => (current === index ? null : current));
                        }}
                        onChange={(event) => updateGetEndpointTuple(index, event.target.value)}
                        placeholder="https://api.tu-servicio.com/recurso"
                      />
                      <button
                        type="button"
                        className={`favorite-toggle-button ${isFavoriteEndpoint(endpointTuple, 'GET') ? 'favorite-toggle-button-active' : ''}`}
                        onClick={() => toggleFavoriteEndpoint(endpointTuple, 'GET')}
                        title={isFavoriteEndpoint(endpointTuple, 'GET') ? 'Quitar de favoritos' : 'Anadir a favoritos'}
                        aria-label={isFavoriteEndpoint(endpointTuple, 'GET') ? 'Quitar de favoritos' : 'Anadir a favoritos'}
                      >
                        {isFavoriteEndpoint(endpointTuple, 'GET') ? '★' : '☆'}
                      </button>
                    </div>
                    {extractEndpointRuntimeParams(endpointTuple).length > 0 && (
                      <div className="path-params-row">
                        {extractEndpointRuntimeParams(endpointTuple).map((param) => (
                          <label key={`path-param-get-${index}-${param.kind}-${param.name}`} className="path-param-field">
                            <span className="path-param-label">{param.kind === 'path' ? `:${param.name}` : `{{${param.name}}}`}</span>
                            <input
                              type="text"
                              className="path-param-input"
                              placeholder={param.kind === 'path' ? `Valor para :${param.name}` : `Valor para {{${param.name}}}`}
                              value={pathParamValues[endpointTuple]?.[param.name] ?? ''}
                              onChange={(e) => setPathParamValues((prev) => ({
                                ...prev,
                                [endpointTuple]: { ...(prev[endpointTuple] ?? {}), [param.name]: e.target.value },
                              }))}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="get-tuple-actions">
                      <button type="button" className="ghost-button" onClick={() => setSelectedGetEndpointIndex(index)}>
                        {selectedGetEndpointIndex === index ? 'Tupla activa' : 'Activar'}
                      </button>
                      <button type="button" className="ghost-button" onClick={() => removeGetEndpointTuple(index)} disabled={getEndpointTuples.length === 1}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="secondary-button" onClick={addGetEndpointTuple}>+ Agregar endpoint GET</button>
            </div>
          ) : (
            <div className="field stretch-full endpoint-config-panel">
              <span>Endpoints</span>
              <div className="get-tuples-list">
                {postEndpointTuples.map((endpointTuple, index) => {
                  const tupleId = postEndpointTupleIds[index] ?? '';
                  const tupleRuntimeParams = tupleId
                    ? (endpointRuntimeParamsByTupleId[tupleId] ?? pathParamValues[endpointTuple] ?? {})
                    : (pathParamValues[endpointTuple] ?? {});
                  const tupleTemplateParams = extractEndpointRuntimeParams(endpointTuple).filter((param) => param.kind === 'template');

                  return (
                  <div key={`post-tuple-${index}`} className="get-tuple-row">
                    <div className="endpoint-input-row">
                      <input
                        type="url"
                        value={endpointTuple}
                        onFocus={() => {
                          setFocusedPostEndpointIndex(index);
                          setSelectedPostEndpointIndex(index);
                        }}
                        onBlur={() => {
                          setFocusedPostEndpointIndex((current) => (current === index ? null : current));
                        }}
                        onChange={(event) => {
                          setSelectedPostEndpointIndex(index);
                          updatePostEndpoint(event.target.value);
                        }}
                        placeholder="https://api.tu-servicio.com/messages"
                      />
                      <button
                        type="button"
                        className={`favorite-toggle-button ${isFavoriteEndpoint(endpointTuple, 'POST') ? 'favorite-toggle-button-active' : ''}`}
                        onClick={() => toggleFavoriteEndpoint(endpointTuple, 'POST')}
                        title={isFavoriteEndpoint(endpointTuple, 'POST') ? 'Quitar de favoritos' : 'Anadir a favoritos'}
                        aria-label={isFavoriteEndpoint(endpointTuple, 'POST') ? 'Quitar de favoritos' : 'Anadir a favoritos'}
                      >
                        {isFavoriteEndpoint(endpointTuple, 'POST') ? '★' : '☆'}
                      </button>
                    </div>
                    {extractEndpointRuntimeParams(endpointTuple).length > 0 && (
                      <div className="path-params-row">
                        {extractEndpointRuntimeParams(endpointTuple).map((param) => (
                          <label key={`path-param-post-${index}-${param.kind}-${param.name}`} className="path-param-field">
                            <span className="path-param-label">{param.kind === 'path' ? `:${param.name}` : `{{${param.name}}}`}</span>
                            <input
                              type="text"
                              className="path-param-input"
                              placeholder={param.kind === 'path' ? `Valor para :${param.name}` : `Valor para {{${param.name}}}`}
                              value={tupleRuntimeParams[param.name] ?? ''}
                              onChange={(e) => {
                                if (tupleId) {
                                  setEndpointRuntimeParamsByTupleId((prev) => ({
                                    ...prev,
                                    [tupleId]: { ...(prev[tupleId] ?? {}), [param.name]: e.target.value },
                                  }));
                                  return;
                                }

                                setPathParamValues((prev) => ({
                                  ...prev,
                                  [endpointTuple]: { ...(prev[endpointTuple] ?? {}), [param.name]: e.target.value },
                                }));
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="get-tuple-actions">
                      <button type="button" className="ghost-button" onClick={() => setSelectedPostEndpointIndex(index)}>
                        {selectedPostEndpointIndex === index ? 'Tupla activa' : 'Activar'}
                      </button>
                      <button type="button" className="ghost-button" onClick={() => removePostEndpointTuple(index)} disabled={postEndpointTuples.length === 1}>
                        Eliminar
                      </button>
                      {tupleTemplateParams.length > 0 ? (
                        <button type="button" className="ghost-button" onClick={() => openEndpointParamGroupDialog(index)}>
                          Anadir grupo de parametros
                        </button>
                      ) : null}
                    </div>
                  </div>
                );})}
              </div>
              <button type="button" className="secondary-button" onClick={addPostEndpointTuple}>+ Agregar endpoint POST</button>
            </div>
          )}

          <div className="field stretch-full endpoint-composer-panel">
            <span>Constructor de Endpoint</span>
            <div className="endpoint-composer-grid">
              <div className="endpoint-input-row">
                <input
                  type="text"
                  value={baseEndpoint}
                  onFocus={() => setIsBaseEndpointFocused(true)}
                  onBlur={() => setIsBaseEndpointFocused(false)}
                  onChange={(event) => updateBaseEndpoint(event.target.value)}
                  placeholder="https://host/servicio-base"
                />
                <button
                  type="button"
                  className={`favorite-toggle-button ${isFavoriteBaseEndpoint(baseEndpoint) ? 'favorite-toggle-button-active' : ''}`}
                  onClick={() => toggleFavoriteBaseEndpoint(baseEndpoint, method)}
                  title={isFavoriteBaseEndpoint(baseEndpoint) ? 'Quitar endpoint base de favoritos' : 'Anadir endpoint base a favoritos'}
                  aria-label={isFavoriteBaseEndpoint(baseEndpoint) ? 'Quitar endpoint base de favoritos' : 'Anadir endpoint base a favoritos'}
                >
                  {isFavoriteBaseEndpoint(baseEndpoint) ? '★' : '☆'}
                </button>
              </div>
              <div className="endpoint-input-row">
                <input
                  type="text"
                  value={commandEndpoint}
                  onFocus={() => setIsCommandEndpointFocused(true)}
                  onBlur={() => setIsCommandEndpointFocused(false)}
                  onChange={(event) => updateCommandEndpoint(event.target.value)}
                  placeholder="/v2/aisles"
                />
                <button
                  type="button"
                  className={`favorite-toggle-button ${isFavoriteCommand(commandEndpoint, method) ? 'favorite-toggle-button-active' : ''}`}
                  onClick={() => toggleFavoriteCommand(commandEndpoint, method)}
                  title={isFavoriteCommand(commandEndpoint, method) ? 'Quitar comando de favoritos' : 'Anadir comando a favoritos'}
                  aria-label={isFavoriteCommand(commandEndpoint, method) ? 'Quitar comando de favoritos' : 'Anadir comando a favoritos'}
                >
                  {isFavoriteCommand(commandEndpoint, method) ? '★' : '☆'}
                </button>
              </div>
            </div>

            {renderBaseEndpointMatches()}
            {renderCommandMatches()}

            <div className="field stretch-full favorite-commands-selector-panel">
              <button
                type="button"
                className="ghost-button favorite-commands-disclosure-button"
                onClick={() => setShowFavoriteCommandsSelector((current) => !current)}
                aria-expanded={showFavoriteCommandsSelector}
              >
                {showFavoriteCommandsSelector
                  ? `Ocultar comandos favoritos (${contextualFavoriteCommands.length})`
                  : `Comandos favoritos para anadir (${contextualFavoriteCommands.length})`}
                {selectedFavoriteCommandIdsOrdered.length > 0 ? ` - seleccionados: ${selectedFavoriteCommandIdsOrdered.length}` : ''}
              </button>
              {showFavoriteCommandsSelector ? renderFavoriteCommandsSelection() : null}
            </div>

            <div className="action-row">
              <button type="button" className="secondary-button" onClick={() => applyComposedEndpointsToCurrentMethod('add')} disabled={!canApplyComposedEndpoints}>
                Anadir a endpoint
              </button>
              <button type="button" className="ghost-button" onClick={() => applyComposedEndpointsToCurrentMethod('replace')} disabled={!canApplyComposedEndpoints}>
                Sustituir endpoint(s)
              </button>
            </div>
          </div>

          {method === 'GET'
            ? renderEndpointMatches(
                getEndpointMatches,
                focusedGetEndpoint,
                'GET',
                focusedGetEndpointIndex !== null && !Boolean(hideGetEndpointMatchesByIndex[focusedGetEndpointIndex]),
                focusedGetEndpointIndex ?? undefined,
              )
            : null}
          {method !== 'GET'
            ? renderEndpointMatches(
                postEndpointMatches,
                focusedPostEndpoint,
                'POST',
                focusedPostEndpointIndex !== null && !Boolean(hidePostEndpointMatchesByIndex[focusedPostEndpointIndex]),
                focusedPostEndpointIndex ?? undefined,
              )
            : null}

          {interfaceMode === 'advanced' ? (
            <>
              <label className="field compact-field">
                <span>Timeout por solicitud (ms)</span>
                <input type="number" min={1000} step={500} value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value) || 0)} />
              </label>

              <label className="field checkbox-field compact-checkbox-field">
                <input type="checkbox" checked={allowInsecureTls} onChange={(event) => setAllowInsecureTls(event.target.checked)} />
                <span>Permitir TLS autofirmado (solo pruebas)</span>
              </label>

              <label className="field compact-field">
                <span>Delay entre filas (ms)</span>
                <input type="number" min={0} step={100} value={delayMs} onChange={(event) => setDelayMs(Number(event.target.value) || 0)} />
              </label>
            </>
          ) : null}

          {method !== 'GET' ? (
            <>
              <label className="field stretch-row">
                <span>Archivo Excel o CSV</span>
                <input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileImport} />
              </label>

              {bodyMode === 'RAW' ? (
                <label className="field stretch stretch-full">
                  <span>Body RAW manual</span>
                  <textarea
                    value={
                      method === 'POST' && composerDraftRawBody !== null
                        ? composerDraftRawBody
                        : (method === 'POST' && selectedPostEndpointTupleId ? (endpointRawBodiesByTupleId[selectedPostEndpointTupleId] ?? '') : rawBodyText)
                    }
                    onChange={(event) => {
                      if (method === 'POST' && composerDraftRawBody !== null) {
                        setComposerDraftRawBody(event.target.value);
                      } else if (method === 'POST' && selectedPostEndpointTupleId) {
                        setEndpointRawBodiesByTupleId((prev) => ({
                          ...prev,
                          [selectedPostEndpointTupleId]: event.target.value,
                        }));
                      } else {
                        setRawBodyText(event.target.value);
                      }
                    }}
                    rows={5}
                    spellCheck={false}
                    placeholder="Si lo dejas vacio, se seguira usando el RAW construido desde Excel/CSV. Puedes usar placeholders como {{col1}}."
                  />
                </label>
              ) : null}

              {interfaceMode === 'advanced' ? (
                <>
                  <label className="field compact-field">
                    <span>Separador RAW</span>
                    <input
                      value={rawDelimiter}
                      onChange={(event) => setRawDelimiter(event.target.value)}
                      placeholder="Opcional. Vacio = sin separador"
                      disabled={bodyMode !== 'RAW'}
                    />
                  </label>

                  <label className="field checkbox-field compact-checkbox-field">
                    <input type="checkbox" checked={firstRowAsHeaders} onChange={(event) => setFirstRowAsHeaders(event.target.checked)} />
                    <span>Usar primera fila como nombres de campo</span>
                  </label>
                </>
              ) : null}
            </>
          ) : null}

          {interfaceMode === 'advanced' ? (
            <label className="field checkbox-field">
              <input type="checkbox" checked={stopOnError} onChange={(event) => setStopOnError(event.target.checked)} />
              <span>Detener el lote al primer error</span>
            </label>
          ) : null}

          {interfaceMode === 'advanced' && method !== 'GET' && bodyMode !== 'RAW' ? (
            <>
              <label className="field stretch">
                <span>Headers JSON</span>
                <textarea
                  value={headersText}
                  onChange={(event) => setHeadersText(event.target.value)}
                  rows={7}
                  spellCheck={false}
                />
              </label>

              <label className="field stretch">
                <span>Query params JSON</span>
                <textarea
                  value={queryText}
                  onChange={(event) => setQueryText(event.target.value)}
                  rows={7}
                  spellCheck={false}
                />
              </label>
            </>
          ) : null}

          {method !== 'GET' && bodyMode !== 'RAW' ? (
            <label className="field stretch stretch-full">
              <span>Body template JSON</span>
              <textarea value={bodyTemplateText} onChange={(event) => setBodyTemplateText(event.target.value)} rows={10} spellCheck={false} />
            </label>
          ) : null}
        </section>

        {method !== 'GET' ? (
          <section className="panel import-panel">
            <div className="panel-header">
              <h2>Importacion y recorrido por filas</h2>
              <div className="action-row">
                <span>{rows.length} filas importadas</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowImportPanel((current) => !current)}
                  aria-expanded={showImportPanel}
                >
                  {showImportPanel ? 'Ocultar' : 'Expandir'}
                </button>
              </div>
            </div>

            {showImportPanel ? (
              <>
                {importErrors.length > 0 ? (
                  <div className="import-error-box">
                    <strong>Errores o avisos de importacion</strong>
                    <ul className="flat-list">
                      {importErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="muted">Sin errores de importacion.</p>
                )}

                {rows.length > 0 ? (
                  <>
                    <div className="slider-actions">
                      <button type="button" className="ghost-button" onClick={() => setSelectedRowIndex((current) => Math.max(0, current - 1))} disabled={selectedRowIndex === 0}>
                        Fila anterior
                      </button>
                      <span>
                        {selectedRowIndex + 1} / {rows.length}
                      </span>
                      <button type="button" className="ghost-button" onClick={() => setSelectedRowIndex((current) => Math.min(rows.length - 1, current + 1))} disabled={selectedRowIndex === rows.length - 1}>
                        Fila siguiente
                      </button>
                    </div>

                    <div className="row-slider" ref={sliderRef}>
                      {rows.map((row, index) => (
                        <article key={`import-row-${row.rowNumber}`} className={`row-card ${index === selectedRowIndex ? 'row-card-active' : ''}`} data-row-card={index} onClick={() => setSelectedRowIndex(index)}>
                          <header>
                            <strong>Fila {row.rowNumber}</strong>
                            <span>{row.cells.length} valor(es)</span>
                          </header>
                          <pre>{formatJson(row.cells)}</pre>
                          <div className="row-card-body">
                            <span>RAW body</span>
                            <pre>{buildRawBody(row.cells, rawDelimiter)}</pre>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted">Todavia no hay filas importadas para recorrer.</p>
                )}
              </>
            ) : (
              <p className="muted">Panel colapsado. Pulsa "Expandir" para ver las filas importadas.</p>
            )}
          </section>
        ) : null}

        {method !== 'GET' ? (
          <section className="split-layout split-layout-top">
            <article className="panel preview-panel">
              <div className="panel-header">
                <h2>Preview</h2>
                <div className="action-row">
                  <span>{previewRow ? `Fila ${previewRow.rowNumber}` : 'Sin datos'}</span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setShowPreviewPanel((current) => !current)}
                    aria-expanded={showPreviewPanel}
                  >
                    {showPreviewPanel ? 'Ocultar' : 'Expandir'}
                  </button>
                </div>
              </div>
              {showPreviewPanel ? (
                <>
                  <div className="preview-block">
                    <h3>Tupla importada</h3>
                    <pre>{previewRow ? formatJson(previewRow.cells) : 'Sin fila seleccionada.'}</pre>
                  </div>
                  <div className="preview-block">
                    <h3>Body resultante</h3>
                    <pre>
                      {previewState.error
                        ? previewState.error
                        : previewState.payload?.body !== undefined
                          ? typeof previewState.payload.body === 'string'
                            ? previewState.payload.body
                            : formatJson(previewState.payload.body)
                          : 'GET no envia body.'}
                    </pre>
                  </div>
                  <div className="preview-block">
                    <h3>RAW construido</h3>
                    <pre>{previewRawBody || 'Sin fila seleccionada.'}</pre>
                  </div>
                </>
              ) : (
                <p className="muted">Panel colapsado. Pulsa "Expandir" para ver la preview de la fila seleccionada.</p>
              )}
            </article>
          </section>
        ) : null}

        <section className="panel preview-panel" aria-live="polite">
          <div className="panel-header">
            <h2>Validacion previa</h2>
            <span>{preflightIssues.length === 0 ? 'Lista para enviar' : `${preflightIssues.length} aviso(s)`}</span>
          </div>
          {preflightIssues.length === 0 ? (
            <p className="muted">La configuracion actual no muestra errores obvios antes del envio.</p>
          ) : (
            <div className="import-error-box">
              <strong>Corrige estos puntos antes de enviar</strong>
              <ul className="flat-list">
                {preflightIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="panel action-panel">
          <div>
            <h2>Envio Mensajeria</h2>
            <p>
              {method === 'GET'
                ? `${getEndpointTuples.filter((item) => item.trim() !== '').length} endpoint(s) GET listos para ejecutar.`
                : `${postEndpointTuples.filter((item) => item.trim() !== '').length} endpoint(s) POST listos para ejecutar.`}
            </p>
            <p>
              {method === 'GET'
                ? null
                : rows.length > 0
                  ? `${rows.length} filas disponibles. Variables detectadas: ${expectedVariables.join(', ') || 'ninguna'}.`
                  : bodyMode === 'RAW'
                    ? `Sin CSV: se enviara una solicitud POST usando Body RAW manual${resolveRawBodyForEndpoint(selectedPostEndpoint).trim() ? '.' : ' vacio.'}`
                    : 'Carga un Excel o CSV para validar columnas y preparar el lote.'}
            </p>
          </div>

          <div className="action-row">
            {showFavoriteRequestsSection ? (
              <button type="button" className="ghost-button" onClick={saveCurrentRequestAsFavorite}>
                Guardar peticion completa en favoritos
              </button>
            ) : null}
            {method === 'GET' ? (
              <>
                <label className="field compact-field">
                  <span>Endpoint activo</span>
                  <select value={selectedGetEndpointIndex} onChange={(event) => setSelectedGetEndpointIndex(Number(event.target.value))} disabled={getEndpointTuples.length === 0 || isSending}>
                    {getEndpointTuples.map((endpointTuple, index) => (
                      <option key={`get-endpoint-${index}`} value={index}>
                        GET {index + 1}: {endpointTuple || '(vacio)'}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={getEndpointTuples.filter((item) => item.trim() !== '').length === 0 || isSending}
                  onClick={requestSendActiveGet}
                >
                  Enviar GET activo
                </button>

                <button
                  type="button"
                  className="primary-button"
                  disabled={getEndpointTuples.filter((item) => item.trim() !== '').length === 0 || isSending}
                  onClick={requestSendGetBatch}
                >
                  Enviar lote GET
                </button>
              </>
            ) : (
              <>
                <label className="field compact-field">
                  <span>Endpoint POST activo</span>
                  <select value={selectedPostEndpointIndex} onChange={(event) => setSelectedPostEndpointIndex(Number(event.target.value))} disabled={postEndpointTuples.length === 0 || isSending}>
                    {postEndpointTuples.map((endpointTuple, index) => (
                      <option key={`post-endpoint-${index}`} value={index}>
                        POST {index + 1}: {endpointTuple || '(vacio)'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field compact-field">
                  <span>Fila de prueba</span>
                  <select value={selectedRowIndex} onChange={(event) => setSelectedRowIndex(Number(event.target.value))} disabled={rows.length === 0 || isSending}>
                    {rows.map((row, index) => (
                      <option key={`row-${row.rowNumber}`} value={index}>
                        Fila {row.rowNumber}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={isSending || !selectedPostEndpoint.trim()}
                  onClick={requestSendCurrentRow}
                >
                  Enviar fila actual
                </button>

                <button
                  type="button"
                  className="primary-button"
                  disabled={isSending || postEndpointTuples.filter((item) => item.trim() !== '').length === 0}
                  onClick={requestSendBatch}
                >
                  Enviar lote completo
                </button>
              </>
            )}

            <button type="button" className="ghost-button" disabled={!isSending} onClick={() => {
              stopRequestedRef.current = true;
            }}>
              Detener despues de la actual
            </button>
          </div>
        </section>

        <section className="panel results-panel" ref={resultsPanelRef}>
          <div className="panel-header">
            <h2>Resultados detallados</h2>
            <span>{results.length} respuestas registradas</span>
            <button type="button" className="ghost-button" onClick={() => void copyAllResultsToClipboard()} disabled={results.length === 0}>
              Copiar todo
            </button>
          </div>

          {dispatchErrors.length > 0 ? (
            <div className="import-error-box">
              <strong>Errores detectados en el envio</strong>
              <ul className="flat-list">
                {dispatchErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {results.length === 0 ? (
            <p className="muted">Todavia no se han ejecutado solicitudes.</p>
          ) : (
            <div className="results-table">
              {method === 'GET'
                ? groupedGetResults.map((group) => (
                    <div key={`group-${group.endpoint}`} className="preview-block">
                      <h3>Endpoint: {group.endpoint}</h3>
                      {group.items.map((result) => {
                        const responseText = getResponseDetailsText(result);
                        const responseLineCount = countTextLines(responseText);
                        const responseKey = `get-response-${group.endpoint}-${result.row.rowNumber}`;
                        const isExpanded = Boolean(expandedGetResponsesByKey[responseKey]);
                        const shouldTruncate = responseLineCount > MAX_RESPONSE_PREVIEW_LINES;
                        const visibleResponseText = shouldTruncate && !isExpanded
                          ? `${trimTextToLines(responseText, MAX_RESPONSE_PREVIEW_LINES)}\n...`
                          : responseText;

                        const associatedCommand = resolveFavoriteCommandForResult(result);
                        const responseContext = buildPostResponseContext(result);
                        const postResponseExecution = associatedCommand?.postResponseScript?.trim()
                          ? executePostResponseScript(associatedCommand.postResponseScript, responseContext)
                          : null;

                        return (
                          <details key={`result-${group.endpoint}-${result.rowNumber}`} className={`result-card ${result.ok ? 'result-ok' : 'result-error'}`}>
                            <summary className="result-summary">
                              <div className="result-meta">
                                <strong>GET {result.row.rowNumber}</strong>
                                <span>{result.method}</span>
                                <span>
                                  {result.status} {result.statusText}
                                </span>
                                <span>{result.durationMs} ms</span>
                              </div>
                            </summary>

                            {renderResultVisualSummary(result)}

                            {associatedCommand ? (
                              <div className="post-response-script-panel">
                                <div className="post-response-script-header">
                                  <strong>Post-respuesta ({associatedCommand.command})</strong>
                                  <div className="action-row">
                                    <button
                                      type="button"
                                      className="ghost-button"
                                      onClick={() => generateSampleScriptForCommand(associatedCommand, responseContext)}
                                    >
                                      Generar sample script
                                    </button>
                                    {associatedCommand.postResponseScript?.trim() ? (
                                      <button
                                        type="button"
                                        className="ghost-button"
                                        onClick={() => editActiveScriptForCommand(associatedCommand, responseContext)}
                                      >
                                        Editar script activo
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                {postResponseExecution ? (
                                  postResponseExecution.error ? (
                                    <p className="result-error-hint">Script error: {postResponseExecution.error}</p>
                                  ) : (
                                    renderPostResponseOutput(postResponseExecution.output, associatedCommand.id)
                                  )
                                ) : (
                                  <p className="muted-small">Este comando no tiene script post-respuesta. Puedes generar un sample o editarlo en Favoritos.</p>
                                )}
                              </div>
                            ) : null}

                            <div className="result-detail-grid">
                              <div>
                                <h3>Request</h3>
                                <pre>{formatJson(result.requestPreview)}</pre>
                              </div>
                              <div>
                                <h3>Response</h3>
                                <div className="result-response-actions">
                                  {shouldTruncate ? (
                                    <button type="button" className="ghost-button" onClick={() => toggleGetResponseExpanded(responseKey)}>
                                      {isExpanded ? 'Mostrar menos' : `Mostrar mas (${responseLineCount} lineas)`}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="ghost-button"
                                    onClick={() => {
                                      void copyTextToClipboard(responseText).then((copied) => {
                                        if (copied) {
                                          setStatusMessage('Respuesta copiada al portapapeles.');
                                        } else {
                                          setStatusMessage('No se pudo copiar la respuesta al portapapeles.');
                                        }
                                      });
                                    }}
                                  >
                                    Copiar respuesta
                                  </button>
                                </div>
                                <pre>{visibleResponseText}</pre>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  ))
                : results.map((result) => (
                    <details key={`result-${result.rowNumber}`} className={`result-card ${result.ok ? 'result-ok' : 'result-error'}`}>
                      <summary className="result-summary">
                        <div className="result-meta">
                          <strong>Fila {result.row.rowNumber}</strong>
                          <span>{result.method}</span>
                          <span>
                            {result.status} {result.statusText}
                          </span>
                          <span>{result.durationMs} ms</span>
                        </div>
                      </summary>

                      {renderResultVisualSummary(result)}

                      <div className="result-detail-grid">
                        <div>
                          <h3>Request</h3>
                          <pre>{formatJson(result.requestPreview)}</pre>
                        </div>
                        <div>
                          <h3>Response</h3>
                          <pre>
                            {formatJson({
                              finalUrl: result.finalUrl,
                              headers: result.responseHeaders,
                              body: result.responseBody,
                              errorDetail: result.errorDetail,
                              tuple: result.row.cells,
                            })}
                          </pre>
                        </div>
                      </div>
                    </details>
                  ))}
            </div>
          )}
        </section>
          </>
        ) : activeSection === 'history' ? (
          <>
            <section className="panel action-panel">
              <div>
                <h2>Historial de solicitudes</h2>
              </div>

              <div className="action-row">
                <input
                  className="history-search-input"
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Buscar por nombre, URL o estado"
                  aria-label="Buscar en el historial"
                />
                <select value={historyMethodFilter} onChange={(event) => setHistoryMethodFilter(event.target.value as 'ALL' | HttpMethod)} aria-label="Filtrar historial por metodo">
                  <option value="ALL">Todos</option>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
                <button type="button" className="secondary-button" onClick={() => historyImportInputRef.current?.click()}>
                  Importar JSON
                </button>
                <button type="button" className="primary-button" onClick={exportHistory} disabled={requestHistory.length === 0}>
                  Exportar JSON
                </button>
                <button type="button" className="ghost-button" onClick={clearHistory} disabled={requestHistory.length === 0}>
                  Vaciar historial
                </button>
              </div>
            </section>

            <section className="panel results-panel">
              <div className="panel-header">
                <h2>Consultas registradas</h2>
                <span>{filteredHistory.length} elemento(s)</span>
              </div>

              {filteredHistory.length === 0 ? (
                <p className="muted">Todavia no hay solicitudes guardadas. Ejecuta una consulta o importa una coleccion JSON.</p>
              ) : (
                <div className="history-list">
                  {filteredHistory.map((entry) => (
                    <article key={entry.id} className="history-card">
                      <div className="favorite-match-card favorite-summary-card">
                        <div className="favorite-match-header">
                          <span className="favorite-description-label" title={entry.name}>{entry.name}</span>
                          <div className="chip-row favorite-summary-badges">
                            <span className="chip">{entry.method}</span>
                            <span className="chip">{entry.origin === 'collection-import' ? 'Importado' : 'Enviado'}</span>
                          </div>
                        </div>
                        <div className="favorite-match-button favorite-summary-surface">
                          <span className="favorite-match-url">{entry.finalUrl ?? entry.url}</span>
                        </div>
                      </div>

                      <div className="panel-header history-card-header">
                        <p className="muted-small">{formatHistoryDate(entry.sentAt)}</p>

                        <div className="action-row">
                          <button type="button" className="secondary-button" onClick={() => applyHistoryEntry(entry)}>
                            Cargar en inicio
                          </button>
                          {showFavoriteRequestsSection ? (
                            <button type="button" className="ghost-button" onClick={() => saveHistoryEntryAsFavorite(entry)}>
                              Guardar favorito
                            </button>
                          ) : null}
                          <button type="button" className="ghost-button" onClick={() => removeHistoryEntry(entry.id)}>
                            Eliminar
                          </button>
                        </div>
                      </div>

                      <div className="history-meta-grid">
                        <div className="history-meta-card">
                          <span>Estado</span>
                          <strong>
                            {entry.status !== undefined
                              ? `${entry.status}${entry.statusText ? ` ${entry.statusText}` : ''}`
                              : entry.origin === 'collection-import'
                                ? 'Importado'
                                : 'Sin respuesta'}
                          </strong>
                        </div>
                        <div className="history-meta-card">
                          <span>Tiempo</span>
                          <strong>{entry.durationMs !== undefined ? `${entry.durationMs} ms` : '-'}</strong>
                        </div>
                        <div className="history-meta-card history-meta-card-wide">
                          <span>URL</span>
                          <strong>{entry.finalUrl ?? entry.url}</strong>
                        </div>
                      </div>

                      <div className="result-detail-grid">
                        <div>
                          <h3>Request</h3>
                          <pre>
                            {formatJson({
                              method: entry.method,
                              url: entry.url,
                              headers: entry.headers,
                              query: entry.query,
                              bodyMode: entry.bodyMode,
                              body: entry.body,
                            })}
                          </pre>
                        </div>
                        <div>
                          <h3>Contexto guardado</h3>
                          <pre>
                            {formatJson({
                              origin: entry.origin,
                              row: entry.row ?? null,
                              ok: entry.ok ?? null,
                              errorDetail: entry.errorDetail ?? null,
                            })}
                          </pre>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}

        {activeSection === 'favorites' ? (
          <>
            <section className="panel action-panel">
              <div>
                <h2>Favoritos</h2>
                <p>Gestiona endpoints conocidos reutilizables.</p>
              </div>
              <div className="action-row">
                <button type="button" className="secondary-button" onClick={() => favoriteBaseEndpointsImportInputRef.current?.click()}>
                  Importar endpoints base favoritos JSON
                </button>
                <button type="button" className="primary-button" onClick={exportFavoriteBaseEndpoints} disabled={favoriteBaseEndpoints.length === 0}>
                  Exportar endpoints base favoritos JSON
                </button>
                <button type="button" className="secondary-button" onClick={() => favoriteCommandsImportInputRef.current?.click()}>
                  Importar comandos favoritos JSON
                </button>
                <button type="button" className="primary-button" onClick={exportFavoriteCommands} disabled={favoriteCommands.length === 0}>
                  Exportar comandos favoritos JSON
                </button>
                {showFavoriteRequestsSection ? (
                  <>
                    <button type="button" className="secondary-button" onClick={() => favoriteRequestsImportInputRef.current?.click()}>
                      Importar peticiones favoritas JSON
                    </button>
                    <button type="button" className="primary-button" onClick={exportFavoriteRequests} disabled={favoriteRequests.length === 0}>
                      Exportar peticiones favoritas JSON
                    </button>
                  </>
                ) : null}
              </div>
            </section>

            <section className="panel split-layout">
              <article className="preview-panel">
                <div className="panel-header">
                  <h2>Endpoints base favoritos</h2>
                  <span>{contextualFavoriteBaseEndpoints.length}</span>
                </div>
                {contextualFavoriteBaseEndpoints.length === 0 ? (
                  <p className="muted">No hay endpoints base favoritos para este entorno.</p>
                ) : (
                  <div className="history-list">
                    {contextualFavoriteBaseEndpoints.map((entry) => (
                      <article key={entry.id} className="history-card">
                        <div className="history-card-title">
                          <input
                            value={entry.name}
                            onChange={(event) => renameFavoriteBaseEndpoint(entry.id, event.target.value)}
                            onBlur={() => commitFavoriteBaseEndpointName(entry.id)}
                            maxLength={40}
                            aria-label={`Nombre del endpoint base favorito ${entry.baseUrl}`}
                          />
                          <input
                            value={entry.baseUrl}
                            onChange={(event) => setFavoriteBaseEndpoints((current) => current.map((candidate) => (candidate.id === entry.id ? { ...candidate, baseUrl: normalizeFavoriteBaseEndpoint(event.target.value) } : candidate)))}
                            aria-label={`Endpoint base favorito ${entry.baseUrl}`}
                          />
                        </div>
                        <div className="action-row">
                          <button type="button" className="secondary-button" onClick={() => setBaseEndpoint(entry.baseUrl)}>
                            Usar como base
                          </button>
                          <button type="button" className="ghost-button" onClick={() => setFavoriteBaseEndpoints((current) => current.filter((candidate) => candidate.id !== entry.id))}>
                            Quitar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </article>

              <article className="preview-panel">
                <div className="panel-header">
                  <h2>Comandos favoritos</h2>
                  <span>{contextualFavoriteCommands.length}</span>
                </div>
                {contextualFavoriteCommands.length === 0 ? (
                  <p className="muted">No hay comandos favoritos para este metodo y entorno.</p>
                ) : (
                  <div className="history-list">
                    {contextualFavoriteCommands.map((entry) => {
                      const latestResult = findLatestGetResultForCommand(entry);

                      return (
                        <article key={entry.id} className="history-card">
                          <div className="history-card-title">
                            <input
                              value={entry.name}
                              onChange={(event) => renameFavoriteCommand(entry.id, event.target.value)}
                              onBlur={() => commitFavoriteCommandName(entry.id)}
                              maxLength={40}
                              aria-label={`Nombre del comando favorito ${entry.command}`}
                            />
                            <input
                              value={entry.command}
                              onChange={(event) => setFavoriteCommands((current) => current.map((candidate) => (candidate.id === entry.id ? { ...candidate, command: normalizeFavoriteCommand(event.target.value) } : candidate)))}
                              aria-label={`Comando favorito ${entry.command}`}
                            />
                          </div>

                          {entry.method === 'POST' ? (
                            <label className="field stretch-full">
                              <span>RAW por defecto del comando</span>
                              <textarea
                                value={entry.defaultRawBody ?? ''}
                                onChange={(event) => setFavoriteCommands((current) => current.map((candidate) => (
                                  candidate.id === entry.id ? { ...candidate, defaultRawBody: event.target.value } : candidate
                                )))}
                                rows={4}
                                spellCheck={false}
                                placeholder="Contenido RAW que se aplicara al usar este comando en POST"
                                aria-label={`RAW por defecto para ${entry.command}`}
                              />
                            </label>
                          ) : null}

                          <label className="field stretch-full">
                            <span>Script post-respuesta</span>
                            <textarea
                              value={entry.postResponseScript ?? ''}
                              onChange={(event) => setFavoriteCommands((current) => current.map((candidate) => (candidate.id === entry.id ? { ...candidate, postResponseScript: event.target.value } : candidate)))}
                              rows={8}
                              placeholder="return { id: helpers.get('id') };"
                              aria-label={`Script post-respuesta para ${entry.command}`}
                            />
                          </label>

                          <div className="action-row">
                            <button type="button" className="secondary-button" onClick={() => applyFavoriteCommand(entry)}>
                              Usar como comando
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => {
                                if (!latestResult) {
                                  setStatusMessage(`No hay respuesta GET reciente asociada a ${entry.command} para generar un sample.`);
                                  return;
                                }

                                generateSampleScriptForCommand(entry, buildPostResponseContext(latestResult));
                              }}
                            >
                              Generar sample script
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => {
                                if (!latestResult) {
                                  setStatusMessage(`No hay respuesta GET reciente asociada a ${entry.command} para editar el script.`);
                                  return;
                                }

                                editActiveScriptForCommand(entry, buildPostResponseContext(latestResult));
                              }}
                              disabled={!(entry.postResponseScript?.trim())}
                            >
                              Editar script activo
                            </button>
                            <button type="button" className="ghost-button" onClick={() => setFavoriteCommands((current) => current.filter((candidate) => candidate.id !== entry.id))}>
                              Quitar
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>
            </section>

            <section className={`panel${showFavoriteRequestsSection ? ' split-layout' : ''}`}>
              <article className="preview-panel">
                <div className="panel-header">
                  <h2>Endpoints favoritos</h2>
                  <span>{filteredFavoriteEndpoints.length}</span>
                </div>
                <div className="action-row">
                  <input
                    value={favoriteEndpointSearch}
                    onChange={(event) => setFavoriteEndpointSearch(event.target.value)}
                    placeholder="Buscar endpoint favorito"
                    aria-label="Buscar endpoint favorito"
                  />
                  <select
                    value={favoriteEndpointMethodFilter}
                    onChange={(event) => setFavoriteEndpointMethodFilter(event.target.value as 'ALL' | HttpMethod)}
                    aria-label="Filtrar favoritos por metodo"
                  >
                    <option value="ALL">Todos los metodos</option>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                  <select
                    value={favoriteEndpointEnvironmentFilter}
                    onChange={(event) => setFavoriteEndpointEnvironmentFilter(event.target.value as 'ALL' | FavoriteEnvironment)}
                    aria-label="Filtrar favoritos por entorno"
                  >
                    <option value="ALL">Todos los entornos</option>
                    <option value="DEV">DEV</option>
                    <option value="PROD">PROD</option>
                    <option value="QA">QA</option>
                  </select>
                </div>
                {filteredFavoriteEndpoints.length === 0 ? (
                  <p className="muted">No hay endpoints favoritos que coincidan.</p>
                ) : (
                  <div className="history-list">
                    {filteredFavoriteEndpoints.map((entry) => (
                      <article key={entry.id} className="history-card">
                        <div className="favorite-match-card favorite-summary-card">
                          <div className="favorite-match-header">
                            <button
                              type="button"
                              className="favorite-description-button"
                              onClick={() => openFavoriteDescriptionDialog(entry)}
                              title={entry.description || 'Anadir descripcion REST'}
                            >
                              {entry.description || 'Anadir descripcion REST'}
                            </button>
                            <div className="chip-row favorite-summary-badges">
                              <span className="chip">{entry.method}</span>
                              <span className={`env-badge env-badge-${entry.environment.toLowerCase()}`}>{entry.environment}</span>
                            </div>
                          </div>
                          <div className="favorite-match-button favorite-summary-surface">
                            <span className="favorite-match-url">{entry.url}</span>
                          </div>
                        </div>

                        <div className="history-card-title">
                          <input
                            value={entry.name}
                            onChange={(event) => renameFavoriteEndpoint(entry.id, event.target.value)}
                            onBlur={() => commitFavoriteEndpointName(entry.id)}
                            maxLength={40}
                            aria-label={`Nombre del endpoint favorito ${entry.url}`}
                          />
                          <input
                            value={entry.description}
                            onChange={(event) => updateFavoriteEndpointDescription(entry.id, event.target.value)}
                            onBlur={() => clampFavoriteEndpointDescription(entry.id)}
                            placeholder="Descripcion para agrupar REST"
                            aria-label={`Descripcion del endpoint favorito ${entry.url}`}
                          />
                          <select value={entry.method} onChange={(event) => setFavoriteEndpoints((current) => current.map((candidate) => (candidate.id === entry.id ? { ...candidate, method: event.target.value as HttpMethod } : candidate)))} aria-label={`Metodo del endpoint favorito ${entry.url}`}>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                          </select>
                          <select value={entry.environment} onChange={(event) => setFavoriteEndpointEnvironment(entry.id, event.target.value as FavoriteEnvironment)} aria-label={`Entorno del endpoint favorito ${entry.url}`}>
                            <option value="DEV">DEV</option>
                            <option value="PROD">PROD</option>
                            <option value="QA">QA</option>
                          </select>
                        </div>
                        <div className="action-row">
                          <button type="button" className="secondary-button" onClick={() => applyFavoriteEndpoint(entry.url, entry.method)}>
                            Cargar en endpoint {entry.method}
                          </button>
                          <button type="button" className="ghost-button" onClick={() => setFavoriteEndpoints((current) => current.filter((candidate) => candidate.id !== entry.id))}>
                            Quitar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </article>

              {showFavoriteRequestsSection ? (
                <article className="preview-panel">
                  <div className="panel-header">
                    <h2>Peticiones favoritas completas</h2>
                    <span>{filteredFavoriteRequests.length}</span>
                  </div>
                  {filteredFavoriteRequests.length === 0 ? (
                    <p className="muted">No hay peticiones favoritas que coincidan.</p>
                  ) : (
                    <div className="history-list">
                      {filteredFavoriteRequests.map((entry) => (
                        <article key={entry.id} className="history-card">
                          <div className="favorite-match-card favorite-summary-card">
                            <div className="favorite-match-header">
                              <span
                                className="favorite-description-label"
                                title={entry.description || 'Descripcion para agrupar REST'}
                              >
                                {entry.description || 'Descripcion para agrupar REST'}
                              </span>
                              <div className="chip-row favorite-summary-badges">
                                <span className="chip">{entry.method}</span>
                                <span className={`env-badge env-badge-${entry.environment.toLowerCase()}`}>{entry.environment}</span>
                                <span className="chip">{entry.source === 'history' ? 'Desde historial' : 'Desde inicio'}</span>
                              </div>
                            </div>
                            <div className="favorite-match-button favorite-summary-surface">
                              <span className="favorite-match-url">{entry.url}</span>
                            </div>
                          </div>

                          <div className="history-card-title">
                            <input
                              value={entry.name}
                              onChange={(event) => renameFavoriteRequest(entry.id, event.target.value)}
                              onBlur={() => commitFavoriteRequestName(entry.id)}
                              maxLength={40}
                              aria-label={`Nombre de la peticion favorita ${entry.url}`}
                            />
                            <input
                              value={entry.description}
                              onChange={(event) => updateFavoriteRequestDescription(entry.id, event.target.value)}
                              onBlur={() => clampFavoriteRequestDescription(entry.id)}
                              placeholder="Descripcion para agrupar REST"
                              aria-label={`Descripcion de la peticion favorita ${entry.url}`}
                            />
                            {renderDescriptionCounter(entry.description)}
                            <select value={entry.environment} onChange={(event) => setFavoriteRequestEnvironment(entry.id, event.target.value as FavoriteEnvironment)} aria-label={`Entorno de la peticion favorita ${entry.name}`}>
                              <option value="DEV">DEV</option>
                              <option value="PROD">PROD</option>
                              <option value="QA">QA</option>
                            </select>
                            <p className="muted-small">{entry.url}</p>
                          </div>
                          <div className="action-row">
                            <button type="button" className="secondary-button" disabled={isSending} onClick={() => requestExecuteFavorite(entry)}>
                              Repetir con confirmacion
                            </button>
                            <button type="button" className="ghost-button" onClick={() => applyFavoriteRequest(entry)}>
                              Cargar en inicio
                            </button>
                            <button type="button" className="ghost-button" onClick={() => removeFavoriteRequest(entry.id)}>
                              Eliminar
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>
              ) : null}
            </section>
          </>
        ) : null}

        {confirmDialog ? (
          <div className="modal-backdrop" role="presentation" onClick={closeConfirmDialog}>
            <section
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="panel-header">
                <h2 id="confirm-dialog-title">{confirmDialog.title}</h2>
              </div>
              <p>{confirmDialog.description}</p>
              <ul className="flat-list confirm-detail-list">
                {confirmDialog.detailLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {confirmDialog.sessionKey ? (
                <label className="checkbox-field confirm-session-checkbox">
                  <input
                    type="checkbox"
                    checked={skipCurrentDialogForSession}
                    onChange={(event) => setSkipCurrentDialogForSession(event.target.checked)}
                  />
                  <span>No volver a preguntar durante esta sesion</span>
                </label>
              ) : null}
              <div className="action-row confirm-actions">
                <button type="button" className="ghost-button" onClick={closeConfirmDialog}>
                  Cancelar
                </button>
                <button type="button" className="primary-button" onClick={confirmDialogAction}>
                  {confirmDialog.confirmLabel}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {endpointParamGroupDialog ? (
          <div className="modal-backdrop" role="presentation" onClick={closeEndpointParamGroupDialog}>
            <section
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="endpoint-param-group-dialog-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="panel-header">
                <h2 id="endpoint-param-group-dialog-title">Anadir grupo de parametros</h2>
              </div>
              <p>
                Pega una lista (una linea por valor). Se creara una nueva tupla por cada valor para el mismo endpoint/comando.
              </p>
              <label className="field">
                <span>Parametro objetivo</span>
                <select
                  value={endpointParamGroupDialog.selectedToken}
                  onChange={(event) => {
                    const token = event.target.value;
                    setEndpointParamGroupDialog((current) => {
                      if (!current) {
                        return current;
                      }

                      return {
                        ...current,
                        selectedToken: token,
                      };
                    });
                  }}
                >
                  {endpointParamGroupDialog.tokens.map((token) => (
                    <option key={`endpoint-param-group-token-${token}`} value={token}>{`{{${token}}}`}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Bloque de valores</span>
                <textarea
                  rows={8}
                  value={endpointParamGroupDialog.blockText}
                  onChange={(event) => {
                    const nextText = event.target.value;
                    setEndpointParamGroupDialog((current) => {
                      if (!current) {
                        return current;
                      }

                      return {
                        ...current,
                        blockText: nextText,
                      };
                    });
                  }}
                  placeholder={'201619339415213110226020\n200218039422587040226021\n...'}
                  autoFocus
                />
              </label>
              <div className="action-row confirm-actions">
                <button type="button" className="ghost-button" onClick={closeEndpointParamGroupDialog}>
                  Cancelar
                </button>
                <button type="button" className="primary-button" onClick={applyEndpointParamGroupDialog}>
                  Generar tuplas
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {sampleScriptDialog ? (
          <div className="modal-backdrop" role="presentation" onClick={closeSampleScriptDialog}>
            <section
              className="confirm-dialog sample-script-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sample-script-dialog-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="panel-header">
                <h2 id="sample-script-dialog-title">{sampleScriptDialog.mode === 'edit' ? 'Editar script activo' : 'Generar sample script'}</h2>
                <span>{sampleScriptDialog.commandLabel}</span>
              </header>

              <p className="muted-small">
                Selecciona campos de meta, headers y body para crear un script de visualizacion dinamica en formato tabla.
              </p>

              <div className="sample-script-quick-actions">
                <button type="button" className="ghost-button" onClick={() => selectSampleScriptPathsByPrefix('meta.')}>Solo meta</button>
                <button type="button" className="ghost-button" onClick={() => selectSampleScriptPathsByPrefix('headers.')}>Solo headers</button>
                <button type="button" className="ghost-button" onClick={() => selectSampleScriptPathsByPrefix('body.')}>Solo body</button>
              </div>

              <label className="sample-script-select-all">
                <input
                  type="checkbox"
                  checked={sampleScriptDialog.selectedPaths.length === sampleScriptDialog.suggestedPaths.length && sampleScriptDialog.suggestedPaths.length > 0}
                  onChange={toggleAllSampleScriptPaths}
                />
                <span>{sampleScriptDialog.selectedPaths.length === sampleScriptDialog.suggestedPaths.length && sampleScriptDialog.suggestedPaths.length > 0 ? 'Deseleccionar todos' : 'Seleccionar todos'}</span>
              </label>

              <div className="sample-script-path-list">
                {sampleScriptDialog.suggestedPaths.map((path) => {
                  const checked = sampleScriptDialog.selectedPaths.includes(path);
                  const previewValue = formatPathPreviewValue(sampleScriptDialog.context, path);

                  return (
                    <label key={`sample-script-path-${path}`} className={`sample-script-path-item${checked ? ' sample-script-path-item-selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSampleScriptPath(path)}
                      />
                      <span className="sample-script-path-name">{path}</span>
                      <small className="sample-script-path-preview" title={previewValue}>{previewValue}</small>
                    </label>
                  );
                })}
              </div>

              <div className="action-row confirm-actions">
                <button type="button" className="ghost-button" onClick={closeSampleScriptDialog}>
                  Cancelar
                </button>
                <button type="button" className="primary-button" onClick={saveSampleScriptDialog}>
                  {sampleScriptDialog.mode === 'edit' ? 'Guardar cambios del script' : 'Generar script'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {descriptionDialog ? (
          <div className="modal-backdrop" role="presentation" onClick={closeFavoriteDescriptionDialog}>
            <section
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="description-dialog-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="panel-header">
                <h2 id="description-dialog-title">{descriptionDialog.title}</h2>
              </div>
              <p>Define una descripcion corta para agrupar este REST desde la pantalla de inicio.</p>
              <label className="field">
                <span>Descripcion REST</span>
                <input
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  placeholder="Ej.: Aisles, Devices, Orders..."
                  autoFocus
                />
                {renderDescriptionCounter(descriptionDraft)}
              </label>
              <div className="action-row confirm-actions">
                <button type="button" className="ghost-button" onClick={closeFavoriteDescriptionDialog}>
                  Cancelar
                </button>
                <button type="button" className="primary-button" onClick={saveFavoriteDescriptionDialog}>
                  Guardar descripcion
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default App;



