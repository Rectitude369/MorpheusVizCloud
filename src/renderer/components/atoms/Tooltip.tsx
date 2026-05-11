import React, { type ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ children, content, side = 'top', className = '' }) => {
  return (
    <div className={`relative inline-block ${className}`}>
      <span className="relative z-10">{children}</span>
      <span className="absolute z-20 px-2 py-1 text-xs rounded bg-primary text-primary-foreground whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ [side]: '0' }}>{content}</span>
    </div>
  );
};
