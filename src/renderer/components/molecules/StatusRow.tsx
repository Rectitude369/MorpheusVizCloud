import React from 'react';
import { StatusBadge } from '../atoms';
import type { StatusType } from '../atoms/StatusBadge';

interface StatusRowProps {
  name: string;
  status: StatusType;
  timestamp?: string;
  className?: string;
}

export const StatusRow: React.FC<StatusRowProps> = ({
  name,
  status,
  timestamp,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between p-3 hover:bg-background/50 rounded-lg ${className}`}>
      <div>
        <div className="font-medium text-foreground">{name}</div>
        {timestamp && <div className="text-xs text-muted">{timestamp}</div>}
      </div>
      <StatusBadge status={status} />
    </div>
  );
};
