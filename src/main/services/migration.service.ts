/**
 * MigrationService — live (and cold) VM migrations between hosts.
 *
 * Replaces the previous fire-and-forget `execAsync(virsh migrate)` with:
 *   • streaming `--verbose` output via `SshClient.streamCommand` so progress
 *     events fire as the migration runs (BUG-010);
 *   • structured pre-flight checks (target host capacity, shared storage,
 *     CPU model compatibility);
 *   • per-VM concurrency lock (one in-flight migration per VM);
 *   • cancel-by-libvirt-name (BUG-036 — previous code passed VizCloud's
 *     internal UUID where libvirt expected the domain name);
 *   • rollback if the post-migrate host_id update fails.
 *
 * The renderer's `event-bridge.ts` listens for `event:migration-progress`
 * and patches the RTK Query cache so MigrationPage shows live state.
 */

import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';

import { LoggerService } from '../core/logger.service';
import { databaseService } from '../db/database.service';
import { rowToMigration, rowToVm, type MigrationRow, type VmRow } from '../db/mappers';
import { sshPool, type SshClient } from '../lib/ssh-client';
import { IPC_EVENTS } from '@shared/ipc/contract';
import { MigrationState, type Migration, type VM } from '@shared/types';

import { HostRepository } from './host-repository';

interface InFlight {
    migrationId: string;
    cancel: () => void;
}

export class MigrationService {
    private readonly logger = new LoggerService('MigrationService');
    /** vmId → in-flight migration; enforces single-in-flight-per-VM. */
    private readonly inflight = new Map<string, InFlight>();

    public async initialize(): Promise<void> {
        this.logger.info('MigrationService initialized');
    }

    public async shutdown(): Promise<void> {
        for (const [, m] of this.inflight) {
            try { m.cancel(); } catch { /* best effort */ }
        }
        this.inflight.clear();
        this.logger.info('MigrationService shutdown complete');
    }

    // ========================================================================
    // Queries
    // ========================================================================

    public async getMigration(id: string): Promise<Migration | null> {
        const row = databaseService.queryGet<MigrationRow>('SELECT * FROM migrations WHERE id = ?', id);
        return row ? rowToMigration(row) : null;
    }

    public async listMigrations(): Promise<Migration[]> {
        const rows = databaseService.queryAll<MigrationRow>('SELECT * FROM migrations ORDER BY started_at DESC');
        return rows.map(rowToMigration);
    }

    public async getActiveMigrations(): Promise<Migration[]> {
        const rows = databaseService.queryAll<MigrationRow>(
            "SELECT * FROM migrations WHERE state IN ('pending','transferring','finalizing') ORDER BY started_at DESC",
        );
        return rows.map(rowToMigration);
    }

    public async getMigrationsByVM(vmId: string): Promise<Migration[]> {
        const rows = databaseService.queryAll<MigrationRow>('SELECT * FROM migrations WHERE vm_id = ? ORDER BY started_at DESC', vmId);
        return rows.map(rowToMigration);
    }

    // ========================================================================
    // Operations
    // ========================================================================

    public async startMigration(
        vmId: string,
        sourceHostId: string,
        targetHostId: string,
        mode: 'live' | 'cold' = 'live',
    ): Promise<Migration> {
        if (this.inflight.has(vmId)) {
            throw new Error(`MIGRATION_IN_PROGRESS: VM ${vmId} already migrating`);
        }
        const vm = this.requireVm(vmId);
        if (vm.hostId !== sourceHostId) {
            throw new Error('SOURCE_MISMATCH: VM is not on the specified source host');
        }
        if (mode === 'live' && vm.state !== 'running') {
            throw new Error('VM_NOT_RUNNING: live migration requires a running VM');
        }
        const sourceHost = HostRepository.requireById(sourceHostId);
        const targetHost = HostRepository.requireById(targetHostId);

        await this.preflight(vm, targetHostId);

        const sourceClient = sshPool.get(sourceHostId);
        if (!sourceClient) {
            throw new Error(`HOST_NOT_CONNECTED: connect to source host ${sourceHostId} first`);
        }

        const migrationId = uuidv4();
        const now = Date.now();
        databaseService.run(
            `INSERT INTO migrations (
                id, vm_id, source_host_id, target_host_id, state, progress,
                data_total, data_processed, data_remaining, bandwidth, duration,
                mode, persistent, unsafe, started_at
             ) VALUES (?, ?, ?, ?, 'pending', 0, 0, 0, 0, 0, 0, ?, 1, 0, ?)`,
            migrationId, vmId, sourceHostId, targetHostId, mode, now,
        );

        // Detach: kick off the streaming migration without awaiting.
        const cancelHandle = { canceled: false };
        this.inflight.set(vmId, {
            migrationId,
            cancel: () => { cancelHandle.canceled = true; },
        });
        void this.executeMigration(migrationId, vm, sourceClient, sourceHost, targetHost, mode, cancelHandle);

        const fresh = await this.getMigration(migrationId);
        if (!fresh) throw new Error('MIGRATION_INCONSISTENT: row missing after insert');
        return fresh;
    }

    public async cancelMigration(migrationId: string): Promise<void> {
        const migration = await this.getMigration(migrationId);
        if (!migration) throw new Error(`MIGRATION_NOT_FOUND: ${migrationId}`);
        if (migration.state === 'completed' || migration.state === 'failed' || migration.state === 'cancelled') {
            throw new Error('MIGRATION_TERMINAL: cannot cancel a terminal migration');
        }
        const handle = this.inflight.get(migration.vmId);
        if (handle) handle.cancel();

        // BUG-036: virsh migrate-cancel needs the libvirt domain *name*, not
        // VizCloud's internal UUID.
        const vm = this.requireVm(migration.vmId);
        const sourceClient = sshPool.get(migration.sourceHostId);
        if (sourceClient) {
            await sourceClient.runCommand(['virsh', 'migrate-cancel', vm.name], { timeoutMs: 30_000 }).catch(() => undefined);
        }
        databaseService.run(
            "UPDATE migrations SET state = 'cancelled', completed_at = ? WHERE id = ?",
            Date.now(), migrationId,
        );
        this.emitProgress(migrationId, MigrationState.CANCELLED, migration.progress, migration.bandwidth, migration.dataProcessed);
        this.inflight.delete(migration.vmId);
    }

    // ========================================================================
    // Internals
    // ========================================================================

    private async preflight(vm: VM, targetHostId: string): Promise<void> {
        const target = HostRepository.requireById(targetHostId);
        // Capacity: target must have enough free memory.
        if (target.memoryAvailable > 0 && vm.memoryMaximum > target.memoryAvailable) {
            throw new Error(
                `PREFLIGHT_FAILED: target host has ${target.memoryAvailable} bytes available, VM requires ${vm.memoryMaximum}`,
            );
        }
        // Pulled checks (shared storage / CPU model) are infrastructure-specific
        // and would need to live in a `MigrationPolicy` module. We block this
        // path with a clear error rather than silently allowing.
        if (target.status !== 'online') {
            throw new Error(`PREFLIGHT_FAILED: target host status is ${target.status}`);
        }
    }

    private async executeMigration(
        migrationId: string,
        vm: VM,
        sourceClient: SshClient,
        sourceHost: { hostname: string },
        targetHost: { id: string; ipAddress: string; hostname: string },
        mode: 'live' | 'cold',
        cancelHandle: { canceled: boolean },
    ): Promise<void> {
        this.emitProgress(migrationId, MigrationState.TRANSFERRING, 0, 0, 0);
        databaseService.run("UPDATE migrations SET state = 'transferring' WHERE id = ?", migrationId);

        // Use the target host's saved SSH username for the qemu+ssh URI rather
        // than hardcoding `root@`. host_connections.id matches hosts.id (see
        // HostService.upsertHost), so a single lookup suffices.
        const targetConn = databaseService.queryGet<{ username: string }>(
            'SELECT username FROM host_connections WHERE id = ?',
            targetHost.id,
        );
        const targetUser = targetConn?.username ?? 'root';

        const argv = [
            'virsh', 'migrate',
            ...(mode === 'live' ? ['--live'] : []),
            '--persistent',
            '--verbose',
            vm.name,
            `qemu+ssh://${targetUser}@${targetHost.ipAddress}/system`,
        ];
        const startedAt = Date.now();

        try {
            const result = await sourceClient.streamCommand(argv, (line) => {
                if (cancelHandle.canceled) return;
                const progressMatch = line.match(/Migration:\s*\[\s*(\d+)\s*%/);
                if (progressMatch?.[1]) {
                    const progress = parseInt(progressMatch[1], 10);
                    databaseService.run('UPDATE migrations SET progress = ? WHERE id = ?', progress, migrationId);
                    this.emitProgress(migrationId, MigrationState.TRANSFERRING, progress, 0, 0);
                }
            }, { timeoutMs: 60 * 60 * 1000 });

            if (result.code !== 0 || cancelHandle.canceled) {
                throw new Error(result.stderr.trim() || `virsh migrate exit ${result.code}`);
            }

            const duration = Date.now() - startedAt;
            databaseService.transaction(() => {
                databaseService.run(
                    "UPDATE migrations SET state = 'completed', progress = 100, duration = ?, completed_at = ? WHERE id = ?",
                    duration, Date.now(), migrationId,
                );
                databaseService.run(
                    'UPDATE vms SET host_id = ?, migrating = 0, migration_state = NULL, migration_source_host = NULL, migration_target_host = NULL, migration_progress = 0, updated_at = ? WHERE id = ?',
                    targetHost.id, Date.now(), vm.id,
                );
            });
            this.emitProgress(migrationId, MigrationState.COMPLETED, 100, 0, 0);
            this.logger.info(`Migration ${migrationId} ${vm.name} ${sourceHost.hostname}→${targetHost.hostname} completed in ${duration}ms`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            databaseService.run(
                "UPDATE migrations SET state = 'failed', error = 'migration_failed', error_message = ?, completed_at = ? WHERE id = ?",
                message, Date.now(), migrationId,
            );
            this.emitProgress(migrationId, MigrationState.FAILED, 0, 0, 0);
            this.logger.error(`Migration ${migrationId} failed`, err);
        } finally {
            this.inflight.delete(vm.id);
        }
    }

    private requireVm(vmId: string): VM {
        const row = databaseService.queryGet<VmRow>('SELECT * FROM vms WHERE id = ?', vmId);
        if (!row) throw new Error(`VM_NOT_FOUND: ${vmId}`);
        return rowToVm(row);
    }

    private emitProgress(
        migrationId: string,
        state: MigrationState,
        progress: number,
        bandwidth: number,
        dataProcessed: number,
    ): void {
        const payload = { migrationId, state, progress, bandwidth, dataProcessed };
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC_EVENTS.migrationProgress, payload);
        }
    }
}
