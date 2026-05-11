import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataCard } from '../../../../src/renderer/components/molecules/DataCard';

describe('DataCard', () => {
  it('should render title and value', () => {
    render(<DataCard title="CPU Usage" value={75} />);
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('should render with unit', () => {
    render(<DataCard title="Memory" value={4096} unit="MB" />);
    expect(screen.getByText('MB')).toBeInTheDocument();
  });

  it('should render with change indicator', () => {
    render(<DataCard title="Load" value={2.5} change={15} trend="up" />);
    expect(screen.getByText(/up by 15%/i)).toBeInTheDocument();
  });

  it('should apply correct trend color for up trend', () => {
    const { container } = render(<DataCard title="Metric" value={100} change={10} trend="up" />);
    expect(container.querySelector('.text-success')).toBeInTheDocument();
  });

  it('should apply correct trend color for down trend', () => {
    const { container } = render(<DataCard title="Metric" value={50} change={-5} trend="down" />);
    expect(container.querySelector('.text-destructive')).toBeInTheDocument();
  });

  it('should render icon when provided', () => {
    const Icon = (): React.ReactElement => <svg data-testid="test-icon" />;
    render(<DataCard title="Test" value={42} icon={<Icon />} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<DataCard title="Test" value={1} className="custom-card" />);
    expect(container.firstChild).toHaveClass('custom-card');
  });
});
