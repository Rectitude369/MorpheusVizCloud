import React, { type ReactNode } from 'react';

interface ActionCardProps {
  title: string;
  description: string;
  actions: ReactNode;
  className?: string;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  title,
  description,
  actions,
  className = '',
}) => {
  return (
    <div className={`bg-background rounded-lg border border-border p-4 ${className}`}>
      <h3 className="font-medium text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted mb-4">{description}</p>
      <div className="flex flex-wrap gap-2">
        {actions}
      </div>
    </div>
  );
};
