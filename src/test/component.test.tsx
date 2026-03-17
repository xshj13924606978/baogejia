import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

// Simple test component
function TestComponent({ title, count }: { title: string; count: number }) {
  return (
    <div>
      <h1>{title}</h1>
      <p data-testid="count">Count: {count}</p>
    </div>
  );
}

describe('TestComponent', () => {
  it('should render title correctly', () => {
    render(<TestComponent title="Hello Test" count={0} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello Test');
  });

  it('should render count correctly', () => {
    render(<TestComponent title="Test" count={42} />);
    expect(screen.getByTestId('count')).toHaveTextContent('Count: 42');
  });

  it('should update when props change', () => {
    const { rerender } = render(<TestComponent title="Test" count={1} />);
    expect(screen.getByTestId('count')).toHaveTextContent('Count: 1');

    rerender(<TestComponent title="Test" count={100} />);
    expect(screen.getByTestId('count')).toHaveTextContent('Count: 100');
  });
});
