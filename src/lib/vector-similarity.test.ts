import { describe, it, expect } from 'vitest';
import { VectorSimilarityCalculator } from '@/lib/vector-similarity';

describe('VectorSimilarityCalculator', () => {
  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = VectorSimilarityCalculator.getInstance();
      const instance2 = VectorSimilarityCalculator.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should accept custom config', () => {
      const customCalculator = VectorSimilarityCalculator.getInstance({
        maxFeatures: 500,
        useIdf: false,
      });
      expect(customCalculator).toBeDefined();
    });
  });

  describe('cosineSimilarity', () => {
    const calculator = VectorSimilarityCalculator.getInstance();

    it('should calculate cosine similarity for identical vectors', () => {
      const vec = { dimensions: [1, 0, 1], norm: Math.sqrt(2) };
      const similarity = calculator.cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should calculate cosine similarity for orthogonal vectors', () => {
      const vec1 = { dimensions: [1, 0, 0], norm: 1 };
      const vec2 = { dimensions: [0, 1, 0], norm: 1 };
      const similarity = calculator.cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return 0 for vectors with mismatched dimensions', () => {
      const vec1 = { dimensions: [1, 0], norm: 1 };
      const vec2 = { dimensions: [1, 0, 0], norm: 1 };
      const similarity = calculator.cosineSimilarity(vec1, vec2);
      expect(similarity).toBe(0);
    });

    it('should return 0 for zero-norm vectors', () => {
      const vec1 = { dimensions: [0, 0, 0], norm: 0 };
      const vec2 = { dimensions: [1, 0, 0], norm: 1 };
      const similarity = calculator.cosineSimilarity(vec1, vec2);
      expect(similarity).toBe(0);
    });

    it('should handle similar vectors', () => {
      const vec1 = { dimensions: [1, 1, 0], norm: Math.sqrt(2) };
      const vec2 = { dimensions: [1, 1, 1], norm: Math.sqrt(3) };
      const similarity = calculator.cosineSimilarity(vec1, vec2);
      expect(similarity).toBeGreaterThan(0.5);
    });
  });

  describe('euclideanDistance', () => {
    const calculator = VectorSimilarityCalculator.getInstance();

    it('should calculate euclidean distance for identical vectors', () => {
      const vec = { dimensions: [1, 2, 3], norm: Math.sqrt(14) };
      const distance = calculator.euclideanDistance(vec, vec);
      expect(distance).toBe(0);
    });

    it('should calculate euclidean distance for different vectors', () => {
      const vec1 = { dimensions: [0, 0, 0], norm: 0 };
      const vec2 = { dimensions: [3, 4, 0], norm: 5 };
      const distance = calculator.euclideanDistance(vec1, vec2);
      expect(distance).toBe(5);
    });

    it('should return Infinity for vectors with mismatched dimensions', () => {
      const vec1 = { dimensions: [1, 0], norm: 1 };
      const vec2 = { dimensions: [1, 0, 0], norm: 1 };
      const distance = calculator.euclideanDistance(vec1, vec2);
      expect(distance).toBe(Infinity);
    });
  });

  describe('jaccardSimilarity', () => {
    const calculator = VectorSimilarityCalculator.getInstance();

    it('should calculate Jaccard similarity for identical sets', () => {
      const tokens1 = ['hello', 'world'];
      const tokens2 = ['hello', 'world'];
      const similarity = calculator.jaccardSimilarity(tokens1, tokens2);
      expect(similarity).toBe(1);
    });

    it('should calculate Jaccard similarity for disjoint sets', () => {
      const tokens1 = ['hello'];
      const tokens2 = ['world'];
      const similarity = calculator.jaccardSimilarity(tokens1, tokens2);
      expect(similarity).toBe(0);
    });

    it('should calculate Jaccard similarity for overlapping sets', () => {
      const tokens1 = ['hello', 'world'];
      const tokens2 = ['hello', 'test'];
      const similarity = calculator.jaccardSimilarity(tokens1, tokens2);
      expect(similarity).toBeCloseTo(1/3, 5);
    });

    it('should handle empty token arrays', () => {
      const similarity = calculator.jaccardSimilarity([], []);
      // 0/0 = NaN, this is expected behavior
      expect(similarity).toBeNaN();
    });
  });
});
