import React from 'react';
import { FiHardDrive } from 'react-icons/fi';

import { formatBytes } from '../lib/format';
import { useGetHostsQuery } from '../store/api/hostsApi';

const StoragePage: React.FC = () => {
  const { data: hosts = [] } = useGetHostsQuery();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Storage</h1>
      {hosts.length === 0 ? (
        <div className="bg-page border border-border rounded-xl p-12 text-center">
          <p className="text-muted">No hosts connected.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hosts.map((host) => {
            const used = host.storageUsed;
            const total = host.storageTotal;
            const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
            return (
              <article key={host.id} className="bg-page border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0">
                    <FiHardDrive className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-foreground truncate">{host.hostname}</h2>
                    <p className="text-xs text-muted">{host.ipAddress}</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>{formatBytes(used)} used</span>
                    <span>{formatBytes(total)} total</span>
                  </div>
                  <div className="h-2 bg-sidebar rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${pct > 85 ? 'bg-error' : pct > 70 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-right text-xs text-muted mt-1 tabular-nums">{pct}% used</div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StoragePage;
