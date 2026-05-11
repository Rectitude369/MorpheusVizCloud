/**
 * Typed IPC contract shared by main, preload, and renderer.
 *
 * Design:
 *   • One `IpcMap` interface enumerates every channel with its request and
 *     response shape.
 *   • The `IPC_CHANNELS` const provides string literal names; main and
 *     renderer use these so a channel rename is a compile error in both.
 *   • `IpcEventMap` enumerates push-style events emitted from main to all
 *     renderers (e.g. migration progress, log fanout, status changes).
 *
 * Adding a channel:
 *   1. Add a string entry to `IPC_CHANNELS`.
 *   2. Add a `[channel]: { req, res }` entry to `IpcMap`.
 *   3. Implement the handler in `src/main/core/ipc.handlers.ts`.
 *   4. Consume via `window.vizcloud.invoke(channel, req)` in the renderer.
 */

import type {
    MessageBoxOptions,
    OpenDialogOptions,
    SaveDialogOptions,
} from 'electron';

import type {
    BundleProgressPayload,
    BundleSummary,
    Cluster,
    Host,
    HostConnection,
    LogLinePayload,
    LogSourceId,
    Migration,
    MigrationState,
    SystemMetrics,
    VM,
} from '@shared/types';

// ============================================================================
// Channel name registry
// ============================================================================

export const IPC_CHANNELS = {
    // App lifecycle
    appGetVersion: 'app:get-version',
    appGetPlatform: 'app:get-platform',
    appGetUserDataPath: 'app:get-user-data-path',
    appReload: 'app:reload',
    appQuit: 'app:quit',

    // Window
    windowMinimize: 'window:minimize',
    windowMaximize: 'window:maximize',
    windowUnmaximize: 'window:unmaximize',
    windowClose: 'window:close',
    windowIsMaximized: 'window:is-maximized',

    // Shell
    shellOpenExternal: 'shell:open-external',
    shellShowItemInFolder: 'shell:show-item-in-folder',

    // Dialog
    dialogOpenFile: 'dialog:open-file',
    dialogSaveFile: 'dialog:save-file',
    dialogSelectFolder: 'dialog:select-folder',
    dialogShowMessageBox: 'dialog:show-message-box',

    // Logging
    logDebug: 'log:debug',
    logInfo: 'log:info',
    logWarn: 'log:warn',
    logError: 'log:error',

    // Hosts
    hostsList: 'hosts:list',
    hostsGet: 'hosts:get',
    hostsConnect: 'hosts:connect',
    hostsDisconnect: 'hosts:disconnect',
    hostsUpdate: 'hosts:update',
    hostsDelete: 'hosts:delete',
    hostsListConnections: 'hosts:list-connections',
    hostsSaveConnection: 'hosts:save-connection',
    hostsRemoveConnection: 'hosts:remove-connection',

    // VMs
    vmsList: 'vms:list',
    vmsGet: 'vms:get',
    vmsListByHost: 'vms:list-by-host',
    vmsDiscover: 'vms:discover',
    vmsStart: 'vms:start',
    vmsStop: 'vms:stop',
    vmsReboot: 'vms:reboot',
    vmsReset: 'vms:reset',
    vmsSuspend: 'vms:suspend',
    vmsResume: 'vms:resume',
    vmsDestroy: 'vms:destroy',

    // Clusters
    clustersList: 'clusters:list',
    clustersGet: 'clusters:get',
    clustersDiscover: 'clusters:discover',

    // Migrations
    migrationsList: 'migrations:list',
    migrationsGet: 'migrations:get',
    migrationsListActive: 'migrations:list-active',
    migrationsStart: 'migrations:start',
    migrationsCancel: 'migrations:cancel',

    // Metrics
    metricsGet: 'metrics:get',
    metricsCollect: 'metrics:collect',
    metricsStartCollection: 'metrics:start-collection',
    metricsStopCollection: 'metrics:stop-collection',

    // Settings
    settingsGet: 'settings:get',
    settingsSet: 'settings:set',
    settingsGetAll: 'settings:get-all',

    // Diagnostics — log bundle collection + live tail + utilities
    diagnosticsBundleCollect: 'diagnostics:bundle-collect',
    diagnosticsBundleCancel: 'diagnostics:bundle-cancel',
    diagnosticsBundleList: 'diagnostics:bundle-list',
    diagnosticsBundleOpenFolder: 'diagnostics:bundle-open-folder',
    diagnosticsTailStart: 'diagnostics:tail-start',
    diagnosticsTailStop: 'diagnostics:tail-stop',
    diagnosticsLogSources: 'diagnostics:log-sources',
    diagnosticsBundleSaveAs: 'diagnostics:bundle-save-as',
    diagnosticsBundleReveal: 'diagnostics:bundle-reveal',
    diagnosticsBundleDelete: 'diagnostics:bundle-delete',

    // Updates
    updatesCheck: 'updates:check',
    updatesGetState: 'updates:get-state',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// ============================================================================
// Event channel registry (main → renderer push)
// ============================================================================

export const IPC_EVENTS = {
    hostStatus: 'event:host-status',
    vmStateChanged: 'event:vm-state-changed',
    migrationProgress: 'event:migration-progress',
    metricsTick: 'event:metrics-tick',
    logEntry: 'event:log-entry',
    bundleProgress: 'event:bundle-progress',
    logLine: 'event:log-line',
} as const;

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

// ============================================================================
// IPC channel request/response map
// ============================================================================

export interface DialogResult {
    canceled: boolean;
    filePaths?: ReadonlyArray<string>;
    filePath?: string;
}

export interface MessageBoxResult {
    response: number;
    checkboxChecked?: boolean;
}

export interface SettingEntry {
    key: string;
    value: string;
    description?: string;
    updatedAt: number;
}

export interface MigrationStartArgs {
    vmId: string;
    sourceHostId: string;
    targetHostId: string;
    mode: 'live' | 'cold';
}

export interface MetricsRangeArgs {
    hostId: string;
    startTime: number;
    endTime: number;
}

export interface IpcMap {
    // App
    [IPC_CHANNELS.appGetVersion]:      { req: void; res: string };
    [IPC_CHANNELS.appGetPlatform]:     { req: void; res: NodeJS.Platform };
    [IPC_CHANNELS.appGetUserDataPath]: { req: void; res: string };
    [IPC_CHANNELS.appReload]:          { req: void; res: void };
    [IPC_CHANNELS.appQuit]:            { req: void; res: void };

    // Window
    [IPC_CHANNELS.windowMinimize]:    { req: void; res: void };
    [IPC_CHANNELS.windowMaximize]:    { req: void; res: void };
    [IPC_CHANNELS.windowUnmaximize]:  { req: void; res: void };
    [IPC_CHANNELS.windowClose]:       { req: void; res: void };
    [IPC_CHANNELS.windowIsMaximized]: { req: void; res: boolean };

    // Shell
    [IPC_CHANNELS.shellOpenExternal]:    { req: { url: string }; res: void };
    [IPC_CHANNELS.shellShowItemInFolder]:{ req: { path: string }; res: void };

    // Dialog
    [IPC_CHANNELS.dialogOpenFile]:      { req: OpenDialogOptions; res: DialogResult };
    [IPC_CHANNELS.dialogSaveFile]:      { req: SaveDialogOptions; res: DialogResult };
    [IPC_CHANNELS.dialogSelectFolder]:  { req: OpenDialogOptions; res: DialogResult };
    [IPC_CHANNELS.dialogShowMessageBox]:{ req: MessageBoxOptions; res: MessageBoxResult };

    // Logging
    [IPC_CHANNELS.logDebug]: { req: { message: string; data?: unknown }; res: void };
    [IPC_CHANNELS.logInfo]:  { req: { message: string; data?: unknown }; res: void };
    [IPC_CHANNELS.logWarn]:  { req: { message: string; data?: unknown }; res: void };
    [IPC_CHANNELS.logError]: { req: { message: string; data?: unknown }; res: void };

    // Hosts
    [IPC_CHANNELS.hostsList]:            { req: void; res: Host[] };
    [IPC_CHANNELS.hostsGet]:             { req: { id: string }; res: Host | null };
    [IPC_CHANNELS.hostsConnect]:         { req: HostConnection; res: Host };
    [IPC_CHANNELS.hostsDisconnect]:      { req: { id: string }; res: void };
    [IPC_CHANNELS.hostsUpdate]:          { req: { id: string; patch: Partial<Host> }; res: Host };
    [IPC_CHANNELS.hostsDelete]:          { req: { id: string }; res: void };
    [IPC_CHANNELS.hostsListConnections]: { req: void; res: HostConnection[] };
    [IPC_CHANNELS.hostsSaveConnection]:  { req: HostConnection & { password?: string }; res: HostConnection };
    [IPC_CHANNELS.hostsRemoveConnection]:{ req: { id: string }; res: void };

    // VMs
    [IPC_CHANNELS.vmsList]:       { req: void; res: VM[] };
    [IPC_CHANNELS.vmsGet]:        { req: { id: string }; res: VM | null };
    [IPC_CHANNELS.vmsListByHost]: { req: { hostId: string }; res: VM[] };
    [IPC_CHANNELS.vmsDiscover]:   { req: { hostId: string }; res: VM[] };
    [IPC_CHANNELS.vmsStart]:      { req: { id: string }; res: void };
    [IPC_CHANNELS.vmsStop]:       { req: { id: string }; res: void };
    [IPC_CHANNELS.vmsReboot]:     { req: { id: string }; res: void };
    [IPC_CHANNELS.vmsReset]:      { req: { id: string }; res: void };
    [IPC_CHANNELS.vmsSuspend]:    { req: { id: string }; res: void };
    [IPC_CHANNELS.vmsResume]:     { req: { id: string }; res: void };
    [IPC_CHANNELS.vmsDestroy]:    { req: { id: string }; res: void };

    // Clusters
    [IPC_CHANNELS.clustersList]:     { req: void; res: Cluster[] };
    [IPC_CHANNELS.clustersGet]:      { req: { id: string }; res: Cluster | null };
    [IPC_CHANNELS.clustersDiscover]: { req: { hostId: string }; res: Cluster | null };

    // Migrations
    [IPC_CHANNELS.migrationsList]:        { req: void; res: Migration[] };
    [IPC_CHANNELS.migrationsGet]:         { req: { id: string }; res: Migration | null };
    [IPC_CHANNELS.migrationsListActive]:  { req: void; res: Migration[] };
    [IPC_CHANNELS.migrationsStart]:       { req: MigrationStartArgs; res: Migration };
    [IPC_CHANNELS.migrationsCancel]:      { req: { id: string }; res: void };

    // Metrics
    [IPC_CHANNELS.metricsGet]:             { req: MetricsRangeArgs; res: SystemMetrics[] };
    [IPC_CHANNELS.metricsCollect]:         { req: { hostId: string }; res: SystemMetrics };
    [IPC_CHANNELS.metricsStartCollection]: { req: { hostId: string }; res: void };
    [IPC_CHANNELS.metricsStopCollection]:  { req: { hostId: string }; res: void };

    // Settings
    [IPC_CHANNELS.settingsGet]:    { req: { key: string }; res: SettingEntry | null };
    [IPC_CHANNELS.settingsSet]:    { req: { key: string; value: string }; res: SettingEntry };
    [IPC_CHANNELS.settingsGetAll]: { req: void; res: SettingEntry[] };

    // Diagnostics
    [IPC_CHANNELS.diagnosticsBundleCollect]:    { req: { hostId: string }; res: { localPath: string; size: number } };
    [IPC_CHANNELS.diagnosticsBundleCancel]:     { req: { hostId: string }; res: void };
    [IPC_CHANNELS.diagnosticsBundleList]:       { req: void; res: BundleSummary[] };
    [IPC_CHANNELS.diagnosticsBundleOpenFolder]: { req: void; res: void };
    [IPC_CHANNELS.diagnosticsTailStart]:        { req: { hostId: string; source: LogSourceId }; res: void };
    [IPC_CHANNELS.diagnosticsTailStop]:         { req: { hostId: string; source: LogSourceId }; res: void };
    [IPC_CHANNELS.diagnosticsLogSources]:       { req: void; res: LogSourceId[] };
    [IPC_CHANNELS.diagnosticsBundleSaveAs]:     { req: { fileName: string }; res: { saved: boolean; destPath?: string } };
    [IPC_CHANNELS.diagnosticsBundleReveal]:     { req: { fileName: string }; res: void };
    [IPC_CHANNELS.diagnosticsBundleDelete]:     { req: { fileName: string }; res: void };

    // Updates
    [IPC_CHANNELS.updatesCheck]:    { req: void; res: { available: boolean; version?: string } };
    [IPC_CHANNELS.updatesGetState]: { req: void; res: { feedConfigured: boolean; currentVersion: string; lastChecked?: number } };
}

// ============================================================================
// Event push payload map
// ============================================================================

export interface IpcEventPayloads {
    [IPC_EVENTS.hostStatus]:       { hostId: string; status: Host['status']; lastHeartbeat: number };
    [IPC_EVENTS.vmStateChanged]:   { vmId: string; state: VM['state'] };
    [IPC_EVENTS.migrationProgress]:{ migrationId: string; state: MigrationState; progress: number; bandwidth: number; dataProcessed: number };
    [IPC_EVENTS.metricsTick]:      { hostId: string; metrics: SystemMetrics };
    [IPC_EVENTS.logEntry]:         { timestamp: number; level: string; source: string; message: string; data?: unknown };
    [IPC_EVENTS.bundleProgress]:   BundleProgressPayload;
    [IPC_EVENTS.logLine]:          LogLinePayload;
}

// ============================================================================
// API surface exposed via contextBridge (`window.vizcloud`)
// ============================================================================

export interface VizCloudApi {
    /** Invoke a typed IPC handler. */
    invoke<C extends IpcChannel>(channel: C, args: IpcMap[C]['req']): Promise<IpcMap[C]['res']>;

    /**
     * Subscribe to a push event. Returns an unsubscribe function. The callback
     * runs synchronously on the renderer's main thread; keep it light.
     */
    subscribe<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayloads[E]) => void): () => void;

    /** Convenience helpers for forwarding renderer logs to the main logger. */
    readonly log: {
        debug: (message: string, data?: unknown) => Promise<void>;
        info:  (message: string, data?: unknown) => Promise<void>;
        warn:  (message: string, data?: unknown) => Promise<void>;
        error: (message: string, data?: unknown) => Promise<void>;
    };
}
