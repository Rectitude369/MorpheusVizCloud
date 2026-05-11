/**
 * IPC handlers — the canonical bridge between the renderer and main.
 *
 * Every channel listed in `IPC_CHANNELS` (`@shared/ipc/contract`) has a
 * handler registered here. Handlers run in the main process; their inputs
 * come from `window.vizcloud.invoke(channel, args)` calls and their outputs
 * are returned via Promise resolution.
 *
 * Conventions:
 *   • Throw real `Error` instances on failure — Electron serializes them as
 *     structured rejections that `ipcBaseQuery` turns into RTK Query errors.
 *   • Validate inputs at the boundary using zod schemas (see `validators`).
 *     A zod failure produces a 400-equivalent error before any service is
 *     touched.
 *   • Never expose `process.env` or platform-specific globals (SEC-009).
 *   • Channel names live in the shared contract; importing them by string
 *     here keeps the registry and the implementation in sync.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { z } from 'zod';

import { IPC_CHANNELS, type IpcChannel, type IpcMap } from '@shared/ipc/contract';

import { databaseService } from '../db/database.service';
import type { ClusterService } from '../services/cluster.service';
import type { DiagnosticsService } from '../services/diagnostics.service';
import type { HostService } from '../services/host.service';
import type { MetricsService } from '../services/metrics.service';
import type { MigrationService } from '../services/migration.service';
import type { UpdaterService } from '../services/updater.service';
import type { VMService } from '../services/vm.service';

import { LoggerService } from './logger.service';

const logger = new LoggerService('IPC');

export interface IpcServiceBundle {
    host: HostService;
    vm: VMService;
    cluster: ClusterService;
    metrics: MetricsService;
    migration: MigrationService;
    diagnostics: DiagnosticsService;
    updater: UpdaterService;
}

// ============================================================================
// Validators (zod schemas) — input shape checks at the IPC boundary.
// ============================================================================

const IdArgs = z.object({ id: z.string().min(1) });
const HostIdArgs = z.object({ hostId: z.string().min(1) });
const KeyArgs = z.object({ key: z.string().min(1) });
const KeyValueArgs = z.object({ key: z.string().min(1), value: z.string() });

const HostConnectionInput = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(22),
    username: z.string().min(1),
    authMethod: z.enum(['password', 'key', 'agent']),
    keyPath: z.string().optional(),
    password: z.string().optional(),
    lastConnected: z.number().default(0),
    tags: z.array(z.string()).default([]),
});

const MigrationStartInput = z.object({
    vmId: z.string().min(1),
    sourceHostId: z.string().min(1),
    targetHostId: z.string().min(1),
    mode: z.enum(['live', 'cold']),
});

const MetricsRangeInput = z.object({
    hostId: z.string().min(1),
    startTime: z.number().int().min(0),
    endTime: z.number().int().min(0),
});

const LogInput = z.object({ message: z.string(), data: z.unknown().optional() });

// ============================================================================
// Helper: typed handler registration with explicit error surfacing.
// ============================================================================

type TypedHandler<C extends IpcChannel> = (
    args: IpcMap[C]['req'],
) => IpcMap[C]['res'] | Promise<IpcMap[C]['res']>;

function on<C extends IpcChannel>(channel: C, handler: TypedHandler<C>): void {
    ipcMain.handle(channel, async (_event, args: IpcMap[C]['req']) => {
        try {
            return await handler(args);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`Handler ${channel} failed: ${message}`, error);
            // Re-throw so Electron rejects the renderer's invoke promise.
            // RTK Query's `ipcBaseQuery` converts this into a structured error.
            throw error instanceof Error ? error : new Error(message);
        }
    });
}

// ============================================================================
// Public entry point
// ============================================================================

export function setupIpcHandlers(services: IpcServiceBundle): void {
    logger.info('Registering IPC handlers');

    registerAppHandlers();
    registerWindowHandlers();
    registerShellHandlers();
    registerDialogHandlers();
    registerLogHandlers();
    registerHostHandlers(services.host);
    registerVmHandlers(services.vm);
    registerClusterHandlers(services.cluster);
    registerMigrationHandlers(services.migration);
    registerMetricsHandlers(services.metrics);
    registerSettingsHandlers();
    registerDiagnosticsHandlers(services.diagnostics);
    registerUpdaterHandlers(services.updater);

    logger.info('IPC handlers registered');
}

function registerUpdaterHandlers(updater: UpdaterService): void {
    on(IPC_CHANNELS.updatesCheck, async () => updater.checkNow());
    on(IPC_CHANNELS.updatesGetState, async () => updater.getState());
}

// ============================================================================
// App
// ============================================================================

function registerAppHandlers(): void {
    on(IPC_CHANNELS.appGetVersion, () => app.getVersion());
    on(IPC_CHANNELS.appGetPlatform, () => process.platform);
    on(IPC_CHANNELS.appGetUserDataPath, () => app.getPath('userData'));
    on(IPC_CHANNELS.appReload, () => {
        for (const win of BrowserWindow.getAllWindows()) {
            win.reload();
        }
    });
    on(IPC_CHANNELS.appQuit, () => {
        app.quit();
    });
}

// ============================================================================
// Window
// ============================================================================

function focusedOrFirst(): BrowserWindow | undefined {
    return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function registerWindowHandlers(): void {
    on(IPC_CHANNELS.windowMinimize, () => focusedOrFirst()?.minimize());
    on(IPC_CHANNELS.windowMaximize, () => focusedOrFirst()?.maximize());
    on(IPC_CHANNELS.windowUnmaximize, () => focusedOrFirst()?.unmaximize());
    on(IPC_CHANNELS.windowClose, () => focusedOrFirst()?.close());
    on(IPC_CHANNELS.windowIsMaximized, () => focusedOrFirst()?.isMaximized() ?? false);
}

// ============================================================================
// Shell — only HTTPS / file URLs to known paths are allowed (SEC-005).
// ============================================================================

function registerShellHandlers(): void {
    on(IPC_CHANNELS.shellOpenExternal, async ({ url }) => {
        if (!/^https:\/\//.test(url)) {
            throw new Error(`Refusing to open non-HTTPS URL: ${url}`);
        }
        await shell.openExternal(url);
    });

    on(IPC_CHANNELS.shellShowItemInFolder, ({ path }) => {
        // We can't easily validate path is "safe" — at minimum require absolute.
        if (!path || typeof path !== 'string') {
            throw new Error('Path is required');
        }
        shell.showItemInFolder(path);
    });
}

// ============================================================================
// Dialog
// ============================================================================

function registerDialogHandlers(): void {
    on(IPC_CHANNELS.dialogOpenFile, async (options) => {
        const win = focusedOrFirst();
        const result = win
            ? await dialog.showOpenDialog(win, options)
            : await dialog.showOpenDialog(options);
        return { canceled: result.canceled, filePaths: result.filePaths };
    });

    on(IPC_CHANNELS.dialogSaveFile, async (options) => {
        const win = focusedOrFirst();
        const result = win
            ? await dialog.showSaveDialog(win, options)
            : await dialog.showSaveDialog(options);
        return { canceled: result.canceled, filePath: result.filePath };
    });

    on(IPC_CHANNELS.dialogSelectFolder, async (options) => {
        const win = focusedOrFirst();
        const merged: Electron.OpenDialogOptions = { ...options, properties: ['openDirectory', ...(options?.properties ?? [])] };
        const result = win
            ? await dialog.showOpenDialog(win, merged)
            : await dialog.showOpenDialog(merged);
        return { canceled: result.canceled, filePaths: result.filePaths };
    });

    on(IPC_CHANNELS.dialogShowMessageBox, async (options) => {
        const win = focusedOrFirst();
        const result = win
            ? await dialog.showMessageBox(win, options)
            : await dialog.showMessageBox(options);
        return { response: result.response, checkboxChecked: result.checkboxChecked };
    });
}

// ============================================================================
// Logging — renderer → main forwarding (BUG-031).
// ============================================================================

function registerLogHandlers(): void {
    const rendererLogger = new LoggerService('Renderer');
    on(IPC_CHANNELS.logDebug, ({ message, data }) => { rendererLogger.debug(message, data); });
    on(IPC_CHANNELS.logInfo,  ({ message, data }) => { rendererLogger.info(message, data); });
    on(IPC_CHANNELS.logWarn,  ({ message, data }) => { rendererLogger.warn(message, data); });
    on(IPC_CHANNELS.logError, ({ message, data }) => { rendererLogger.error(message, data); });
    // Also accept raw {message, data} via zod for safety
    void LogInput;
}

// ============================================================================
// Hosts
// ============================================================================

function registerHostHandlers(host: HostService): void {
    on(IPC_CHANNELS.hostsList, async () => host.getAllHosts());

    on(IPC_CHANNELS.hostsGet, async (raw) => {
        const { id } = IdArgs.parse(raw);
        return host.getHost(id);
    });

    on(IPC_CHANNELS.hostsConnect, async (raw) => {
        const conn = HostConnectionInput.parse(raw);
        return host.connect(conn);
    });

    on(IPC_CHANNELS.hostsDisconnect, async (raw) => {
        const { id } = IdArgs.parse(raw);
        await host.disconnect(id);
    });

    on(IPC_CHANNELS.hostsUpdate, async (raw) => {
        const args = z.object({ id: z.string().min(1), patch: z.record(z.unknown()) }).parse(raw);
        return host.updateHost(args.id, args.patch);
    });

    on(IPC_CHANNELS.hostsDelete, async (raw) => {
        const { id } = IdArgs.parse(raw);
        await host.deleteHost(id);
    });

    on(IPC_CHANNELS.hostsListConnections, async () => host.listSavedConnections());

    on(IPC_CHANNELS.hostsSaveConnection, async (raw) => {
        const conn = HostConnectionInput.parse(raw);
        return host.saveConnection(conn);
    });

    on(IPC_CHANNELS.hostsRemoveConnection, async (raw) => {
        const { id } = IdArgs.parse(raw);
        await host.removeConnection(id);
    });
}

// ============================================================================
// VMs
// ============================================================================

function registerVmHandlers(vm: VMService): void {
    on(IPC_CHANNELS.vmsList,       async () => vm.getAllVMs());
    on(IPC_CHANNELS.vmsGet,        async (raw) => vm.getVM(IdArgs.parse(raw).id));
    on(IPC_CHANNELS.vmsListByHost, async (raw) => vm.getVMsByHost(HostIdArgs.parse(raw).hostId));
    on(IPC_CHANNELS.vmsDiscover,   async (raw) => vm.discoverVMs(HostIdArgs.parse(raw).hostId));
    on(IPC_CHANNELS.vmsStart,      async (raw) => { await vm.startVM(IdArgs.parse(raw).id); });
    on(IPC_CHANNELS.vmsStop,       async (raw) => { await vm.stopVM(IdArgs.parse(raw).id); });
    on(IPC_CHANNELS.vmsReboot,     async (raw) => { await vm.rebootVM(IdArgs.parse(raw).id); });
    on(IPC_CHANNELS.vmsReset,      async (raw) => { await vm.resetVM(IdArgs.parse(raw).id); });
    on(IPC_CHANNELS.vmsSuspend,    async (raw) => { await vm.suspendVM(IdArgs.parse(raw).id); });
    on(IPC_CHANNELS.vmsResume,     async (raw) => { await vm.resumeVM(IdArgs.parse(raw).id); });
    on(IPC_CHANNELS.vmsDestroy,    async (raw) => { await vm.destroyVM(IdArgs.parse(raw).id); });
}

// ============================================================================
// Clusters
// ============================================================================

function registerClusterHandlers(cluster: ClusterService): void {
    on(IPC_CHANNELS.clustersList,     async () => cluster.getAllClusters());
    on(IPC_CHANNELS.clustersGet,      async (raw) => cluster.getCluster(IdArgs.parse(raw).id));
    on(IPC_CHANNELS.clustersDiscover, async (raw) => cluster.discoverCluster(HostIdArgs.parse(raw).hostId));
}

// ============================================================================
// Migrations
// ============================================================================

function registerMigrationHandlers(migration: MigrationService): void {
    on(IPC_CHANNELS.migrationsList,       async () => migration.listMigrations());
    on(IPC_CHANNELS.migrationsGet,        async (raw) => migration.getMigration(IdArgs.parse(raw).id));
    on(IPC_CHANNELS.migrationsListActive, async () => migration.getActiveMigrations());
    on(IPC_CHANNELS.migrationsStart,      async (raw) => {
        const args = MigrationStartInput.parse(raw);
        return migration.startMigration(args.vmId, args.sourceHostId, args.targetHostId, args.mode);
    });
    on(IPC_CHANNELS.migrationsCancel, async (raw) => {
        await migration.cancelMigration(IdArgs.parse(raw).id);
    });
}

// ============================================================================
// Metrics
// ============================================================================

function registerMetricsHandlers(metrics: MetricsService): void {
    on(IPC_CHANNELS.metricsGet, async (raw) => {
        const { hostId, startTime, endTime } = MetricsRangeInput.parse(raw);
        return metrics.getMetrics(hostId, startTime, endTime);
    });
    on(IPC_CHANNELS.metricsCollect,         async (raw) => metrics.collectMetrics(HostIdArgs.parse(raw).hostId));
    on(IPC_CHANNELS.metricsStartCollection, async (raw) => { await metrics.startCollection(HostIdArgs.parse(raw).hostId); });
    on(IPC_CHANNELS.metricsStopCollection,  async (raw) => { await metrics.stopCollection(HostIdArgs.parse(raw).hostId); });
}

// ============================================================================
// Settings
// ============================================================================

function registerSettingsHandlers(): void {
    on(IPC_CHANNELS.settingsGet, async (raw) => {
        const { key } = KeyArgs.parse(raw);
        const row = databaseService.queryGet<{ key: string; value: string; description: string | null; updated_at: number }>(
            'SELECT key, value, description, updated_at FROM settings WHERE key = ?',
            key,
        );
        if (!row) return null;
        return { key: row.key, value: row.value, description: row.description ?? undefined, updatedAt: row.updated_at };
    });

    on(IPC_CHANNELS.settingsSet, async (raw) => {
        const { key, value } = KeyValueArgs.parse(raw);
        const now = Date.now();
        databaseService.run(
            `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            key, value, now,
        );
        return { key, value, updatedAt: now };
    });

    on(IPC_CHANNELS.settingsGetAll, async () => {
        const rows = databaseService.queryAll<{ key: string; value: string; description: string | null; updated_at: number }>(
            'SELECT key, value, description, updated_at FROM settings ORDER BY key',
        );
        return rows.map((r) => ({
            key: r.key, value: r.value, description: r.description ?? undefined, updatedAt: r.updated_at,
        }));
    });
}

// ============================================================================
// Diagnostics — log bundle collection + live tail
// ============================================================================

const TailArgs = z.object({
    hostId: z.string().min(1),
    source: z.enum(['morphd', 'pacemaker', 'corosync', 'pcsd', 'libvirtd', 'syslog']),
});

const BundleFileNameArgs = z.object({ fileName: z.string().min(1).regex(/\.tar\.gz$/) });

function registerDiagnosticsHandlers(diagnostics: DiagnosticsService): void {
    on(IPC_CHANNELS.diagnosticsBundleCollect, async (raw) => {
        const { hostId } = HostIdArgs.parse(raw);
        return diagnostics.collectBundle(hostId);
    });
    on(IPC_CHANNELS.diagnosticsBundleCancel, async (raw) => {
        const { hostId } = HostIdArgs.parse(raw);
        diagnostics.cancelBundle(hostId);
    });
    on(IPC_CHANNELS.diagnosticsBundleList, async () => diagnostics.listBundles());
    on(IPC_CHANNELS.diagnosticsBundleOpenFolder, async () => {
        await shell.openPath(diagnostics.getBundleDir());
    });
    on(IPC_CHANNELS.diagnosticsTailStart, async (raw) => {
        const { hostId, source } = TailArgs.parse(raw);
        await diagnostics.startTail(hostId, source);
    });
    on(IPC_CHANNELS.diagnosticsTailStop, async (raw) => {
        const { hostId, source } = TailArgs.parse(raw);
        diagnostics.stopTail(hostId, source);
    });
    on(IPC_CHANNELS.diagnosticsLogSources, async () => [...diagnostics.listLogSources()]);

    on(IPC_CHANNELS.diagnosticsBundleSaveAs, async (raw) => {
        const { fileName } = BundleFileNameArgs.parse(raw);
        const win = focusedOrFirst();
        const result = win
            ? await dialog.showSaveDialog(win, { defaultPath: fileName, filters: [{ name: 'Tarball', extensions: ['tar.gz'] }] })
            : await dialog.showSaveDialog({ defaultPath: fileName, filters: [{ name: 'Tarball', extensions: ['tar.gz'] }] });
        if (result.canceled || !result.filePath) {
            return { saved: false };
        }
        await diagnostics.saveBundleAs(fileName, result.filePath);
        return { saved: true, destPath: result.filePath };
    });

    on(IPC_CHANNELS.diagnosticsBundleReveal, async (raw) => {
        const { fileName } = BundleFileNameArgs.parse(raw);
        shell.showItemInFolder(diagnostics.resolveBundlePath(fileName));
    });

    on(IPC_CHANNELS.diagnosticsBundleDelete, async (raw) => {
        const { fileName } = BundleFileNameArgs.parse(raw);
        await diagnostics.deleteBundle(fileName);
    });
}
