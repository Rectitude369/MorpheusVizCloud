import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  FiActivity,
  FiCheckCircle,
  FiCpu,
  FiHardDrive,
  FiSearch,
  FiServer,
  FiShield,
} from 'react-icons/fi';

import { LoadingSpinner, StatusBadge } from '../components/atoms';
import { formatBytes } from '../lib/format';
import { useDiscoverClusterMutation, useGetClustersQuery } from '../store/api/clustersApi';
import { useGetHostsQuery } from '../store/api/hostsApi';
import { useGetVMsQuery } from '../store/api/vmsApi';
import type { Cluster, Host, VM } from '@shared/types';

/**
 * Strip the internal `pcs:<sorted-node-list>` cluster identity used as the
 * stable DB key, presenting a friendlier title in the UI.
 */
function clusterTitle(cluster: Cluster): string {
  if (cluster.name.startsWith('pcs:')) {
    const nodes = cluster.name.slice(4).split(',').filter(Boolean);
    if (nodes.length > 0) return `Pacemaker — ${nodes.join(' · ')}`;
  }
  return cluster.name;
}

interface ClusterCardProps {
  cluster: Cluster;
  hosts: ReadonlyArray<Host>;
  vms: ReadonlyArray<VM>;
}

const ClusterCard: React.FC<ClusterCardProps> = ({ cluster, hosts, vms }) => {
  const memberHosts = cluster.hostIds
    .map((id) => hosts.find((h) => h.id === id))
    .filter((h): h is Host => Boolean(h));
  const dcHostname = hosts.find((h) => h.id === cluster.masterHostId)?.hostname;

  const totalVms = memberHosts.reduce(
    (acc, h) => acc + vms.filter((v) => v.hostId === h.id).length,
    0,
  );
  const runningVms = memberHosts.reduce(
    (acc, h) => acc + vms.filter((v) => v.hostId === h.id && v.state === 'running').length,
    0,
  );
  const aggregateMemory = memberHosts.reduce((acc, h) => acc + (h.memoryTotal || 0), 0);
  const aggregateCores = memberHosts.reduce((acc, h) => acc + (h.cpuCores || 0), 0);
  const onlineCount = memberHosts.filter((h) => h.status === 'online').length;
  const quorumPct = cluster.quorumThreshold > 0
    ? Math.min(100, Math.round((cluster.quorumVotes / cluster.quorumThreshold) * 100))
    : 0;

  const accent = cluster.status === 'healthy'
    ? 'from-success/20 via-primary/10 to-transparent'
    : cluster.status === 'degraded'
      ? 'from-warning/20 via-primary/10 to-transparent'
      : 'from-error/20 via-error/5 to-transparent';

  return (
    <article className="relative overflow-hidden bg-page border border-border rounded-2xl shadow-lg">
      <div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${accent} pointer-events-none`} />

      <header className="relative p-6 pb-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
            <FiShield className="w-3.5 h-3.5" />
            Pacemaker / Corosync cluster
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground truncate">{clusterTitle(cluster)}</h2>
          {cluster.description && (
            <p className="mt-1 text-xs text-muted">{cluster.description}</p>
          )}
        </div>
        <StatusBadge status={cluster.status} size="md" />
      </header>

      <div className="relative px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Nodes online" value={`${onlineCount}/${memberHosts.length}`} icon={<FiServer />} accent={onlineCount === memberHosts.length ? 'success' : 'warning'} />
        <KpiTile label="VMs running" value={`${runningVms}/${totalVms}`} icon={<FiCpu />} />
        <KpiTile label="Total cores" value={`${aggregateCores}`} icon={<FiActivity />} />
        <KpiTile label="Total memory" value={formatBytes(aggregateMemory)} icon={<FiHardDrive />} />
      </div>

      <section className="relative px-6 mt-4">
        <div className="flex items-center justify-between text-xs text-muted mb-1">
          <span className="uppercase tracking-wider">Quorum</span>
          <span className="font-medium text-foreground">
            {cluster.quorumVotes} / {cluster.quorumThreshold}
            {cluster.quorum ? '' : ' · loss'}
          </span>
        </div>
        <div className="h-2 bg-search rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              cluster.quorum ? 'bg-success' : 'bg-error'
            }`}
            style={{ width: `${Math.max(8, quorumPct)}%` }}
          />
        </div>
      </section>

      <section className="relative p-6 pt-5 space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted mb-1">Members</div>
        <ul className="grid grid-cols-1 gap-2">
          {memberHosts.map((host) => {
            const isDC = host.id === cluster.masterHostId;
            const hostVms = vms.filter((v) => v.hostId === host.id);
            const hostRunning = hostVms.filter((v) => v.state === 'running').length;
            return (
              <li
                key={host.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-sidebar/40 border border-border hover:bg-sidebar-hover/60 transition-colors"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    host.status === 'online' ? 'bg-success animate-pulse' :
                    host.status === 'degraded' ? 'bg-warning' :
                    'bg-muted'
                  }`}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">{host.hostname}</span>
                    {isDC && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40">
                        Designated
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted font-mono truncate">{host.ipAddress}</div>
                </div>
                <div className="text-right text-xs text-muted">
                  <div className="text-foreground font-medium">{hostRunning}/{hostVms.length} VMs</div>
                  <div>{host.cpuCores} cores · {formatBytes(host.memoryTotal)}</div>
                </div>
              </li>
            );
          })}
        </ul>
        {dcHostname && (
          <p className="text-[11px] text-muted pt-1 flex items-center gap-1">
            <FiCheckCircle className="w-3 h-3 text-primary" />
            Designated coordinator: <span className="text-foreground">{dcHostname}</span>
          </p>
        )}
      </section>
    </article>
  );
};

interface KpiTileProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: 'success' | 'warning' | 'error';
}

const KpiTile: React.FC<KpiTileProps> = ({ label, value, icon, accent }) => {
  const accentClass =
    accent === 'success' ? 'text-success' :
    accent === 'warning' ? 'text-warning' :
    accent === 'error' ? 'text-error' :
    'text-foreground';
  return (
    <div className="bg-search/50 border border-border rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${accentClass}`}>{value}</div>
    </div>
  );
};

const ClustersPage: React.FC = () => {
  const { data: clusters = [], isLoading } = useGetClustersQuery();
  const { data: hosts = [] } = useGetHostsQuery();
  const { data: vms = [] } = useGetVMsQuery();
  const [discover, discoverState] = useDiscoverClusterMutation();
  const [selectedHost, setSelectedHost] = useState('');

  const onlineHosts = hosts.filter((h) => h.status === 'online');

  const handleDiscover = async (): Promise<void> => {
    if (!selectedHost) {
      toast.error('Pick a host first');
      return;
    }
    try {
      const cluster = await discover(selectedHost).unwrap();
      if (cluster) {
        toast.success(`Discovered ${clusterTitle(cluster)}`);
      } else {
        toast(`No PCS cluster on this host`);
      }
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Discovery failed';
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clusters</h1>
          <p className="text-sm text-muted">Pacemaker / Corosync membership and quorum, derived from <code className="text-primary">pcs status xml</code>.</p>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedHost}
            onChange={(e) => setSelectedHost(e.target.value)}
            className="px-3 py-2 bg-search border border-border rounded-md text-sm focus:outline-none focus:border-primary"
          >
            <option value="">Discover via host…</option>
            {onlineHosts.map((h) => (
              <option key={h.id} value={h.id}>{h.hostname}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedHost || discoverState.isLoading}
            onClick={handleDiscover}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-md text-sm disabled:opacity-50"
          >
            <FiSearch className="w-4 h-4" /> {discoverState.isLoading ? 'Scanning…' : 'Discover'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center"><LoadingSpinner size="lg" /></div>
      ) : clusters.length === 0 ? (
        <div className="bg-page border border-border rounded-2xl p-12 text-center">
          <FiShield className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">No clusters discovered yet</p>
          <p className="text-muted text-sm mt-2">Pick an online host above and click <strong>Discover</strong> — VizCloud queries Pacemaker via <code>pcs status xml</code> and renders cluster topology, quorum, and DC.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {clusters.map((cluster) => (
            <ClusterCard key={cluster.id} cluster={cluster} hosts={hosts} vms={vms} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ClustersPage;
