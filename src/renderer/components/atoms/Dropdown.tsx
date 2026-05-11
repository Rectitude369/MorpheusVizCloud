import React from 'react';

interface DropdownProps {
  label: string;
  options: { label: string; value: string }[];
  onChange?: (value: string) => void;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({ label, options, onChange, className = '' }) => {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      <select
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="">Select {label}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
};
