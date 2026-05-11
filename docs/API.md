# VizCloud API Documentation

## Overview

VizCloud provides a REST-like API for managing Morpheus HVM infrastructure. All API endpoints are exposed through Electron IPC and can be accessed from the renderer process.

---

## Table of Contents

1. [Hosts API](#hosts-api)
2. [VMs API](#vms-api)
3. [Clusters API](#clusters-api)
4. [Migrations API](#migrations-api)
5. [Metrics API](#metrics-api)
6. [IPC API](#ipc-api)

---

## Hosts API

### Get All Hosts

Retrieve a list of all registered hosts.

**Endpoint**: `GET /api/hosts`

**Response**:
```typescript
interface Host {
  id: string;
  hostname: string;
  ipAddress: string;
  macAddress: string;
  datacenter: string;
  rack: string | null;
  status: 'online' | 'offline' | 'degraded' | 'maintenance';
  lastHeartbeat: number;
  uptime: number;
  cpuModel: string;
  cpuCores: number;
  cpuThreads: number;
  memoryTotal: number;
  memoryAvailable: number;
  storageTotal: number;
  storageUsed: number;
  loadAverage: [number, number, number];
  vmCount: number;
  vmRunningCount: number;
  createdAt: number;
  updatedAt: number;
}

Response: Host[]
```

**RTK Query Hook**:
```typescript
import { useGetHostsQuery } from '@/store/api/hostsApi';

const { data: hosts, isLoading, error } = useGetHostsQuery();
```

---

### Get Host by ID

Retrieve a specific host by ID.

**Endpoint**: `GET /api/hosts/:id`

**Parameters**:
- `id` (string): Host UUID

**Response**: `Host`

**RTK Query Hook**:
```typescript
import { useGetHostQuery } from '@/store/api/hostsApi';

const { data: host, isLoading } = useGetHostQuery(hostId);
```

---

### Add Host

Register a new host in the system.

**Endpoint**: `POST /api/hosts`

**Request Body**:
```typescript
{
  hostname: string;
  ipAddress: string;
  sshUser?: string;
  sshPassword?: string;
  datacenter?: string;
}
```

**Response**: `Host`

**RTK Query Hook**:
```typescript
import { useAddHostMutation } from '@/store/api/hostsApi';

const [addHost, { isLoading }] = useAddHostMutation();

await addHost({
  hostname: 'hv01.example.com',
  ipAddress: '192.168.1.100',
  datacenter: 'DC1'
});
```

---

### Update Host

Update host configuration.

**Endpoint**: `PUT /api/hosts/:id`

**Parameters**:
- `id` (string): Host UUID

**Request Body**: `Partial<Host>`

**Response**: `Host`

**RTK Query Hook**:
```typescript
import { useUpdateHostMutation } from '@/store/api/hostsApi';

const [updateHost] = useUpdateHostMutation();

await updateHost({
  id: hostId,
  body: { datacenter: 'DC2' }
});
```

---

### Delete Host

Remove a host from the system.

**Endpoint**: `DELETE /api/hosts/:id`

**Parameters**:
- `id` (string): Host UUID

**Response**: `void`

**RTK Query Hook**:
```typescript
import { useDeleteHostMutation } from '@/store/api/hostsApi';

const [deleteHost] = useDeleteHostMutation();

await deleteHost(hostId);
```

---

## VMs API

### Get All VMs

Retrieve a list of all virtual machines.

**Endpoint**: `GET /api/vms`

**Response**: `VM[]`

**RTK Query Hook**:
```typescript
import { useGetVMsQuery } from '@/store/api/vmsApi';

const { data: vms, isLoading } = useGetVMsQuery();
```

---

### Get VM by ID

Retrieve a specific VM by ID.

**Endpoint**: `GET /api/vms/:id`

**Parameters**:
- `id` (string): VM UUID

**Response**: `VM`

**RTK Query Hook**:
```typescript
import { useGetVMQuery } from '@/store/api/vmsApi';

const { data: vm } = useGetVMQuery(vmId);
```

---

### Update VM

Update VM configuration.

**Endpoint**: `PUT /api/vms/:id`

**Request Body**: `Partial<VM>`

**Response**: `VM`

**RTK Query Hook**:
```typescript
import { useUpdateVMMutation } from '@/store/api/vmsApi';

const [updateVM] = useUpdateVMMutation();

await updateVM({
  id: vmId,
  body: { vcpusCurrent: 4 }
});
```

---

## Clusters API

### Get All Clusters

Retrieve a list of all clusters.

**Endpoint**: `GET /api/clusters`

**Response**: `Cluster[]`

**RTK Query Hook**:
```typescript
import { useGetClustersQuery } from '@/store/api/clustersApi';

const { data: clusters } = useGetClustersQuery();
```

---

### Get Cluster by ID

Retrieve a specific cluster by ID.

**Endpoint**: `GET /api/clusters/:id`

**Parameters**:
- `id` (string): Cluster UUID

**Response**: `Cluster`

**RTK Query Hook**:
```typescript
import { useGetClusterQuery } from '@/store/api/clustersApi';

const { data: cluster } = useGetClusterQuery(clusterId);
```

---

## Migrations API

### Get All Migrations

Retrieve a list of all migrations.

**Endpoint**: `GET /api/migrations`

**Response**: `Migration[]`

**RTK Query Hook**:
```typescript
import { useGetMigrationsQuery } from '@/store/api/migrationsApi';

const { data: migrations } = useGetMigrationsQuery();
```

---

### Start Migration

Initiate a VM migration.

**Endpoint**: `POST /api/migrations/start`

**Request Body**:
```typescript
{
  vmId: string;
  sourceHostId: string;
  targetHostId: string;
  mode: 'live' | 'cold';
}
```

**Response**: `Migration`

**RTK Query Hook**:
```typescript
import { useStartMigrationMutation } from '@/store/api/migrationsApi';

const [startMigration, { isLoading }] = useStartMigrationMutation();

await startMigration({
  vmId,
  sourceHostId,
  targetHostId,
  mode: 'live'
});
```

---

### Cancel Migration

Cancel an in-progress migration.

**Endpoint**: `POST /api/migrations/:id/cancel`

**Parameters**:
- `id` (string): Migration UUID

**Response**: `void`

**RTK Query Hook**:
```typescript
import { useCancelMigrationMutation } from '@/store/api/migrationsApi';

const [cancelMigration] = useCancelMigrationMutation();

await cancelMigration(migrationId);
```

---

## Metrics API

### Get Host Metrics

Retrieve real-time metrics for a specific host.

**Endpoint**: `GET /api/metrics/host/:hostId`

**Parameters**:
- `hostId` (string): Host UUID

**Response**:
```typescript
{
  hostId: string;
  cpu: number;        // Percentage (0-100)
  memory: number;     // Percentage (0-100)
  storage: number;    // Percentage (0-100)
  network: number;    // MB/s
  timestamp: number;  // Unix timestamp
}
```

**RTK Query Hook**:
```typescript
import { useGetHostMetricsQuery } from '@/store/api/metricsApi';

const { data: metrics } = useGetHostMetricsQuery(hostId, {
  pollingInterval: 5000 // Refresh every 5 seconds
});
```

---

### Get Cluster Metrics

Retrieve aggregated metrics for a cluster.

**Endpoint**: `GET /api/metrics/cluster/:clusterId`

**Response**:
```typescript
{
  clusterId: string;
  totalHosts: number;
  totalVMs: number;
  totalCPU: number;
  totalMemory: number;
  usedCPU: number;
  usedMemory: number;
  timestamp: number;
}
```

**RTK Query Hook**:
```typescript
import { useGetClusterMetricsQuery } from '@/store/api/metricsApi';

const { data: metrics } = useGetClusterMetricsQuery(clusterId);
```

---

### Get System Metrics

Retrieve system-wide metrics.

**Endpoint**: `GET /api/metrics/system`

**Response**:
```typescript
{
  hosts: number;
  vms: number;
  clusters: number;
}
```

**RTK Query Hook**:
```typescript
import { useGetSystemMetricsQuery } from '@/store/api/metricsApi';

const { data: metrics } = useGetSystemMetricsQuery();
```

---

## IPC API

VizCloud uses Electron IPC for communication between the main and renderer processes.

### Application Control

```typescript
// Get application version
window.electron.ipcRenderer.invoke('app:get-version') 
  => Promise<string>

// Get platform
window.electron.ipcRenderer.invoke('app:get-platform')
  => Promise<'darwin' | 'win32' | 'linux'>

// Get application path
window.electron.ipcRenderer.invoke('app:get-path', name: string)
  => Promise<string>

// Quit application
window.electron.ipcRenderer.invoke('app:quit')
  => Promise<void>

// Reload application
window.electron.ipcRenderer.invoke('app:reload')
  => Promise<void>
```

### Window Control

```typescript
// Minimize window
window.electron.ipcRenderer.invoke('window:minimize')
  => Promise<void>

// Maximize window
window.electron.ipcRenderer.invoke('window:maximize')
  => Promise<void>

// Restore window
window.electron.ipcRenderer.invoke('window:unmaximize')
  => Promise<void>

// Close window
window.electron.ipcRenderer.invoke('window:close')
  => Promise<void>

// Check if maximized
window.electron.ipcRenderer.invoke('window:is-maximized')
  => Promise<boolean>
```

### Shell & Dialog

```typescript
// Open external URL
window.electron.ipcRenderer.invoke('shell:open-external', url: string)
  => Promise<void>

// Show item in folder
window.electron.ipcRenderer.invoke('shell:show-item-in-folder', path: string)
  => Promise<void>

// Open file dialog
window.electron.ipcRenderer.invoke('dialog:open-file', options)
  => Promise<{ canceled: boolean; filePaths: string[] }>

// Save file dialog
window.electron.ipcRenderer.invoke('dialog:save-file', options)
  => Promise<{ canceled: boolean; filePath?: string }>

// Message box
window.electron.ipcRenderer.invoke('dialog:show-message-box', options)
  => Promise<{ response: number }>
```

---

## Error Handling

All API calls follow a consistent error handling pattern:

```typescript
try {
  const result = await apiCall();
  // Handle success
} catch (error) {
  if (error.status === 404) {
    // Handle not found
  } else if (error.status === 500) {
    // Handle server error
  } else {
    // Handle other errors
  }
}
```

RTK Query provides automatic error handling:

```typescript
const { data, error, isLoading } = useGetHostsQuery();

if (error) {
  if ('status' in error) {
    // HTTP error
    console.error(`Error ${error.status}:`, error.data);
  } else {
    // Network error
    console.error('Network error:', error.message);
  }
}
```

---

## Rate Limiting

API calls are not rate-limited by default, but RTK Query provides automatic request deduplication and caching:

- **Cache Duration**: 60 seconds (default)
- **Polling**: Available for real-time data
- **Refetch**: On focus, mount, or manual trigger

---

## Type Definitions

All types are exported from `@shared/types`:

```typescript
import type { Host, VM, Cluster, Migration } from '@shared/types';
```

For detailed type definitions, see `src/shared/types/index.ts`.

---

*Last updated: 2026-05-08*
