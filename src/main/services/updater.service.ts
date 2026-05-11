/**
 * UpdaterService — `electron-updater` integration, channel-agnostic.
 *
 * The release channel is configured via the `updates.feedUrl` setting (a
 * `generic` provider URL — supports static hosting on S3/CloudFront/GitHub
 * Releases mirror/etc.). When the setting is absent, the auto-update path
 * is a no-op so unsigned dev builds don't try to fetch updates.
 *
 * Choosing a real channel is a product decision (SEC-008 follow-up). When
 * the user picks one:
 *   1. Set `updates.feedUrl` in Settings to the static index URL
 *   2. Sign the build (set `MAC_CERT` / `APPLE_*` repo secrets)
 *   3. Publish via `electron-builder --publish always`
 */

import { app, BrowserWindow, dialog } from 'electron';
import type { AppUpdater, UpdateInfo } from 'electron-updater';

import { LoggerService } from '../core/logger.service';
import { databaseService } from '../db/database.service';

/**
 * Lazy-load `electron-updater` so any platform-specific resolution failures
 * (missing native dep on Windows, etc.) degrade gracefully to "auto-update
 * unavailable" rather than crashing the main process before the window
 * opens. Type-only `import type` above keeps TypeScript happy.
 */
let cachedAutoUpdater: AppUpdater | null = null;
let updaterLoadFailed = false;
function getAutoUpdater(): AppUpdater | null {
    if (cachedAutoUpdater) return cachedAutoUpdater;
    if (updaterLoadFailed) return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('electron-updater') as { autoUpdater: AppUpdater };
        cachedAutoUpdater = mod.autoUpdater;
        return cachedAutoUpdater;
    } catch (err) {
        updaterLoadFailed = true;
        // We can't use the LoggerService here because this is a hot-path
        // helper called from initialize() before the singleton is necessarily
        // safe — fall back to console which electron-log mirrors.
        console.warn('[UpdaterService] electron-updater unavailable on this platform:', (err as Error).message);
        return null;
    }
}

interface UpdaterState {
    feedConfigured: boolean;
    currentVersion: string;
    lastChecked?: number;
}

export class UpdaterService {
    private readonly logger = new LoggerService('UpdaterService');
    private lastChecked: number | undefined;
    private feedConfigured = false;

    public async initialize(): Promise<void> {
        try {
            const feedUrl = this.readFeedSetting();
            if (!feedUrl) {
                this.logger.info('Auto-updater disabled — set `updates.feedUrl` in Settings to enable');
                return;
            }
            const updater = getAutoUpdater();
            if (!updater) {
                this.logger.warn('Auto-updater module unavailable on this platform — continuing without it');
                return;
            }
            updater.logger = {
                info: (m) => this.logger.info(`autoUpdater: ${m}`),
                warn: (m) => this.logger.warn(`autoUpdater: ${m}`),
                error: (m) => this.logger.error(`autoUpdater: ${m}`),
                debug: (m) => this.logger.debug(`autoUpdater: ${m}`),
            };
            updater.autoDownload = false;
            updater.setFeedURL({ provider: 'generic', url: feedUrl });
            updater.on('update-available', (info: UpdateInfo) => {
                this.logger.info(`Update available: ${info.version}`);
                void this.surfaceUpdatePrompt(info.version);
            });
            updater.on('error', (err) => {
                this.logger.warn(`Auto-update error: ${err.message}`);
            });
            this.feedConfigured = true;
            this.logger.info(`Auto-updater configured against ${feedUrl}`);
            void this.checkNow();
        } catch (err) {
            // Never let updater init kill the app — degrade silently.
            this.logger.warn(`Auto-updater init failed (continuing without it): ${(err as Error).message}`);
        }
    }

    public async shutdown(): Promise<void> {
        // electron-updater has no persistent background tasks we own.
    }

    public async checkNow(): Promise<{ available: boolean; version?: string }> {
        if (!this.feedConfigured) {
            return { available: false };
        }
        const updater = getAutoUpdater();
        if (!updater) {
            return { available: false };
        }
        try {
            this.lastChecked = Date.now();
            const result = await updater.checkForUpdates();
            const update = result?.updateInfo;
            if (update && update.version !== app.getVersion()) {
                return { available: true, version: update.version };
            }
            return { available: false };
        } catch (err) {
            this.logger.warn(`Update check failed: ${(err as Error).message}`);
            return { available: false };
        }
    }

    public getState(): UpdaterState {
        return {
            feedConfigured: this.feedConfigured,
            currentVersion: app.getVersion(),
            lastChecked: this.lastChecked,
        };
    }

    private readFeedSetting(): string | null {
        try {
            const row = databaseService.queryGet<{ value: string }>(
                "SELECT value FROM settings WHERE key = 'updates.feedUrl'",
            );
            return row?.value && row.value.trim().length > 0 ? row.value.trim() : null;
        } catch {
            // Database may not yet be ready in some test paths.
            return null;
        }
    }

    private async surfaceUpdatePrompt(version: string): Promise<void> {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        if (!win) return;
        const result = await dialog.showMessageBox(win, {
            type: 'info',
            title: 'VizCloud update available',
            message: `Version ${version} is available. Download now?`,
            detail: `You're currently running ${app.getVersion()}.`,
            buttons: ['Download', 'Later'],
            defaultId: 0,
            cancelId: 1,
        });
        if (result.response === 0) {
            const updater = getAutoUpdater();
            if (updater) void updater.downloadUpdate();
        }
    }
}
