import React from 'react';
import { type IconType } from 'react-icons';

interface IconButtonProps {
  icon: IconType;
  onClick: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon: Icon,
  onClick,
  title,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  className = '',
}) => {
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-background hover:bg-sidebar-hover text-muted hover:text-foreground',
    ghost: 'hover:bg-background/50 text-muted hover:text-foreground',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  };

  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex items-center justify-center rounded-lg transition-all duration-200 ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
};
