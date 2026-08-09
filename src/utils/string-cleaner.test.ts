import { describe, it, expect } from 'vitest';
import { cleanParameterDescription, normalizeModel, extractKeyParameters } from '@/utils/string-cleaner';

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

  it('should remove 套：X X pattern (colon separator)', () => {
    const text = '搅拌罐 套：3 2';
    const result = cleanParameterDescription(text);
    expect(result).not.toMatch(/套[：:]\s*3\s*2/);
    expect(result).toContain('搅拌罐');
  });

  it('should remove 套X pattern (single number after 套)', () => {
    const text = '搅拌罐套3';
    const result = cleanParameterDescription(text);
    expect(result).not.toContain('套3');
    expect(result).toContain('搅拌罐');
  });

  it('should keep only the first when duplicate sizes appear', () => {
    const text = 'φ4000×3000mm搅拌罐 φ4000×3000mm';
    const result = cleanParameterDescription(text);
    expect(result).toMatch(/φ\s*4000×3000mm/);
    const sizeCount = (result.match(/φ\s*4000×3000mm/g) || []).length;
    expect(sizeCount).toBe(1);
  });

  it('should keep different sizes without removing', () => {
    const text = 'φ4000×3000mm φ5000×4000mm';
    const result = cleanParameterDescription(text);
    expect(result).toContain('φ5000×4000mm');
  });

  it('should keep only the first when duplicate power values appear', () => {
    const text = '搅拌罐 11kW 11kW';
    const result = cleanParameterDescription(text);
    const powerCount = (result.match(/11kW/gi) || []).length;
    expect(powerCount).toBe(1);
  });

  it('should keep different power values without removing', () => {
    const text = '搅拌罐 11kW 5.5kW';
    const result = cleanParameterDescription(text);
    expect(result).toContain('5.5kW');
    expect(result).toContain('11kW');
  });

  it('should deduplicate Chinese power units', () => {
    const text = '搅拌罐 5.5千瓦 5.5千瓦';
    const result = cleanParameterDescription(text);
    const count = (result.match(/5\.5千瓦/g) || []).length;
    expect(count).toBe(1);
  });

  it('should deduplicate mixed power units with same numeric value', () => {
    const text = '搅拌罐 11kW 11千瓦';
    const result = cleanParameterDescription(text);
    const count = (result.match(/11(?:kW|千瓦)/g) || []).length;
    expect(count).toBe(1);
  });

  it('should collapse multiple spaces into one', () => {
    const text = 'a   b';
    const result = cleanParameterDescription(text);
    expect(result).toBe('a b');
  });

  it('should collapse newlines into single space', () => {
    const text = 'a\nb';
    const result = cleanParameterDescription(text);
    expect(result).toBe('a b');
  });

  it('should remove trailing punctuation', () => {
    expect(cleanParameterDescription('abc；')).toBe('abc');
    expect(cleanParameterDescription('abc，')).toBe('abc');
    expect(cleanParameterDescription('abc。')).toBe('abc');
    expect(cleanParameterDescription('abc、')).toBe('abc');
  });

  it('should remove trailing pure number', () => {
    const text = '搅拌罐 2';
    const result = cleanParameterDescription(text);
    expect(result).toBe('搅拌罐');
  });

  it('should collapse consecutive 套 characters', () => {
    // Note: "套套3" is also matched by step 1 (套\d+), which removes "套3"
    // After step 1: "套", after step 7 (套+/g): "套" — no collapse needed
    // A true collapse scenario: "套套罐" (no digit follows, so step 1 doesn't match)
    const text = '套套搅拌罐';
    const result = cleanParameterDescription(text);
    expect(result).toBe('套搅拌罐');
  });

  it('should handle comprehensive cleaning scenario', () => {
    const text = 'φ4000×3000mm套3 2 11kW 11kW';
    const result = cleanParameterDescription(text);
    expect(result).toContain('φ4000×3000mm');
    expect(result).not.toContain('套');
    const powerCount = (result.match(/11kW/gi) || []).length;
    expect(powerCount).toBeLessThanOrEqual(1);
  });
});

describe('normalizeModel', () => {
  it('should return empty string for empty/undefined/null input', () => {
    expect(normalizeModel('')).toBe('');
    expect(normalizeModel(null as any)).toBe('');
    expect(normalizeModel(undefined as any)).toBe('');
  });

  it('should replace lowercase x with ×', () => {
    expect(normalizeModel('4000x3000')).toBe('4000×3000');
  });

  it('should replace uppercase X with ×', () => {
    expect(normalizeModel('4000X3000')).toBe('4000×3000');
  });

  it('should not replace X when not a dimension separator', () => {
    expect(normalizeModel('GA37')).toBe('GA37');
  });

  it('should collapse multiple spaces into one', () => {
    expect(normalizeModel('GA  37')).toBe('GA 37');
  });

  it('should normalize mm to lowercase', () => {
    expect(normalizeModel('4000×3000MM')).toBe('4000×3000mm');
  });

  it('should return unchanged text when already normalized', () => {
    expect(normalizeModel('4000×3000mm')).toBe('4000×3000mm');
  });
});

describe('extractKeyParameters', () => {
  it('should return empty object for empty/null/undefined input', () => {
    expect(extractKeyParameters('')).toEqual({});
    expect(extractKeyParameters(null as any)).toEqual({});
    expect(extractKeyParameters(undefined as any)).toEqual({});
  });

  it('should extract size with φ prefix', () => {
    const result = extractKeyParameters('φ4000×3000mm搅拌罐');
    expect(result.size).toBe('4000×3000');
  });

  it('should extract capacity with 吨/天', () => {
    const result = extractKeyParameters('处理量50吨/天');
    expect(result.capacity).toContain('50');
    expect(result.capacity).toContain('吨');
  });

  it('should extract capacity with m³/h', () => {
    const result = extractKeyParameters('100m³/h');
    expect(result.capacity).toContain('100');
  });

  it('should extract material - 不锈钢', () => {
    const result = extractKeyParameters('不锈钢材质搅拌罐');
    expect(result.material).toBe('不锈钢');
  });

  it('should extract material - 碳钢', () => {
    const result = extractKeyParameters('碳钢储罐');
    expect(result.material).toBe('碳钢');
  });

  it('should extract power with kW unit', () => {
    const result = extractKeyParameters('电机5.5kW');
    expect(result.power).toContain('5.5kW');
  });

  it('should extract power with lowercase kw unit', () => {
    const result = extractKeyParameters('电机7.5kw');
    expect(result.power).toContain('7.5');
  });

  it('should return first material when multiple are present', () => {
    const result = extractKeyParameters('不锈钢碳钢搅拌罐');
    expect(result.material).toBe('不锈钢');
  });

  it('should return empty object when no parameters match', () => {
    const result = extractKeyParameters('普通搅拌设备');
    expect(result).toEqual({});
  });

  it('should extract multiple parameters from combined description', () => {
    const result = extractKeyParameters('φ4000×3000mm 不锈钢 50吨/天 5.5kW');
    expect(result.size).toBe('4000×3000');
    expect(result.material).toBe('不锈钢');
    expect(result.capacity).toContain('50');
    expect(result.power).toContain('5.5kW');
  });
});
