import React from 'react';
import { StatusBadge } from '../atoms';
import type { StatusType } from '../atoms/StatusBadge';

interface HostSummaryProps {
  hostname: string;
  ipAddress: string;
  status: StatusType;
  lastHeartbeat: string;
  datacenter: string;
  className?: string;
}

export const HostSummary: React.FC<HostSummaryProps> = ({
  hostname,
  ipAddress,
  status,
  lastHeartbeat,
  datacenter,
  className = '',
}) => {
  return (
    <div className={`bg-background rounded-lg border border-border overflow-hidden ${className}`}>
      <div className="p-4 border-b border-border">
        <h3 className="font-medium text-foreground">
          <span className="text-primary mr-2">🖥️</span>
          {hostname}
        </h3>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm text-muted">IP Address</div>
            <div className="font-mono text-foreground">{ipAddress}</div>
          </div>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted">Last Heartbeat</div>
            <div className="text-foreground">{lastHeartbeat}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Datacenter</div>
            <div className="text-foreground">{datacenter}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
