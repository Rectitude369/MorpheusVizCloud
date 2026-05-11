/**
 * MetricsService — collect /proc/* counters from managed hosts.
 *
 * Replaces the previous implementation that:
 *   • had an empty memory/swap parser branch (BUG-009 — Rule 3 violation),
 *   • ran a `DELETE FROM system_metrics` on every insert (BUG-020),
 *   • relied on `top -bn1` text scraping (locale-fragile).
 *
 * The new implementation:
 *   • Collects two CPU samples one second apart and computes a true
 *     percentage (delta of /proc/stat idle vs total).
 *   • Parses /proc/meminfo, /proc/diskstats, /proc/net/dev with shared
 *     parsers (lib/parsers.ts).
 *   • Inserts a single row per host per tick (batch-friendly via prepared
 *     statement).
 *   • Runs retention as a daily timer (90 days by default), not on every
 *     write.
 *   • Pushes `event:metrics-tick` so the renderer can update without
 *     polling.
 */

import { BrowserWindow } from 'electron';

import { LoggerService } from '../core/logger.service';
import { databaseService } from '../db/database.service';
import { rowToMetrics, type MetricsRow } from '../db/mappers';
import { type SshClient } from '../lib/ssh-client';
import { parseDiskstats, parseLoadAverage, parseMeminfo, parseNetDev, parseProcStat } from '../lib/parsers';
import { IPC_EVENTS } from '@shared/ipc/contract';
import type { SystemMetrics } from '@shared/types';

import { ensureHostConnected } from './connection-manager';
import { HostRepository } from './host-repository';

const COLLECTION_INTERVAL_MS = 30_000;
const RETENTION_DAYS = 90;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class MetricsService {
    private readonly logger = new LoggerService('MetricsService');
    private readonly collectors = new Map<string, NodeJS.Timeout>();
    private retentionTimer: NodeJS.Timeout | null = null;

    public async initialize(): Promise<void> {
        // Daily retention sweep.
        this.retentionTimer = setInterval(() => {
            this.runRetention().catch((err) => this.logger.error('Retention sweep failed', err));
        }, RETENTION_INTERVAL_MS);
        this.retentionTimer.unref?.();
        this.logger.info('MetricsService initialized');
    }

    public async shutdown(): Promise<void> {
        for (const [, timer] of this.collectors) {
            clearInterval(timer);
        }
        this.collectors.clear();
        if (this.retentionTimer) {
            clearInterval(this.retentionTimer);
            this.retentionTimer = null;
        }
        this.logger.info('MetricsService shutdown complete');
    }

    public async startCollection(hostId: string): Promise<void> {
        if (this.collectors.has(hostId)) return;
        const timer = setInterval(() => {
            this.collectMetrics(hostId).catch((err) => {
                this.logger.error(`Metrics collection failed for ${hostId}`, err);
            });
        }, COLLECTION_INTERVAL_MS);
        timer.unref?.();
        this.collectors.set(hostId, timer);
        this.logger.info(`Started metrics collection for ${hostId}`);
    }

    public async stopCollection(hostId: string): Promise<void> {
        const timer = this.collectors.get(hostId);
        if (timer) {
            clearInterval(timer);
            this.collectors.delete(hostId);
            this.logger.info(`Stopped metrics collection for ${hostId}`);
        }
    }

    public async collectMetrics(hostId: string): Promise<SystemMetrics> {
        // Validate host exists; surfaces a precise error if not.
        HostRepository.requireById(hostId);
        const client = await ensureHostConnected(hostId);

        const metrics = await this.sample(client);
        this.persist(hostId, metrics);
        this.emitTick(hostId, metrics);
        return metrics;
    }

    public async getMetrics(hostId: string, startTime: number, endTime: number): Promise<SystemMetrics[]> {
        const rows = databaseService.queryAll<MetricsRow>(
            'SELECT * FROM system_metrics WHERE host_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC',
            hostId, startTime, endTime,
        );
        return rows.map(rowToMetrics);
    }

    private async sample(client: SshClient): Promise<SystemMetrics> {
        const M = '##VIZCLOUD_METRICS##';
        // `set +e` + `; exit 0` keeps the script tolerant: if any individual
        // /proc read fails (e.g. transient I/O hiccup), that section parses as
        // empty and the rest of the sample is still usable.
        const commands = [
            'cat /proc/stat | head -1',
            'cat /proc/meminfo',
            'cat /proc/diskstats',
            'cat /proc/net/dev',
            'cat /proc/loadavg',
            "awk '{print int($1)}' /proc/uptime",
            'sleep 1',
            'cat /proc/stat | head -1',
            'cat /proc/diskstats',
            'cat /proc/net/dev',
        ];
        const parts: string[] = ['set +e'];
        commands.forEach((cmd, idx) => {
            if (idx > 0) parts.push(`printf '%s\\n' '${M}'`);
            parts.push(cmd);
        });
        parts.push('exit 0');
        const script = parts.join('; ');
        const result = await client.runCommand(['sh', '-c', script], { timeoutMs: 15_000 });
        if (result.code !== 0) {
            throw new Error(`METRICS_FAILED: ${result.stderr.trim() || `exit ${result.code}`}`);
        }
        const sections = result.stdout.split(M).map((s) => s.trim());
        const [
            cpu1, meminfoText, diskstats1, netdev1, loadavg, uptimeStr, , cpu2, diskstats2, netdev2,
        ] = sections;

        const cpuStart = parseProcStat(cpu1 ?? '');
        const cpuEnd = parseProcStat(cpu2 ?? '');
        const totalDelta = cpuEnd.total - cpuStart.total;
        const idleDelta = cpuEnd.idle - cpuStart.idle;
        const cpuUsage = totalDelta > 0 ? Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100)) : 0;

        const mem = parseMeminfo(meminfoText ?? '');
        const memoryTotal = mem['MemTotal'] ?? 0;
        const memoryAvailable = mem['MemAvailable'] ?? mem['MemFree'] ?? 0;
        const memoryCached = mem['Cached'] ?? 0;
        const memoryBuffers = mem['Buffers'] ?? 0;
        const swapTotal = mem['SwapTotal'] ?? 0;
        const swapFree = mem['SwapFree'] ?? swapTotal;
        const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);

        const diskA = parseDiskstats(diskstats1 ?? '');
        const diskB = parseDiskstats(diskstats2 ?? '');
        const diskIORead = Math.max(0, diskB.readBytes - diskA.readBytes);
        const diskIOWrite = Math.max(0, diskB.writeBytes - diskA.writeBytes);

        const netA = parseNetDev(netdev1 ?? '');
        const netB = parseNetDev(netdev2 ?? '');
        const networkRx = Math.max(0, netB.rxBytes - netA.rxBytes);
        const networkTx = Math.max(0, netB.txBytes - netA.txBytes);
        const networkErrors = Math.max(0, netB.errors - netA.errors);

        const load = parseLoadAverage(loadavg ?? '');

        return {
            timestamp: Date.now(),
            hostId: '', // filled by caller via persist()
            cpuUsage,
            cpuLoad: load,
            memoryTotal, memoryUsed, memoryAvailable, memoryCached, memoryBuffers,
            swapTotal, swapUsed: Math.max(0, swapTotal - swapFree),
            diskIORead, diskIOWrite, diskIOUtil: 0,
            networkRx, networkTx, networkErrors,
            uptime: parseInt(uptimeStr ?? '', 10) || 0,
            loadAverage: load,
        };
    }

    private persist(hostId: string, metrics: SystemMetrics): void {
        databaseService.get().prepare(
            `INSERT INTO system_metrics (
                host_id, timestamp, cpu_usage, cpu_load_1m, cpu_load_5m, cpu_load_15m,
                memory_total, memory_used, memory_available, memory_cached, memory_buffers,
                swap_total, swap_used,
                disk_io_read, disk_io_write, disk_io_util,
                network_rx, network_tx, network_errors,
                uptime, load_average_1m, load_average_5m, load_average_15m
             ) VALUES (
                @host_id, @timestamp, @cpu_usage, @cpu_load_1m, @cpu_load_5m, @cpu_load_15m,
                @memory_total, @memory_used, @memory_available, @memory_cached, @memory_buffers,
                @swap_total, @swap_used,
                @disk_io_read, @disk_io_write, @disk_io_util,
                @network_rx, @network_tx, @network_errors,
                @uptime, @load_average_1m, @load_average_5m, @load_average_15m
             )`,
        ).run({
            host_id: hostId,
            timestamp: metrics.timestamp,
            cpu_usage: metrics.cpuUsage,
            cpu_load_1m: metrics.cpuLoad[0],
            cpu_load_5m: metrics.cpuLoad[1],
            cpu_load_15m: metrics.cpuLoad[2],
            memory_total: metrics.memoryTotal,
            memory_used: metrics.memoryUsed,
            memory_available: metrics.memoryAvailable,
            memory_cached: metrics.memoryCached,
            memory_buffers: metrics.memoryBuffers,
            swap_total: metrics.swapTotal,
            swap_used: metrics.swapUsed,
            disk_io_read: metrics.diskIORead,
            disk_io_write: metrics.diskIOWrite,
            disk_io_util: metrics.diskIOUtil,
            network_rx: metrics.networkRx,
            network_tx: metrics.networkTx,
            network_errors: metrics.networkErrors,
            uptime: metrics.uptime,
            load_average_1m: metrics.loadAverage[0],
            load_average_5m: metrics.loadAverage[1],
            load_average_15m: metrics.loadAverage[2],
        });
    }

    private async runRetention(): Promise<void> {
        const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const result = databaseService.run('DELETE FROM system_metrics WHERE timestamp < ?', cutoff);
        if (result.changes > 0) {
            this.logger.info(`Retention sweep deleted ${result.changes} old metric rows`);
        }
    }

    private emitTick(hostId: string, metrics: SystemMetrics): void {
        const payload = { hostId, metrics: { ...metrics, hostId } };
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC_EVENTS.metricsTick, payload);
        }
    }
}
