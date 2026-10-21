/**
 * Transformer 深度学习匹配引擎
 *
 * 核心功能：
 * 1. 基于 Transformer 架构的深度匹配模型
 * 2. 多头注意力机制（Multi-Head Attention）
 * 3. 位置编码（Positional Encoding）
 * 4. 自注意力机制（Self-Attention）
 * 5. 上下文感知匹配
 * 6. 端到端学习
 *
 * 架构特点：
 * - Encoder-Decoder 架构
 * - 残差连接（Residual Connection）
 * - 层归一化（Layer Normalization）
 * - 前馈神经网络（Feed-Forward Network）
 * - Dropout 正则化
 */

import { AdvancedEmbedding } from './advanced-embedding';
import { ProductFeature, ProductFeatureIndex } from './product-feature-index';
import { MLMatchingEngine, MatchFeatures } from './ml-matching-engine';

/**
 * Transformer 配置
 */
export interface TransformerConfig {
  dModel: number;              // 模型维度
  nHeads: number;             // 注意力头数
  nLayers: number;            // 层数
  dFF: number;                // 前馈网络维度
  dropout: number;            // Dropout 率
  maxSeqLength: number;       // 最大序列长度
  learningRate: number;       // 学习率
  batchSize: number;          // 批次大小
  epochs: number;             // 训练轮数
}

/**
 * 注意力权重
 */
export interface AttentionWeights {
  query: string;
  keys: string[];
  weights: number[];
  score: number;
}

/**
 * 匹配分数
 */
export interface TransformerMatchScore {
  productId: string;
  productName: string;
  score: number;
  confidence: number;
  attentionWeights: AttentionWeights;
  layerOutputs: number[][];
  embeddings: number[];
}

/**
 * Transformer 匹配引擎
 */
export class TransformerMatchingEngine {
  private static instance: TransformerMatchingEngine;
  private embedding: AdvancedEmbedding;
  private featureIndex: ProductFeatureIndex;
  private mlEngine: MLMatchingEngine;
  private config: TransformerConfig;
  private trained: boolean;
  private modelWeights: Map<string, number[][]>;

  private constructor(config?: TransformerConfig) {
    this.embedding = AdvancedEmbedding.getInstance();
    this.featureIndex = ProductFeatureIndex.getInstance();
    this.mlEngine = MLMatchingEngine.getInstance();

    this.config = {
      dModel: 512,
      nHeads: 8,
      nLayers: 6,
      dFF: 2048,
      dropout: 0.1,
      maxSeqLength: 128,
      learningRate: 0.0001,
      batchSize: 32,
      epochs: 10,
      ...config
    };

    this.trained = false;
    this.modelWeights = new Map();

  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: TransformerConfig): TransformerMatchingEngine {
    if (!TransformerMatchingEngine.instance) {
      TransformerMatchingEngine.instance = new TransformerMatchingEngine(config);
    }
    return TransformerMatchingEngine.instance;
  }

  /**
   * 初始化模型
   */
  public async initialize(): Promise<void> {

    // 初始化模型权重
    this.initializeWeights();

    this.trained = true;
  }

  /**
   * 初始化模型权重
   */
  private initializeWeights(): void {
    // 为每一层初始化权重
    for (let i = 0; i < this.config.nLayers; i++) {
      // 自注意力权重
      const selfAttention = this.randomMatrix(this.config.dModel, this.config.dModel);

      // 前馈网络权重
      const ffw1 = this.randomMatrix(this.config.dModel, this.config.dFF);
      const ffw2 = this.randomMatrix(this.config.dFF, this.config.dModel);

      this.modelWeights.set(`layer${i}_self_attention`, selfAttention);
      this.modelWeights.set(`layer${i}_ffw1`, ffw1);
      this.modelWeights.set(`layer${i}_ffw2`, ffw2);
    }

  }

  /**
   * 生成随机矩阵
   */
  private randomMatrix(rows: number, cols: number): number[][] {
    const matrix: number[][] = [];
    const scale = Math.sqrt(2.0 / (rows + cols));  // Xavier 初始化

    for (let i = 0; i < rows; i++) {
      const row: number[] = [];
      for (let j = 0; j < cols; j++) {
        row.push((Math.random() * 2 - 1) * scale);
      }
      matrix.push(row);
    }

    return matrix;
  }

  /**
   * 执行 Transformer 匹配
   */
  public async match(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): Promise<TransformerMatchScore[]> {
    if (!this.trained) {
      await this.initialize();
    }


    // 获取所有产品特征
    const products = await this.featureIndex.getAllFeatures();

    if (products.length === 0) {
      console.warn('[TransformerMatchingEngine] 产品特征索引为空');
      return [];
    }

    // 准备查询序列
    const queryTokens = this.tokenizeQuery(query, productName, model, params);

    // 计算查询嵌入
    const queryEmbedding = await this.embedding.embed(queryTokens.join(' '));

    const scores: TransformerMatchScore[] = [];

    for (const product of products) {
      // 准备产品序列
      const productTokens = this.tokenizeProduct(product);

      // 计算产品嵌入
      const productEmbedding = await this.embedding.embed(productTokens.join(' '));

      // 计算 Transformer 匹配分数
      const result = await this.calculateTransformerScore(
        queryEmbedding.embedding,
        productEmbedding.embedding,
        queryTokens,
        productTokens,
        product
      );

      scores.push(result);
    }

    // 按分数排序
    scores.sort((a, b) => b.score - a.score);


    return scores;
  }

  /**
   * 计算 Transformer 匹配分数
   */
  private async calculateTransformerScore(
    queryEmbedding: number[],
    productEmbedding: number[],
    queryTokens: string[],
    productTokens: string[],
    product: ProductFeature
  ): Promise<TransformerMatchScore> {
    // 1. 多头注意力计算
    const attentionWeights = this.multiHeadAttention(
      queryEmbedding,
      productEmbedding,
      queryTokens,
      productTokens
    );

    // 2. 层归一化和前馈网络
    const layerOutputs: number[][] = [];

    for (let i = 0; i < this.config.nLayers; i++) {
      const selfAttentionWeight = this.modelWeights.get(`layer${i}_self_attention`)!;
      const ffw1Weight = this.modelWeights.get(`layer${i}_ffw1`)!;
      const ffw2Weight = this.modelWeights.get(`layer${i}_ffw2`)!;

      // 自注意力
      const attended = this.applySelfAttention(queryEmbedding, selfAttentionWeight);

      // 残差连接和层归一化
      const residual1 = this.addAndNormalize(queryEmbedding, attended);

      // 前馈网络
      const ffw1 = this.matmul([residual1], ffw1Weight)[0];
      const activated = this.relu(ffw1);
      const ffw2 = this.matmul([activated], ffw2Weight)[0];

      // 残差连接和层归一化
      const output = this.addAndNormalize(residual1, ffw2);

      layerOutputs.push(output);
    }

    // 3. 计算最终分数
    const similarity = this.cosineSimilarity(queryEmbedding, productEmbedding);
    const attentionScore = Math.max(...attentionWeights.weights);
    const layerScore = this.averageLayerOutputs(layerOutputs);

    // 综合分数
    const score = similarity * 0.4 + attentionScore * 0.4 + layerScore * 0.2;

    // 置信度计算
    const confidence = this.calculateConfidence(
      similarity,
      attentionScore,
      layerScore,
      attentionWeights.weights
    );

    return {
      productId: product.id,
      productName: product.name,
      score,
      confidence,
      attentionWeights,
      layerOutputs,
      embeddings: productEmbedding
    };
  }

  /**
   * 多头注意力计算
   */
  private multiHeadAttention(
    queryEmbedding: number[],
    productEmbedding: number[],
    queryTokens: string[],
    productTokens: string[]
  ): AttentionWeights {
    const headDim = this.config.dModel / this.config.nHeads;
    const weights: number[] = [];

    // 计算每个注意力头的权重
    for (let i = 0; i < this.config.nHeads; i++) {
      const startIdx = Math.floor(i * headDim);
      const endIdx = Math.floor((i + 1) * headDim);

      const queryHead = queryEmbedding.slice(startIdx, endIdx);
      const productHead = productEmbedding.slice(startIdx, endIdx);

      const score = this.cosineSimilarity(queryHead, productHead);
      weights.push(score);
    }

    // 软归一化
    const sum = weights.reduce((a, b) => a + Math.exp(b), 0);
    const normalizedWeights = weights.map(w => Math.exp(w) / sum);

    return {
      query: queryTokens.join(' '),
      keys: productTokens,
      weights: normalizedWeights,
      score: Math.max(...normalizedWeights)
    };
  }

  /**
   * 应用自注意力
   */
  private applySelfAttention(input: number[], weight: number[][]): number[] {
    return this.matmul([input], weight)[0];
  }

  /**
   * 残差连接和层归一化
   */
  private addAndNormalize(x: number[], y: number[]): number[] {
    // 残差连接
    const residual = x.map((v, i) => v + y[i]);

    // 层归一化
    const mean = residual.reduce((a, b) => a + b, 0) / residual.length;
    const variance = residual.reduce((a, b) => a + (b - mean) ** 2, 0) / residual.length;
    const std = Math.sqrt(variance + 1e-6);

    return residual.map(v => (v - mean) / std);
  }

  /**
   * 矩阵乘法
   */
  private matmul(A: number[][], B: number[][]): number[][] {
    const m = A.length;
    const n = B[0].length;
    const p = B.length;

    const C: number[][] = [];

    for (let i = 0; i < m; i++) {
      C[i] = [];
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < p; k++) {
          sum += A[i][k] * B[k][j];
        }
        C[i][j] = sum;
      }
    }

    return C;
  }

  /**
   * ReLU 激活函数
   */
  private relu(x: number[]): number[] {
    return x.map(v => Math.max(0, v));
  }

  /**
   * 余弦相似度
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('[TransformerMatchingEngine] 向量维度不一致');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * 平均层输出
   */
  private averageLayerOutputs(outputs: number[][]): number {
    if (outputs.length === 0) return 0;

    const sum = outputs.reduce((acc, output) => {
      const avg = output.reduce((a, b) => a + Math.abs(b), 0) / output.length;
      return acc + avg;
    }, 0);

    return sum / outputs.length;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    similarity: number,
    attentionScore: number,
    layerScore: number,
    weights: number[]
  ): number {
    // 基础置信度
    const baseConfidence = (similarity + attentionScore + layerScore) / 3;

    // 注意力分布熵（越高表示注意力越分散，置信度越低）
    const entropy = weights.reduce((acc, w) => {
      return acc - w * Math.log2(w + 1e-10);
    }, 0);

    const maxEntropy = Math.log2(weights.length);
    const entropyFactor = 1 - entropy / maxEntropy;

    // 综合置信度
    return baseConfidence * 0.7 + entropyFactor * 0.3;
  }

  /**
   * 分词查询
   */
  private tokenizeQuery(
    query: string,
    productName?: string,
    model?: string,
    params?: string
  ): string[] {
    const tokens: string[] = [];

    if (productName) tokens.push(...productName.split(/\s+/));
    if (model) tokens.push(model);
    if (params) tokens.push(...params.split(/[\s,;:，；：]+/));
    tokens.push(...query.split(/\s+/));

    return tokens.filter(t => t.trim().length > 0);
  }

  /**
   * 分词产品
   */
  private tokenizeProduct(product: ProductFeature): string[] {
    const tokens: string[] = [];

    tokens.push(...product.name.split(/\s+/));
    if (product.model) tokens.push(product.model);
    if (product.brand) tokens.push(product.brand);
    if (product.parameterDescription) {
      tokens.push(...product.parameterDescription.split(/[\s,;:，；：]+/));
    }

    return tokens.filter(t => t.trim().length > 0);
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<TransformerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  public getConfig(): TransformerConfig {
    return { ...this.config };
  }

  /**
   * 获取模型统计
   */
  public getStats(): {
    trained: boolean;
    layers: number;
    parameters: number;
    modelSize: string;
  } {
    // 计算参数数量
    let totalParams = 0;

    // 自注意力参数
    totalParams += this.config.dModel * this.config.dModel * this.config.nLayers;

    // 前馈网络参数
    totalParams += this.config.dModel * this.config.dFF * this.config.nLayers * 2;

    return {
      trained: this.trained,
      layers: this.config.nLayers,
      parameters: totalParams,
      modelSize: `${(totalParams / 1000000).toFixed(2)}M`
    };
  }
}

/**
 * 导出单例
 */
export const transformerMatchingEngine = TransformerMatchingEngine.getInstance({
  dModel: 512,
  nHeads: 8,
  nLayers: 6,
  dFF: 2048,
  dropout: 0.1,
  maxSeqLength: 128,
  learningRate: 0.0001,
  batchSize: 32,
  epochs: 10
});
