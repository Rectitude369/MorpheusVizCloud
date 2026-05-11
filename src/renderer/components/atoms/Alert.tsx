import React from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant: AlertVariant;
  title: string;
  message: string;
  icon?: React.ReactNode;
  className?: string;
}

const variantConfig = {
  info: { title: 'Info', icon: 'ℹ️', bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20' },
  success: { title: 'Success', icon: '✅', bg: 'bg-green-500/10', text: 'text-green-500', border: 'border-green-500/20' },
  warning: { title: 'Warning', icon: '⚠️', bg: 'bg-yellow-500/10', text: 'text-yellow-500', border: 'border-yellow-500/20' },
  error: { title: 'Error', icon: '❌', bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/20' },
};

export const Alert: React.FC<AlertProps> = ({ variant, title, message, icon, className = '' }) => {
  const config = variantConfig[variant];

  return (
    <div className={`flex gap-3 p-4 rounded-lg border ${config.bg} ${config.border} ${className}`}>
      <span className={`text-lg flex-shrink-0 ${config.text}`}>{icon}</span>
      <div>
        <h4 className={`font-medium ${config.text}`}>{title}</h4>
        <p className="text-sm text-muted mt-1">{message}</p>
      </div>
    </div>
  );
};
