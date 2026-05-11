import React from 'react';

interface DataCardProps {
  title: string;
  value: string | number;
  unit?: string;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

export const DataCard: React.FC<DataCardProps> = ({
  title,
  value,
  unit = '',
  change,
  trend = 'neutral',
  icon,
  className = '',
}) => {
  const trendColor = {
    up: 'text-success',
    down: 'text-destructive',
    neutral: 'text-muted',
  };

  return (
    <div className={`bg-background rounded-lg border border-border p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-foreground">{title}</h3>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        {unit && <span className="text-muted">{unit}</span>}
      </div>
      {change !== undefined && (
        <div className={`text-sm mt-1 ${trendColor[trend]}`}>
          <span className="capitalize">{trend} by {change}%</span>
        </div>
      )}
    </div>
  );
};
