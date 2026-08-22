const { app, BrowserWindow, ipcMain, safeStorage, dialog, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

let UndiciAgent = null;
try {
  ({ Agent: UndiciAgent } = require('undici'));
} catch {
  UndiciAgent = null;
}

const isDev = !app.isPackaged;
const diagnosticsEnabled = process.env.POSTAIS_DIAGNOSTIC === '1';
const secretStore = new Map();
const userDataRoot = path.join(app.getPath('appData'), 'PostAIs');
const cacheRoot = path.join(userDataRoot, 'cache');
const legacyRuntimeRoot = path.join(app.getPath('temp'), 'PostAIs-runtime');
const legacySessionDataDir = path.join(legacyRuntimeRoot, 'session');
const legacyCacheDir = path.join(legacyRuntimeRoot, 'cache');
const sessionDataDir = path.join(userDataRoot, 'session');
const cacheDir = path.join(cacheRoot, 'chromium');
const localSecretsFilePath = path.join(userDataRoot, 'secrets.local.json');

fs.mkdirSync(userDataRoot, { recursive: true });
fs.mkdirSync(sessionDataDir, { recursive: true });
fs.mkdirSync(cacheRoot, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

// Migrate Chromium session storage from old temp location to persistent data.
if (fs.existsSync(legacySessionDataDir) && fs.existsSync(sessionDataDir)) {
  const hasPersistentData = fs.readdirSync(sessionDataDir).length > 0;

  if (!hasPersistentData) {
    try {
      fs.cpSync(legacySessionDataDir, sessionDataDir, { recursive: true, force: true });
    } catch (error) {
      console.error('[postais] no se pudo migrar sessionData legado', error instanceof Error ? error.message : error);
    }
  }
}

if (fs.existsSync(legacyCacheDir) && fs.existsSync(cacheDir)) {
  const hasPersistentCache = fs.readdirSync(cacheDir).length > 0;

  if (!hasPersistentCache) {
    try {
      fs.cpSync(legacyCacheDir, cacheDir, { recursive: true, force: true });
    } catch (error) {
      console.error('[postais] no se pudo migrar cache legado', error instanceof Error ? error.message : error);
    }
  }
}

app.setPath('userData', userDataRoot);
app.setPath('sessionData', sessionDataDir);
app.setPath('cache', cacheDir);
app.commandLine.appendSwitch('disk-cache-dir', cacheDir);

function isValidSecretKey(value) {
  return /^[A-Z0-9_\-.]{2,64}$/i.test(value);
}

function normalizeSecretScope(scope) {
  return scope === 'local' ? 'local' : 'temporary';
}

function listSecretDescriptors() {
  return [...secretStore.entries()]
    .map(([key, entry]) => ({
      key,
      scope: entry.scope,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function persistLocalSecrets() {
  const localEntries = [...secretStore.entries()]
    .filter(([, entry]) => entry.scope === 'local')
    .map(([key, entry]) => {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('El cifrado seguro no esta disponible en este equipo.');
      }

      return {
        key,
        value: safeStorage.encryptString(String(entry.value)).toString('base64'),
      };
    });

  const serialized = JSON.stringify(
    {
      version: 1,
      secrets: localEntries,
    },
    null,
    2,
  );

  fs.writeFileSync(localSecretsFilePath, serialized, 'utf8');
}

function hydrateLocalSecrets() {
  if (!fs.existsSync(localSecretsFilePath)) {
    return;
  }

  try {
    const raw = fs.readFileSync(localSecretsFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    const secrets = Array.isArray(parsed?.secrets) ? parsed.secrets : [];

    secrets.forEach((entry) => {
      const key = String(entry?.key ?? '').trim();
      const encoded = String(entry?.value ?? '').trim();

      if (!isValidSecretKey(key) || !encoded) {
        return;
      }

      if (!safeStorage.isEncryptionAvailable()) {
        return;
      }

      const decrypted = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
      secretStore.set(key, { value: decrypted, scope: 'local' });
    });
  } catch (error) {
    console.error('[postais] no se pudieron cargar secretos locales', error instanceof Error ? error.message : error);
  }
}

function resolveSecretString(input) {
  const withBasicAuth = input.replace(/{{\s*basic-auth:([^:{}]+):([^:{}]+)\s*}}/g, (_match, rawUserKey, rawPasswordKey) => {
    const userKey = rawUserKey.trim();
    const passwordKey = rawPasswordKey.trim();

    if (!secretStore.has(userKey)) {
      throw new Error(`Falta la variable privada ${userKey} para Basic Auth (Username).`);
    }

    if (!secretStore.has(passwordKey)) {
      throw new Error(`Falta la variable privada ${passwordKey} para Basic Auth (Password).`);
    }

    const username = String(secretStore.get(userKey).value);
    const password = String(secretStore.get(passwordKey).value);
    return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
  });

  return withBasicAuth.replace(/{{\s*secret:([^{}]+?)\s*}}/g, (_match, rawKey) => {
    const key = rawKey.trim();

    if (!secretStore.has(key)) {
      throw new Error(`Falta la variable privada ${key}.`);
    }

    return secretStore.get(key).value;
  });
}

function resolveSecrets(value) {
  if (typeof value === 'string') {
    return resolveSecretString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveSecrets(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, resolveSecrets(entryValue)]));
  }

  return value;
}

function normalizeTimeout(timeoutMs) {
  const parsed = Number(timeoutMs);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 15000;
  }

  return Math.min(parsed, 120000);
}

function buildNetworkHint(errorCode, tlsBypassEnabled) {
  switch (errorCode) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'No se pudo resolver el host. Revisa DNS, URL y conectividad de red.';
    case 'ECONNREFUSED':
      return 'Conexion rechazada por el servidor. Verifica puerto, endpoint y firewall.';
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
    case 'UND_ERR_HEADERS_TIMEOUT':
      return 'Timeout de red. Aumenta el timeout y valida disponibilidad del servicio.';
    case 'ECONNRESET':
      return 'Conexion reiniciada por el servidor o un intermediario de red.';
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return tlsBypassEnabled
        ? 'TLS inseguro estaba activo pero el handshake sigue fallando. Revisa proxy corporativo, certificado de salida o mTLS requerido por el servicio.'
        : 'Fallo TLS/SSL del certificado. Activa "Permitir TLS autofirmado" para pruebas internas o corrige la cadena de certificados.';
    default:
      return 'Error de red al ejecutar fetch. Revisa proxy, VPN, firewall y endpoint.';
  }
}

function extractNetworkErrorInfo(error, tlsBypassEnabled) {
  const baseMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const cause = error && typeof error === 'object' ? error.cause : null;
  const causeCode = cause && typeof cause === 'object' ? cause.code : null;
  const code = typeof causeCode === 'string' && causeCode ? causeCode : 'UNKNOWN';

  return {
    message: baseMessage,
    code,
    hint: buildNetworkHint(code, tlsBypassEnabled),
  };
}

function createWindow() {
  const windowIconPath = path.join(__dirname, '..', 'assets', 'icons', 'postais-box-wings.png');

  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#060915',
    icon: fs.existsSync(windowIconPath) ? windowIconPath : undefined,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#07091c',
      symbolColor: '#c8d0ff',
      height: 38,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });

  if (diagnosticsEnabled) {
    window.webContents.on('did-finish-load', () => {
      console.log('[postais] did-finish-load', window.webContents.getURL());
    });

    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[postais] did-fail-load', { errorCode, errorDescription, validatedURL });
    });

    window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        console.error('[renderer]', { level, message, line, sourceId });
      }
    });
  }

  if (isDev) {
    window.loadURL('http://localhost:5173');
    return;
  }

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('secrets:set', (_event, payload) => {
  const key = String(payload?.key ?? '').trim();
  const value = String(payload?.value ?? '');
  const scope = normalizeSecretScope(payload?.scope);

  if (!isValidSecretKey(key)) {
    return {
      ok: false,
      secrets: listSecretDescriptors(),
      error: 'La clave debe tener entre 2 y 64 caracteres y solo usar letras, numeros, guion, punto o guion bajo.',
    };
  }

  if (!value) {
    return {
      ok: false,
      secrets: listSecretDescriptors(),
      error: 'El valor privado no puede estar vacio.',
    };
  }

  if (scope === 'local' && !safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      secrets: listSecretDescriptors(),
      error: 'No se puede persistir localmente: el cifrado seguro no esta disponible en este equipo.',
    };
  }

  secretStore.set(key, { value, scope });

  try {
    persistLocalSecrets();
  } catch (error) {
    if (scope === 'local') {
      secretStore.delete(key);
    }

    return {
      ok: false,
      secrets: listSecretDescriptors(),
      error: error instanceof Error ? error.message : 'No se pudo persistir la variable privada local.',
    };
  }

  return {
    ok: true,
    secrets: listSecretDescriptors(),
  };
});

ipcMain.handle('secrets:delete', (_event, payload) => {
  const key = String(payload?.key ?? '').trim();
  secretStore.delete(key);

  try {
    persistLocalSecrets();
  } catch (error) {
    return {
      ok: false,
      secrets: listSecretDescriptors(),
      error: error instanceof Error ? error.message : 'No se pudo actualizar el almacenamiento local.',
    };
  }

  return {
    ok: true,
    secrets: listSecretDescriptors(),
  };
});

ipcMain.handle('secrets:list', () => {
  return listSecretDescriptors();
});

ipcMain.handle('file:saveText', async (_event, payload) => {
  const window = BrowserWindow.getFocusedWindow();
  if (!window) {
    return {
      ok: false,
      canceled: false,
      error: 'No hay ventana activa.',
    };
  }

  const suggestedName = String(payload?.suggestedName ?? 'export.json').trim();
  const title = String(payload?.title ?? 'Guardar archivo').trim();
  const content = String(payload?.content ?? '');

  try {
    const result = await dialog.showSaveDialog(window, {
      title,
      defaultPath: suggestedName,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled) {
      return {
        ok: false,
        canceled: true,
        error: null,
      };
    }

    const filePath = result.filePath;
    if (!filePath) {
      return {
        ok: false,
        canceled: false,
        error: 'No se seleccionó ruta de archivo.',
      };
    }

    fs.writeFileSync(filePath, content, 'utf8');

    return {
      ok: true,
      canceled: false,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    return {
      ok: false,
      canceled: false,
      error: errorMessage,
    };
  }
});

ipcMain.handle('http:request', async (_event, request) => {
  const startedAt = Date.now();
  const method = request.method === 'GET' ? 'GET' : 'POST';
  const timeoutMs = normalizeTimeout(request.timeoutMs);
  const allowInsecureTls = request.allowInsecureTls === true;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error(`Timeout tras ${timeoutMs} ms`)), timeoutMs);
  let insecureDispatcher = null;
  const previousTlsFlag = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  try {
    const baseUrl = new URL(resolveSecretString(String(request.url ?? '')));
    const resolvedHeaders = resolveSecrets(request.headers ?? {});
    const resolvedQuery = resolveSecrets(request.query ?? {});

    Object.entries(resolvedQuery).forEach(([key, value]) => {
      baseUrl.searchParams.set(key, String(value ?? ''));
    });

    const requestInit = {
      method,
      headers: resolvedHeaders,
      signal: controller.signal,
    };

    if (allowInsecureTls === true) {
      if (UndiciAgent) {
        insecureDispatcher = new UndiciAgent({
          connect: {
            rejectUnauthorized: false,
          },
        });

        requestInit.dispatcher = insecureDispatcher;
      }

      // Fallback para entornos Electron/Node donde fetch no respeta dispatcher
      // o cuando undici no esta disponible como dependencia externa.
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    if (method === 'POST') {
      const resolvedBody = resolveSecrets(request.body ?? null);
      requestInit.body = request.bodyMode === 'RAW' ? String(resolvedBody ?? '') : JSON.stringify(resolvedBody);
    }

    const response = await fetch(baseUrl, requestInit);

    const rawText = await response.text();
    let parsedBody;

    try {
      parsedBody = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsedBody = rawText;
    }

    return {
      ok: response.ok,
      method,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - startedAt,
      finalUrl: baseUrl.toString(),
      responseBody: parsedBody,
      responseHeaders: Object.fromEntries(response.headers.entries()),
      errorDetail: response.ok ? null : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    const networkError = extractNetworkErrorInfo(error, allowInsecureTls);

    if (diagnosticsEnabled) {
      console.error('[postais] http:request failed', {
        method,
        url: String(request.url ?? ''),
        code: networkError.code,
        message: networkError.message,
        allowInsecureTls,
      });
    }

    return {
      ok: false,
      method,
      status: 0,
      statusText: 'Network Error',
      durationMs: Date.now() - startedAt,
      finalUrl: String(request.url ?? ''),
      responseBody: {
        message: networkError.message,
        code: networkError.code,
        hint: networkError.hint,
        allowInsecureTls,
      },
      responseHeaders: {},
      errorDetail: `${networkError.message} (${networkError.code})`,
    };
  } finally {
    if (previousTlsFlag === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsFlag;
    }

    if (insecureDispatcher && typeof insecureDispatcher.close === 'function') {
      await insecureDispatcher.close();
    }
    clearTimeout(timeoutId);
  }
});

ipcMain.handle('window:setZoom', (_event, factor) => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win) {
    const clamped = Math.min(3.0, Math.max(0.25, Number(factor) || 1));
    win.webContents.setZoomFactor(clamped);
    return clamped;
  }
  return null;
});

ipcMain.handle('window:getZoom', () => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return win ? win.webContents.getZoomFactor() : 1;
});

ipcMain.handle('window:setTitleBarOverlay', (_event, options) => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win && typeof win.setTitleBarOverlay === 'function') {
    win.setTitleBarOverlay(options);
  }
});

// ========== SINGLE INSTANCE PROTECTION ==========
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance already running
  app.whenReady().then(() => {
    dialog.showMessageBox({
      type: 'warning',
      title: 'PostAIS ya está ejecutándose',
      message: 'Ya existe una instancia de PostAIS en ejecución.',
      detail: 'Elige una opción: terminar la instancia existente y arrancar de nuevo, o cerrar esta ventana.',
      buttons: ['Finalizarlo y arrancar de nuevo', 'Cerrar'],
      defaultId: 1,
      cancelId: 1,
    }).then((result) => {
      if (result.response === 0) {
        // Kill existing and restart
        app.quit();
        setTimeout(() => {
          const { spawn } = require('child_process');
          spawn(process.execPath, process.argv.slice(1), { detached: true });
        }, 500);
      } else {
        // Just quit
        app.quit();
      }
    }).catch(() => {
      app.quit();
    });
  });
} else {
  // This is the primary instance
  app.on('second-instance', () => {
    // Bring existing window to front
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWindow = windows[0];
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    hydrateLocalSecrets();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}