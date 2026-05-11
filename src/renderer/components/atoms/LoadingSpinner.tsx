import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary';
  className?: string;
  /** Render the spinner centered in a full-viewport container (used as Suspense fallback). */
  fullScreen?: boolean;
}

const sizes = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'primary',
  className = '',
  fullScreen = false,
}) => {
  const spinner = (
    <div className={`relative ${className}`}>
      <div className={`w-full h-full border-2 border-transparent ${variant === 'primary' ? 'border-r-primary' : 'border-r-muted'} rounded-full animate-spin ${sizes[size]}`} />
    </div>
  );
  if (!fullScreen) return spinner;
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
      {spinner}
    </div>
  );
};
