/**
 * Event bridge — wires push notifications from main into the renderer's
 * RTK Query cache so pages stay live without polling.
 *
 * Subscribes to:
 *   • `event:host-status`        → patches the `Host` entity in `hostsApi`.
 *   • `event:vm-state-changed`   → patches the `VM` entity in `vmsApi`.
 *   • `event:migration-progress` → patches `Migration` and surfaces a toast
 *                                  when a migration completes / fails.
 *   • `event:metrics-tick`       → appends to the latest `getMetrics` window.
 *
 * Call `attachEventBridge(store)` once on renderer startup. Returns a
 * cleanup function for tests.
 */

import { toast } from 'react-hot-toast';

import { IPC_EVENTS } from '@shared/ipc/contract';

import { hostsApi } from '../store/api/hostsApi';
import { metricsApi } from '../store/api/metricsApi';
import { migrationsApi } from '../store/api/migrationsApi';
import { vmsApi } from '../store/api/vmsApi';
import type { AppDispatch } from '../store';

export function attachEventBridge(dispatch: AppDispatch): () => void {
  if (typeof window === 'undefined' || !window.vizcloud) {
    // Outside Electron (component tests) — no-op.
    return () => undefined;
  }

  const unsubHostStatus = window.vizcloud.subscribe(IPC_EVENTS.hostStatus, (payload) => {
    dispatch(
      hostsApi.util.updateQueryData('getHosts', undefined, (draft) => {
        const idx = draft.findIndex((h) => h.id === payload.hostId);
        const item = idx >= 0 ? draft[idx] : undefined;
        if (item) {
          item.status = payload.status;
          item.lastHeartbeat = payload.lastHeartbeat;
        }
      }),
    );
    dispatch(
      hostsApi.util.updateQueryData('getHost', payload.hostId, (draft) => {
        if (draft) {
          draft.status = payload.status;
          draft.lastHeartbeat = payload.lastHeartbeat;
        }
      }),
    );
  });

  const unsubVmState = window.vizcloud.subscribe(IPC_EVENTS.vmStateChanged, (payload) => {
    dispatch(
      vmsApi.util.updateQueryData('getVMs', undefined, (draft) => {
        const idx = draft.findIndex((v) => v.id === payload.vmId);
        const item = idx >= 0 ? draft[idx] : undefined;
        if (item) {
          item.state = payload.state;
        }
      }),
    );
    dispatch(
      vmsApi.util.updateQueryData('getVM', payload.vmId, (draft) => {
        if (draft) {
          draft.state = payload.state;
        }
      }),
    );
  });

  const unsubMigrationProgress = window.vizcloud.subscribe(IPC_EVENTS.migrationProgress, (payload) => {
    dispatch(
      migrationsApi.util.updateQueryData('getMigration', payload.migrationId, (draft) => {
        if (draft) {
          draft.state = payload.state;
          draft.progress = payload.progress;
          draft.bandwidth = payload.bandwidth;
          draft.dataProcessed = payload.dataProcessed;
        }
      }),
    );
    dispatch(
      migrationsApi.util.updateQueryData('getActiveMigrations', undefined, (draft) => {
        const idx = draft.findIndex((m) => m.id === payload.migrationId);
        const item = idx >= 0 ? draft[idx] : undefined;
        if (item) {
          item.state = payload.state;
          item.progress = payload.progress;
        }
      }),
    );
    if (payload.state === 'completed') {
      toast.success('Migration completed');
      dispatch(migrationsApi.util.invalidateTags(['Migration', 'VM']));
    } else if (payload.state === 'failed') {
      toast.error('Migration failed');
      dispatch(migrationsApi.util.invalidateTags(['Migration']));
    }
  });

  const unsubMetricsTick = window.vizcloud.subscribe(IPC_EVENTS.metricsTick, () => {
    // Conservative invalidation — pages doing range queries refetch on tick.
    // For high-frequency dashboards we'd switch to per-host updateQueryData.
    dispatch(metricsApi.util.invalidateTags(['Metrics']));
  });

  return () => {
    unsubHostStatus();
    unsubVmState();
    unsubMigrationProgress();
    unsubMetricsTick();
  };
}
