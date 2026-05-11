import React from 'react';

interface TimelineItemProps {
  time: string;
  event: string;
  status: 'success' | 'warning' | 'error' | 'info';
  className?: string;
}

export const TimelineItem: React.FC<TimelineItemProps> = ({
  time,
  event,
  status,
  className = '',
}) => {
  const statusColors = {
    success: 'border-success',
    warning: 'border-warning',
    error: 'border-destructive',
    info: 'border-primary',
  };

  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${statusColors[status]} ${className}`}>
      <div className="w-20 text-xs text-muted">{time}</div>
      <div className="flex-1">
        <div className="text-sm text-foreground">{event}</div>
      </div>
    </div>
  );
};
