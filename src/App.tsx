import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { BodyMode, DispatchResult, HttpMethod, ImportedRow, PostRequestPayload, RequestPreview, SecretDescriptor, SecretScope } from './types';

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

type TemplateMode = 'keep-secret-placeholders' | 'mask-secrets';
type AuthorizationScheme = 'NONE' | 'BASIC';

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
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

function pickPreferredSecretKey(candidates: string[], available: string[]): string {
  const availableSet = new Set(available.map((item) => item.toUpperCase()));
  const preferred = candidates.find((candidate) => availableSet.has(candidate.toUpperCase()));

  if (preferred) {
    const match = available.find((item) => item.toUpperCase() === preferred.toUpperCase());
    return match ?? available[0] ?? '';
  }

  return available[0] ?? '';
}

function App() {
  const [method, setMethod] = useState<HttpMethod>('POST');
  const [bodyMode, setBodyMode] = useState<BodyMode>('RAW');
  const [endpoint, setEndpoint] = useState('https://httpbin.org/anything');
  const [getEndpointTuples, setGetEndpointTuples] = useState<string[]>(['https://httpbin.org/get']);
  const [selectedGetEndpointIndex, setSelectedGetEndpointIndex] = useState(0);
  const [headersText, setHeadersText] = useState(defaultHeaders);
  const [queryText, setQueryText] = useState(defaultQuery);
  const [bodyTemplateText, setBodyTemplateText] = useState(defaultBodyTemplate);
  const [rawDelimiter, setRawDelimiter] = useState('|');
  const [firstRowAsHeaders, setFirstRowAsHeaders] = useState(false);
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [fileName, setFileName] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [results, setResults] = useState<DispatchResult[]>([]);
  const [statusMessage, setStatusMessage] = useState('Importa un Excel o CSV para comenzar.');
  const [savedSecrets, setSavedSecrets] = useState<SecretDescriptor[]>([]);
  const [secretName, setSecretName] = useState('API_TOKEN');
  const [secretScope, setSecretScope] = useState<SecretScope>('temporary');
  const [authorizationScheme, setAuthorizationScheme] = useState<AuthorizationScheme>('NONE');
  const [basicAuthUsernameSecretKey, setBasicAuthUsernameSecretKey] = useState('');
  const [basicAuthPasswordSecretKey, setBasicAuthPasswordSecretKey] = useState('');
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
  const [isSending, setIsSending] = useState(false);
  const [isTestingConnectivity, setIsTestingConnectivity] = useState(false);
  const [dispatchErrors, setDispatchErrors] = useState<string[]>([]);

  const stopRequestedRef = useRef(false);
  const secretValueRef = useRef<HTMLInputElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const resultsPanelRef = useRef<HTMLElement | null>(null);

  const previewRow = rows[selectedRowIndex] ?? null;
  const previewRawBody = previewRow ? buildRawBody(previewRow.cells, rawDelimiter) : '';
  const selectedGetEndpoint = getEndpointTuples[selectedGetEndpointIndex] ?? '';
  const savedSecretKeys = useMemo(() => savedSecrets.map((secret) => secret.key), [savedSecrets]);
  const savedSecretsByKey = useMemo(
    () => Object.fromEntries(savedSecrets.map((secret) => [secret.key, secret.scope] as const)),
    [savedSecrets],
  );
  const csvColumns = rows[0] ? Object.keys(rows[0].fields) : [];

  const expectedVariables = useMemo(
    () =>
      method === 'GET'
        ? []
        :
      extractPlaceholders(
        endpoint,
        headersText,
        queryText,
        ...(method === 'POST' && bodyMode === 'JSON' ? [bodyTemplateText] : []),
      ),
    [bodyMode, bodyTemplateText, endpoint, headersText, method, queryText],
  );

  useEffect(() => {
    if (!window.postais?.listSecrets) {
      return;
    }

    window.postais.listSecrets().then(setSavedSecrets).catch(() => {
      setSavedSecrets([]);
    });
  }, []);

  useEffect(() => {
    if (savedSecretKeys.length === 0) {
      return;
    }

    const preferredUser = pickPreferredSecretKey(['POST_USER', 'USERNAME', 'USER'], savedSecretKeys);
    const preferredPass = pickPreferredSecretKey(['POST_PASS', 'PASSWORD', 'PASS'], savedSecretKeys);

    if (!basicAuthUsernameSecretKey || !savedSecretKeys.includes(basicAuthUsernameSecretKey)) {
      setBasicAuthUsernameSecretKey(preferredUser);
    }

    if (!basicAuthPasswordSecretKey || !savedSecretKeys.includes(basicAuthPasswordSecretKey)) {
      setBasicAuthPasswordSecretKey(preferredPass);
    }
  }, [basicAuthPasswordSecretKey, basicAuthUsernameSecretKey, savedSecretKeys]);

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

  function createRequestPreview(row: ImportedRow, endpointOverride?: string): RequestPreview {
    const parsedHeaders = method === 'GET' ? {} : parseJsonInput(headersText, 'Las cabeceras');
    const parsedQuery = method === 'GET' ? {} : parseJsonInput(queryText, 'Los query params');
    const parsedBody = method === 'POST' && bodyMode === 'JSON' ? parseJsonInput(bodyTemplateText, 'El body') : undefined;
    const endpointSource = endpointOverride ?? endpoint;
    const finalUrl = new URL(applyStringTemplate(endpointSource, row.fields, 'mask-secrets'));
    const query = normalizeStringMap(applyValueTemplate(parsedQuery, row.fields, 'mask-secrets'), 'Los query params');

    Object.entries(query).forEach(([key, value]) => {
      finalUrl.searchParams.set(key, value);
    });

    const headers = applyAuthorizationToHeaders(
      normalizeStringMap(applyValueTemplate(parsedHeaders, row.fields, 'mask-secrets'), 'Las cabeceras'),
      'mask-secrets',
    );

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
            ? buildRawBody(row.cells, rawDelimiter)
            : parsedBody === undefined
              ? undefined
              : applyValueTemplate(parsedBody, row.fields, 'mask-secrets'),
    };
  }

  function buildPayload(row: ImportedRow, endpointOverride?: string): PostRequestPayload {
    const parsedHeaders = method === 'GET' ? {} : parseJsonInput(headersText, 'Las cabeceras');
    const parsedQuery = method === 'GET' ? {} : parseJsonInput(queryText, 'Los query params');
    const parsedBody = method === 'POST' && bodyMode === 'JSON' ? parseJsonInput(bodyTemplateText, 'El body') : undefined;
    const endpointSource = endpointOverride ?? endpoint;
    const finalUrl = new URL(applyStringTemplate(endpointSource, row.fields, 'keep-secret-placeholders'));

    const headers = applyAuthorizationToHeaders(
      normalizeStringMap(applyValueTemplate(parsedHeaders, row.fields, 'keep-secret-placeholders'), 'Las cabeceras'),
      'keep-secret-placeholders',
    );

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
            ? buildRawBody(row.cells, rawDelimiter)
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
  }, [bodyMode, bodyTemplateText, endpoint, headersText, method, previewRow, queryText, rawDelimiter]);

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
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
          setRows([]);
          setImportErrors(['El Excel no contiene hojas.']);
          setStatusMessage(`No se pudo importar ${file.name}: el libro no contiene hojas.`);
          return;
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, {
          header: 1,
          defval: '',
          blankrows: false,
        }) as string[][];

        finalizeImportedRows(matrix, file.name, 'Excel');
      } catch (error) {
        setRows([]);
        setImportErrors([error instanceof Error ? error.message : 'No se pudo procesar el Excel.']);
        setStatusMessage(`No se pudo leer el Excel: ${error instanceof Error ? error.message : 'error desconocido'}`);
      }

      return;
    }

    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: ({ data, errors }) => {
        if (errors.length > 0) {
          setRows([]);
          setImportErrors(errors.map((error) => `Fila ${error.row ?? '?'}: ${error.message}`));
          setStatusMessage(`El CSV contiene ${errors.length} error(es). Revisa el formato y vuelve a cargarlo.`);
          return;
        }

        finalizeImportedRows(data, file.name, 'CSV');
      },
      error: (error) => {
        setRows([]);
        setImportErrors([error.message]);
        setStatusMessage(`No se pudo leer el CSV: ${error.message}`);
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
    if (secretValueRef.current) {
      secretValueRef.current.value = '';
    }
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

  function validateBatch(rowsToSend: ImportedRow[]) {
    if (!window.postais?.sendRequest) {
      throw new Error('La API nativa no esta disponible. Ejecuta la app dentro de Electron.');
    }

    if (!endpoint.trim()) {
      throw new Error('Define una URL de destino antes de enviar.');
    }

    if (rowsToSend.length === 0) {
      throw new Error('No hay filas importadas para enviar.');
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

    const missingColumns = expectedVariables.filter((column) => !csvColumns.includes(column));

    if (missingColumns.length > 0) {
      throw new Error(`Faltan columnas requeridas en el archivo importado: ${missingColumns.join(', ')}.`);
    }

    if (savedSecretKeys.length === 0 && [endpoint, headersText, queryText, ...(bodyMode === 'JSON' ? [bodyTemplateText] : [])].some((source) => source.includes('{{secret:'))) {
      throw new Error('Hay placeholders privados definidos pero no existe ninguna variable privada cargada.');
    }

    createRequestPreview(rowsToSend[0]);
  }

  async function dispatchRows(targetRows: ImportedRow[]) {
    try {
      validateBatch(targetRows);
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

      for (const [index, row] of targetRows.entries()) {
        if (stopRequestedRef.current) {
          setStatusMessage(`Envio detenido. ${nextResults.length} filas procesadas.`);
          break;
        }

        setStatusMessage(`Enviando fila ${index + 1} de ${targetRows.length}...`);

        let requestPreview: RequestPreview;
        let payload: PostRequestPayload;

        try {
          requestPreview = createRequestPreview(row);
          payload = buildPayload(row);
        } catch (error) {
          const templateError = error instanceof Error ? error.message : 'Error de plantilla';
          collectedErrors.push(`Fila ${row.rowNumber}: ${templateError}`);
          nextResults.push({
            ok: false,
            method,
            status: 0,
            statusText: 'Template Error',
            durationMs: 0,
            finalUrl: endpoint,
            responseBody: templateError,
            responseHeaders: {},
            errorDetail: templateError,
            rowNumber: index + 1,
            row,
            requestPreview: {
              method,
              url: endpoint,
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

        if (!response.ok) {
          collectedErrors.push(
            `Fila ${row.rowNumber}: ${response.errorDetail ?? `HTTP ${response.status} ${response.statusText}`}`,
          );
          setDispatchErrors([...new Set(collectedErrors)]);
        }

        if (!response.ok && stopOnError) {
          setStatusMessage(`Proceso detenido por error en la fila ${index + 1}.`);
          break;
        }

        if (delayMs > 0 && index < targetRows.length - 1) {
          await delay(delayMs);
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

        if (!response.ok) {
          collectedErrors.push(`GET ${index + 1}: ${response.errorDetail ?? `${response.status} ${response.statusText}`}`);
          setDispatchErrors([...new Set(collectedErrors)]);
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
      return next;
    });
  }

  async function testConnectivity() {
    const postais = window.postais;
    if (!postais) {
      setStatusMessage('La API nativa no esta disponible. Ejecuta la app dentro de Electron.');
      return;
    }

    const connectivityEndpoint = method === 'GET' ? selectedGetEndpoint : endpoint;

    if (!connectivityEndpoint.trim()) {
      setStatusMessage('Define una URL de destino antes de probar conectividad.');
      return;
    }

    const row = previewRow ?? rows[0] ?? { rowNumber: 0, cells: [], fields: {} };
    const safeTimeout = Math.max(3000, Math.min(timeoutMs, 15000));

    setIsTestingConnectivity(true);
    setStatusMessage('Probando conectividad...');

    try {
      const parsedHeaders = method === 'GET' ? {} : parseJsonInput(headersText, 'Las cabeceras');
      const parsedQuery = method === 'GET' ? {} : parseJsonInput(queryText, 'Los query params');
      const finalUrl = new URL(applyStringTemplate(connectivityEndpoint, row.fields, 'keep-secret-placeholders'));
      const headers = applyAuthorizationToHeaders(
        normalizeStringMap(applyValueTemplate(parsedHeaders, row.fields, 'keep-secret-placeholders'), 'Las cabeceras'),
        'keep-secret-placeholders',
      );
      const query = normalizeStringMap(
        applyValueTemplate(parsedQuery, row.fields, 'keep-secret-placeholders'),
        'Los query params',
      );

      const response = await postais.sendRequest({
        method: 'GET',
        url: finalUrl.toString(),
        headers,
        query,
        bodyMode: 'RAW',
        timeoutMs: safeTimeout,
        allowInsecureTls,
      });

      if (response.ok) {
        setStatusMessage(`Conectividad OK (${response.status}) en ${response.durationMs} ms.`);
      } else {
        const message = `Conectividad KO: ${response.errorDetail ?? `${response.status} ${response.statusText}`}`;
        setDispatchErrors([message]);
        setStatusMessage(message);
        scrollToResultsPanel();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo probar conectividad.';
      setDispatchErrors([`Conectividad KO: ${message}`]);
      setStatusMessage(`Conectividad KO: ${message}`);
      scrollToResultsPanel();
    } finally {
      setIsTestingConnectivity(false);
    }
  }

  return (
    <div className="app-shell">
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
          <span className="theme-toggle-icon" aria-hidden="true">🌙</span>
          {isNightMode ? 'Modo claro' : 'Modo noche'}
        </button>

        <div className="status-card">
          <span className="status-label">Estado</span>
          <strong>{statusMessage}</strong>
          <span>{fileName ? `Archivo actual: ${fileName}` : 'Sin archivo cargado'}</span>
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
                  <input ref={secretValueRef} type="password" placeholder="Token..." autoComplete="off" />
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
        <section className="panel grid-panel grid-panel-wide">
          <label className="field compact-field">
            <span>Metodo</span>
            <select value={method} onChange={(event) => setMethod(event.target.value as HttpMethod)}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </label>

          <label className="field compact-field">
            <span>Autenticacion</span>
            <select value={authorizationScheme} onChange={(event) => setAuthorizationScheme(event.target.value as AuthorizationScheme)}>
              <option value="NONE">Sin autenticacion</option>
              <option value="BASIC">Basic Auth</option>
            </select>
          </label>

          <label className="field compact-field">
            <span>Basic Username (variable privada)</span>
            <select
              value={basicAuthUsernameSecretKey}
              onChange={(event) => setBasicAuthUsernameSecretKey(event.target.value)}
              disabled={authorizationScheme !== 'BASIC' || savedSecretKeys.length === 0}
            >
              {savedSecretKeys.length > 0 ? (
                savedSecretKeys.map((key) => (
                  <option key={`basic-user-${key}`} value={key}>
                    {key}
                  </option>
                ))
              ) : (
                <option value="">Sin variables privadas</option>
              )}
            </select>
          </label>

          <label className="field compact-field">
            <span>Basic Password (variable privada)</span>
            <select
              value={basicAuthPasswordSecretKey}
              onChange={(event) => setBasicAuthPasswordSecretKey(event.target.value)}
              disabled={authorizationScheme !== 'BASIC' || savedSecretKeys.length === 0}
            >
              {savedSecretKeys.length > 0 ? (
                savedSecretKeys.map((key) => (
                  <option key={`basic-pass-${key}`} value={key}>
                    {key}
                  </option>
                ))
              ) : (
                <option value="">Sin variables privadas</option>
              )}
            </select>
          </label>

          {method !== 'GET' ? (
            <label className="field compact-field">
              <span>Modo body</span>
              <select value={bodyMode} onChange={(event) => setBodyMode(event.target.value as BodyMode)}>
                <option value="RAW">RAW por fila</option>
                <option value="JSON">JSON templated</option>
              </select>
            </label>
          ) : null}

          {method === 'GET' ? (
            <div className="field stretch-full">
              <span>Endpoints GET por tupla</span>
              <div className="get-tuples-list">
                {getEndpointTuples.map((endpointTuple, index) => (
                  <div key={`get-tuple-${index}`} className="get-tuple-row">
                    <input
                      type="url"
                      value={endpointTuple}
                      onChange={(event) => updateGetEndpointTuple(index, event.target.value)}
                      placeholder="https://api.tu-servicio.com/recurso"
                    />
                    <button type="button" className="ghost-button" onClick={() => setSelectedGetEndpointIndex(index)}>
                      {selectedGetEndpointIndex === index ? 'Tupla activa' : 'Activar'}
                    </button>
                    <button type="button" className="ghost-button" onClick={() => removeGetEndpointTuple(index)} disabled={getEndpointTuples.length === 1}>
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="secondary-button" onClick={addGetEndpointTuple}>+ Agregar endpoint GET</button>
            </div>
          ) : (
            <label className="field stretch-row">
              <span>Endpoint</span>
              <input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.tu-servicio.com/messages" />
            </label>
          )}

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

          {method !== 'GET' ? (
            <>
              <label className="field stretch-row">
                <span>Archivo Excel o CSV</span>
                <input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileImport} />
              </label>

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

          <label className="field checkbox-field">
            <input type="checkbox" checked={stopOnError} onChange={(event) => setStopOnError(event.target.checked)} />
            <span>Detener el lote al primer error</span>
          </label>

          {method !== 'GET' && bodyMode !== 'RAW' ? (
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

          <div className="field stretch-full connectivity-row">
            <button
              type="button"
              className="secondary-button"
              onClick={testConnectivity}
              disabled={isSending || isTestingConnectivity}
            >
              {isTestingConnectivity ? 'Probando conectividad...' : 'Probar conectividad'}
            </button>
          </div>

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
            <span>{rows.length} filas importadas</span>
          </div>

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
        </section>
        ) : null}

        <section className="panel action-panel">
          <div>
            <h2>Protecciones y lote</h2>
            <p>
              {method === 'GET'
                ? `${getEndpointTuples.filter((item) => item.trim() !== '').length} endpoint(s) GET listos para ejecutar.`
                : rows.length > 0
                  ? `${rows.length} filas disponibles. Variables detectadas: ${expectedVariables.join(', ') || 'ninguna'}.`
                  : 'Carga un Excel o CSV para validar columnas y preparar el lote.'}
            </p>
          </div>

          <div className="action-row">
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
                  onClick={() => dispatchGetTuples([selectedGetEndpoint])}
                >
                  Enviar GET activo
                </button>

                <button
                  type="button"
                  className="primary-button"
                  disabled={getEndpointTuples.filter((item) => item.trim() !== '').length === 0 || isSending}
                  onClick={() => dispatchGetTuples(getEndpointTuples)}
                >
                  Enviar lote GET
                </button>
              </>
            ) : (
              <>
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

                <button type="button" className="secondary-button" disabled={rows.length === 0 || isSending} onClick={() => dispatchRows(rows.slice(selectedRowIndex, selectedRowIndex + 1))}>
                  Enviar fila actual
                </button>

                <button type="button" className="primary-button" disabled={rows.length === 0 || isSending} onClick={() => dispatchRows(rows)}>
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

        {method !== 'GET' ? (
        <section className="split-layout split-layout-top">
          <article className="panel preview-panel">
            <div className="panel-header">
              <h2>Preview</h2>
              <span>{previewRow ? `Fila ${previewRow.rowNumber}` : 'Sin datos'}</span>
            </div>
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
          </article>
        </section>
        ) : null}

        <section className="panel results-panel" ref={resultsPanelRef}>
          <div className="panel-header">
            <h2>Resultados detallados</h2>
            <span>{results.length} respuestas registradas</span>
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
                      {group.items.map((result) => (
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
                                })}
                              </pre>
                            </div>
                          </div>
                        </details>
                      ))}
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
      </main>
    </div>
  );
}

export default App;
