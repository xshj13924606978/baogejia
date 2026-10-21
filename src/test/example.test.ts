import { describe, it, expect } from 'vitest';

describe('Example Test Suite', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string operations', () => {
    const str = 'hello world';
    expect(str).toContain('world');
    expect(str.length).toBe(11);
  });

  it('should handle array operations', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(arr).toHaveLength(5);
    expect(arr).toContain(3);
    expect(arr.filter(n => n > 3)).toEqual([4, 5]);
  });

  it('should handle object operations', () => {
    const obj = { name: 'test', value: 123 };
    expect(obj).toHaveProperty('name');
    expect(obj.name).toBe('test');
    expect(obj.value).toBeGreaterThan(100);
  });
});
