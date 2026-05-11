import React, { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiPlay, FiX } from 'react-icons/fi';

import { LoadingSpinner, StatusBadge } from '../components/atoms';
import { formatRelativeTime } from '../lib/format';
import { useGetHostsQuery } from '../store/api/hostsApi';
import {
  useCancelMigrationMutation,
  useGetActiveMigrationsQuery,
  useGetMigrationsQuery,
  useStartMigrationMutation,
} from '../store/api/migrationsApi';
import { useGetVMsQuery } from '../store/api/vmsApi';

const MigrationPage: React.FC = () => {
  const { data: vms = [] } = useGetVMsQuery();
  const { data: hosts = [] } = useGetHostsQuery();
  const { data: active = [], isLoading: activeLoading } = useGetActiveMigrationsQuery();
  const { data: history = [] } = useGetMigrationsQuery();
  const [start, startState] = useStartMigrationMutation();
  const [cancel] = useCancelMigrationMutation();

  const [vmId, setVmId] = useState('');
  const [targetHostId, setTargetHostId] = useState('');
  const [mode, setMode] = useState<'live' | 'cold'>('live');

  const hostById = useMemo(() => {
    const m = new Map(hosts.map((h) => [h.id, h.hostname]));
    return m;
  }, [hosts]);
  const vmById = useMemo(() => new Map(vms.map((v) => [v.id, v])), [vms]);

  const selectedVm = vmById.get(vmId);

  const handleStart = async (): Promise<void> => {
    if (!selectedVm || !targetHostId) {
      toast.error('Pick a VM and target host');
      return;
    }
    if (selectedVm.hostId === targetHostId) {
      toast.error('Target must differ from source');
      return;
    }
    try {
      await start({ vmId, sourceHostId: selectedVm.hostId, targetHostId, mode }).unwrap();
      toast.success('Migration started');
      setVmId(''); setTargetHostId('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start migration');
    }
  };

  const handleCancel = async (id: string): Promise<void> => {
    try {
      await cancel(id).unwrap();
      toast.success('Cancellation requested');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Live Migration</h1>

      {/* Start panel */}
      <div className="bg-page border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Start a migration</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={vmId} onChange={(e) => setVmId(e.target.value)} className="px-3 py-2 bg-search border border-border rounded-md text-sm">
            <option value="">VM…</option>
            {vms.filter((v) => v.state === 'running').map((v) => (
              <option key={v.id} value={v.id}>{v.name} ({hostById.get(v.hostId) ?? '?'})</option>
            ))}
          </select>
          <select value={targetHostId} onChange={(e) => setTargetHostId(e.target.value)} className="px-3 py-2 bg-search border border-border rounded-md text-sm">
            <option value="">Target host…</option>
            {hosts.filter((h) => h.status === 'online' && h.id !== selectedVm?.hostId).map((h) => (
              <option key={h.id} value={h.id}>{h.hostname}</option>
            ))}
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'live' | 'cold')} className="px-3 py-2 bg-search border border-border rounded-md text-sm">
            <option value="live">Live (zero downtime)</option>
            <option value="cold">Cold (shutdown first)</option>
          </select>
          <button
            type="button"
            disabled={!vmId || !targetHostId || startState.isLoading}
            onClick={handleStart}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-md text-sm disabled:opacity-50"
          >
            <FiPlay className="w-4 h-4" /> {startState.isLoading ? 'Starting…' : 'Start'}
          </button>
        </div>
      </div>

      {/* Active */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Active</h2>
        {activeLoading ? <LoadingSpinner /> : active.length === 0 ? (
          <p className="text-muted text-sm">No migrations in progress.</p>
        ) : (
          <div className="space-y-2">
            {active.map((m) => (
              <div key={m.id} className="bg-page border border-border rounded-lg p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground truncate">
                      {vmById.get(m.vmId)?.name ?? m.vmId}
                    </span>
                    <StatusBadge status={m.state} />
                  </div>
                  <div className="text-xs text-muted">
                    {hostById.get(m.sourceHostId) ?? m.sourceHostId} → {hostById.get(m.targetHostId) ?? m.targetHostId} · {m.mode}
                  </div>
                  <div className="mt-2 h-1.5 bg-sidebar rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${m.progress}%` }}
                      role="progressbar"
                      aria-valuenow={m.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-foreground font-medium tabular-nums">{m.progress}%</div>
                  <button
                    type="button"
                    onClick={() => handleCancel(m.id)}
                    className="text-xs text-error hover:underline mt-1"
                  >
                    <FiX className="inline w-3 h-3 mr-0.5" /> Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Recent history</h2>
        {history.length === 0 ? (
          <p className="text-muted text-sm">No migration history yet.</p>
        ) : (
          <div className="bg-page border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-sidebar/40 text-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">VM</th>
                  <th className="text-left px-4 py-3">Source → Target</th>
                  <th className="text-left px-4 py-3">Mode</th>
                  <th className="text-left px-4 py-3">State</th>
                  <th className="text-right px-4 py-3">Progress</th>
                  <th className="text-right px-4 py-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 25).map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-3">{vmById.get(m.vmId)?.name ?? m.vmId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-muted">
                      {hostById.get(m.sourceHostId) ?? m.sourceHostId.slice(0, 8)} → {hostById.get(m.targetHostId) ?? m.targetHostId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-muted">{m.mode}</td>
                    <td className="px-4 py-3"><StatusBadge status={m.state} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.progress}%</td>
                    <td className="px-4 py-3 text-right text-muted">{formatRelativeTime(m.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default MigrationPage;
