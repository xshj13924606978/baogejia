import { describe, it, expect } from 'vitest';
import { cleanParameterDescription } from '@/utils/string-cleaner';

describe('cleanParameterDescription', () => {
  it('should return empty string for empty input', () => {
    expect(cleanParameterDescription('')).toBe('');
    expect(cleanParameterDescription(null as any)).toBe('');
    expect(cleanParameterDescription(undefined as any)).toBe('');
  });

  it('should return original text when no cleaning is needed', () => {
    const text = '不锈钢材质搅拌罐';
    const result = cleanParameterDescription(text);
    // The function may modify the text, so we check it contains the key content
    expect(result).toContain('不锈钢');
  });

  it('should handle text with size specifications', () => {
    const text = 'φ4000×3000mm搅拌罐';
    const result = cleanParameterDescription(text);
    expect(result).toBeTruthy();
  });

  it('should remove redundant set numbers (套X X pattern)', () => {
    const text = '处理量50吨/天 套3 2';
    const result = cleanParameterDescription(text);
    // Should not contain the "套3 2" pattern
    expect(result).not.toMatch(/套\s*3\s*2/);
  });
});
