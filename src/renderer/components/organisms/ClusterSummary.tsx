import React from 'react';
import { DataCard } from '../molecules';

interface ClusterSummaryProps {
  name: string;
  hosts: number;
  vms: number;
  status: string;
  uptime: string;
  className?: string;
}

export const ClusterSummary: React.FC<ClusterSummaryProps> = ({
  name,
  hosts,
  vms,
  status,
  uptime,
  className = '',
}) => {
  return (
    <div className={`bg-background rounded-lg border border-border overflow-hidden ${className}`}>
      <div className="p-4 border-b border-border">
        <h3 className="font-medium text-foreground">
          <span className="text-primary mr-2">📦</span>
          {name}
        </h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
        <DataCard
          title="Hosts"
          value={hosts}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>}
        />
        <DataCard
          title="VMs"
          value={vms}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7" /></svg>}
        />
        <DataCard
          title="Status"
          value={status}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
        />
        <DataCard
          title="Uptime"
          value={uptime}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        />
      </div>
    </div>
  );
};
