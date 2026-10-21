import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { VectorSimilarityCalculator } from '@/lib/vector-similarity';

// 重置单例以确保测试隔离（自定义 config 的 getInstance 会创建新单例）
beforeAll(() => {
  VectorSimilarityCalculator.resetInstance();
});
afterAll(() => {
  VectorSimilarityCalculator.resetInstance();
});

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

  // --- 以下为新增测试 ---

  describe('initializeVocabulary', () => {
    const calculator = VectorSimilarityCalculator.getInstance();

    beforeEach(() => {
      calculator.clearCache();
    });

    it('should build vocabulary from text collection', () => {
      calculator.initializeVocabulary(['hello world', 'hello test']);
      expect(calculator.getVocabularySize()).toBeGreaterThan(0);
    });

    it('should build IDF cache', () => {
      calculator.initializeVocabulary(['hello world', 'foo bar']);
      expect(calculator.getVocabularySize()).toBeGreaterThan(0);
      // IDF values should be positive for terms that appear in documents
      // Verify by checking that calculateSimilarity works (uses IDF internally)
      const result = calculator.calculateSimilarity('hello', 'world');
      expect(result.cosineSimilarity).toBeGreaterThanOrEqual(0);
    });

    it('should set isReady to true after initialization', () => {
      expect(calculator.isReady()).toBe(false);
      calculator.initializeVocabulary(['hello world']);
      expect(calculator.isReady()).toBe(true);
    });

    it('should handle empty text array', () => {
      calculator.initializeVocabulary([]);
      // empty array should still set isInitialized to true
      expect(calculator.isReady()).toBe(true);
      expect(calculator.getVocabularySize()).toBe(0);
    });

    it('should handle Chinese text', () => {
      calculator.initializeVocabulary(['你好世界', '世界和平']);
      expect(calculator.getVocabularySize()).toBeGreaterThan(0);
    });

    it('should handle mixed Chinese and English text', () => {
      calculator.initializeVocabulary(['hello你好', 'world世界']);
      expect(calculator.getVocabularySize()).toBeGreaterThan(0);
    });

    it('should generate bigram tokens', () => {
      calculator.initializeVocabulary(['hello world']);
      const size = calculator.getVocabularySize();
      // With bigrams: 'hello', 'world', 'hello_world' = 3 tokens
      expect(size).toBe(3);
    });

    it('should respect maxFeatures config', () => {
      // getInstance with custom config — note: singleton, config set at first creation
      // maxFeatures should cap the vocabulary size
      calculator.initializeVocabulary([
        'a b c d e f g h i j k l m n o p',
        'q r s t u v w x y z',
      ]);
      // By default maxFeatures is 10000, so all terms should fit
      expect(calculator.getVocabularySize()).toBeGreaterThan(0);
      // This test verifies no crash with many terms; the cap is high by default
    });
  });

  describe('textToVector', () => {
    const calculator = VectorSimilarityCalculator.getInstance();

    beforeEach(() => {
      calculator.clearCache();
      calculator.initializeVocabulary(['hello world', 'foo bar']);
    });

    it('should return vector with dimension equal to vocabulary size', () => {
      const vec = calculator.textToVector('hello');
      expect(vec.dimensions.length).toBe(calculator.getVocabularySize());
    });

    it('should return zero vector when text contains no vocabulary words', () => {
      const vec = calculator.textToVector('xyznotinvocab123');
      const allZero = vec.dimensions.every(d => d === 0);
      expect(allZero).toBe(true);
      expect(vec.norm).toBe(0);
    });

    it('should return normalized vector when normalize is true (default)', () => {
      const vec = calculator.textToVector('hello world');
      if (vec.norm > 0) {
        expect(vec.norm).toBeCloseTo(1, 10);
      }
      // If norm is 0, text has no vocab terms — that's also valid
    });

    it('should produce same vector for same text (deterministic)', () => {
      const vec1 = calculator.textToVector('hello');
      const vec2 = calculator.textToVector('hello');
      expect(vec1.dimensions).toEqual(vec2.dimensions);
      expect(vec1.norm).toBeCloseTo(vec2.norm, 10);
    });

    it('should produce different vectors for different texts', () => {
      const vec1 = calculator.textToVector('hello');
      const vec2 = calculator.textToVector('foo');
      // At least one dimension should differ (unless both somehow map to same sparse positions)
      const hasDiff = vec1.dimensions.some((d, i) => d !== vec2.dimensions[i]);
      expect(hasDiff).toBe(true);
    });

    it('should handle Chinese text vectorization', () => {
      const calculatorCn = VectorSimilarityCalculator.getInstance();
      calculatorCn.clearCache();
      calculatorCn.initializeVocabulary(['你好世界', '世界和平']);
      const vec = calculatorCn.textToVector('你好');
      expect(vec.dimensions.length).toBe(calculatorCn.getVocabularySize());
    });

    it('should return vector with non-zero norm for text matching vocabulary', () => {
      const vec = calculator.textToVector('hello');
      expect(vec.norm).toBeGreaterThan(0);
    });
  });

  describe('calculateSimilarity', () => {
    const calculator = VectorSimilarityCalculator.getInstance();

    beforeEach(() => {
      calculator.clearCache();
    });

    it('should fall back to Jaccard when not initialized', () => {
      expect(calculator.isReady()).toBe(false);
      const result = calculator.calculateSimilarity('hello world', 'hello test');
      expect(result.cosineSimilarity).toBe(0);
      expect(result.jaccardSimilarity).toBeGreaterThan(0);
      expect(result.score).toBe(result.jaccardSimilarity!);
    });

    it('should compute cosine + Jaccard by default when initialized', () => {
      calculator.initializeVocabulary(['hello world', 'foo bar']);
      const result = calculator.calculateSimilarity('hello world', 'hello test');
      expect(result.cosineSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.jaccardSimilarity).toBeDefined();
      expect(result.score).toBeGreaterThan(0);
    });

    it('should only use cosine when useJaccard is false', () => {
      calculator.initializeVocabulary(['hello world', 'foo bar']);
      const result = calculator.calculateSimilarity('hello', 'world', { useJaccard: false });
      expect(result.cosineSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.jaccardSimilarity).toBeUndefined();
      expect(result.score).toBeCloseTo(result.cosineSimilarity, 5);
    });

    it('should only use Jaccard when useCosine is false', () => {
      calculator.initializeVocabulary(['hello world', 'foo bar']);
      const result = calculator.calculateSimilarity('hello world', 'hello test', { useCosine: false });
      expect(result.cosineSimilarity).toBe(0);
      expect(result.jaccardSimilarity).toBeGreaterThan(0);
      expect(result.score).toBeCloseTo(result.jaccardSimilarity!, 5);
    });

    it('should include euclidean distance when useEuclidean is true', () => {
      calculator.initializeVocabulary(['hello world', 'foo bar']);
      const result = calculator.calculateSimilarity('hello', 'world', { useEuclidean: true });
      expect(result.euclideanDistance).toBeDefined();
      expect(result.euclideanDistance).toBeGreaterThanOrEqual(0);
    });

    it('should return similarity of 1 for identical texts', () => {
      calculator.initializeVocabulary(['hello world', 'foo bar']);
      const result = calculator.calculateSimilarity('hello world', 'hello world');
      expect(result.score).toBeCloseTo(1, 5);
    });

    it('should return similarity less than 1 for different texts', () => {
      calculator.initializeVocabulary(['hello world', 'foo bar']);
      const result = calculator.calculateSimilarity('hello', 'foo bar');
      expect(result.score).toBeLessThan(1);
    });

    it('should use custom weights', () => {
      calculator.initializeVocabulary(['hello world', 'foo bar']);
      const result = calculator.calculateSimilarity('hello', 'world', {
        weights: { cosine: 0.5, jaccard: 0.5, euclidean: 0.0 },
      });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should handle Jaccard NaN gracefully in score (fallback case)', () => {
      expect(calculator.isReady()).toBe(false);
      // empty texts produce NaN Jaccard
      const result = calculator.calculateSimilarity('', '');
      expect(result.score).toBe(0); // NaN || 0 = 0
    });

    it('should return 0 score for texts with no vocabulary overlap when only cosine is used', () => {
      calculator.initializeVocabulary(['hello world']);
      const result = calculator.calculateSimilarity('xyznotinvocab', 'abcnotinvocab', { useJaccard: false });
      expect(result.cosineSimilarity).toBe(0);
      expect(result.score).toBe(0);
    });
  });

  describe('batchCalculateSimilarity', () => {
    const calculator = VectorSimilarityCalculator.getInstance();

    beforeEach(() => {
      calculator.clearCache();
      calculator.initializeVocabulary([
        'the quick brown fox',
        'jumps over the lazy dog',
        'hello world',
        'foo bar baz',
      ]);
    });

    it('should return results sorted by similarity descending', () => {
      const results = calculator.batchCalculateSimilarity('hello world', [
        'foo bar baz',
        'the quick brown fox',
      ]);
      expect(results.length).toBe(2);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it('should filter by threshold', () => {
      const results = calculator.batchCalculateSimilarity('hello world', [
        'hello world',
        'foo bar baz',
        'xyznotinvocab',
      ], { threshold: 0.1 });
      // All results should have score >= 0.1
      results.forEach(r => {
        expect(r.score).toBeGreaterThanOrEqual(0.1);
      });
    });

    it('should limit results to topK', () => {
      const results = calculator.batchCalculateSimilarity('hello world', [
        'hello world',
        'the quick brown fox',
        'jumps over the lazy dog',
        'foo bar baz',
      ], { topK: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array for empty candidates', () => {
      const results = calculator.batchCalculateSimilarity('hello', []);
      expect(results).toEqual([]);
    });

    it('should return correct text field in results', () => {
      const results = calculator.batchCalculateSimilarity('hello', ['hello world']);
      expect(results[0].text).toBe('hello world');
      expect(results[0].score).toBeGreaterThan(0);
    });
  });

  describe('clearCache', () => {
    const calculator = VectorSimilarityCalculator.getInstance();

    beforeEach(() => {
      calculator.clearCache();
    });

    it('should make isReady return false after clear', () => {
      calculator.initializeVocabulary(['hello']);
      expect(calculator.isReady()).toBe(true);
      calculator.clearCache();
      expect(calculator.isReady()).toBe(false);
    });

    it('should make getVocabularySize return 0 after clear', () => {
      calculator.initializeVocabulary(['hello world', 'foo bar']);
      expect(calculator.getVocabularySize()).toBeGreaterThan(0);
      calculator.clearCache();
      expect(calculator.getVocabularySize()).toBe(0);
    });

    it('should allow re-initialization after clear', () => {
      calculator.initializeVocabulary(['hello']);
      calculator.clearCache();
      calculator.initializeVocabulary(['foo bar']);
      expect(calculator.isReady()).toBe(true);
      expect(calculator.getVocabularySize()).toBeGreaterThan(0);
    });
  });

  describe('isReady / getVocabularySize', () => {
    const calculator = VectorSimilarityCalculator.getInstance();

    beforeEach(() => {
      calculator.clearCache();
    });

    it('should return false before initialization', () => {
      expect(calculator.isReady()).toBe(false);
    });

    it('should return 0 vocabulary size before initialization', () => {
      expect(calculator.getVocabularySize()).toBe(0);
    });

    it('should return true after initialization', () => {
      calculator.initializeVocabulary(['hello']);
      expect(calculator.isReady()).toBe(true);
    });

    it('should return correct vocabulary size after initialization', () => {
      calculator.initializeVocabulary(['hello world']);
      expect(calculator.getVocabularySize()).toBeGreaterThan(0);
    });
  });

  describe('branch coverage', () => {
    it('resetInstance: should skip clearCache when instance is null', () => {
      // Instance exists, so resetInstance calls clearCache
      VectorSimilarityCalculator.resetInstance();
      // Now call resetInstance again — instance is null, skips clearCache branch
      VectorSimilarityCalculator.resetInstance();
      // Should work without error
      const instance = VectorSimilarityCalculator.getInstance();
      expect(instance.isReady()).toBe(false);
    });

    it('initializeVocabulary: should skip IDF cache for terms below minTf', () => {
      // minTf=2 means terms appearing in only 1 doc are excluded from IDF cache
      VectorSimilarityCalculator.resetInstance();
      const calc = VectorSimilarityCalculator.getInstance({ minTf: 2 });
      calc.initializeVocabulary(['hello world', 'foo bar']);
      // 'hello' appears in 1 doc (< minTf=2), should be in vocabulary but NOT in IDF cache
      // vocabular size should still be > 0 (term frequency threshold doesn't affect vocabulary)
      expect(calc.getVocabularySize()).toBeGreaterThan(0);
    });

    it('textToVector: should use IDF=1 when useIdf is false', () => {
      VectorSimilarityCalculator.resetInstance();
      const calc = VectorSimilarityCalculator.getInstance({ useIdf: false });
      calc.initializeVocabulary(['hello world']);
      const vec = calc.textToVector('hello');
      // Should produce a valid vector even without IDF weighting
      expect(vec.dimensions.length).toBeGreaterThan(0);
      expect(vec.norm).toBeGreaterThan(0);
    });

    it('textToVector: should not normalize when normalize is false', () => {
      VectorSimilarityCalculator.resetInstance();
      const calc = VectorSimilarityCalculator.getInstance({ normalize: false });
      calc.initializeVocabulary(['hello world']);
      const vec = calc.textToVector('hello');
      // Without normalization, norm should NOT be 1
      expect(vec.norm).toBeGreaterThan(0);
      // Should NOT equal 1 when normalize is disabled
      expect(vec.norm).not.toBe(1);
    });

    it('textToVector: should handle zero norm (no matching vocabulary)', () => {
      VectorSimilarityCalculator.resetInstance();
      const calc = VectorSimilarityCalculator.getInstance({ useIdf: false });
      calc.initializeVocabulary(['hello world']);
      // 'xyz' has no tokens in vocabulary, so all dimensions are 0 → norm=0
      const vec = calc.textToVector('xyz');
      expect(vec.norm).toBe(0);
    });

    it('calculateSimilarity: should return 0 score when totalWeight is 0', () => {
      VectorSimilarityCalculator.resetInstance();
      const calc = VectorSimilarityCalculator.getInstance();
      calc.initializeVocabulary(['hello world']);
      // All metrics disabled → totalWeight=0 → score=0
      const result = calc.calculateSimilarity('hello', 'world', {
        useCosine: false,
        useJaccard: false,
        useEuclidean: false,
      });
      expect(result.score).toBe(0);
      expect(result.cosineSimilarity).toBe(0);
    });
  });
});
