import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LoadingSpinner } from '../../../../src/renderer/components/atoms/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('should render without crashing', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply primary variant by default', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.border-r-primary')).toBeInTheDocument();
  });

  it('should apply secondary variant', () => {
    const { container } = render(<LoadingSpinner variant="secondary" />);
    expect(container.querySelector('.border-r-muted')).toBeInTheDocument();
  });

  it('should apply different sizes', () => {
    const { container: small } = render(<LoadingSpinner size="sm" />);
    const { container: large } = render(<LoadingSpinner size="lg" />);
    
    expect(small.querySelector('.w-4')).toBeInTheDocument();
    expect(large.querySelector('.w-8')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<LoadingSpinner className="custom-spinner" />);
    expect(container.firstChild).toHaveClass('custom-spinner');
  });

  it('should have animation', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
