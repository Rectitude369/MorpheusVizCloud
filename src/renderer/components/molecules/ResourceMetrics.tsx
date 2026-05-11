import React from 'react';

interface ResourceMetricsProps {
  cpu: number;
  memory: number;
  storage: number;
  network: number;
  className?: string;
}

export const ResourceMetrics: React.FC<ResourceMetricsProps> = ({
  cpu,
  memory,
  storage,
  network,
  className = '',
}) => {
  const formatPercentage = (value: number): string => {
    return value > 100 ? `${(value / 100).toFixed(1)}00%` : `${value.toFixed(1)}%`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {[
        { value: cpu, label: 'CPU', unit: '%' },
        { value: memory, label: 'Memory', unit: '%' },
        { value: storage, label: 'Storage', unit: '%' },
        { value: network, label: 'Network', unit: 'MB/s' },
      ].map((metric) => (
        <div key={metric.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-foreground">{metric.label}</span>
            <span className="text-muted">
              {metric.label === 'Network' ? formatBytes(metric.value * 1000000) : formatPercentage(metric.value)}
            </span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, metric.value))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
