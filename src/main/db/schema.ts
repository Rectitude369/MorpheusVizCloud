/**
 * VizCloud Database Schema & Migrations.
 *
 * SQLite schema for production-grade infrastructure management.
 *
 * Design notes:
 *   • SQLite does not support inline `INDEX` clauses inside CREATE TABLE
 *     bodies — every index must be its own `CREATE INDEX` statement.
 *   • Each migration is wrapped in a single transaction by the caller.
 *   • New schema changes are added as additional `Migration` entries with
 *     incrementing versions; never edit the SQL of a shipped migration.
 *   • `pragma user_version` is the source of truth for the applied version.
 */

export const SCHEMA_VERSION = 1;

export interface Migration {
    readonly version: number;
    readonly description: string;
    readonly sql: string;
}

const M001_INITIAL_SCHEMA = `
-- ============================================================================
-- CONFIGURATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- ============================================================================
-- CLUSTERS (defined first so hosts.cluster_id FK resolves cleanly)
-- ============================================================================
CREATE TABLE IF NOT EXISTS clusters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    master_host_id TEXT,

    quorum INTEGER NOT NULL DEFAULT 1,
    fence_enabled INTEGER NOT NULL DEFAULT 0,
    stonith_device TEXT,

    status TEXT NOT NULL DEFAULT 'healthy' CHECK(status IN ('healthy', 'degraded', 'failed')),
    quorum_votes INTEGER NOT NULL DEFAULT 0,
    quorum_threshold INTEGER NOT NULL DEFAULT 0,

    cluster_network TEXT NOT NULL DEFAULT '',
    heartbeat_interface TEXT NOT NULL DEFAULT '',

    tags TEXT NOT NULL DEFAULT '[]',

    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_clusters_status ON clusters(status);

-- ============================================================================
-- HOSTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS hosts (
    id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL UNIQUE,
    ip_address TEXT NOT NULL,
    mac_address TEXT NOT NULL DEFAULT '',
    cluster_id TEXT REFERENCES clusters(id) ON DELETE SET NULL,
    datacenter TEXT NOT NULL DEFAULT '',
    rack TEXT,

    cpu_model TEXT NOT NULL DEFAULT '',
    cpu_cores INTEGER NOT NULL DEFAULT 0,
    cpu_threads INTEGER NOT NULL DEFAULT 0,
    memory_total INTEGER NOT NULL DEFAULT 0,
    memory_available INTEGER NOT NULL DEFAULT 0,

    storage_total INTEGER NOT NULL DEFAULT 0,
    storage_used INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'unknown'
        CHECK(status IN ('online', 'offline', 'degraded', 'maintenance', 'unknown')),
    last_heartbeat INTEGER NOT NULL DEFAULT 0,
    uptime INTEGER NOT NULL DEFAULT 0,
    load_average_1m REAL NOT NULL DEFAULT 0,
    load_average_5m REAL NOT NULL DEFAULT 0,
    load_average_15m REAL NOT NULL DEFAULT 0,

    libvirt_version TEXT,
    qemu_version TEXT,
    vm_count INTEGER NOT NULL DEFAULT 0,
    vm_running_count INTEGER NOT NULL DEFAULT 0,

    cluster_role TEXT CHECK(cluster_role IN ('master', 'slave', 'peer') OR cluster_role IS NULL),
    pcs_connected INTEGER NOT NULL DEFAULT 0,
    corosync_connected INTEGER NOT NULL DEFAULT 0,

    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',

    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_hosts_hostname   ON hosts(hostname);
CREATE INDEX IF NOT EXISTS idx_hosts_cluster_id ON hosts(cluster_id);
CREATE INDEX IF NOT EXISTS idx_hosts_status     ON hosts(status);
CREATE INDEX IF NOT EXISTS idx_hosts_datacenter ON hosts(datacenter);

-- Cluster membership (many-to-many)
CREATE TABLE IF NOT EXISTS cluster_hosts (
    cluster_id TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (cluster_id, host_id)
);

CREATE INDEX IF NOT EXISTS idx_cluster_hosts_host ON cluster_hosts(host_id);

-- ============================================================================
-- VIRTUAL MACHINES
-- ============================================================================
CREATE TABLE IF NOT EXISTS vms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    uuid TEXT NOT NULL UNIQUE,

    state TEXT NOT NULL DEFAULT 'shut off'
        CHECK(state IN ('running', 'shut off', 'paused', 'shutdown', 'crashed', 'pmsuspended')),
    state_string TEXT NOT NULL DEFAULT '',

    vcpus_current INTEGER NOT NULL DEFAULT 0,
    vcpus_maximum INTEGER NOT NULL DEFAULT 0,
    memory_current INTEGER NOT NULL DEFAULT 0,
    memory_maximum INTEGER NOT NULL DEFAULT 0,

    autostart INTEGER NOT NULL DEFAULT 0,
    persistent INTEGER NOT NULL DEFAULT 0,

    snapshot_count INTEGER NOT NULL DEFAULT 0,
    current_snapshot_id TEXT,

    migrating INTEGER NOT NULL DEFAULT 0,
    migration_state TEXT,
    migration_source_host TEXT REFERENCES hosts(id) ON DELETE SET NULL,
    migration_target_host TEXT REFERENCES hosts(id) ON DELETE SET NULL,
    migration_progress INTEGER NOT NULL DEFAULT 0,

    os_type TEXT NOT NULL DEFAULT '',
    os_version TEXT NOT NULL DEFAULT '',
    guest_os TEXT,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',

    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    started_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_vms_host_id ON vms(host_id);
CREATE INDEX IF NOT EXISTS idx_vms_state   ON vms(state);
CREATE INDEX IF NOT EXISTS idx_vms_name    ON vms(name);
CREATE INDEX IF NOT EXISTS idx_vms_uuid    ON vms(uuid);

-- ============================================================================
-- VM DISKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS vm_disks (
    id TEXT PRIMARY KEY,
    vm_id TEXT NOT NULL REFERENCES vms(id) ON DELETE CASCADE,
    device TEXT NOT NULL,
    target TEXT NOT NULL,
    bus TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT '',
    capacity INTEGER NOT NULL DEFAULT 0,
    allocation INTEGER NOT NULL DEFAULT 0,
    readonly INTEGER NOT NULL DEFAULT 0,
    snapshot INTEGER NOT NULL DEFAULT 0,
    bus_type TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_vm_disks_vm_id ON vm_disks(vm_id);

-- ============================================================================
-- VM NETWORK INTERFACES
-- ============================================================================
CREATE TABLE IF NOT EXISTS vm_interfaces (
    id TEXT PRIMARY KEY,
    vm_id TEXT NOT NULL REFERENCES vms(id) ON DELETE CASCADE,
    iface TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '',
    mac_address TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    alias TEXT,
    link_state TEXT,
    ip_addresses TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_vm_interfaces_vm_id ON vm_interfaces(vm_id);

-- ============================================================================
-- STORAGE
-- ============================================================================
CREATE TABLE IF NOT EXISTS storage_pools (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    state TEXT NOT NULL,

    capacity INTEGER NOT NULL DEFAULT 0,
    allocation INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 0,

    source_path TEXT,
    source_device TEXT,
    source_name TEXT,

    target_path TEXT NOT NULL,

    auto_start INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),

    UNIQUE(host_id, name)
);

CREATE INDEX IF NOT EXISTS idx_storage_pools_host_id ON storage_pools(host_id);

CREATE TABLE IF NOT EXISTS storage_volumes (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL REFERENCES storage_pools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    allocation INTEGER NOT NULL DEFAULT 0,
    format TEXT,
    target_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),

    UNIQUE(pool_id, name)
);

CREATE INDEX IF NOT EXISTS idx_storage_volumes_pool_id ON storage_volumes(pool_id);

-- ============================================================================
-- SNAPSHOTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    vm_id TEXT NOT NULL REFERENCES vms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    mem_state TEXT,
    mem_backing TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_vm_id      ON snapshots(vm_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS snapshot_disks (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    node TEXT NOT NULL,
    backing_file TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshot_disks_snapshot_id ON snapshot_disks(snapshot_id);

CREATE TABLE IF NOT EXISTS snapshot_children (
    parent_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    PRIMARY KEY (parent_id, child_id)
);

-- ============================================================================
-- MIGRATIONS (live VM moves; not to be confused with schema migrations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS migrations (
    id TEXT PRIMARY KEY,
    vm_id TEXT NOT NULL REFERENCES vms(id) ON DELETE CASCADE,
    source_host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,
    target_host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,

    state TEXT NOT NULL DEFAULT 'pending'
        CHECK(state IN ('pending', 'transferring', 'finalizing', 'completed', 'failed', 'cancelled')),
    progress INTEGER NOT NULL DEFAULT 0,

    data_total INTEGER NOT NULL DEFAULT 0,
    data_processed INTEGER NOT NULL DEFAULT 0,
    data_remaining INTEGER NOT NULL DEFAULT 0,

    bandwidth INTEGER NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL DEFAULT 0,

    mode TEXT NOT NULL DEFAULT 'live' CHECK(mode IN ('live', 'cold')),
    persistent INTEGER NOT NULL DEFAULT 1,
    unsafe INTEGER NOT NULL DEFAULT 0,

    started_at INTEGER NOT NULL,
    completed_at INTEGER,

    error TEXT,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_migrations_vm_id      ON migrations(vm_id);
CREATE INDEX IF NOT EXISTS idx_migrations_state      ON migrations(state);
CREATE INDEX IF NOT EXISTS idx_migrations_started_at ON migrations(started_at DESC);

-- ============================================================================
-- METRICS (time series)
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    timestamp INTEGER NOT NULL,

    cpu_usage REAL NOT NULL DEFAULT 0,
    cpu_load_1m REAL NOT NULL DEFAULT 0,
    cpu_load_5m REAL NOT NULL DEFAULT 0,
    cpu_load_15m REAL NOT NULL DEFAULT 0,
    cpu_temperature REAL,

    memory_total INTEGER NOT NULL DEFAULT 0,
    memory_used INTEGER NOT NULL DEFAULT 0,
    memory_available INTEGER NOT NULL DEFAULT 0,
    memory_cached INTEGER NOT NULL DEFAULT 0,
    memory_buffers INTEGER NOT NULL DEFAULT 0,
    swap_total INTEGER NOT NULL DEFAULT 0,
    swap_used INTEGER NOT NULL DEFAULT 0,

    disk_io_read INTEGER NOT NULL DEFAULT 0,
    disk_io_write INTEGER NOT NULL DEFAULT 0,
    disk_io_util REAL NOT NULL DEFAULT 0,

    network_rx INTEGER NOT NULL DEFAULT 0,
    network_tx INTEGER NOT NULL DEFAULT 0,
    network_errors INTEGER NOT NULL DEFAULT 0,

    uptime INTEGER NOT NULL DEFAULT 0,
    load_average_1m REAL NOT NULL DEFAULT 0,
    load_average_5m REAL NOT NULL DEFAULT 0,
    load_average_15m REAL NOT NULL DEFAULT 0,
    temperature REAL
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_host_id   ON system_metrics(host_id);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp DESC);

-- ============================================================================
-- LOGS (structured app log mirror)
-- ============================================================================
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    level TEXT NOT NULL CHECK(level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT,
    stack TEXT
);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level     ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_source    ON logs(source);

-- ============================================================================
-- DIAGNOSTICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS diagnostic_reports (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('full', 'quick', 'custom')),
    file_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_host_id   ON diagnostic_reports(host_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_timestamp ON diagnostic_reports(timestamp DESC);

-- ============================================================================
-- HOST CONNECTIONS (saved SSH credentials — passwords stored encrypted via
-- safeStorage; the BLOB column lives outside the schema text since it is
-- populated only when the user opts into password auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS host_connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    auth_method TEXT NOT NULL CHECK(auth_method IN ('password', 'key', 'agent')),
    password_blob BLOB,
    key_path TEXT,
    last_connected INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_host_connections_host ON host_connections(host);

-- ============================================================================
-- SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

INSERT OR IGNORE INTO settings (key, value, description) VALUES
    ('app.version', '1.0.0-alpha.1', 'Application version'),
    ('app.theme', 'dark', 'UI theme: dark, light, system'),
    ('app.refreshInterval', '5000', 'Auto-refresh interval in milliseconds'),
    ('app.itemsPerPage', '50', 'Items per page in tables'),
    ('features.liveMigration', 'true', 'Enable live migration feature'),
    ('features.clusterManagement', 'true', 'Enable cluster management'),
    ('features.advancedMonitoring', 'true', 'Enable advanced monitoring'),
    ('features.topographicalMap', 'true', 'Enable topographical network map'),
    ('features.aiAnalysis', 'false', 'Enable AI-powered analysis'),
    ('features.experimental', 'false', 'Enable experimental features'),
    ('logging.level', 'info', 'Log level: debug, info, warn, error, fatal');
`;

/**
 * Ordered list of every schema migration.
 *
 * Migrations are applied sequentially: a fresh DB jumps straight to
 * `latestVersion`, an existing DB applies whatever's missing.
 *
 * **Never edit a migration after it has shipped** — add a new entry instead.
 */
export const MIGRATIONS: ReadonlyArray<Migration> = [
    {
        version: 1,
        description: 'Initial schema',
        sql: M001_INITIAL_SCHEMA,
    },
];

/** Highest migration version known to this build. */
export const LATEST_VERSION = MIGRATIONS.reduce(
    (max, m) => (m.version > max ? m.version : max),
    0,
);
