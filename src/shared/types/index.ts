/**
 * VizCloud Shared Types
 * Production-grade type definitions for Morpheus HVM infrastructure management
 */

// ============================================================================
// PRIMITIVE TYPES
// ============================================================================

export type UUID = string;
export type Timestamp = number;
export type Hostname = string;
export type IP = string;
export type Port = number;

// ============================================================================
// STATUS ENUMS
// ============================================================================

export enum HostStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  DEGRADED = 'degraded',
  MAINTENANCE = 'maintenance',
  UNKNOWN = 'unknown',
}

export enum VMState {
  RUNNING = 'running',
  SHUTOFF = 'shut off',
  PAUSED = 'paused',
  SHUTDOWN = 'shutdown',
  CRASHED = 'crashed',
  PMSUSPENDED = 'pmsuspended',
}

export enum MigrationState {
  PENDING = 'pending',
  TRANSFERRING = 'transferring',
  FINALIZING = 'finalizing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum ClusterRole {
  MASTER = 'master',
  SLAVE = 'slave',
  PEER = 'peer',
}

export enum ServiceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  FAILED = 'failed',
  ACTIVATING = 'activating',
  DEACTIVATING = 'deactivating',
  RELOADING = 'reloading',
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

// ============================================================================
// CORE ENTITIES
// ============================================================================

/**
 * HVM Host representing a physical Morpheus node
 */
export interface Host {
  id: UUID;
  hostname: Hostname;
  ipAddress: IP;
  macAddress: string;
  clusterId: UUID | null;
  datacenter: string;
  rack: string | null;
  
  // System specs
  cpuModel: string;
  cpuCores: number;
  cpuThreads: number;
  memoryTotal: number; // bytes
  memoryAvailable: number; // bytes
  
  // Storage
  storageTotal: number; // bytes
  storageUsed: number; // bytes
  storagePools: StoragePool[];
  
  // Status
  status: HostStatus;
  lastHeartbeat: Timestamp;
  uptime: number; // seconds
  loadAverage: [number, number, number];
  
  // Virtualization
  libvirtVersion: string;
  qemuVersion: string;
  vmCount: number;
  vmRunningCount: number;
  
  // Cluster info
  clusterRole?: ClusterRole;
  pcsConnected: boolean;
  corosyncConnected: boolean;
  
  // Metadata
  tags: string[];
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Virtual Machine running on a host
 */
export interface VM {
  id: UUID;
  name: string;
  hostId: UUID;
  uuid: string; // Libvirt UUID
  
  // State
  state: VMState;
  stateString: string;
  
  // Resources
  vcpusCurrent: number;
  vcpusMaximum: number;
  memoryCurrent: number; // bytes
  memoryMaximum: number; // bytes
  
  // Storage
  disks: VMDisk[];
  
  // Network
  interfaces: VMNetworkInterface[];
  
  // Configuration
  autostart: boolean;
  persistent: boolean;
  
  // Snapshot info
  snapshotCount: number;
  currentSnapshotId: UUID | null;
  
  // Migration info
  migrating: boolean;
  migrationState?: MigrationState;
  migrationSourceHost?: UUID;
  migrationTargetHost?: UUID;
  migrationProgress?: number;
  
  // Metadata
  osType: string;
  osVersion: string;
  guestOS?: string;
  description: string;
  tags: string[];
  
  // Timestamps
  createdAt: Timestamp;
  startedAt: Timestamp | null;
  updatedAt: Timestamp;
}

/**
 * Cluster containing multiple hosts
 */
export interface Cluster {
  id: UUID;
  name: string;
  description: string;
  
  // Membership
  hostIds: UUID[];
  masterHostId: UUID;
  
  // Configuration
  quorum: boolean;
  fenceEnabled: boolean;
  stonithDevice?: string;
  
  // Status
  status: 'healthy' | 'degraded' | 'failed';
  quorumVotes: number;
  quorumThreshold: number;
  
  // Network
  clusterNetwork: string;
  heartbeatInterface: string;
  
  // Metadata
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// STORAGE TYPES
// ============================================================================

export interface StoragePool {
  id: UUID;
  name: string;
  type: 'dir' | 'fs' | 'netfs' | 'iscsi' | 'scsi' | 'gluster' | 'sheepdog';
  state: 'running' | 'inactive' | 'paused';
  
  // Capacity
  capacity: number; // bytes
  allocation: number; // bytes
  available: number; // bytes
  
  // Source
  sourcePath?: string;
  sourceDevice?: string;
  sourceName?: string;
  
  // Target
  targetPath: string;
  
  // Metadata
  autoStart: boolean;
  createdAt: Timestamp;
}

export interface StorageVolume {
  id: UUID;
  poolId: UUID;
  name: string;
  capacity: number; // bytes
  allocation: number; // bytes
  format?: string;
  targetPath: string;
  createdAt: Timestamp;
}

// ============================================================================
// VM COMPONENTS
// ============================================================================

export interface VMDisk {
  device: string; // hda, sda, vda, etc.
  target: string;
  bus: string; // virtio, scsi, ide, etc.
  source: string;
  format: string;
  capacity: number; // bytes
  allocation: number; // bytes
  readonly: boolean;
  snapshot: boolean;
  busType: string;
}

export interface VMNetworkInterface {
  interface: string; // vnet0, etc.
  source: string;
  target: string;
  macAddress: string;
  model: string;
  type: 'network' | 'interface' | 'bridge' | 'user' | 'direct' | 'vhostuser';
  alias?: string;
  linkState?: 'up' | 'down';
  ipAddresses?: string[];
}

export interface VMSnapshot {
  id: UUID;
  vmId: UUID;
  name: string;
  description: string;
  state: string;
  createdAt: Timestamp;
  memState?: string;
  memBacking?: string;
  disks: SnapshotDisk[];
  children: UUID[];
}

export interface SnapshotDisk {
  domain: string;
  node: string;
  backingFile?: string;
}

// ============================================================================
// MIGRATION TYPES
// ============================================================================

export interface Migration {
  id: UUID;
  vmId: UUID;
  sourceHostId: UUID;
  targetHostId: UUID;
  
  // State
  state: MigrationState;
  progress: number; // 0-100
  
  // Data transfer
  dataTotal: number; // bytes
  dataProcessed: number; // bytes
  dataRemaining: number; // bytes
  
  // Performance
  bandwidth: number; // bytes/sec
  duration: number; // ms
  
  // Metadata
  mode: 'live' | 'cold';
  persistent: boolean;
  unsafe: boolean;
  
  // Timing
  startedAt: Timestamp;
  completedAt: Timestamp | null;
  
  // Error info
  error?: string;
  errorMessage?: string;
}

// ============================================================================
// DIAGNOSTICS & MONITORING
// ============================================================================

export interface SystemMetrics {
  timestamp: Timestamp;
  hostId: UUID;
  
  // CPU
  cpuUsage: number; // 0-100
  cpuLoad: [number, number, number];
  cpuTemperature?: number;
  
  // Memory
  memoryTotal: number;
  memoryUsed: number;
  memoryAvailable: number;
  memoryCached: number;
  memoryBuffers: number;
  swapTotal: number;
  swapUsed: number;
  
  // Disk
  diskIORead: number; // bytes/sec
  diskIOWrite: number; // bytes/sec
  diskIOUtil: number; // 0-100
  
  // Network
  networkRx: number; // bytes/sec
  networkTx: number; // bytes/sec
  networkErrors: number;
  
  // System
  uptime: number;
  loadAverage: [number, number, number];
  temperature?: number;
}

export interface DiagnosticReport {
  id: UUID;
  hostId: UUID;
  timestamp: Timestamp;
  type: 'full' | 'quick' | 'custom';
  
  // Sections
  systemInfo: SystemInfo;
  clusterStatus: ClusterStatus;
  vmStatus: VMStatusSummary;
  storageStatus: StorageStatus;
  networkStatus: NetworkStatus;
  serviceStatus: ServiceStatusSummary;
  recentErrors: LogEntry[];
  
  // File path
  filePath: string;
}

export interface SystemInfo {
  hostname: string;
  os: string;
  kernel: string;
  architecture: string;
  cpuModel: string;
  cpuCores: number;
  cpuThreads: number;
  memoryTotal: number;
  uptime: number;
  bootTime: Timestamp;
}

export interface ClusterStatus {
  pcsStatus: string;
  corosyncStatus: string;
  pacemakerStatus: string;
  quorum: boolean;
  nodes: ClusterNodeStatus[];
  resources: ClusterResource[];
}

export interface ClusterNodeStatus {
  name: string;
  status: 'Online' | 'Offline' | 'Standby';
  votes: number;
  ringId: number;
}

export interface ClusterResource {
  name: string;
  type: string;
  status: string;
  locationConstraint?: string;
}

export interface VMStatusSummary {
  total: number;
  running: number;
  stopped: number;
  paused: number;
}

export interface StorageStatus {
  pools: StoragePoolStatus[];
  multipathDevices: MultipathDevice[];
  fcHbAs: FCHBA[];
}

export interface StoragePoolStatus {
  name: string;
  type: string;
  state: string;
  capacity: number;
  allocated: number;
  available: number;
}

export interface MultipathDevice {
  name: string;
  state: string;
  paths: MultipathPath[];
}

export interface MultipathPath {
  dev: string;
  state: string;
  qq: string;
  tto: string;
}

export interface FCHBA {
  name: string;
  wwpn: string;
  state: string;
  speed: string;
}

export interface NetworkStatus {
  interfaces: NetworkInterface[];
  routes: Route[];
  dnsServers: string[];
}

export interface NetworkInterface {
  name: string;
  state: string;
  ipAddresses: string[];
  macAddress: string;
  mtu: number;
  speed?: string;
}

export interface Route {
  destination: string;
  gateway: string;
  interface: string;
}

export interface ServiceStatusSummary {
  services: ServiceEntry[];
}

export interface ServiceEntry {
  name: string;
  status: ServiceStatus;
  subState: string;
  since: Timestamp;
}

// ============================================================================
// LOGGING
// ============================================================================

export interface LogEntry {
  timestamp: Timestamp;
  level: LogLevel;
  source: string;
  message: string;
  data?: Record<string, unknown>;
  stack?: string;
}

export interface LogConfig {
  level: LogLevel;
  maxFiles: number;
  maxSizeMB: number;
  includeTimestamp: boolean;
  includeSource: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface AppConfig {
  version: string;
  theme: 'dark' | 'light' | 'system';
  
  // Connection
  defaultHosts: HostConnection[];
  
  // UI
  refreshInterval: number; // ms
  itemsPerPage: number;
  
  // Features
  features: FeatureFlags;
  
  // Database
  databasePath: string;
}

export interface HostConnection {
  id: UUID;
  name: string;
  host: Hostname | IP;
  port: Port;
  username: string;
  authMethod: 'password' | 'key' | 'agent';
  keyPath?: string;
  lastConnected: Timestamp;
  tags: string[];
}

export interface FeatureFlags {
  liveMigration: boolean;
  clusterManagement: boolean;
  advancedMonitoring: boolean;
  topographicalMap: boolean;
  aiAnalysis: boolean;
  experimental: boolean;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: Timestamp;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

export type Nullable<T> = T | null;
export type WithId<T> = T & { id: UUID };

export type EntityWithTimestamps<T> = T & {
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export interface SortDescriptor {
  key: string;
  direction: 'asc' | 'desc';
}

export interface FilterDescriptor {
  key: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'regex';
  value: unknown;
}

export interface QueryParams {
  page?: number;
  pageSize?: number;
  sort?: SortDescriptor[];
  filters?: FilterDescriptor[];
  search?: string;
}

// ============================================================================
// DIAGNOSTICS (log bundle collection + live log tailing)
// ============================================================================

/** Logical log source IDs the renderer can ask to tail. */
export type LogSourceId =
  | 'morphd'
  | 'pacemaker'
  | 'corosync'
  | 'pcsd'
  | 'libvirtd'
  | 'syslog';

/** Per-line push payload from a live tail. */
export interface LogLinePayload {
  hostId: UUID;
  source: LogSourceId;
  stream: 'stdout' | 'stderr';
  line: string;
  timestamp: Timestamp;
}

/** Bundle-collection lifecycle event. */
export interface BundleProgressPayload {
  hostId: UUID;
  phase: 'uploading' | 'running' | 'downloading' | 'cleanup' | 'complete' | 'failed';
  percent: number;
  message: string;
  timestamp: Timestamp;
  /** Populated only on `complete`. */
  localPath?: string;
  /** Populated only on `complete`. */
  size?: number;
}

/** Summary row for an already-collected bundle on disk. */
export interface BundleSummary {
  fileName: string;
  fullPath: string;
  size: number;
  createdAt: Timestamp;
}
