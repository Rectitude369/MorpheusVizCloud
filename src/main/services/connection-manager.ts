/**
 * connection-manager — lazy SSH reconnect using credentials from
 * `host_connections`.
 *
 * The in-memory `sshPool` is wiped on every app launch, but the DB persists
 * the list of hosts and their saved credentials. After a restart the user
 * sees their hosts as "online" (the DB still says so) but every operation
 * that resolves the SSH client by `host.id` would otherwise fail with
 * HOST_NOT_CONNECTED. This helper closes that gap: when a service needs a
 * client it doesn't have, look up the saved connection and reconnect on the
 * fly. Connecting still goes through the normal `safeStorage` /
 * known_hosts / TOFU paths.
 *
 * Kept deliberately framework-light so VM/Cluster/Metrics services can
 * import it without dragging in the full HostService.
 */

import { safeStorage } from 'electron';
import type { Buffer } from 'node:buffer';

import { LoggerService } from '../core/logger.service';
import { databaseService } from '../db/database.service';
import { sshPool, type SshAuth, type SshClient } from '../lib/ssh-client';

const logger = new LoggerService('ConnectionManager');

interface HostConnectionAuthRow {
    id: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key' | 'agent';
    password_blob: Buffer | null;
    key_path: string | null;
}

/**
 * Return a live `SshClient` for the given host. If the pool already has one,
 * reuse it. Otherwise, look up the saved `host_connections` row for the host
 * and reconnect with those credentials.
 *
 * Throws if no saved connection exists or the credentials can't be resolved.
 */
export async function ensureHostConnected(hostId: string): Promise<SshClient> {
    const existing = sshPool.get(hostId);
    if (existing) {
        return existing;
    }

    const row = databaseService.queryGet<HostConnectionAuthRow>(
        'SELECT id, host, port, username, auth_method, password_blob, key_path FROM host_connections WHERE id = ?',
        hostId,
    );
    if (!row) {
        throw new Error(`HOST_NOT_CONNECTED: no saved connection for host ${hostId}`);
    }

    const auth = await resolveAuth(row);
    logger.info(`Auto-reconnect: ${row.username}@${row.host} [${hostId}]`);
    return sshPool.getOrCreate({
        id: hostId,
        host: row.host,
        port: row.port,
        username: row.username,
        auth,
        timeoutMs: 15_000,
    });
}

async function resolveAuth(row: HostConnectionAuthRow): Promise<SshAuth> {
    if (row.auth_method === 'agent') {
        return { type: 'agent' };
    }
    if (row.auth_method === 'key') {
        if (!row.key_path) {
            throw new Error('AUTH_FAILED: key auth saved without a keyPath');
        }
        const fs = await import('node:fs/promises');
        const key = await fs.readFile(row.key_path, 'utf8');
        return { type: 'key', privateKey: key };
    }
    // password
    if (!row.password_blob) {
        throw new Error('AUTH_FAILED: password auth saved with no encrypted password');
    }
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('AUTH_FAILED: OS keychain not available; cannot decrypt stored password');
    }
    return { type: 'password', password: safeStorage.decryptString(row.password_blob) };
}
