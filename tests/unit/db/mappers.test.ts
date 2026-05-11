/**
 * Tests for snake_case row → camelCase domain object mappers.
 * Ensures DATA-003 fix doesn't regress.
 */

import { describe, expect, it } from 'vitest';

import {
    rowToCluster,
    rowToHost,
    rowToHostConnection,
    rowToMetrics,
    rowToMigration,
    rowToVm,
    type ClusterRow,
    type HostConnectionRow,
    type HostRow,
    type MetricsRow,
    type MigrationRow,
    type VmRow,
} from '../../../src/main/db/mappers';

const baseHostRow: HostRow = {
    id: 'h-1',
    hostname: 'hv-01',
    ip_address: '10.0.0.10',
    mac_address: 'aa:bb:cc:dd:ee:ff',
    cluster_id: 'c-1',
    datacenter: 'OKC',
    rack: 'R7',
    cpu_model: 'AMD EPYC 7763',
    cpu_cores: 64,
    cpu_threads: 128,
    memory_total: 256_000_000_000,
    memory_available: 200_000_000_000,
    storage_total: 1_000_000_000_000,
    storage_used: 250_000_000_000,
    status: 'online',
    last_heartbeat: 1_700_000_000_000,
    uptime: 86_400,
    load_average_1m: 0.4,
    load_average_5m: 0.3,
    load_average_15m: 0.2,
    libvirt_version: '8.0.0',
    qemu_version: '7.0.0',
    vm_count: 12,
    vm_running_count: 10,
    cluster_role: 'peer',
    pcs_connected: 1,
    corosync_connected: 1,
    tags: '["prod","ok"]',
    notes: 'rack near A/C',
    created_at: 1_650_000_000_000,
    updated_at: 1_700_000_000_000,
};

describe('rowToHost', () => {
    it('converts every snake_case column to camelCase', () => {
        const host = rowToHost(baseHostRow);
        expect(host.ipAddress).toBe('10.0.0.10');
        expect(host.cpuCores).toBe(64);
        expect(host.memoryTotal).toBe(256_000_000_000);
        expect(host.tags).toEqual(['prod', 'ok']);
        expect(host.pcsConnected).toBe(true);
        expect(host.corosyncConnected).toBe(true);
        expect(host.loadAverage).toEqual([0.4, 0.3, 0.2]);
        expect(host.clusterRole).toBe('peer');
    });
    it('survives malformed JSON in tags', () => {
        const host = rowToHost({ ...baseHostRow, tags: 'not json' });
        expect(host.tags).toEqual([]);
    });
    it('handles null cluster_role / rack / libvirt', () => {
        const host = rowToHost({ ...baseHostRow, cluster_role: null, rack: null, libvirt_version: null });
        expect(host.clusterRole).toBeUndefined();
        expect(host.rack).toBeNull();
        expect(host.libvirtVersion).toBe('');
    });
});

describe('rowToVm', () => {
    const row: VmRow = {
        id: 'v-1',
        name: 'web01',
        host_id: 'h-1',
        uuid: 'uuid-1',
        state: 'running',
        state_string: 'running',
        vcpus_current: 4,
        vcpus_maximum: 8,
        memory_current: 4_000_000_000,
        memory_maximum: 8_000_000_000,
        autostart: 1,
        persistent: 1,
        snapshot_count: 2,
        current_snapshot_id: 's-1',
        migrating: 0,
        migration_state: null,
        migration_source_host: null,
        migration_target_host: null,
        migration_progress: 0,
        os_type: 'linux',
        os_version: '22.04',
        guest_os: 'ubuntu',
        description: '',
        tags: '[]',
        created_at: 1_700_000_000_000,
        started_at: 1_700_001_000_000,
        updated_at: 1_700_002_000_000,
    };
    it('coerces 0/1 booleans', () => {
        expect(rowToVm(row).autostart).toBe(true);
        expect(rowToVm({ ...row, autostart: 0 }).autostart).toBe(false);
    });
});

describe('rowToCluster', () => {
    it('threads hostIds through and converts quorum to boolean', () => {
        const row: ClusterRow = {
            id: 'c-1', name: 'cl', description: '', master_host_id: 'h-1',
            quorum: 1, fence_enabled: 0, stonith_device: null,
            status: 'healthy', quorum_votes: 3, quorum_threshold: 2,
            cluster_network: '', heartbeat_interface: '', tags: '[]',
            created_at: 1, updated_at: 2,
        };
        const cluster = rowToCluster(row, ['h-1', 'h-2']);
        expect(cluster.hostIds).toEqual(['h-1', 'h-2']);
        expect(cluster.quorum).toBe(true);
    });
});

describe('rowToMigration', () => {
    it('maps all fields and turns int booleans', () => {
        const row: MigrationRow = {
            id: 'm-1', vm_id: 'v-1', source_host_id: 'h-1', target_host_id: 'h-2',
            state: 'transferring', progress: 42,
            data_total: 100, data_processed: 42, data_remaining: 58,
            bandwidth: 1024, duration: 0,
            mode: 'live', persistent: 1, unsafe: 0,
            started_at: 1, completed_at: null, error: null, error_message: null,
        };
        const m = rowToMigration(row);
        expect(m.persistent).toBe(true);
        expect(m.unsafe).toBe(false);
        expect(m.state).toBe('transferring');
        expect(m.progress).toBe(42);
    });
});

describe('rowToHostConnection', () => {
    it('omits password_blob and surfaces metadata', () => {
        const row: HostConnectionRow = {
            id: 'hc-1', name: 'lab',
            host: 'lab.local', port: 22,
            username: 'admin', auth_method: 'key',
            key_path: '/home/me/.ssh/id_ed25519',
            last_connected: 0, tags: '["lab"]',
            created_at: 0, updated_at: 0,
        };
        const conn = rowToHostConnection(row);
        expect(conn.tags).toEqual(['lab']);
        expect(conn.authMethod).toBe('key');
        expect(conn.keyPath).toBe('/home/me/.ssh/id_ed25519');
    });
});

describe('rowToMetrics', () => {
    it('packs cpu_load_* and load_average_* into tuples', () => {
        const row: MetricsRow = {
            host_id: 'h-1', timestamp: 1,
            cpu_usage: 25, cpu_load_1m: 0.5, cpu_load_5m: 0.4, cpu_load_15m: 0.3, cpu_temperature: null,
            memory_total: 100, memory_used: 50, memory_available: 50, memory_cached: 5, memory_buffers: 1,
            swap_total: 0, swap_used: 0,
            disk_io_read: 0, disk_io_write: 0, disk_io_util: 0,
            network_rx: 0, network_tx: 0, network_errors: 0,
            uptime: 86400, load_average_1m: 0.5, load_average_5m: 0.4, load_average_15m: 0.3,
            temperature: null,
        };
        const m = rowToMetrics(row);
        expect(m.cpuLoad).toEqual([0.5, 0.4, 0.3]);
        expect(m.loadAverage).toEqual([0.5, 0.4, 0.3]);
    });
});
