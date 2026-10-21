import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn (className merge utility)', () => {
  it('should merge class names correctly', () => {
    const result = cn('foo', 'bar');
    expect(result).toBe('foo bar');
  });

  it('should handle conditional class names', () => {
    const result = cn('base', true && 'included', false && 'excluded');
    expect(result).toBe('base included');
  });

  it('should merge tailwind classes correctly', () => {
    // tailwind-merge should keep the last class when there are conflicts
    const result = cn('px-2 py-1', 'px-4');
    expect(result).toBe('py-1 px-4');
  });

  it('should handle undefined and null values', () => {
    const result = cn('base', undefined, null, 'end');
    expect(result).toBe('base end');
  });

  it('should handle array of class names', () => {
    const result = cn(['array-class-1', 'array-class-2'], 'string-class');
    expect(result).toContain('array-class-1');
    expect(result).toContain('array-class-2');
    expect(result).toContain('string-class');
  });

  it('should handle object syntax', () => {
    const result = cn({
      'active': true,
      'disabled': false,
      'primary': true,
    });
    expect(result).toContain('active');
    expect(result).toContain('primary');
    expect(result).not.toContain('disabled');
  });

  it('should handle complex tailwind merge scenarios', () => {
    // Testing conflicting margin classes
    const result = cn('m-4', 'm-8');
    expect(result).toBe('m-8');
  });

  it('should handle empty input', () => {
    const result = cn();
    expect(result).toBe('');
  });
});
