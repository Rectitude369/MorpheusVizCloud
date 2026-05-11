/**
 * VizCloud — Main Process Entry Point
 *
 * Bootstraps the Electron app: configures hardened security defaults,
 * acquires the single-instance lock, opens the database, initializes
 * services, registers IPC handlers, and creates the main window.
 *
 * Lifecycle ordering matters:
 *   1. enableSandbox + Fuses-equivalent runtime hardening
 *   2. requestSingleInstanceLock
 *   3. app.whenReady → CSP + WebRequest hooks → DB init → services → IPC → window
 *   4. before-quit → reverse-order shutdown
 */

// ---------- Early-crash logger (registered before any other imports) ----------
// If module load itself throws on a particular platform (missing native dep,
// etc.), the regular electron-log singleton may not yet be alive. Writing to
// a flat file at the user's data dir from the very first lines of execution
// guarantees we capture the diagnostic — without it, Windows users see "the
// process never appeared in Task Manager" and have nothing to debug from.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join as joinPath } from 'node:path';

(function installEarlyCrashLogger(): void {
    const root = process.env.APPDATA
        || (process.env.HOME ? `${process.env.HOME}/Library/Application Support` : '')
        || '/tmp';
    const dir = joinPath(root, 'vizcloud');
    const file = joinPath(dir, 'startup.log');
    const write = (level: string, msg: string): void => {
        try {
            mkdirSync(dir, { recursive: true });
            appendFileSync(
                file,
                `[${new Date().toISOString()}] [${level}] ${msg}\n`,
                { flag: 'a' },
            );
        } catch {
            // If we can't even write here, we're out of options.
        }
    };
    write('info', `boot start; platform=${process.platform} arch=${process.arch} electron=${process.versions.electron ?? 'n/a'}`);
    process.on('uncaughtException', (err) => {
        write('uncaught', `${err.message}\n${err.stack ?? ''}`);
    });
    process.on('unhandledRejection', (reason) => {
        write('unhandled', String(reason));
    });
})();

import { app, BrowserWindow, screen, session } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { join } from 'path';

import { setupIpcHandlers } from './core/ipc.handlers';
import { logger } from './core/logger.service';
import { databaseService } from './db/database.service';
import { ClusterService } from './services/cluster.service';
import { DiagnosticsService } from './services/diagnostics.service';
import { HostService } from './services/host.service';
import { MetricsService } from './services/metrics.service';
import { MigrationService } from './services/migration.service';
import { UpdaterService } from './services/updater.service';
import { VMService } from './services/vm.service';

// Sandbox the renderer at the app level on every platform (SEC-004).
app.enableSandbox();

// Single-instance lock (REFACTOR-016) — without this the `second-instance`
// listener below never fires.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
    process.exit(0);
}

// Application state
let mainWindow: BrowserWindow | null = null;
let servicesInitialized = false;

// Services — instantiated lazily inside `initializeApp` so that any
// constructor-time logging happens after `whenReady`.
const services: {
    host: HostService;
    vm: VMService;
    cluster: ClusterService;
    metrics: MetricsService;
    migration: MigrationService;
    diagnostics: DiagnosticsService;
    updater: UpdaterService;
} = {
    host: new HostService(),
    vm: new VMService(),
    cluster: new ClusterService(),
    metrics: new MetricsService(),
    migration: new MigrationService(),
    diagnostics: new DiagnosticsService(),
    updater: new UpdaterService(),
};

// Wire the inverse dep: HostService schedules auto-discovery against
// VMService. Set BEFORE initialize() so the scheduler is hot from t=0.
services.host.setVMService(services.vm);

/**
 * Bootstrap the application after Electron's app is ready.
 *
 * Sequence is significant: hardening must run before the first window mounts
 * any content; the database must be open before services try to talk to it.
 */
async function initializeApp(): Promise<void> {
    logger.info('Initializing VizCloud...');

    try {
        await app.whenReady();

        // 1) Session-level hardening (CSP, permission handler).
        applySessionHardening();

        // 2) Database (synchronous via better-sqlite3).
        databaseService.initialize();
        logger.info('Database initialized');

        // 3) Domain services (each is allowed to be best-effort: a failed
        //    service shouldn't kill the whole app).
        const initResults = await Promise.allSettled([
            services.host.initialize(),
            services.vm.initialize(),
            services.cluster.initialize(),
            services.metrics.initialize(),
            services.migration.initialize(),
            services.diagnostics.initialize(),
            services.updater.initialize(),
        ]);
        for (const [idx, result] of initResults.entries()) {
            if (result.status === 'rejected') {
                logger.error(`Service[${idx}] failed to initialize`, result.reason);
            }
        }
        servicesInitialized = true;
        logger.info('All services initialized');

        // 4) IPC handlers — registered after services so `services` is wired.
        setupIpcHandlers(services);
        logger.info('IPC handlers configured');

        // 5) Main window.
        createWindow();
        logger.info('Main window created');

        // 6) Bootstrap previously-connected hosts: lazy-reconnect via saved
        //    credentials, refresh VM lists, restart heartbeat polling. Runs
        //    in the background (semaphore-throttled, max 4 concurrent).
        services.host.resumeKnownHosts();

        // macOS: dock visibility / reopen behavior.
        app.dock?.show();

        app.on('second-instance', () => {
            if (mainWindow) {
                if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                }
                mainWindow.focus();
            }
        });

        app.on('open-url', (event, url) => {
            event.preventDefault();
            logger.info(`Open URL: ${url}`);
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    } catch (error) {
        logger.error('Failed to initialize application', error);
        app.exit(1);
    }
}

/**
 * Create the main application window with hardened webPreferences and
 * navigation policy.
 */
function createWindow(): void {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // REFACTOR-015: persist window position/size between launches.
    // Defaults clamp to the work area on first launch.
    const defaultWidth = Math.min(1600, Math.max(1024, screenWidth - 100));
    const defaultHeight = Math.min(1000, Math.max(768, screenHeight - 100));
    const stateKeeper = windowStateKeeper({
        defaultWidth,
        defaultHeight,
        path: app.getPath('userData'),
        file: 'window-state.json',
    });

    const windowOptions: Electron.BrowserWindowConstructorOptions = {
        width: stateKeeper.width,
        height: stateKeeper.height,
        minWidth: 1024,
        minHeight: 768,
        x: stateKeeper.x,
        y: stateKeeper.y,
        frame: true,
        fullscreenable: true,
        show: false,
        titleBarStyle: 'default',
        trafficLightPosition: { x: 20, y: 20 },
        backgroundColor: '#0a0a0f',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // vite-plugin-electron emits this file at dist/main/main.js and
            // the preload at dist/main/preload/preload.js — same level.
            preload: join(__dirname, 'preload', 'preload.js'),
            sandbox: true,
            webSecurity: true,
            spellcheck: true,
            // Block creating new windows from inside the renderer; we route
            // external links explicitly via `setWindowOpenHandler` below.
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
        },
    };

    mainWindow = new BrowserWindow(windowOptions);
    stateKeeper.manage(mainWindow);

    if (process.env.VITE_DEV_SERVER_URL) {
        void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: 'undocked' });
    } else {
        // From dist/main/, the renderer lives at dist/renderer/index.html.
        void mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        logger.info('Window ready to show');
    });

    mainWindow.on('close', () => {
        logger.info('Window closing');
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        logger.info('Window closed');
    });

    // SEC-005: Strict navigation policy. Allow only the dev server (HMR) or
    // the packaged file:// origin. Everything else is blocked; external HTTPS
    // links are surfaced to the user's default browser.
    const allowedOrigins: ReadonlyArray<string> = [
        process.env.VITE_DEV_SERVER_URL ?? '',
    ].filter(Boolean);

    const isAllowedNavigation = (urlString: string): boolean => {
        try {
            const url = new URL(urlString);
            if (url.protocol === 'file:') {
                return true; // packaged renderer
            }
            for (const allowed of allowedOrigins) {
                const allowedUrl = new URL(allowed);
                if (url.origin === allowedUrl.origin) {
                    return true;
                }
            }
            return false;
        } catch {
            return false;
        }
    };

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) {
            void import('electron').then(({ shell }) => shell.openExternal(url));
        } else {
            logger.warn(`Blocked window-open: ${url}`);
        }
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedNavigation(url)) {
            event.preventDefault();
            logger.warn(`Blocked navigation: ${url}`);
        }
    });

    mainWindow.webContents.on('will-frame-navigate', (event) => {
        if (!isAllowedNavigation(event.url)) {
            event.preventDefault();
            logger.warn(`Blocked frame navigation: ${event.url}`);
        }
    });

    // Deny attached webview / new BrowserWindow instances created via
    // <webview> tags or window.open with custom features.
    mainWindow.webContents.on('will-attach-webview', (event) => {
        event.preventDefault();
    });
}

/**
 * Apply renderer-side security hardening that lives on the default session:
 * a strict Content-Security-Policy and a deny-all permission handler.
 *
 * Both are scoped to `session.defaultSession` so they apply to every window
 * the app creates (including future log/diagnostic windows).
 */
function applySessionHardening(): void {
    const csp = [
        "default-src 'self'",
        "script-src 'self'",
        // Tailwind base + utilities are emitted as static stylesheets, but
        // we also allow inline styles for dynamic class composition. Drop
        // 'unsafe-inline' once every styled component is verified static.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws://localhost:* http://localhost:*",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'none'",
    ].join('; ');

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp],
                'X-Content-Type-Options': ['nosniff'],
                'Referrer-Policy': ['no-referrer'],
            },
        });
    });

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        // Deny everything by default. Add explicit allow-list later if
        // legitimate needs (e.g. clipboard) emerge.
        callback(false);
    });
}

/**
 * Graceful shutdown — runs once on `before-quit`. Idempotent so multiple
 * triggers (Cmd-Q, dock close, OS shutdown) don't double-close resources.
 */
let shuttingDown = false;
async function shutdown(reason: string): Promise<void> {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    logger.info(`Shutting down: ${reason}`);
    if (servicesInitialized) {
        await Promise.allSettled([
            services.host.shutdown(),
            services.vm.shutdown(),
            services.cluster.shutdown(),
            services.metrics.shutdown(),
            services.migration.shutdown(),
            services.diagnostics.shutdown(),
            services.updater.shutdown(),
        ]);
    }
    databaseService.close();
    logger.info('Cleanup complete');
}

app.on('before-quit', (event) => {
    if (!shuttingDown) {
        event.preventDefault();
        void shutdown('before-quit').finally(() => app.exit(0));
    }
});

// BUG-034: surface uncaught errors and exit non-zero so any process supervisor
// (or the user) sees a clear failure rather than a zombie state.
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    void shutdown('uncaughtException').finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
    void shutdown('unhandledRejection').finally(() => process.exit(1));
});

// Forward signals to the same shutdown path for `tsx watch` dev mode (BUG-027).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        void shutdown(signal).finally(() => process.exit(0));
    });
}

void initializeApp();
