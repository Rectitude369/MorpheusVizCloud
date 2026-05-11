import React, { type ReactNode } from 'react';

interface CardProps {
  title: string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, children, className = '', footer }) => {
  return (
    <div className={`bg-background rounded-lg border border-border overflow-hidden ${className}`}>
      <div className="p-4 border-b border-border">
        <h3 className="font-medium text-foreground">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
      {footer && (
        <div className="p-4 border-t border-border bg-background/50">
          {footer}
        </div>
      )}
    </div>
  );
};
