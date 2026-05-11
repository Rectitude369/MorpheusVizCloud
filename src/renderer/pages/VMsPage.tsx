import React from 'react';
import { toast } from 'react-hot-toast';
import { FiPause, FiPlay, FiPower, FiRefreshCw, FiSquare, FiZap } from 'react-icons/fi';

import { LoadingSpinner, StatusBadge } from '../components/atoms';
import { formatBytes } from '../lib/format';
import { useGetHostsQuery } from '../store/api/hostsApi';
import { useGetVMsQuery, useRunLifecycleMutation } from '../store/api/vmsApi';
import { IPC_CHANNELS } from '@shared/ipc/contract';
import { VMState, type VM } from '@shared/types';

const ACTIONS: Array<{
  label: string;
  op: typeof IPC_CHANNELS.vmsStart | typeof IPC_CHANNELS.vmsStop | typeof IPC_CHANNELS.vmsReboot |
      typeof IPC_CHANNELS.vmsReset | typeof IPC_CHANNELS.vmsSuspend | typeof IPC_CHANNELS.vmsResume |
      typeof IPC_CHANNELS.vmsDestroy;
  Icon: React.ComponentType<{ className?: string }>;
  className?: string;
  enabledFor: ReadonlyArray<VM['state']>;
}> = [
  { label: 'Start',       op: IPC_CHANNELS.vmsStart,   Icon: FiPlay,        className: 'text-success', enabledFor: [VMState.SHUTOFF, VMState.SHUTDOWN, VMState.CRASHED] },
  { label: 'Shutdown',    op: IPC_CHANNELS.vmsStop,    Icon: FiSquare,      className: 'text-warning', enabledFor: [VMState.RUNNING] },
  { label: 'Reboot',      op: IPC_CHANNELS.vmsReboot,  Icon: FiRefreshCw,   enabledFor: [VMState.RUNNING] },
  { label: 'Suspend',     op: IPC_CHANNELS.vmsSuspend, Icon: FiPause,       enabledFor: [VMState.RUNNING] },
  { label: 'Resume',      op: IPC_CHANNELS.vmsResume,  Icon: FiPlay,        enabledFor: [VMState.PAUSED, VMState.PMSUSPENDED] },
  { label: 'Force off',   op: IPC_CHANNELS.vmsDestroy, Icon: FiPower,       className: 'text-error',   enabledFor: [VMState.RUNNING, VMState.PAUSED] },
  { label: 'Reset',       op: IPC_CHANNELS.vmsReset,   Icon: FiZap,         enabledFor: [VMState.RUNNING] },
];

const VMsPage: React.FC = () => {
  const { data: vms = [], isLoading, isError } = useGetVMsQuery();
  const { data: hosts = [] } = useGetHostsQuery();
  const [runLifecycle, lifecycleState] = useRunLifecycleMutation();

  const hostNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const h of hosts) m.set(h.id, h.hostname);
    return m;
  }, [hosts]);

  const handleAction = async (id: string, op: typeof ACTIONS[number]['op'], label: string, name: string): Promise<void> => {
    if (op === IPC_CHANNELS.vmsDestroy && !confirm(`Force off ${name}? This is equivalent to pulling the plug.`)) return;
    try {
      await runLifecycle({ id, op }).unwrap();
      toast.success(`${label} → ${name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${label} failed`);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Virtual Machines</h1>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center"><LoadingSpinner size="lg" /></div>
      ) : isError ? (
        <div className="bg-page border border-error rounded-xl p-6 text-error">Failed to load VMs.</div>
      ) : vms.length === 0 ? (
        <div className="bg-page border border-border rounded-xl p-12 text-center">
          <p className="text-muted">No virtual machines discovered yet.</p>
          <p className="text-muted text-sm mt-2">Open <strong>Hosts</strong> and click the discover icon next to a connected host.</p>
        </div>
      ) : (
        <div className="bg-page border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sidebar/40 text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Host</th>
                <th className="text-left px-4 py-3">State</th>
                <th className="text-right px-4 py-3">vCPUs</th>
                <th className="text-right px-4 py-3">Memory</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vms.map((vm) => (
                <tr key={vm.id} className="border-t border-border hover:bg-sidebar-hover/40">
                  <td className="px-4 py-3 font-medium text-foreground">{vm.name}</td>
                  <td className="px-4 py-3 text-muted">{hostNameById.get(vm.hostId) ?? vm.hostId}</td>
                  <td className="px-4 py-3"><StatusBadge status={vm.state} /></td>
                  <td className="px-4 py-3 text-right text-muted">{vm.vcpusCurrent}/{vm.vcpusMaximum}</td>
                  <td className="px-4 py-3 text-right text-muted">{formatBytes(vm.memoryCurrent)}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    {ACTIONS.map(({ label, op, Icon, className, enabledFor }) => {
                      const enabled = enabledFor.includes(vm.state);
                      return (
                        <button
                          key={op}
                          type="button"
                          disabled={!enabled || lifecycleState.isLoading}
                          onClick={() => handleAction(vm.id, op, label, vm.name)}
                          className={`px-1.5 py-1 rounded hover:bg-sidebar-hover disabled:opacity-30 disabled:cursor-not-allowed ${className ?? 'text-muted'}`}
                          title={label}
                          aria-label={`${label} ${vm.name}`}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default VMsPage;
