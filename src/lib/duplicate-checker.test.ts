import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuplicateChecker } from '@/lib/duplicate-checker';

describe('DuplicateChecker', () => {
  let checker: DuplicateChecker;

  beforeEach(() => {
    checker = new DuplicateChecker();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const config = checker.getConfig();
      expect(config.fields).toEqual(['name', 'model']);
      expect(config.matchRule).toBe('and');
    });

    it('should use custom config when provided', () => {
      const customChecker = new DuplicateChecker({
        fields: ['name', 'brand'],
        matchRule: 'and',
      });
      const config = customChecker.getConfig();
      expect(config.fields).toEqual(['name', 'brand']);
    });
  });

  describe('setConfig', () => {
    it('should update config', () => {
      checker.setConfig({ fields: ['name'], matchRule: 'and' });
      const config = checker.getConfig();
      expect(config.fields).toEqual(['name']);
    });
  });

  describe('checkDuplicate', () => {
    it('should return not duplicate when fields are empty', async () => {
      checker.setConfig({ fields: [], matchRule: 'and' });
      const result = await checker.checkDuplicate({ name: 'test' });
      expect(result.isDuplicate).toBe(false);
    });

    it('should detect duplicate with name and model match', async () => {
      checker.setConfig({ fields: ['name', 'model'], matchRule: 'and' });

      const existingProducts = [
        { name: 'Product A', model: 'X100', brand: 'BrandX' },
        { name: 'Product B', model: 'Y200', brand: 'BrandY' },
      ];

      const newProduct = { name: 'Product A', model: 'X100', brand: 'BrandZ' };
      const result = await checker.checkDuplicate(newProduct, existingProducts);

      expect(result.isDuplicate).toBe(true);
      expect(result.matchedFields).toEqual(expect.arrayContaining(['name', 'model']));
    });

    it('should not detect duplicate when only name matches', async () => {
      checker.setConfig({ fields: ['name', 'model'], matchRule: 'and' });

      const existingProducts = [
        { name: 'Product A', model: 'X100' },
      ];

      const newProduct = { name: 'Product A', model: 'X200' };
      const result = await checker.checkDuplicate(newProduct, existingProducts);

      expect(result.isDuplicate).toBe(false);
    });

    it('should detect duplicate with single field config', async () => {
      checker.setConfig({ fields: ['name'], matchRule: 'and' });

      const existingProducts = [
        { name: 'Product A', model: 'X100' },
      ];

      const newProduct = { name: 'Product A', model: 'X200' };
      const result = await checker.checkDuplicate(newProduct, existingProducts);

      expect(result.isDuplicate).toBe(true);
      expect(result.matchedFields).toContain('name');
    });

    it('should not detect duplicate in empty list', async () => {
      checker.setConfig({ fields: ['name', 'model'], matchRule: 'and' });

      const newProduct = { name: 'Product A', model: 'X100' };
      const result = await checker.checkDuplicate(newProduct, []);

      expect(result.isDuplicate).toBe(false);
    });

    it('should handle products with missing fields', async () => {
      checker.setConfig({ fields: ['name', 'model'], matchRule: 'and' });

      const existingProducts = [
        { name: 'Product A' }, // missing model
      ];

      const newProduct = { name: 'Product A', model: 'X100' };
      const result = await checker.checkDuplicate(newProduct, existingProducts);

      // Should not match because model is undefined in existing product
      expect(result.isDuplicate).toBe(false);
    });

    it('should return duplicate product info when found', async () => {
      checker.setConfig({ fields: ['name'], matchRule: 'and' });

      const existingProducts = [
        { id: 1, name: 'Product A', price: 100 },
      ];

      const newProduct = { name: 'Product A' };
      const result = await checker.checkDuplicate(newProduct, existingProducts);

      expect(result.isDuplicate).toBe(true);
      expect(result.duplicateProduct).toBeDefined();
      expect(result.duplicateProduct.id).toBe(1);
    });
  });

  describe('setDB', () => {
    it('should set database instance', () => {
      const mockDb = { from: vi.fn() };
      checker.setDB(mockDb);
      // No error means success
      expect(true).toBe(true);
    });
  });
});
