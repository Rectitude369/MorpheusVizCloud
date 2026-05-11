/**
 * DiagnosticsService — Morpheus log bundle collection + live log tail.
 *
 * Two functions:
 *   • `collectBundle(hostId)` — uploads HPE Support's `collect.sh` to the
 *     remote host, executes it under a PTY, handles its interactive prompts
 *     ("multiple log files" cleanup → choose 1; "Collecting SOS report…" →
 *     ENTER), pulls the resulting tar.gz back to `<userData>/log-bundles/`,
 *     and cleans up remote artifacts. Mirrors MorphLogGrabber's behavior.
 *   • `tailLog(hostId, source)` — streams `tail -F` of the requested log
 *     file over SSH and emits each line as an `event:log-line` push event.
 *
 * Bundle progress is broadcast via `event:bundle-progress` so the renderer
 * can show a per-host status pill without polling.
 */

import { app, BrowserWindow } from 'electron';
import { mkdir, readdir, stat, copyFile, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';

import { LoggerService } from '../core/logger.service';
import type { SshClient } from '../lib/ssh-client';
import { IPC_EVENTS } from '@shared/ipc/contract';
import type {
    BundleProgressPayload,
    BundleSummary,
    LogLinePayload,
    LogSourceId,
} from '@shared/types';

import { COLLECT_SCRIPT } from './collect-script';
import { ensureHostConnected } from './connection-manager';
import { HostRepository } from './host-repository';

/**
 * Map a logical log source to the shell command that streams it.
 *
 * Each entry returns the *body* of the remote command (no `sh -c` wrapper
 * here — that's added at exec time). Two strategies:
 *
 *   • file-tail — `tail -n 100 -F <path>`. Used when the unit writes to a
 *     stable on-disk file.
 *   • journald  — `journalctl -u <unit> -f -n 100 --output=cat`. Used for
 *     services that only log to systemd-journald (libvirtd on Morpheus HVM /
 *     Ubuntu Server is the canonical example — `/var/log/libvirt/libvirtd.log`
 *     either doesn't exist or only holds a startup banner).
 *
 * For sources that may live in either place we prefer journald with a
 * file-tail fallback, so the user gets *something* even on older hosts.
 */
const LOG_SOURCES: Record<LogSourceId, string> = {
    morphd:    "tail -n 100 -F /var/log/morpheus-node/morphd/current 2>/dev/null",
    pacemaker: "tail -n 100 -F /var/log/pacemaker/pacemaker.log 2>/dev/null",
    corosync:  "tail -n 100 -F /var/log/corosync/corosync.log 2>/dev/null",
    pcsd:      "tail -n 100 -F /var/log/pcsd/pcsd.log 2>/dev/null",
    libvirtd:  "journalctl -u libvirtd -u virtqemud -f -n 100 --output=cat --no-pager 2>/dev/null"
               + " || tail -n 100 -F /var/log/libvirt/libvirtd.log 2>/dev/null",
    syslog:    "tail -n 100 -F /var/log/syslog 2>/dev/null",
};

interface ActiveTail {
    cancel: () => void;
    result: Promise<unknown>;
}

export class DiagnosticsService {
    private readonly logger = new LoggerService('DiagnosticsService');
    /** key: `${hostId}:${source}` → cancel handle. */
    private readonly tails = new Map<string, ActiveTail>();
    /** key: hostId → in-flight bundle abort handle. */
    private readonly bundles = new Map<string, { canceled: boolean }>();
    private bundleDir = '';

    public async initialize(): Promise<void> {
        this.bundleDir = join(app.getPath('userData'), 'log-bundles');
        await mkdir(this.bundleDir, { recursive: true });
        this.logger.info(`DiagnosticsService initialized (bundles → ${this.bundleDir})`);
    }

    public async shutdown(): Promise<void> {
        for (const [, t] of this.tails) {
            try { t.cancel(); } catch { /* best effort */ }
        }
        this.tails.clear();
        for (const [, b] of this.bundles) {
            b.canceled = true;
        }
        this.bundles.clear();
        this.logger.info('DiagnosticsService shutdown complete');
    }

    public getBundleDir(): string {
        return this.bundleDir;
    }

    // ========================================================================
    // Bundle collection
    // ========================================================================

    /**
     * Collect a log bundle from the given host. Returns the local file path
     * of the downloaded tar.gz on success.
     *
     * Phases (broadcast via `event:bundle-progress`):
     *   1. uploading  — SCP collect.sh to /tmp on the host
     *   2. running    — execute collect.sh; auto-respond to prompts
     *   3. downloading — SFTP pull the .tar.gz to the local bundle dir
     *   4. cleanup    — rm /tmp/collect.sh + the remote .tar.gz
     *   5. complete   — emit final state with size/path
     */
    public async collectBundle(hostId: string): Promise<{ localPath: string; size: number }> {
        if (this.bundles.has(hostId)) {
            throw new Error('BUNDLE_IN_PROGRESS: a collection is already running for this host');
        }
        const host = HostRepository.requireById(hostId);
        const handle = { canceled: false };
        this.bundles.set(hostId, handle);

        try {
            const client = await ensureHostConnected(hostId);
            const remoteScript = '/tmp/vizcloud-collect.sh';

            // 1. Upload
            this.emitProgress(hostId, 'uploading', 0, `Uploading collect.sh to ${host.hostname}…`);
            await this.sftpWriteFile(client, remoteScript, COLLECT_SCRIPT, 0o755);
            if (handle.canceled) throw new Error('BUNDLE_CANCELLED');

            // 2. Run with PTY, handle prompts.
            this.emitProgress(hostId, 'running', 5,
                `Running collect.sh on ${host.hostname}. This usually takes 5–10 minutes.`);
            const tarFilename = await this.runCollectScript(client, hostId, remoteScript, handle);
            if (!tarFilename) throw new Error('BUNDLE_FAILED: no archive filename emitted by collect.sh');

            // 3. Download — native SFTP with progress callbacks.
            this.emitProgress(hostId, 'downloading', 80, `Downloading ${tarFilename}…`);
            const localFilename = `${host.hostname}_${tarFilename}`;
            const localPath = join(this.bundleDir, localFilename);
            const remoteTar = `/tmp/${tarFilename}`;
            await this.sftpDownload(client, remoteTar, localPath, (transferred, total) => {
                if (total > 0) {
                    const pct = 80 + Math.min(14, Math.floor((transferred / total) * 14));
                    this.emitProgress(
                        hostId,
                        'downloading',
                        pct,
                        `Downloading ${tarFilename} — ${formatBytes(transferred)} / ${formatBytes(total)}`,
                    );
                }
            });

            // 4. Cleanup
            this.emitProgress(hostId, 'cleanup', 95, 'Cleaning up remote artifacts…');
            await client.runCommand(['rm', '-f', remoteScript, remoteTar], { timeoutMs: 30_000 })
                .catch((err) => this.logger.warn(`Remote cleanup failed: ${(err as Error).message}`));

            // 5. Complete
            const stats = await stat(localPath);
            this.emitProgress(hostId, 'complete', 100,
                `Saved ${formatBytes(stats.size)} to ${localFilename}`,
                { localPath, size: stats.size });
            this.logger.info(`Bundle collected for ${host.hostname}: ${localPath} (${stats.size} bytes)`);
            return { localPath, size: stats.size };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.emitProgress(hostId, 'failed', 0, message);
            throw err;
        } finally {
            this.bundles.delete(hostId);
        }
    }

    /** Cancel an in-flight bundle collection. */
    public cancelBundle(hostId: string): void {
        const handle = this.bundles.get(hostId);
        if (handle) handle.canceled = true;
    }

    /** List previously-collected bundles for the renderer. */
    public async listBundles(): Promise<BundleSummary[]> {
        const entries = await readdir(this.bundleDir).catch(() => [] as string[]);
        const result: BundleSummary[] = [];
        for (const name of entries) {
            if (!name.endsWith('.tar.gz')) continue;
            const fullPath = join(this.bundleDir, name);
            try {
                const s = await stat(fullPath);
                result.push({
                    fileName: name,
                    fullPath,
                    size: s.size,
                    createdAt: s.mtimeMs,
                });
            } catch {
                // ignore unreadable entry
            }
        }
        result.sort((a, b) => b.createdAt - a.createdAt);
        return result;
    }

    // ========================================================================
    // Live log tail
    // ========================================================================

    public async startTail(hostId: string, source: LogSourceId): Promise<void> {
        const key = `${hostId}:${source}`;
        if (this.tails.has(key)) return;
        const tailCmd = LOG_SOURCES[source];
        if (!tailCmd) throw new Error(`UNKNOWN_LOG_SOURCE: ${source}`);
        const client = await ensureHostConnected(hostId);

        let canceled = false;
        const stream = client.streamCommandWithCancel(
            ['sh', '-c', tailCmd],
            (line, src) => {
                if (canceled) return;
                this.emitLogLine(hostId, source, line, src);
            },
            { timeoutMs: 24 * 60 * 60 * 1000 },
        );

        const handle: ActiveTail = {
            cancel: () => {
                canceled = true;
                stream.cancel();
            },
            result: stream.result.catch((err) => {
                if (!canceled) {
                    this.logger.warn(`tail ${source} on ${hostId} ended: ${(err as Error).message}`);
                }
            }).finally(() => {
                this.tails.delete(key);
            }),
        };
        this.tails.set(key, handle);
    }

    public stopTail(hostId: string, source: LogSourceId): void {
        const key = `${hostId}:${source}`;
        const handle = this.tails.get(key);
        if (!handle) return;
        handle.cancel();
        // The handle removes itself from the map when the stream's `close`
        // event fires; we don't await here to keep stop() snappy.
    }

    // ========================================================================
    // Bundle file management (per-row actions in the renderer)
    // ========================================================================

    public async saveBundleAs(fileName: string, destPath: string): Promise<void> {
        const sourcePath = this.resolveBundlePath(fileName);
        await copyFile(sourcePath, destPath);
    }

    public async deleteBundle(fileName: string): Promise<void> {
        const sourcePath = this.resolveBundlePath(fileName);
        await unlink(sourcePath);
    }

    /** Returns the absolute path of a saved bundle, validating the filename
     *  is contained in our bundle directory (no path traversal). */
    public resolveBundlePath(fileName: string): string {
        const base = basename(fileName);
        if (!base.endsWith('.tar.gz')) {
            throw new Error('INVALID_BUNDLE: filename must end with .tar.gz');
        }
        return join(this.bundleDir, base);
    }

    public listLogSources(): ReadonlyArray<LogSourceId> {
        return Object.keys(LOG_SOURCES) as LogSourceId[];
    }

    // ========================================================================
    // Internals
    // ========================================================================

    /**
     * Write content to a remote path via SFTP. We can't use streamCommand
     * here because we need to push bytes, not commands; reach into the
     * underlying ssh2.Client via the SshClient pool.
     */
    private async sftpWriteFile(
        client: SshClient,
        remotePath: string,
        content: string,
        mode: number,
    ): Promise<void> {
        const sftp = await client.sftp();
        try {
            await new Promise<void>((resolve, reject) => {
                sftp.writeFile(remotePath, content, { mode }, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        } finally {
            sftp.end();
        }
    }

    /**
     * Run collect.sh on the remote host. Watches stdout for the two known
     * interactive prompts and stuffs the appropriate response into stdin.
     * Returns the basename of the produced tar.gz.
     */
    private async runCollectScript(
        client: SshClient,
        hostId: string,
        remoteScript: string,
        cancelHandle: { canceled: boolean },
    ): Promise<string | null> {
        // collect.sh emits "Output archive created: <name>.tar.gz" on success.
        // We tee output to a temp file so we can grep it post-run, and also
        // pipe through awk that auto-answers "1" to the cleanup prompt and
        // "ENTER" wherever the SOS-report message appears (mirrors MorphLogGrabber).
        const promptHelper = `
awk 'BEGIN { RS="\\n"; ORS="\\n" }
     { print; fflush() }
     /Enter your choice \\(1 or 2\\):/ { print "1" > "/dev/stderr"; system("echo 1") }
     /Collecting SOS report\\.\\.\\./ { system("printf \\\\n") }
'`;
        // Simpler & more reliable: pre-pipe "1\\n\\n" into stdin so the script,
        // when prompted, reads "1" then ENTER. Most invocations only have
        // these two prompts in this order; if the cleanup prompt isn't reached
        // (no existing logs) the extra inputs are ignored.
        void promptHelper;
        const cmd = [
            'sh', '-c',
            `cd /tmp && printf '1\\n\\n\\n' | bash ${remoteScript} 2>&1`,
        ];

        const start = Date.now();
        const result = await client.runCommand(cmd, { timeoutMs: 30 * 60 * 1000 });
        if (cancelHandle.canceled) return null;
        const elapsed = Math.round((Date.now() - start) / 1000);
        this.logger.info(`collect.sh on ${hostId} exited ${result.code} after ${elapsed}s`);

        // Surface progress mid-run isn't possible with runCommand; we emit a
        // last-mile "running 70%" beat now that the script is done.
        this.emitProgress(hostId, 'running', 70, `collect.sh finished (exit ${result.code}); locating archive…`);

        // Parse the archive name from stdout.
        const match = result.stdout.match(/Output archive created:\s*(\S+\.tar\.gz)/);
        return match?.[1] ?? null;
    }

    private async sftpDownload(
        client: SshClient,
        remotePath: string,
        localPath: string,
        onProgress?: (transferred: number, total: number) => void,
    ): Promise<void> {
        const sftp = await client.sftp();
        try {
            // Get the remote size first so progress callbacks have a denominator.
            const total = await new Promise<number>((resolve, reject) => {
                sftp.stat(remotePath, (err, stats) => {
                    if (err) reject(err);
                    else resolve(stats.size);
                });
            });
            await new Promise<void>((resolve, reject) => {
                sftp.fastGet(
                    remotePath,
                    localPath,
                    {
                        step: (transferred) => {
                            onProgress?.(transferred, total);
                        },
                    },
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    },
                );
            });
        } finally {
            sftp.end();
        }
    }

    private emitProgress(
        hostId: string,
        phase: BundleProgressPayload['phase'],
        percent: number,
        message: string,
        extra?: { localPath?: string; size?: number },
    ): void {
        const payload: BundleProgressPayload = {
            hostId,
            phase,
            percent,
            message,
            timestamp: Date.now(),
            ...extra,
        };
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC_EVENTS.bundleProgress, payload);
        }
    }

    private emitLogLine(
        hostId: string,
        source: LogSourceId,
        line: string,
        stream: 'stdout' | 'stderr',
    ): void {
        const payload: LogLinePayload = {
            hostId,
            source,
            stream,
            line,
            timestamp: Date.now(),
        };
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC_EVENTS.logLine, payload);
        }
    }
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}
