/**
 * ClusterService — Pacemaker / Corosync integration.
 *
 * Replaces the previous regex-on-text-output approach with structured XML
 * parsing of `pcs status xml`, which gives us:
 *   • accurate node enumeration (BUG-018: previous regex matched
 *     "Daemons Online" as a node),
 *   • derived cluster status from the `with_quorum` attribute (BUG-019),
 *   • elected DC detection (BUG-029).
 */

import { v4 as uuidv4 } from 'uuid';

import { LoggerService } from '../core/logger.service';
import { databaseService } from '../db/database.service';
import { rowToCluster, type ClusterRow } from '../db/mappers';
import { parsePcsStatusXml } from '../lib/parsers';
import type { Cluster } from '@shared/types';

import { ensureHostConnected } from './connection-manager';
import { HostRepository } from './host-repository';

export class ClusterService {
    private readonly logger = new LoggerService('ClusterService');

    public async initialize(): Promise<void> {
        this.logger.info('ClusterService initialized');
    }

    public async shutdown(): Promise<void> {
        this.logger.info('ClusterService shutdown complete');
    }

    public async getCluster(clusterId: string): Promise<Cluster | null> {
        const row = databaseService.queryGet<ClusterRow>('SELECT * FROM clusters WHERE id = ?', clusterId);
        if (!row) return null;
        const memberRows = databaseService.queryAll<{ host_id: string }>(
            'SELECT host_id FROM cluster_hosts WHERE cluster_id = ?', clusterId,
        );
        return rowToCluster(row, memberRows.map((r) => r.host_id));
    }

    public async getAllClusters(): Promise<Cluster[]> {
        const rows = databaseService.queryAll<ClusterRow>('SELECT * FROM clusters ORDER BY name');
        return rows.map((row) => {
            const memberRows = databaseService.queryAll<{ host_id: string }>(
                'SELECT host_id FROM cluster_hosts WHERE cluster_id = ?', row.id,
            );
            return rowToCluster(row, memberRows.map((m) => m.host_id));
        });
    }

    public async discoverCluster(hostId: string): Promise<Cluster | null> {
        const host = HostRepository.requireById(hostId);
        const client = await ensureHostConnected(hostId);

        // `pcs status xml` is a structured XML document — far safer to parse
        // than the human-readable text format.
        const xmlResult = await client.runCommand(['pcs', 'status', 'xml'], { timeoutMs: 30_000 });
        if (xmlResult.code !== 0) {
            this.logger.debug(`No PCS cluster on ${host.hostname} (exit ${xmlResult.code})`);
            return null;
        }

        const parsed = parsePcsStatusXml(xmlResult.stdout);
        if (parsed.nodes.length === 0) {
            return null;
        }

        // Cluster identity must be stable across whichever host runs the
        // discovery — keying on the discovering host's name created duplicate
        // cluster rows (one per discovery host). Sorting node names yields the
        // same identity from every member.
        const sortedNodes = parsed.nodes.map((n) => n.name).filter(Boolean).sort();
        const clusterName = sortedNodes.length > 0
            ? `pcs:${sortedNodes.join(',')}`
            : `cluster-${host.hostname}`;
        const existing = databaseService.queryGet<ClusterRow>('SELECT * FROM clusters WHERE name = ?', clusterName);
        const clusterId = existing?.id ?? uuidv4();
        const now = Date.now();

        // DC name from XML maps to a host record by hostname.
        const dcHost = parsed.dcName ? HostRepository.findByHostname(parsed.dcName) : null;
        const masterHostId = dcHost?.id ?? hostId;

        const onlineCount = parsed.nodes.filter((n) => n.status === 'Online').length;
        const status: Cluster['status'] =
            !parsed.quorate ? 'failed'
                : onlineCount === parsed.nodes.length ? 'healthy'
                    : 'degraded';

        databaseService.transaction(() => {
            databaseService.get().prepare(
                `INSERT INTO clusters (
                    id, name, description, master_host_id, quorum, fence_enabled,
                    status, quorum_votes, quorum_threshold,
                    cluster_network, heartbeat_interface, tags,
                    created_at, updated_at
                ) VALUES (
                    @id, @name, @description, @master_host_id, @quorum, 0,
                    @status, @quorum_votes, @quorum_threshold,
                    '', '', '[]',
                    @created_at, @updated_at
                )
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    description = excluded.description,
                    master_host_id = excluded.master_host_id,
                    quorum = excluded.quorum,
                    status = excluded.status,
                    quorum_votes = excluded.quorum_votes,
                    quorum_threshold = excluded.quorum_threshold,
                    updated_at = excluded.updated_at`,
            ).run({
                id: clusterId,
                name: clusterName,
                description: `Pacemaker cluster discovered via ${host.hostname}`,
                master_host_id: masterHostId,
                quorum: parsed.quorate ? 1 : 0,
                status,
                quorum_votes: parsed.nodes.length,
                quorum_threshold: Math.floor(parsed.nodes.length / 2) + 1,
                created_at: existing?.created_at ?? now,
                updated_at: now,
            });

            // Replace membership atomically. Dedupe host_ids defensively in
            // case two parsed nodes resolve to the same host record (e.g. an
            // alias hostname).
            databaseService.run('DELETE FROM cluster_hosts WHERE cluster_id = ?', clusterId);
            const insertMember = databaseService.get().prepare(
                'INSERT INTO cluster_hosts (cluster_id, host_id, joined_at) VALUES (?, ?, ?)',
            );
            const seenHostIds = new Set<string>();
            for (const node of parsed.nodes) {
                const member = HostRepository.findByHostname(node.name);
                if (member && !seenHostIds.has(member.id)) {
                    seenHostIds.add(member.id);
                    insertMember.run(clusterId, member.id, now);
                }
            }
        });

        return this.getCluster(clusterId);
    }
}
