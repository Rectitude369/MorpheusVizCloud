/**
 * HostService — discover, connect to, monitor, and manage HVM hosts.
 *
 * Replaces the previous SSH-shell-out implementation that:
 *   • interpolated user input into shell commands (SEC-002),
 *   • opened a fresh TCP handshake per command (BUG-020),
 *   • stored credentials in plaintext (SEC-003),
 *   • did `INSERT OR REPLACE` upserts that cascaded FK deletes (DATA-001),
 *   • cast raw rows with `as Host[]` despite a snake↔camel mismatch (DATA-003).
 *
 * The new implementation:
 *   • Uses `ssh2.Client` via `SshClient` with argv-based command exec.
 *   • Encrypts saved passwords with Electron `safeStorage` (BLOB column).
 *   • Uses `INSERT … ON CONFLICT DO UPDATE` with named bindings.
 *   • Maps every row through `rowToHost` (DATA-003).
 *   • Pools one `SshClient` per host id and reuses it for polling.
 *   • Emits `event:host-status` push events on every successful poll so
 *     the renderer's RTK Query cache stays current without polling.
 */

import { app, BrowserWindow, safeStorage } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { Buffer } from 'node:buffer';

import { LoggerService } from '../core/logger.service';
import { databaseService } from '../db/database.service';
import { rowToHostConnection, type HostConnectionRow } from '../db/mappers';
import { KeyedSerializer, Semaphore } from '../lib/semaphore';
import { sshPool, type SshAuth, type SshClient, configureSshPool } from '../lib/ssh-client';
import { parseLoadAverage, parseUptime } from '../lib/parsers';
import { IPC_EVENTS } from '@shared/ipc/contract';
import { HostStatus, type Host, type HostConnection } from '@shared/types';

import { HostRepository } from './host-repository';
import type { VMService } from './vm.service';

const POLL_INTERVAL_MS = 30_000;

interface SaveConnectionInput extends HostConnection {
    /**
     * Plaintext password — only present when the user opts into password
     * authentication. The service encrypts it via `safeStorage` and stores
     * the ciphertext in `host_connections.password_blob`.
     */
    password?: string;
}

export class HostService {
    private readonly logger = new LoggerService('HostService');
    private readonly pollTimers = new Map<string, NodeJS.Timeout>();
    /** Cap concurrent SSH-heavy auto-discoveries so a 50-host fleet doesn't
     *  saturate the laptop's TCP table or the target hosts' sshd. */
    private readonly discoverySem = new Semaphore(4);
    /** Per-host serializer — coalesces duplicate discover requests. */
    private readonly discoveryKeys = new KeyedSerializer();
    /** Lazy-injected to avoid a circular import with VMService. */
    private vmService?: VMService;
    private initialized = false;

    public setVMService(vm: VMService): void {
        this.vmService = vm;
    }

    public async initialize(): Promise<void> {
        if (this.initialized) return;
        configureSshPool(app.getPath('userData'));
        this.initialized = true;
        this.logger.info('HostService initialized');
    }

    /**
     * Rehydrate the in-memory connection state for hosts the user has
     * previously connected to. Called once after services init + IPC are
     * ready, so heartbeat status events can reach the renderer.
     *
     * Each host is queued through the discovery semaphore (max 4 concurrent)
     * with the keyed serializer ensuring no double-discover for the same id.
     * Failures are logged per-host and never abort startup.
     */
    public resumeKnownHosts(): void {
        const rows = databaseService.queryAll<{ id: string }>(
            'SELECT id FROM host_connections WHERE last_connected > 0 ORDER BY last_connected DESC',
        );
        if (rows.length === 0) return;
        this.logger.info(`Bootstrap: resuming ${rows.length} previously-connected host(s)`);
        for (const { id } of rows) {
            void this.scheduleDiscovery(id);
        }
    }

    /**
     * Queue a VM discovery + heartbeat-poll bootstrap for the given host.
     * Re-entrant safe — duplicate requests for the same host coalesce into
     * the in-flight promise. Auto-throttled via the discovery semaphore.
     */
    public scheduleDiscovery(hostId: string): Promise<void> {
        return this.discoveryKeys.run(`discover:${hostId}`, () =>
            this.discoverySem.run(async () => {
                try {
                    if (!this.vmService) {
                        this.logger.warn('VMService not wired; auto-discover skipped');
                        return;
                    }
                    await this.vmService.discoverVMs(hostId);
                    this.ensurePolling(hostId);
                } catch (err) {
                    this.logger.warn(
                        `Auto-discover ${hostId} failed: ${(err as Error).message}`,
                    );
                }
            }),
        ).then(() => undefined);
    }

    private ensurePolling(hostId: string): void {
        if (this.pollTimers.has(hostId)) return;
        this.startPolling(hostId);
    }

    public async shutdown(): Promise<void> {
        for (const [hostId, timer] of this.pollTimers) {
            clearInterval(timer);
            this.logger.debug(`Cleared poll timer for host ${hostId}`);
        }
        this.pollTimers.clear();
        sshPool.closeAll();
        this.logger.info('HostService shutdown complete');
    }

    // ========================================================================
    // Queries
    // ========================================================================

    public async getHost(hostId: string): Promise<Host | null> {
        return HostRepository.findById(hostId);
    }

    public async getAllHosts(): Promise<Host[]> {
        return HostRepository.findAll();
    }

    public async getOnlineHosts(): Promise<Host[]> {
        return HostRepository.findByStatus(HostStatus.ONLINE);
    }

    // ========================================================================
    // Connection lifecycle
    // ========================================================================

    public async connect(connection: HostConnection & { password?: string }): Promise<Host> {
        this.logger.info(`Connecting to ${connection.host}`);
        const auth = await this.resolveAuth(connection);

        // Open a pooled SSH connection. `getOrCreate` auto-`connect()`s.
        const client = await sshPool.getOrCreate({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            auth,
            timeoutMs: 15_000,
        });

        // Gather host facts in a single batch — multiplexed channels on one
        // connection, no shell on the local machine.
        const facts = await this.gatherHostFacts(client);
        const host = this.upsertHost(connection, facts);

        // Persist credentials so future sessions can auto-reconnect via
        // ConnectionManager.ensureHostConnected. saveConnection encrypts the
        // password through safeStorage when password auth is selected, and
        // preserves the existing blob via COALESCE on subsequent reconnects.
        await this.saveConnection(connection);

        // Update last_connected on the saved connection record.
        databaseService.run(
            'UPDATE host_connections SET last_connected = ?, updated_at = ? WHERE id = ?',
            Date.now(), Date.now(), connection.id,
        );

        this.startPolling(host.id);
        this.emitStatus(host.id, host.status, host.lastHeartbeat);

        // Auto-discover VMs in the background. Renderer's event-bridge picks
        // up RTK-Query cache invalidations via the migration/host events;
        // VM list will refresh on the next refetch trigger.
        void this.scheduleDiscovery(host.id);

        return host;
    }

    public async disconnect(hostId: string): Promise<void> {
        const timer = this.pollTimers.get(hostId);
        if (timer) {
            clearInterval(timer);
            this.pollTimers.delete(hostId);
        }
        sshPool.close(hostId);
        databaseService.run(
            'UPDATE hosts SET status = ?, last_heartbeat = ?, updated_at = ? WHERE id = ?',
            HostStatus.OFFLINE, Date.now(), Date.now(), hostId,
        );
        this.emitStatus(hostId, HostStatus.OFFLINE, Date.now());
        this.logger.info(`Disconnected host ${hostId}`);
    }

    // ========================================================================
    // CRUD
    // ========================================================================

    public async updateHost(hostId: string, patch: Partial<Host>): Promise<Host> {
        const existing = HostRepository.requireById(hostId);
        // Whitelist user-editable fields so we never let the renderer
        // overwrite system-managed fields like uptime / status.
        const editable: Array<keyof Host> = ['datacenter', 'rack', 'tags', 'notes', 'clusterId'];
        const updates: Record<string, unknown> = { updated_at: Date.now() };
        for (const key of editable) {
            if (patch[key] !== undefined) {
                const dbKey = camelToSnake(key);
                updates[dbKey] =
                    key === 'tags' ? JSON.stringify(patch.tags ?? []) : (patch[key] as unknown);
            }
        }
        if (Object.keys(updates).length === 1) {
            return existing;
        }
        const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
        databaseService.get().prepare(`UPDATE hosts SET ${setClause} WHERE id = @id`).run({ ...updates, id: hostId });
        const updated = HostRepository.requireById(hostId);
        return updated;
    }

    public async deleteHost(hostId: string): Promise<void> {
        await this.disconnect(hostId);
        databaseService.run('DELETE FROM hosts WHERE id = ?', hostId);
        this.logger.info(`Deleted host ${hostId}`);
    }

    // ========================================================================
    // Saved connections (host_connections table)
    // ========================================================================

    public async listSavedConnections(): Promise<HostConnection[]> {
        const rows = databaseService.queryAll<HostConnectionRow>('SELECT id, name, host, port, username, auth_method, key_path, last_connected, tags, created_at, updated_at FROM host_connections ORDER BY name');
        return rows.map(rowToHostConnection);
    }

    public async saveConnection(input: SaveConnectionInput): Promise<HostConnection> {
        const passwordBlob = this.encryptPasswordIfNeeded(input);
        const now = Date.now();
        // Resolve the id once so the post-insert SELECT uses the same value as
        // the INSERT (the previous code passed `input.id || uuidv4()` to the
        // INSERT but used `input.id` in the SELECT, which 404'd on empty input.id).
        const id = input.id || uuidv4();
        databaseService.get().prepare(
            `INSERT INTO host_connections (id, name, host, port, username, auth_method, password_blob, key_path, tags, created_at, updated_at)
             VALUES (@id, @name, @host, @port, @username, @auth_method, @password_blob, @key_path, @tags, @created_at, @updated_at)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                host = excluded.host,
                port = excluded.port,
                username = excluded.username,
                auth_method = excluded.auth_method,
                password_blob = COALESCE(excluded.password_blob, host_connections.password_blob),
                key_path = excluded.key_path,
                tags = excluded.tags,
                updated_at = excluded.updated_at`,
        ).run({
            id,
            name: input.name,
            host: input.host,
            port: input.port ?? 22,
            username: input.username,
            auth_method: input.authMethod,
            password_blob: passwordBlob,
            key_path: input.keyPath ?? null,
            tags: JSON.stringify(input.tags ?? []),
            created_at: now,
            updated_at: now,
        });
        const row = databaseService.queryGet<HostConnectionRow>('SELECT * FROM host_connections WHERE id = ?', id);
        if (!row) throw new Error('SAVE_FAILED: connection not found after upsert');
        return rowToHostConnection(row);
    }

    public async removeConnection(id: string): Promise<void> {
        databaseService.run('DELETE FROM host_connections WHERE id = ?', id);
    }

    // ========================================================================
    // Internals
    // ========================================================================

    private async resolveAuth(connection: HostConnection & { password?: string }): Promise<SshAuth> {
        if (connection.authMethod === 'agent') {
            return { type: 'agent' };
        }
        if (connection.authMethod === 'key') {
            if (!connection.keyPath) {
                throw new Error('AUTH_FAILED: key auth selected but no keyPath provided');
            }
            const fs = await import('node:fs/promises');
            const key = await fs.readFile(connection.keyPath, 'utf8');
            return { type: 'key', privateKey: key };
        }
        // password auth
        if (connection.password) {
            return { type: 'password', password: connection.password };
        }
        const stored = await this.lookupStoredPassword(connection.id);
        if (!stored) {
            throw new Error('AUTH_FAILED: password required but none provided or saved');
        }
        return { type: 'password', password: stored };
    }

    private async lookupStoredPassword(connectionId: string): Promise<string | null> {
        const row = databaseService.queryGet<{ password_blob: Buffer | null }>(
            'SELECT password_blob FROM host_connections WHERE id = ?',
            connectionId,
        );
        if (!row?.password_blob) return null;
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('AUTH_FAILED: OS keychain not available; cannot decrypt stored password');
        }
        try {
            return safeStorage.decryptString(row.password_blob as Buffer);
        } catch (err) {
            this.logger.error('Failed to decrypt stored password', err);
            return null;
        }
    }

    private encryptPasswordIfNeeded(input: SaveConnectionInput): Buffer | null {
        if (input.authMethod !== 'password' || !input.password) {
            return null;
        }
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('SAVE_FAILED: OS keychain not available; refusing to store password in plaintext');
        }
        return safeStorage.encryptString(input.password);
    }

    /**
     * Gather host facts via a single SSH session. Uses one large argv that
     * delimits each section with a magic marker so we can parse the bulk
     * output without N round-trips.
     */
    private async gatherHostFacts(client: SshClient): Promise<Partial<Host>> {
        // Marker is unlikely to appear in normal output; keeps parsing simple.
        const M = '##VIZCLOUD_SECTION##';
        // We use `sh -c` with argv quoting so user-controlled fields can never
        // bleed into the shell. The script itself is fixed.
        //
        // `set +e` + `; true` ensures one missing tool (e.g. `virsh` on a
        // non-libvirt host) yields an empty section rather than aborting the
        // whole probe. Sections that fail simply parse as 0 / ''.
        const commands = [
            'hostname',
            "ip -4 -o addr show scope global | awk '{print $4}' | head -1 | cut -d/ -f1",
            "ip -o link show | awk -F': ' 'NR==2 {print $2}' | head -1",
            "lscpu | awk -F: '/Model name/ {gsub(/^ +/, \"\", $2); print $2; exit}'",
            "nproc",
            "awk '/MemTotal/ {print $2 * 1024}' /proc/meminfo",
            "awk '/MemAvailable/ {print $2 * 1024}' /proc/meminfo",
            "df -B1 / --output=size,used | tail -1",
            "uptime -p 2>/dev/null || awk '{print int($1)\" seconds\"}' /proc/uptime",
            "cat /proc/loadavg",
            "virsh version --daemon 2>/dev/null | awk '/Running hypervisor/ {print $3}' | head -1",
            "qemu-system-x86_64 --version 2>/dev/null | head -1",
            "virsh list --all --name 2>/dev/null | grep -c .",
            "virsh list --name 2>/dev/null | grep -c .",
        ];
        const parts: string[] = ['set +e'];
        commands.forEach((cmd, idx) => {
            if (idx > 0) parts.push(`printf '%s\\n' '${M}'`);
            parts.push(cmd);
        });
        parts.push('exit 0');
        const script = parts.join('; ');

        const result = await client.runCommand(['sh', '-c', script], { timeoutMs: 30_000 });
        // With `exit 0` the script always returns 0 unless ssh itself fails;
        // ssh-level failures throw before we get here.
        if (result.code !== 0) {
            throw new Error(`HOST_DISCOVERY_FAILED: exit ${result.code}: ${result.stderr.trim()}`);
        }
        const sections = result.stdout.split(M).map((s) => s.trim());
        const [
            hostname, ipAddress, macAddressLine, cpuModel, coresStr,
            memTotalStr, memAvailStr, dfLine, uptimeStr, loadAvgStr,
            libvirtVersion, qemuVersionLine, vmCountStr, vmRunningCountStr,
        ] = sections;

        const dfParts = dfLine?.trim().split(/\s+/) ?? [];
        const storageTotal = parseInt(dfParts[0] ?? '', 10) || 0;
        const storageUsed = parseInt(dfParts[1] ?? '', 10) || 0;

        return {
            hostname: hostname || '',
            ipAddress: ipAddress || '0.0.0.0',
            macAddress: '', // mac of first non-loopback iface; left blank for now (would need a second `ip link` lookup)
            cpuModel: cpuModel || 'Unknown',
            cpuCores: parseInt(coresStr ?? '', 10) || 0,
            cpuThreads: parseInt(coresStr ?? '', 10) || 0,
            memoryTotal: parseInt(memTotalStr ?? '', 10) || 0,
            memoryAvailable: parseInt(memAvailStr ?? '', 10) || 0,
            storageTotal,
            storageUsed,
            uptime: parseUptime(uptimeStr ?? '') || 0,
            loadAverage: parseLoadAverage(loadAvgStr ?? ''),
            libvirtVersion: libvirtVersion || '',
            qemuVersion: (qemuVersionLine ?? '').replace(/^QEMU emulator version\s*/, ''),
            vmCount: parseInt(vmCountStr ?? '', 10) || 0,
            vmRunningCount: parseInt(vmRunningCountStr ?? '', 10) || 0,
            status: HostStatus.ONLINE,
            lastHeartbeat: Date.now(),
        };
        // macAddressLine is currently unused — virsh hosts often have many
        // interfaces; we keep the field reserved for the next pass.
        void macAddressLine;
    }

    /**
     * INSERT … ON CONFLICT DO UPDATE — replaces the previous INSERT OR REPLACE
     * which silently nuked tags / notes / cluster_id (DATA-001) and cascaded
     * FK deletes through cluster_hosts / vms.
     */
    private upsertHost(connection: HostConnection, facts: Partial<Host>): Host {
        const existing = HostRepository.findByHostname(facts.hostname ?? connection.host);
        // The host's id MUST match the connection's id so that the SSH pool
        // (keyed by connection.id) and downstream services (keyed by host.id)
        // line up. The previous code generated a fresh UUID here when no
        // existing host was found, which left hosts.id != host_connections.id
        // and broke every operation that resolved the SSH client by host.id
        // (vms:discover, metrics:collect, etc.).
        const id = existing?.id ?? connection.id;
        const now = Date.now();
        databaseService.transaction(() => {
            databaseService.get().prepare(
                `INSERT INTO hosts (
                    id, hostname, ip_address, mac_address, datacenter, rack,
                    cpu_model, cpu_cores, cpu_threads, memory_total, memory_available,
                    storage_total, storage_used, status, last_heartbeat, uptime,
                    load_average_1m, load_average_5m, load_average_15m,
                    libvirt_version, qemu_version, vm_count, vm_running_count,
                    pcs_connected, corosync_connected, tags, notes,
                    created_at, updated_at
                ) VALUES (
                    @id, @hostname, @ip_address, @mac_address, '', NULL,
                    @cpu_model, @cpu_cores, @cpu_threads, @memory_total, @memory_available,
                    @storage_total, @storage_used, @status, @last_heartbeat, @uptime,
                    @load_average_1m, @load_average_5m, @load_average_15m,
                    @libvirt_version, @qemu_version, @vm_count, @vm_running_count,
                    0, 0, '[]', '',
                    @created_at, @updated_at
                )
                ON CONFLICT(id) DO UPDATE SET
                    hostname = excluded.hostname,
                    ip_address = excluded.ip_address,
                    cpu_model = excluded.cpu_model,
                    cpu_cores = excluded.cpu_cores,
                    cpu_threads = excluded.cpu_threads,
                    memory_total = excluded.memory_total,
                    memory_available = excluded.memory_available,
                    storage_total = excluded.storage_total,
                    storage_used = excluded.storage_used,
                    status = excluded.status,
                    last_heartbeat = excluded.last_heartbeat,
                    uptime = excluded.uptime,
                    load_average_1m = excluded.load_average_1m,
                    load_average_5m = excluded.load_average_5m,
                    load_average_15m = excluded.load_average_15m,
                    libvirt_version = excluded.libvirt_version,
                    qemu_version = excluded.qemu_version,
                    vm_count = excluded.vm_count,
                    vm_running_count = excluded.vm_running_count,
                    updated_at = excluded.updated_at`,
            ).run({
                id,
                hostname: facts.hostname ?? '',
                ip_address: facts.ipAddress ?? '',
                mac_address: facts.macAddress ?? '',
                cpu_model: facts.cpuModel ?? '',
                cpu_cores: facts.cpuCores ?? 0,
                cpu_threads: facts.cpuThreads ?? 0,
                memory_total: facts.memoryTotal ?? 0,
                memory_available: facts.memoryAvailable ?? 0,
                storage_total: facts.storageTotal ?? 0,
                storage_used: facts.storageUsed ?? 0,
                status: facts.status ?? 'online',
                last_heartbeat: facts.lastHeartbeat ?? now,
                uptime: facts.uptime ?? 0,
                load_average_1m: facts.loadAverage?.[0] ?? 0,
                load_average_5m: facts.loadAverage?.[1] ?? 0,
                load_average_15m: facts.loadAverage?.[2] ?? 0,
                libvirt_version: facts.libvirtVersion ?? '',
                qemu_version: facts.qemuVersion ?? '',
                vm_count: facts.vmCount ?? 0,
                vm_running_count: facts.vmRunningCount ?? 0,
                created_at: existing?.createdAt ?? now,
                updated_at: now,
            });
            // Side effect: ensure a paired host_connections row exists so the
            // user can re-connect later. Password is preserved if previously set.
            databaseService.get().prepare(
                `INSERT INTO host_connections (id, name, host, port, username, auth_method, key_path, tags, created_at, updated_at)
                 VALUES (@id, @name, @host, @port, @username, @auth_method, @key_path, @tags, @created_at, @updated_at)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    host = excluded.host,
                    port = excluded.port,
                    username = excluded.username,
                    auth_method = excluded.auth_method,
                    key_path = excluded.key_path,
                    tags = excluded.tags,
                    updated_at = excluded.updated_at`,
            ).run({
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port ?? 22,
                username: connection.username,
                auth_method: connection.authMethod,
                key_path: connection.keyPath ?? null,
                tags: JSON.stringify(connection.tags ?? []),
                created_at: now,
                updated_at: now,
            });
        });
        return HostRepository.requireById(id);
    }

    private startPolling(hostId: string): void {
        const existing = this.pollTimers.get(hostId);
        if (existing) clearInterval(existing);
        const timer = setInterval(() => {
            this.pollHost(hostId).catch((err) => {
                this.logger.error(`Poll failed for ${hostId}`, err);
            });
        }, POLL_INTERVAL_MS);
        // Don't keep the event loop alive on its own.
        timer.unref?.();
        this.pollTimers.set(hostId, timer);
    }

    private async pollHost(hostId: string): Promise<void> {
        const client = sshPool.get(hostId);
        if (!client) {
            // Caller previously disconnected; nothing to do.
            return;
        }
        try {
            // Lightweight heartbeat probe — `true` exits 0 immediately.
            await client.runCommand(['true'], { timeoutMs: 10_000 });
            const now = Date.now();
            databaseService.run(
                'UPDATE hosts SET status = ?, last_heartbeat = ?, updated_at = ? WHERE id = ?',
                HostStatus.ONLINE, now, now, hostId,
            );
            this.emitStatus(hostId, HostStatus.ONLINE, now);
        } catch (err) {
            this.logger.warn(`Heartbeat failed for ${hostId}: ${(err as Error).message}`);
            const now = Date.now();
            databaseService.run(
                'UPDATE hosts SET status = ?, last_heartbeat = ?, updated_at = ? WHERE id = ?',
                HostStatus.DEGRADED, now, now, hostId,
            );
            this.emitStatus(hostId, HostStatus.DEGRADED, now);
        }
    }

    private emitStatus(hostId: string, status: Host['status'], lastHeartbeat: number): void {
        const payload = { hostId, status, lastHeartbeat };
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC_EVENTS.hostStatus, payload);
        }
    }
}

function camelToSnake(s: string): string {
    return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}
