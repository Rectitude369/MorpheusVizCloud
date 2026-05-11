/**
 * Host repository — single source for host row → domain object mapping.
 *
 * Previously every service had its own private `getHost()` (BUG-032).
 * Centralizing here removes the duplication, keeps DB column references
 * in one file, and gives services a stable typed surface.
 */

import { databaseService } from '../db/database.service';
import { rowToHost, type HostRow } from '../db/mappers';
import type { Host } from '@shared/types';

export const HostRepository = {
    findById(hostId: string): Host | null {
        const row = databaseService.queryGet<HostRow>('SELECT * FROM hosts WHERE id = ?', hostId);
        return row ? rowToHost(row) : null;
    },

    findByHostname(hostname: string): Host | null {
        const row = databaseService.queryGet<HostRow>('SELECT * FROM hosts WHERE hostname = ?', hostname);
        return row ? rowToHost(row) : null;
    },

    findAll(): Host[] {
        const rows = databaseService.queryAll<HostRow>('SELECT * FROM hosts ORDER BY hostname');
        return rows.map(rowToHost);
    },

    findByStatus(status: Host['status']): Host[] {
        const rows = databaseService.queryAll<HostRow>('SELECT * FROM hosts WHERE status = ? ORDER BY hostname', status);
        return rows.map(rowToHost);
    },

    requireById(hostId: string): Host {
        const host = this.findById(hostId);
        if (!host) {
            throw new Error(`HOST_NOT_FOUND: host ${hostId} does not exist`);
        }
        return host;
    },
};
