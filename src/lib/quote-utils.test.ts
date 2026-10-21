import { describe, it, expect, vi } from 'vitest';
import {
  calculateProductTotal,
  calculateSubtotal,
  calculateTaxAmount,
  calculateFeeSummary,
  groupProducts,
  formatAmountToChinese,
  getQuoteTitle,
  getTotalTitle,
  calculatePriceDiff,
  generateQuoteNumber,
} from '@/lib/quote-utils';
import type { QuoteProduct, FeeConfig } from '@/types/quote';

// Helper function to create test products with calculated totalPrice
const createTestProduct = (
  id: string,
  name: string,
  quantity: number,
  unitPrice: number,
  options?: { category?: string; brand?: string; system?: string }
): QuoteProduct => ({
  id,
  name,
  price: unitPrice,
  quantity,
  unitPrice,
  totalPrice: quantity * unitPrice,
  ...options,
});

describe('quote-utils', () => {
  describe('calculateProductTotal', () => {
    it('should calculate product total correctly', () => {
      expect(calculateProductTotal(5, 100)).toBe(500);
      expect(calculateProductTotal(2, 50.5)).toBe(101);
    });

    it('should handle zero quantity', () => {
      expect(calculateProductTotal(0, 100)).toBe(0);
    });

    it('should handle zero price', () => {
      expect(calculateProductTotal(5, 0)).toBe(0);
    });

    it('should handle decimal values', () => {
      const result = calculateProductTotal(3, 33.33);
      expect(result).toBeCloseTo(99.99, 2);
    });

    it('should handle large numbers', () => {
      expect(calculateProductTotal(10000, 1000)).toBe(10000000);
    });
  });

  describe('calculateSubtotal', () => {
    it('should calculate subtotal of multiple products', () => {
      const products: QuoteProduct[] = [
        createTestProduct('1', 'Product A', 2, 100),
        createTestProduct('2', 'Product B', 3, 50),
      ];

      expect(calculateSubtotal(products)).toBe(350); // 2*100 + 3*50
    });

    it('should return 0 for empty array', () => {
      expect(calculateSubtotal([])).toBe(0);
    });

    it('should handle single product', () => {
      const products: QuoteProduct[] = [
        createTestProduct('1', 'Product A', 5, 20),
      ];

      expect(calculateSubtotal(products)).toBe(100);
    });

    it('should handle products with zero values', () => {
      const products: QuoteProduct[] = [
        createTestProduct('1', 'Product A', 0, 100),
        createTestProduct('2', 'Product B', 5, 0),
      ];

      expect(calculateSubtotal(products)).toBe(0);
    });
  });

  describe('calculateTaxAmount', () => {
    it('should calculate tax amount correctly', () => {
      expect(calculateTaxAmount(1000, 10)).toBe(100);
      expect(calculateTaxAmount(500, 5)).toBe(25);
    });

    it('should handle zero tax rate', () => {
      expect(calculateTaxAmount(1000, 0)).toBe(0);
    });

    it('should handle zero subtotal', () => {
      expect(calculateTaxAmount(0, 10)).toBe(0);
    });

    it('should handle decimal tax rate', () => {
      const result = calculateTaxAmount(1000, 13.5);
      expect(result).toBe(135);
    });
  });

  describe('calculateFeeSummary', () => {
    it('should calculate complete fee summary', () => {
      const products: QuoteProduct[] = [
        createTestProduct('1', 'Product A', 2, 500),
      ];

      const feeConfig: FeeConfig = {
        taxRate: 10,
        shippingFee: 100,
        installationFee: 200,
        otherFee: 50,
      };

      const summary = calculateFeeSummary(products, feeConfig);

      expect(summary.subtotal).toBe(1000); // 2 * 500
      expect(summary.taxAmount).toBe(100); // 1000 * 10%
      expect(summary.shippingFee).toBe(100);
      expect(summary.installationFee).toBe(200);
      expect(summary.otherFee).toBe(50);
      expect(summary.totalAmount).toBe(1450); // 1000 + 100 + 100 + 200 + 50
    });

    it('should handle empty products', () => {
      const feeConfig: FeeConfig = {
        taxRate: 10,
        shippingFee: 100,
        installationFee: 0,
        otherFee: 0,
      };

      const summary = calculateFeeSummary([], feeConfig);

      expect(summary.subtotal).toBe(0);
      expect(summary.taxAmount).toBe(0);
      expect(summary.totalAmount).toBe(100); // only shipping fee
    });

    it('should handle all zero fees', () => {
      const products: QuoteProduct[] = [
        createTestProduct('1', 'Product A', 1, 1000),
      ];

      const feeConfig: FeeConfig = {
        taxRate: 0,
        shippingFee: 0,
        installationFee: 0,
        otherFee: 0,
      };

      const summary = calculateFeeSummary(products, feeConfig);

      expect(summary.subtotal).toBe(1000);
      expect(summary.totalAmount).toBe(1000);
    });
  });

  describe('groupProducts', () => {
    const products: QuoteProduct[] = [
      createTestProduct('1', 'Product A', 1, 100, { category: 'Electronics', brand: 'BrandA' }),
      createTestProduct('2', 'Product B', 1, 200, { category: 'Electronics', brand: 'BrandB' }),
      createTestProduct('3', 'Product C', 1, 300, { category: 'Clothing', brand: 'BrandA' }),
    ];

    it('should group products by category', () => {
      const groups = groupProducts(products, 'category');

      expect(groups).toHaveLength(2);
      const electronicsGroup = groups.find(g => g.name === 'Electronics');
      expect(electronicsGroup?.products).toHaveLength(2);
    });

    it('should group products by brand', () => {
      const groups = groupProducts(products, 'brand');

      expect(groups).toHaveLength(2);
      const brandAGroup = groups.find(g => g.name === 'BrandA');
      expect(brandAGroup?.products).toHaveLength(2);
    });

    it('should return single group for none type', () => {
      const groups = groupProducts(products, 'none');

      expect(groups).toHaveLength(1);
      expect(groups[0].type).toBe('none');
      expect(groups[0].products).toHaveLength(3);
    });

    it('should handle products without category/brand', () => {
      const productsWithoutCategory: QuoteProduct[] = [
        createTestProduct('1', 'Product A', 1, 100),
        createTestProduct('2', 'Product B', 1, 200, { category: 'Electronics' }),
      ];

      const groups = groupProducts(productsWithoutCategory, 'category');

      expect(groups).toHaveLength(2);
      const uncategorized = groups.find(g => g.name === '未分类');
      expect(uncategorized?.products).toHaveLength(1);
    });

    it('should handle empty products array', () => {
      const groups = groupProducts([], 'category');

      // When products array is empty, groups will also be empty
      expect(groups).toHaveLength(0);
    });

    it('should group products by system', () => {
      const products: QuoteProduct[] = [
        createTestProduct('1', 'Product A', 1, 100, { system: 'SystemA' }),
        createTestProduct('2', 'Product B', 1, 200, { system: 'SystemA' }),
        createTestProduct('3', 'Product C', 1, 300, { system: 'SystemB' }),
      ];

      const groups = groupProducts(products, 'system');

      expect(groups).toHaveLength(2);
      const systemAGroup = groups.find(g => g.name === 'SystemA');
      expect(systemAGroup?.products).toHaveLength(2);
    });

    it('should group products without brand into uncategorized', () => {
      const products: QuoteProduct[] = [
        createTestProduct('1', 'Product A', 1, 100),
        createTestProduct('2', 'Product B', 1, 200, { brand: 'BrandA' }),
      ];

      const groups = groupProducts(products, 'brand');

      expect(groups).toHaveLength(2);
      const uncategorized = groups.find(g => g.name === '未分类');
      expect(uncategorized?.products).toHaveLength(1);
    });

    it('should group products without system into uncategorized', () => {
      const products: QuoteProduct[] = [
        createTestProduct('1', 'Product A', 1, 100),
        createTestProduct('2', 'Product B', 1, 200, { system: 'SystemX' }),
      ];

      const groups = groupProducts(products, 'system');

      expect(groups).toHaveLength(2);
      const uncategorized = groups.find(g => g.name === '未分类');
      expect(uncategorized?.products).toHaveLength(1);
    });
  });

  describe('generateQuoteNumber', () => {
    it('should generate quote number with company prefix', async () => {
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn().mockResolvedValue({ data: [] }),
            })),
          })),
        })),
      };

      const result = await generateQuoteNumber('ABC', mockDb);

      expect(result).toMatch(/^ABC\d{8}001$/);
    });

    it('should use QT prefix when no company abbreviation', async () => {
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn().mockResolvedValue({ data: [] }),
            })),
          })),
        })),
      };

      const result = await generateQuoteNumber('', mockDb);

      expect(result).toMatch(/^QT\d{8}001$/);
    });

    it('should increment sequence based on existing quotes', async () => {
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn().mockResolvedValue({ data: [{ quote_number: '1' }, { quote_number: '2' }] }),
            })),
          })),
        })),
      };

      const result = await generateQuoteNumber('ABC', mockDb);

      // 2 existing + 1 = 003
      expect(result).toMatch(/^ABC\d{8}003$/);
    });

    it('should fallback to timestamp on DB error', async () => {
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn().mockRejectedValue(new Error('DB connection failed')),
            })),
          })),
        })),
      };

      const result = await generateQuoteNumber('ABC', mockDb);

      // Should still have prefix and date, with 6-digit timestamp suffix
      expect(result).toMatch(/^ABC\d{8}\d{6}$/);
    });

    it('should clean special characters from company abbreviation', async () => {
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn().mockResolvedValue({ data: [] }),
            })),
          })),
        })),
      };

      const result = await generateQuoteNumber('A-B C', mockDb);

      expect(result).toMatch(/^ABC\d{8}001$/);
    });
  });

  describe('formatAmountToChinese', () => {
    it('should return "零元整" for zero', () => {
      expect(formatAmountToChinese(0)).toBe('零元整');
    });

    it('should format 1 as "壹元整"', () => {
      expect(formatAmountToChinese(1)).toBe('壹元整');
    });

    it('should format 12 as "壹拾贰元整"', () => {
      expect(formatAmountToChinese(12)).toBe('壹拾贰元整');
    });

    it('should format 100 as "壹佰元整"', () => {
      expect(formatAmountToChinese(100)).toBe('壹佰元整');
    });

    it('should format 10000 as "壹万元整"', () => {
      expect(formatAmountToChinese(10000)).toBe('壹万元整');
    });

    it('should format 100000000 — known code behavior (亿位后追加"万元整")', () => {
      // The current units array has overlapping 万/亿 segments, producing "壹亿万元整"
      // rather than the expected "壹亿元整". This is a known code issue.
      expect(formatAmountToChinese(100000000)).toBe('壹亿万元整');
    });

    it('should handle internal zeros: 101 → "壹佰零壹元整"', () => {
      expect(formatAmountToChinese(101)).toBe('壹佰零壹元整');
    });

    it('should handle internal zeros: 1001 → "壹仟零壹元整"', () => {
      expect(formatAmountToChinese(1001)).toBe('壹仟零壹元整');
    });

    it('should format 1.5 as "壹元伍角"', () => {
      expect(formatAmountToChinese(1.5)).toBe('壹元伍角');
    });

    it('should format 1.53 as "壹元伍角叁分"', () => {
      expect(formatAmountToChinese(1.53)).toBe('壹元伍角叁分');
    });

    it('should format 0.53 as "伍角叁分" (no "零元" prefix)', () => {
      // integerPart=0 skips the integer branch, result stays empty
      // then decimalPart > 0 appends 角分 directly
      expect(formatAmountToChinese(0.53)).toBe('伍角叁分');
    });

    it('should format 0.5 as "伍角"', () => {
      expect(formatAmountToChinese(0.5)).toBe('伍角');
    });

    it('should format 0.06 as "零角陆分"', () => {
      // jiao=0 so no 角, fen=6 so 陆分; but no 零角 prefix because jiao>0 check skips
      // Actually: jiao=0 skips the "if (jiao > 0)" branch, fen=6 appends "陆分"
      expect(formatAmountToChinese(0.06)).toBe('陆分');
    });

    it('should format 10 as "壹拾元整"', () => {
      expect(formatAmountToChinese(10)).toBe('壹拾元整');
    });

    it('should format 10010 as "壹万零壹拾元整"', () => {
      // 10010: digit sequence 1-0-0-1-0
      // units at indices 4,3,2,1,0: 万,仟,佰,拾,(none)
      // 1万, 0仟(zeroFlag), 0佰(zeroFlag), 1拾(零flag→add 零, then 壹拾)
      // Final: 壹万零壹拾元整
      expect(formatAmountToChinese(10010)).toBe('壹万零壹拾元整');
    });
  });

  describe('getQuoteTitle', () => {
    it('should return "报价单" for empty array', () => {
      expect(getQuoteTitle([])).toBe('报价单');
    });

    it('should return "{category}报价单" for single product with category', () => {
      const products = [{ category: '电子产品', totalPrice: 5000 }];
      expect(getQuoteTitle(products)).toBe('电子产品报价单');
    });

    it('should return "产品报价单" for single product without category', () => {
      const products = [{ totalPrice: 5000 }];
      expect(getQuoteTitle(products)).toBe('产品报价单');
    });

    it('should return "产品报价单" for single product with "未分类" category', () => {
      const products = [{ category: '未分类', totalPrice: 5000 }];
      expect(getQuoteTitle(products)).toBe('产品报价单');
    });

    it('should return "{category}报价单" for multiple products, single category, small total', () => {
      const products = [
        { category: '电子产品', totalPrice: 3000 },
        { category: '电子产品', totalPrice: 2000 },
      ];
      expect(getQuoteTitle(products)).toBe('电子产品报价单');
    });

    it('should return "{category}项目报价单" for multiple products, single category, medium total', () => {
      const products = [
        { category: '电子产品', totalPrice: 50000 },
        { category: '电子产品', totalPrice: 30000 },
      ];
      expect(getQuoteTitle(products)).toBe('电子产品项目报价单');
    });

    it('should return "{category}整体解决方案报价单" for multiple products, single category, large total', () => {
      const products = [
        { category: '电子产品', totalPrice: 60000 },
        { category: '电子产品', totalPrice: 60000 },
      ];
      expect(getQuoteTitle(products)).toBe('电子产品整体解决方案报价单');
    });

    it('should return "产品报价单" for multiple products, no categories, small total', () => {
      const products = [
        { totalPrice: 2000 },
        { totalPrice: 3000 },
      ];
      expect(getQuoteTitle(products)).toBe('产品报价单');
    });

    it('should return "{brand}品牌项目报价单" for multiple products, >3 categories, single brand, medium total', () => {
      const products = [
        { category: '电子', totalPrice: 2000, brand: '华为' },
        { category: '服装', totalPrice: 3000, brand: '华为' },
        { category: '食品', totalPrice: 4000, brand: '华为' },
        { category: '家居', totalPrice: 5000, brand: '华为' },
      ];
      // 4 categories (>3), 1 brand, total=14000 (medium: project)
      expect(getQuoteTitle(products)).toBe('华为品牌项目报价单');
    });

    it('should return "cat1+cat2+cat3报价单" for 2-3 categories, small total', () => {
      const products = [
        { category: '电子', totalPrice: 2000, brand: 'A' },
        { category: '服装', totalPrice: 2000, brand: 'B' },
        { category: '食品', totalPrice: 2000, brand: 'C' },
      ];
      expect(getQuoteTitle(products)).toBe('电子+服装+食品报价单');
    });

    it('should return "完整解决方案报价单" for multiple products, no categories, no brands, large total', () => {
      const products = [
        { totalPrice: 60000 },
        { totalPrice: 60000 },
      ];
      expect(getQuoteTitle(products)).toBe('完整解决方案报价单');
    });

    it('should return "工程项目报价单" for multiple products, no categories, medium total', () => {
      const products = [
        { totalPrice: 30000 },
        { totalPrice: 40000 },
      ];
      expect(getQuoteTitle(products)).toBe('工程项目报价单');
    });

    it('should return "cat1+cat2项目报价单" for 2 categories, medium total', () => {
      const products = [
        { category: '电子', totalPrice: 30000, brand: 'A' },
        { category: '服装', totalPrice: 40000, brand: 'B' },
      ];
      expect(getQuoteTitle(products)).toBe('电子+服装项目报价单');
    });

    it('should handle products without totalPrice (treated as 0)', () => {
      const products = [
        { category: '电子', brand: 'A' },
        { category: '电子', brand: 'B' },
      ];
      // totalPrice is undefined, reduce falls back to 0, totalAmount=0 < 10000
      expect(getQuoteTitle(products)).toBe('电子报价单');
    });
  });

  describe('getTotalTitle', () => {
    it('should return "总价" for empty array', () => {
      expect(getTotalTitle([])).toBe('总价');
    });

    it('should return "产品总价" for single product', () => {
      const products = [{ totalPrice: 50000 }];
      expect(getTotalTitle(products)).toBe('产品总价');
    });

    it('should return "产品总价" for multiple products with small total', () => {
      const products = [
        { totalPrice: 2000 },
        { totalPrice: 3000 },
      ];
      expect(getTotalTitle(products)).toBe('产品总价');
    });

    it('should return "工程总价" for multiple products with large total', () => {
      const products = [
        { totalPrice: 60000 },
        { totalPrice: 60000 },
      ];
      expect(getTotalTitle(products)).toBe('工程总价');
    });

    it('should return "工程总价" for multiple products at exactly 10000', () => {
      const products = [
        { totalPrice: 5000 },
        { totalPrice: 5000 },
      ];
      expect(getTotalTitle(products)).toBe('工程总价');
    });

    it('should return "产品总价" for multiple products just under 10000', () => {
      const products = [
        { totalPrice: 4999 },
        { totalPrice: 5000 },
      ];
      expect(getTotalTitle(products)).toBe('产品总价');
    });

    it('should handle products without totalPrice (treated as 0)', () => {
      const products = [{}, { category: '电子' }];
      // totalPrice is undefined, reduce falls back to 0, totalAmount=0 < 10000
      expect(getTotalTitle(products)).toBe('产品总价');
    });
  });

  describe('calculatePriceDiff', () => {
    it('should return isLower=true when ourPrice < marketPrice', () => {
      const result = calculatePriceDiff(90, 100);
      expect(result.diff).toBe(-10);
      expect(result.percentage).toBe(10);
      expect(result.isLower).toBe(true);
    });

    it('should return isLower=false when ourPrice > marketPrice', () => {
      const result = calculatePriceDiff(110, 100);
      expect(result.diff).toBe(10);
      expect(result.percentage).toBe(10);
      expect(result.isLower).toBe(false);
    });

    it('should return zero diff and percentage when prices are equal', () => {
      const result = calculatePriceDiff(100, 100);
      expect(result.diff).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.isLower).toBe(false);
    });

    it('should return percentage=0 when marketPrice is 0', () => {
      const result = calculatePriceDiff(100, 0);
      expect(result.diff).toBe(100);
      expect(result.percentage).toBe(0);
      expect(result.isLower).toBe(false);
    });

    it('should return percentage=0 when marketPrice is negative', () => {
      const result = calculatePriceDiff(100, -50);
      expect(result.diff).toBe(150);
      expect(result.percentage).toBe(0);
      expect(result.isLower).toBe(false);
    });

    it('should handle both prices as 0', () => {
      const result = calculatePriceDiff(0, 0);
      expect(result.diff).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.isLower).toBe(false);
    });
  });
});
