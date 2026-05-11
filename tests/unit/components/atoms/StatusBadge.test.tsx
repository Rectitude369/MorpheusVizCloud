import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../../../../src/renderer/components/atoms/StatusBadge';

describe('StatusBadge', () => {
  it('should render with online status', () => {
    render(<StatusBadge status="online" />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('should render with custom label', () => {
    render(<StatusBadge status="online" label="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should apply correct color for success status', () => {
    const { container } = render(<StatusBadge status="running" />);
    expect(container.firstChild).toHaveClass('text-success');
  });

  it('should apply correct color for offline status', () => {
    const { container } = render(<StatusBadge status="offline" />);
    expect(container.firstChild).toHaveClass('text-muted');
  });

  it('should apply different sizes', () => {
    const { container: small } = render(<StatusBadge status="online" size="sm" />);
    const { container: large } = render(<StatusBadge status="online" size="lg" />);
    
    expect(small.firstChild).toHaveClass('px-2');
    expect(large.firstChild).toHaveClass('px-4');
  });

  it('should apply custom className', () => {
    const { container } = render(<StatusBadge status="online" className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
