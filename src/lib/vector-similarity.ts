/**
 * 向量相似度计算器
 * 
 * 功能：
 * 1. 实现文本向量化（TF-IDF）
 * 2. 计算余弦相似度
 * 3. 支持中英文混合文本
 * 4. 提供向量缓存机制
 */

/**
 * 向量表示
 */
export interface Vector {
  dimensions: number[];
  norm: number;
}

/**
 * 向量化配置
 */
export interface VectorizationConfig {
  maxFeatures?: number;      // 最大特征数
  minTf?: number;            // 最小词频
  useIdf?: boolean;          // 是否使用 IDF
  normalize?: boolean;       // 是否归一化
}

/**
 * 相似度计算结果
 */
export interface SimilarityResult {
  score: number;             // 相似度得分 (0-1)
  cosineSimilarity: number;  // 余弦相似度
  euclideanDistance?: number;// 欧氏距离
  jaccardSimilarity?: number;// Jaccard 相似度
}

/**
 * 向量相似度计算器类
 */
export class VectorSimilarityCalculator {
  private static instance: VectorSimilarityCalculator;
  private vocabulary: Map<string, number> = new Map();  // 词汇表
  private idfCache: Map<string, number> = new Map();    // IDF 缓存
  private config: VectorizationConfig;
  private isInitialized = false;

  private constructor(config?: VectorizationConfig) {
    this.config = {
      maxFeatures: 10000,
      minTf: 1,
      useIdf: true,
      normalize: true,
      ...config
    };
    console.log('[VectorSimilarityCalculator] 向量相似度计算器初始化完成');
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: VectorizationConfig): VectorSimilarityCalculator {
    if (!VectorSimilarityCalculator.instance) {
      VectorSimilarityCalculator.instance = new VectorSimilarityCalculator(config);
    }
    return VectorSimilarityCalculator.instance;
  }

  /**
   * 初始化词汇表
   */
  public initializeVocabulary(texts: string[]): void {
    console.log('[VectorSimilarityCalculator] 开始初始化词汇表...');

    const termFrequency = new Map<string, number>();
    const docFrequency = new Map<string, number>();

    // 统计词频和文档频率
    texts.forEach(text => {
      const tokens = this.tokenize(text);
      const uniqueTokens = new Set(tokens);

      tokens.forEach(token => {
        termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
      });

      uniqueTokens.forEach(token => {
        docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
      });
    });

    // 构建 IDF 缓存
    const totalDocs = texts.length;
    docFrequency.forEach((df, term) => {
      if (df >= this.config.minTf!) {
        const idf = Math.log(totalDocs / (df + 1));
        this.idfCache.set(term, idf);
      }
    });

    // 构建词汇表（按词频排序）
    const sortedTerms = Array.from(termFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.config.maxFeatures);

    sortedTerms.forEach(([term], index) => {
      this.vocabulary.set(term, index);
    });

    this.isInitialized = true;
    console.log(`[VectorSimilarityCalculator] 词汇表初始化完成，共 ${this.vocabulary.size} 个词汇`);
  }

  /**
   * 分词（中文 + 英文）
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    
    // 中文分词（按字符拆分）
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    tokens.push(...chineseChars);
    
    // 英文/数字分词（按单词拆分）
    const englishWords = text.match(/[a-zA-Z0-9]+/g) || [];
    tokens.push(...englishWords.map(word => word.toLowerCase()));

    // 添加二元组（bigram）
    for (let i = 0; i < tokens.length - 1; i++) {
      tokens.push(`${tokens[i]}_${tokens[i + 1]}`);
    }

    return tokens;
  }

  /**
   * 计算 TF（词频）
   */
  private calculateTf(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    const total = tokens.length;

    tokens.forEach(token => {
      tf.set(token, (tf.get(token) || 0) + 1);
    });

    // 归一化 TF
    tf.forEach((count, token) => {
      tf.set(token, count / total);
    });

    return tf;
  }

  /**
   * 将文本转换为向量
   */
  public textToVector(text: string): Vector {
    const dimensions = new Array(this.vocabulary.size).fill(0);
    const tokens = this.tokenize(text);
    const tf = this.calculateTf(tokens);

    // 构建 TF-IDF 向量
    let norm = 0;
    tf.forEach((value, term) => {
      const index = this.vocabulary.get(term);
      if (index !== undefined) {
        const idf = this.config.useIdf ? (this.idfCache.get(term) || 1) : 1;
        const tfidf = value * idf;
        dimensions[index] = tfidf;
        norm += tfidf * tfidf;
      }
    });

    // 计算向量范数
    norm = Math.sqrt(norm);

    // 归一化
    if (this.config.normalize && norm > 0) {
      for (let i = 0; i < dimensions.length; i++) {
        dimensions[i] /= norm;
      }
      norm = 1;
    }

    return { dimensions, norm };
  }

  /**
   * 计算余弦相似度
   */
  public cosineSimilarity(vec1: Vector, vec2: Vector): number {
    if (vec1.dimensions.length !== vec2.dimensions.length) {
      console.warn('[VectorSimilarityCalculator] 向量维度不匹配');
      return 0;
    }

    if (vec1.norm === 0 || vec2.norm === 0) {
      return 0;
    }

    let dotProduct = 0;
    for (let i = 0; i < vec1.dimensions.length; i++) {
      dotProduct += vec1.dimensions[i] * vec2.dimensions[i];
    }

    return dotProduct / (vec1.norm * vec2.norm);
  }

  /**
   * 计算欧氏距离
   */
  public euclideanDistance(vec1: Vector, vec2: Vector): number {
    if (vec1.dimensions.length !== vec2.dimensions.length) {
      console.warn('[VectorSimilarityCalculator] 向量维度不匹配');
      return Infinity;
    }

    let sum = 0;
    for (let i = 0; i < vec1.dimensions.length; i++) {
      const diff = vec1.dimensions[i] - vec2.dimensions[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  /**
   * 计算 Jaccard 相似度
   */
  public jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 计算综合相似度
   */
  public calculateSimilarity(
    text1: string,
    text2: string,
    options?: {
      useCosine?: boolean;
      useJaccard?: boolean;
      useEuclidean?: boolean;
      weights?: {
        cosine: number;
        jaccard: number;
        euclidean: number;
      };
    }
  ): SimilarityResult {
    const opts = {
      useCosine: true,
      useJaccard: true,
      useEuclidean: false,
      weights: {
        cosine: 0.7,
        jaccard: 0.3,
        euclidean: 0.0
      },
      ...options
    };

    const result: SimilarityResult = {
      score: 0,
      cosineSimilarity: 0
    };

    if (!this.isInitialized) {
      console.warn('[VectorSimilarityCalculator] 词汇表未初始化，使用简化相似度');
      // 降级到 Jaccard 相似度
      const tokens1 = this.tokenize(text1);
      const tokens2 = this.tokenize(text2);
      result.jaccardSimilarity = this.jaccardSimilarity(tokens1, tokens2);
      result.score = result.jaccardSimilarity || 0;
      return result;
    }

    // 余弦相似度
    if (opts.useCosine) {
      const vec1 = this.textToVector(text1);
      const vec2 = this.textToVector(text2);
      result.cosineSimilarity = this.cosineSimilarity(vec1, vec2);
    }

    // Jaccard 相似度
    if (opts.useJaccard) {
      const tokens1 = this.tokenize(text1);
      const tokens2 = this.tokenize(text2);
      result.jaccardSimilarity = this.jaccardSimilarity(tokens1, tokens2);
    }

    // 欧氏距离（转换为相似度）
    if (opts.useEuclidean) {
      const vec1 = this.textToVector(text1);
      const vec2 = this.textToVector(text2);
      const distance = this.euclideanDistance(vec1, vec2);
      result.euclideanDistance = distance;
    }

    // 计算综合得分
    let totalWeight = 0;
    let weightedScore = 0;

    if (opts.useCosine) {
      weightedScore += result.cosineSimilarity * opts.weights.cosine;
      totalWeight += opts.weights.cosine;
    }

    if (opts.useJaccard && result.jaccardSimilarity !== undefined) {
      weightedScore += result.jaccardSimilarity * opts.weights.jaccard;
      totalWeight += opts.weights.jaccard;
    }

    if (opts.useEuclidean && result.euclideanDistance !== undefined) {
      // 欧氏距离越小，相似度越高
      const euclideanSimilarity = Math.max(0, 1 - result.euclideanDistance / 10);
      weightedScore += euclideanSimilarity * opts.weights.euclidean;
      totalWeight += opts.weights.euclidean;
    }

    result.score = totalWeight > 0 ? weightedScore / totalWeight : 0;

    return result;
  }

  /**
   * 批量计算相似度
   */
  public batchCalculateSimilarity(
    query: string,
    candidates: string[],
    options?: {
      threshold?: number;
      topK?: number;
    }
  ): Array<{ text: string; score: number }> {
    const results: Array<{ text: string; score: number }> = [];
    const threshold = options?.threshold || 0;
    const topK = options?.topK || candidates.length;

    candidates.forEach(candidate => {
      const similarity = this.calculateSimilarity(query, candidate);
      if (similarity.score >= threshold) {
        results.push({
          text: candidate,
          score: similarity.score
        });
      }
    });

    // 按相似度排序
    results.sort((a, b) => b.score - a.score);

    // 返回 topK
    return results.slice(0, topK);
  }

  /**
   * 检查是否已初始化
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * 获取词汇表大小
   */
  public getVocabularySize(): number {
    return this.vocabulary.size;
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.vocabulary.clear();
    this.idfCache.clear();
    this.isInitialized = false;
    console.log('[VectorSimilarityCalculator] 缓存已清除');
  }
}

// 导出单例
export const vectorSimilarityCalculator = VectorSimilarityCalculator.getInstance();
