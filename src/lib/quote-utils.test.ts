import { describe, it, expect } from 'vitest';
import {
  calculateProductTotal,
  calculateSubtotal,
  calculateTaxAmount,
  calculateFeeSummary,
  groupProducts,
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
  });
});
