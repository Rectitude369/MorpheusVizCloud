import React from 'react';

/**
 * Status types covering hosts, VMs, clusters, services, and migrations.
 * Adding a new status requires both a type entry and a `statusConfig` row.
 */
export type StatusType =
  // Host statuses
  | 'online'
  | 'offline'
  | 'degraded'
  | 'maintenance'
  | 'unknown'
  // VM states
  | 'running'
  | 'shut off'
  | 'paused'
  | 'shutdown'
  | 'crashed'
  | 'pmsuspended'
  // Cluster states
  | 'healthy'
  | 'failed'
  // Migration states
  | 'pending'
  | 'transferring'
  | 'finalizing'
  | 'completed'
  | 'cancelled';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface StatusStyle {
  readonly color: string;
  readonly bg: string;
  readonly dot: string;
}

const FALLBACK: StatusStyle = { color: 'text-muted', bg: 'bg-muted/10', dot: 'bg-muted' };

const statusConfig: Record<StatusType, StatusStyle> = {
  // Host
  online:       { color: 'text-success', bg: 'bg-success/10', dot: 'bg-success' },
  offline:      { color: 'text-muted',   bg: 'bg-muted/10',   dot: 'bg-muted' },
  degraded:     { color: 'text-warning', bg: 'bg-warning/10', dot: 'bg-warning' },
  maintenance: { color: 'text-info',    bg: 'bg-info/10',    dot: 'bg-info' },
  unknown:      { color: 'text-muted',   bg: 'bg-muted/10',   dot: 'bg-muted' },
  // VM
  running:      { color: 'text-success', bg: 'bg-success/10', dot: 'bg-success' },
  'shut off':   { color: 'text-muted',   bg: 'bg-muted/10',   dot: 'bg-muted' },
  paused:       { color: 'text-warning', bg: 'bg-warning/10', dot: 'bg-warning' },
  shutdown:     { color: 'text-muted',   bg: 'bg-muted/10',   dot: 'bg-muted' },
  crashed:      { color: 'text-error',   bg: 'bg-error/10',   dot: 'bg-error' },
  pmsuspended: { color: 'text-info',    bg: 'bg-info/10',    dot: 'bg-info' },
  // Cluster
  healthy:      { color: 'text-success', bg: 'bg-success/10', dot: 'bg-success' },
  failed:       { color: 'text-error',   bg: 'bg-error/10',   dot: 'bg-error' },
  // Migration
  pending:      { color: 'text-muted',   bg: 'bg-muted/10',   dot: 'bg-muted' },
  transferring: { color: 'text-info',    bg: 'bg-info/10',    dot: 'bg-info' },
  finalizing:   { color: 'text-info',    bg: 'bg-info/10',    dot: 'bg-info' },
  completed:    { color: 'text-success', bg: 'bg-success/10', dot: 'bg-success' },
  cancelled:    { color: 'text-muted',   bg: 'bg-muted/10',   dot: 'bg-muted' },
};

const sizeClasses: Record<NonNullable<StatusBadgeProps['size']>, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'sm',
  className = '',
}) => {
  const config: StatusStyle = statusConfig[status] ?? FALLBACK;
  const display = label ?? status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      role="status"
      aria-label={`${display} status`}
      className={`inline-flex items-center gap-1.5 rounded-full ${config.bg} ${config.color} ${sizeClasses[size]} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${config.dot} animate-pulse`} aria-hidden="true" />
      {display}
    </span>
  );
};
