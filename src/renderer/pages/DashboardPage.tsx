import React from 'react';
import { FiAlertCircle, FiBox, FiLayers, FiServer } from 'react-icons/fi';
import { Link } from 'react-router-dom';

import { LoadingSpinner } from '../components/atoms';
import { useGetClustersQuery } from '../store/api/clustersApi';
import { useGetHostsQuery } from '../store/api/hostsApi';
import { useGetActiveMigrationsQuery } from '../store/api/migrationsApi';
import { useGetVMsQuery } from '../store/api/vmsApi';

interface KpiProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: 'primary' | 'success' | 'info' | 'warning';
  href?: string;
  caption?: string;
}

const accentStyles: Record<KpiProps['accent'], string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  info:    'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
};

const Kpi: React.FC<KpiProps> = ({ label, value, icon, accent, href, caption }) => {
  const content = (
    <div className="bg-page border border-border rounded-xl p-5 hover:border-border-light transition-colors h-full">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentStyles[accent]}`}>
          {icon}
        </div>
        {caption && <span className="text-muted text-xs font-medium">{caption}</span>}
      </div>
      <h3 className="text-2xl font-bold text-foreground">{value}</h3>
      <p className="text-muted text-sm mt-0.5">{label}</p>
    </div>
  );
  return href ? <Link to={href} aria-label={`Open ${label}`}>{content}</Link> : content;
};

const DashboardPage: React.FC = () => {
  const hostsQuery = useGetHostsQuery();
  const vmsQuery = useGetVMsQuery();
  const clustersQuery = useGetClustersQuery();
  const migrationsQuery = useGetActiveMigrationsQuery();

  const isLoading =
    hostsQuery.isLoading || vmsQuery.isLoading || clustersQuery.isLoading || migrationsQuery.isLoading;

  const onlineHosts = (hostsQuery.data ?? []).filter((h) => h.status === 'online').length;
  const totalHosts = hostsQuery.data?.length ?? 0;
  const runningVMs = (vmsQuery.data ?? []).filter((v) => v.state === 'running').length;
  const totalVMs = vmsQuery.data?.length ?? 0;
  const healthyClusters = (clustersQuery.data ?? []).filter((c) => c.status === 'healthy').length;
  const totalClusters = clustersQuery.data?.length ?? 0;
  const activeMigrations = migrationsQuery.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      </div>

      {isLoading ? (
        <div className="py-16 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Hosts" value={totalHosts} icon={<FiServer className="w-5 h-5" />} accent="primary" href="/hosts"
                 caption={totalHosts ? `${onlineHosts}/${totalHosts} online` : undefined} />
            <Kpi label="Virtual Machines" value={totalVMs} icon={<FiBox className="w-5 h-5" />} accent="success" href="/vms"
                 caption={totalVMs ? `${runningVMs} running` : undefined} />
            <Kpi label="Clusters" value={totalClusters} icon={<FiLayers className="w-5 h-5" />} accent="info" href="/clusters"
                 caption={totalClusters ? `${healthyClusters} healthy` : undefined} />
            <Kpi label="Active migrations" value={activeMigrations} icon={<FiAlertCircle className="w-5 h-5" />} accent="warning" href="/migration" />
          </div>

          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-1">
              {totalHosts === 0 ? 'Welcome to VizCloud' : 'Infrastructure overview'}
            </h2>
            <p className="text-muted text-sm">
              {totalHosts === 0
                ? 'No hosts connected yet. Head to the Hosts page to add your first hypervisor.'
                : `Managing ${totalHosts} host(s), ${totalVMs} VM(s), ${totalClusters} cluster(s).`}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
