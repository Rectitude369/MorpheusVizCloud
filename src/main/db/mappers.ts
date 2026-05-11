/**
 * Row mappers — bridge SQLite snake_case columns to TypeScript camelCase
 * domain types (DATA-003).
 *
 * The previous service layer cast raw rows with `as Host[]` / `as VM[]`
 * which lied to the type system: every renderer-side `host.ipAddress`
 * access actually returned `undefined` because the row had `ip_address`.
 *
 * Each mapper here is the single source of truth for the field-by-field
 * shape conversion. They also normalize boolean (`0`/`1`) and JSON
 * (`tags TEXT`) columns into their typed forms.
 *
 * The reverse direction (camelCase → DB row) is owned by named-binding
 * INSERT / UPSERT statements in the services themselves; we don't try to
 * synthesize SQL here because column subsets vary by call site.
 */

import type {
    Cluster,
    ClusterRole,
    Host,
    HostConnection,
    HostStatus,
    Migration,
    MigrationState,
    SystemMetrics,
    VM,
    VMState,
} from '@shared/types';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Parse a JSON-encoded TEXT column with a typed default. */
function parseJson<T>(raw: unknown, fallback: T): T {
    if (typeof raw !== 'string' || raw.length === 0) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

const intToBool = (v: unknown): boolean => v === 1 || v === true;
const strOrEmpty = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull  = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null);

// ----------------------------------------------------------------------------
// Hosts
// ----------------------------------------------------------------------------

interface HostRow {
    id: string;
    hostname: string;
    ip_address: string;
    mac_address: string;
    cluster_id: string | null;
    datacenter: string;
    rack: string | null;
    cpu_model: string;
    cpu_cores: number;
    cpu_threads: number;
    memory_total: number;
    memory_available: number;
    storage_total: number;
    storage_used: number;
    status: HostStatus;
    last_heartbeat: number;
    uptime: number;
    load_average_1m: number;
    load_average_5m: number;
    load_average_15m: number;
    libvirt_version: string | null;
    qemu_version: string | null;
    vm_count: number;
    vm_running_count: number;
    cluster_role: ClusterRole | null;
    pcs_connected: number;
    corosync_connected: number;
    tags: string;
    notes: string;
    created_at: number;
    updated_at: number;
}

export function rowToHost(row: HostRow): Host {
    return {
        id: row.id,
        hostname: row.hostname,
        ipAddress: row.ip_address,
        macAddress: row.mac_address,
        clusterId: row.cluster_id,
        datacenter: row.datacenter,
        rack: row.rack,
        cpuModel: row.cpu_model,
        cpuCores: row.cpu_cores,
        cpuThreads: row.cpu_threads,
        memoryTotal: row.memory_total,
        memoryAvailable: row.memory_available,
        storageTotal: row.storage_total,
        storageUsed: row.storage_used,
        storagePools: [], // populated separately when needed
        status: row.status,
        lastHeartbeat: row.last_heartbeat,
        uptime: row.uptime,
        loadAverage: [row.load_average_1m, row.load_average_5m, row.load_average_15m],
        libvirtVersion: strOrEmpty(row.libvirt_version),
        qemuVersion: strOrEmpty(row.qemu_version),
        vmCount: row.vm_count,
        vmRunningCount: row.vm_running_count,
        clusterRole: row.cluster_role ?? undefined,
        pcsConnected: intToBool(row.pcs_connected),
        corosyncConnected: intToBool(row.corosync_connected),
        tags: parseJson<string[]>(row.tags, []),
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ----------------------------------------------------------------------------
// VMs
// ----------------------------------------------------------------------------

interface VmRow {
    id: string;
    name: string;
    host_id: string;
    uuid: string;
    state: VMState;
    state_string: string;
    vcpus_current: number;
    vcpus_maximum: number;
    memory_current: number;
    memory_maximum: number;
    autostart: number;
    persistent: number;
    snapshot_count: number;
    current_snapshot_id: string | null;
    migrating: number;
    migration_state: MigrationState | null;
    migration_source_host: string | null;
    migration_target_host: string | null;
    migration_progress: number;
    os_type: string;
    os_version: string;
    guest_os: string | null;
    description: string;
    tags: string;
    created_at: number;
    started_at: number | null;
    updated_at: number;
}

export function rowToVm(row: VmRow): VM {
    return {
        id: row.id,
        name: row.name,
        hostId: row.host_id,
        uuid: row.uuid,
        state: row.state,
        stateString: row.state_string,
        vcpusCurrent: row.vcpus_current,
        vcpusMaximum: row.vcpus_maximum,
        memoryCurrent: row.memory_current,
        memoryMaximum: row.memory_maximum,
        disks: [],       // populated separately
        interfaces: [],  // populated separately
        autostart: intToBool(row.autostart),
        persistent: intToBool(row.persistent),
        snapshotCount: row.snapshot_count,
        currentSnapshotId: row.current_snapshot_id,
        migrating: intToBool(row.migrating),
        migrationState: row.migration_state ?? undefined,
        migrationSourceHost: row.migration_source_host ?? undefined,
        migrationTargetHost: row.migration_target_host ?? undefined,
        migrationProgress: row.migration_progress || undefined,
        osType: row.os_type,
        osVersion: row.os_version,
        guestOS: strOrNull(row.guest_os) ?? undefined,
        description: row.description,
        tags: parseJson<string[]>(row.tags, []),
        createdAt: row.created_at,
        startedAt: row.started_at,
        updatedAt: row.updated_at,
    };
}

// ----------------------------------------------------------------------------
// Clusters
// ----------------------------------------------------------------------------

interface ClusterRow {
    id: string;
    name: string;
    description: string;
    master_host_id: string | null;
    quorum: number;
    fence_enabled: number;
    stonith_device: string | null;
    status: 'healthy' | 'degraded' | 'failed';
    quorum_votes: number;
    quorum_threshold: number;
    cluster_network: string;
    heartbeat_interface: string;
    tags: string;
    created_at: number;
    updated_at: number;
}

export function rowToCluster(row: ClusterRow, hostIds: string[]): Cluster {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        hostIds,
        masterHostId: row.master_host_id ?? '',
        quorum: row.quorum > 0,
        fenceEnabled: intToBool(row.fence_enabled),
        stonithDevice: strOrNull(row.stonith_device) ?? undefined,
        status: row.status,
        quorumVotes: row.quorum_votes,
        quorumThreshold: row.quorum_threshold,
        clusterNetwork: row.cluster_network,
        heartbeatInterface: row.heartbeat_interface,
        tags: parseJson<string[]>(row.tags, []),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ----------------------------------------------------------------------------
// Migrations
// ----------------------------------------------------------------------------

interface MigrationRow {
    id: string;
    vm_id: string;
    source_host_id: string;
    target_host_id: string;
    state: MigrationState;
    progress: number;
    data_total: number;
    data_processed: number;
    data_remaining: number;
    bandwidth: number;
    duration: number;
    mode: 'live' | 'cold';
    persistent: number;
    unsafe: number;
    started_at: number;
    completed_at: number | null;
    error: string | null;
    error_message: string | null;
}

export function rowToMigration(row: MigrationRow): Migration {
    return {
        id: row.id,
        vmId: row.vm_id,
        sourceHostId: row.source_host_id,
        targetHostId: row.target_host_id,
        state: row.state,
        progress: row.progress,
        dataTotal: row.data_total,
        dataProcessed: row.data_processed,
        dataRemaining: row.data_remaining,
        bandwidth: row.bandwidth,
        duration: row.duration,
        mode: row.mode,
        persistent: intToBool(row.persistent),
        unsafe: intToBool(row.unsafe),
        startedAt: row.started_at,
        completedAt: row.completed_at,
        error: strOrNull(row.error) ?? undefined,
        errorMessage: strOrNull(row.error_message) ?? undefined,
    };
}

// ----------------------------------------------------------------------------
// Host connections
// ----------------------------------------------------------------------------

interface HostConnectionRow {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key' | 'agent';
    key_path: string | null;
    last_connected: number | null;
    tags: string;
    created_at: number;
    updated_at: number;
}

export function rowToHostConnection(row: HostConnectionRow): HostConnection {
    return {
        id: row.id,
        name: row.name,
        host: row.host,
        port: row.port,
        username: row.username,
        authMethod: row.auth_method,
        keyPath: strOrNull(row.key_path) ?? undefined,
        lastConnected: row.last_connected ?? 0,
        tags: parseJson<string[]>(row.tags, []),
    };
}

// ----------------------------------------------------------------------------
// Metrics
// ----------------------------------------------------------------------------

interface MetricsRow {
    host_id: string;
    timestamp: number;
    cpu_usage: number;
    cpu_load_1m: number;
    cpu_load_5m: number;
    cpu_load_15m: number;
    cpu_temperature: number | null;
    memory_total: number;
    memory_used: number;
    memory_available: number;
    memory_cached: number;
    memory_buffers: number;
    swap_total: number;
    swap_used: number;
    disk_io_read: number;
    disk_io_write: number;
    disk_io_util: number;
    network_rx: number;
    network_tx: number;
    network_errors: number;
    uptime: number;
    load_average_1m: number;
    load_average_5m: number;
    load_average_15m: number;
    temperature: number | null;
}

export function rowToMetrics(row: MetricsRow): SystemMetrics {
    return {
        timestamp: row.timestamp,
        hostId: row.host_id,
        cpuUsage: row.cpu_usage,
        cpuLoad: [row.cpu_load_1m, row.cpu_load_5m, row.cpu_load_15m],
        cpuTemperature: row.cpu_temperature ?? undefined,
        memoryTotal: row.memory_total,
        memoryUsed: row.memory_used,
        memoryAvailable: row.memory_available,
        memoryCached: row.memory_cached,
        memoryBuffers: row.memory_buffers,
        swapTotal: row.swap_total,
        swapUsed: row.swap_used,
        diskIORead: row.disk_io_read,
        diskIOWrite: row.disk_io_write,
        diskIOUtil: row.disk_io_util,
        networkRx: row.network_rx,
        networkTx: row.network_tx,
        networkErrors: row.network_errors,
        uptime: row.uptime,
        loadAverage: [row.load_average_1m, row.load_average_5m, row.load_average_15m],
        temperature: row.temperature ?? undefined,
    };
}

export type { HostRow, VmRow, ClusterRow, MigrationRow, HostConnectionRow, MetricsRow };
