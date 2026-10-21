import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputProcessor } from '@/lib/input-processor';

vi.mock('@/utils/ocr-helper', () => ({ OcrHelper: class {} }));

describe('InputProcessor', () => {
  let processor: InputProcessor;

  beforeEach(() => {
    processor = new InputProcessor();
  });

  describe('process', () => {
    it('should process text input correctly', async () => {
      const result = await processor.process({
        type: 'text',
        content: 'Hello, this is a test message.',
      });

      expect(result.type).toBe('text');
      expect(result.textContent).toBe('Hello, this is a test message.');
    });

    it('should handle empty text input', async () => {
      const result = await processor.process({
        type: 'text',
        content: '',
      });

      expect(result.type).toBe('text');
      expect(result.textContent).toBe('');
    });

    it('should process text input with special characters', async () => {
      const specialText = '特殊字符: 中文、日本語、한국어、emoji 🎉';
      const result = await processor.process({
        type: 'text',
        content: specialText,
      });

      expect(result.type).toBe('text');
      expect(result.textContent).toBe(specialText);
    });

    it('should handle multiline text input', async () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const result = await processor.process({
        type: 'text',
        content: multilineText,
      });

      expect(result.type).toBe('text');
      expect(result.textContent).toBe(multilineText);
    });

    it('should handle very long text input', async () => {
      const longText = 'a'.repeat(10000);
      const result = await processor.process({
        type: 'text',
        content: longText,
      });

      expect(result.type).toBe('text');
      expect(result.textContent).toBe(longText);
    });

    it('should return rawContent for text input', async () => {
      const text = 'Test content';
      const result = await processor.process({
        type: 'text',
        content: text,
      });

      expect(result.rawContent).toBe(text);
    });

    it('should return empty metadata for text input', async () => {
      const result = await processor.process({
        type: 'text',
        content: 'test',
      });

      expect(result.metadata).toEqual({});
    });
  });

  describe('error handling', () => {
    it('should throw error for unsupported input format', async () => {
      await expect(
        processor.process({
          type: 'text' as any,
          content: 123 as any,
        })
      ).rejects.toThrow();
    });
  });
});
