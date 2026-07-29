/**
 * 跨语言匹配支持
 *
 * 核心功能：
 * 1. 多语言文本翻译
 * 2. 跨语言语义匹配
 * 3. 语言检测
 * 4. 多语言同义词映射
 * 5. 文化适应性匹配
 *
 * 支持的语言：
 * - 中文（简体/繁体）
 * - 英文
 * - 日文
 * - 韩文
 * - 法文
 * - 德文
 * - 西班牙文
 * - 俄文
 */

import { AdvancedEmbedding } from './advanced-embedding';

/**
 * 语言代码
 */
export type LanguageCode =
  | 'zh-CN'  // 中文（简体）
  | 'zh-TW'  // 中文（繁体）
  | 'en'     // 英文
  | 'ja'     // 日文
  | 'ko'     // 韩文
  | 'fr'     // 法文
  | 'de'     // 德文
  | 'es'     // 西班牙文
  | 'ru';    // 俄文

/**
 * 语言名称
 */
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  'zh-CN': '中文（简体）',
  'zh-TW': '中文（繁体）',
  'en': '英文',
  'ja': '日文',
  'ko': '韩文',
  'fr': '法文',
  'de': '德文',
  'es': '西班牙文',
  'ru': '俄文'
};

/**
 * 翻译结果
 */
export interface TranslationResult {
  originalText: string;
  originalLanguage: LanguageCode;
  translatedText: string;
  targetLanguage: LanguageCode;
  confidence: number;
  provider: string;
}

/**
 * 语言检测结果
 */
export interface LanguageDetectionResult {
  text: string;
  language: LanguageCode;
  confidence: number;
  alternatives: Array<{ language: LanguageCode; confidence: number }>;
}

/**
 * 跨语言匹配结果
 */
export interface CrossLanguageMatchResult {
  originalQuery: string;
  queryLanguage: LanguageCode;
  translatedQuery: string;
  targetLanguage: LanguageCode;
  similarity: number;
  productName: string;
  matchedLanguages: LanguageCode[];
  confidence: number;
}

/**
 * 多语言同义词映射
 */
export interface MultilingualSynonymMapping {
  canonical: string;                    // 规范名称（英文）
  languages: Record<LanguageCode, string[]>;  // 各语言同义词
  category: string;
}

/**
 * 跨语言匹配引擎
 */
export class CrossLanguageMatcher {
  private static instance: CrossLanguageMatcher;
  private embedding: AdvancedEmbedding;
  private synonymMappings: Map<string, MultilingualSynonymMapping>;
  private translationCache: Map<string, TranslationResult>;
  private detectionCache: Map<string, LanguageDetectionResult>;

  private constructor() {
    this.embedding = AdvancedEmbedding.getInstance();
    this.synonymMappings = new Map();
    this.translationCache = new Map();
    this.detectionCache = new Map();

    this.initializeSynonymMappings();

  }

  /**
   * 获取单例实例
   */
  public static getInstance(): CrossLanguageMatcher {
    if (!CrossLanguageMatcher.instance) {
      CrossLanguageMatcher.instance = new CrossLanguageMatcher();
    }
    return CrossLanguageMatcher.instance;
  }

  /**
   * 初始化多语言同义词映射
   */
  private initializeSynonymMappings(): void {
    // 空压机
    this.synonymMappings.set('air_compressor', {
      canonical: 'air compressor',
      category: 'Air Compression Equipment',
      languages: {
        'zh-CN': ['空压机', '压缩机', '空气压缩机', '空压'],
        'zh-TW': ['空壓機', '壓縮機', '空氣壓縮機'],
        'en': ['air compressor', 'compressor', 'air compression system'],
        'ja': ['エアコンプレッサー', '圧縮機'],
        'ko': ['에어 컴프레서', '압축기'],
        'fr': ['compresseur d\'air', 'compresseur'],
        'de': ['Luftkompressor', 'Kompressor'],
        'es': ['compresor de aire', 'compresor'],
        'ru': ['воздушный компрессор', 'компрессор']
      }
    });

    // 螺杆空压机
    this.synonymMappings.set('screw_compressor', {
      canonical: 'screw compressor',
      category: 'Screw Type Air Compressor',
      languages: {
        'zh-CN': ['螺杆空压机', '螺杆机', '螺杆压缩机'],
        'zh-TW': ['螺桿空壓機', '螺桿機'],
        'en': ['screw compressor', 'screw type compressor'],
        'ja': ['スクリューコンプレッサー'],
        'ko': ['스크류 컴프레서'],
        'fr': ['compresseur à vis'],
        'de': ['Schraubenkompressor'],
        'es': ['compresor de tornillo'],
        'ru': ['винтовой компрессор']
      }
    });

    // 活塞空压机
    this.synonymMappings.set('piston_compressor', {
      canonical: 'piston compressor',
      category: 'Piston Type Air Compressor',
      languages: {
        'zh-CN': ['活塞空压机', '活塞压缩机', '往复式空压机'],
        'zh-TW': ['活塞空壓機', '活塞壓縮機'],
        'en': ['piston compressor', 'reciprocating compressor'],
        'ja': ['ピストンコンプレッサー', '往復動式圧縮機'],
        'ko': ['피스톤 컴프레서', '왕복동 압축기'],
        'fr': ['compresseur à piston'],
        'de': ['Kolbenkompressor'],
        'es': ['compresor de pistón'],
        'ru': ['поршневой компрессор']
      }
    });

    // 变频空压机
    this.synonymMappings.set('variable_frequency_compressor', {
      canonical: 'variable frequency compressor',
      category: 'Variable Frequency Air Compressor',
      languages: {
        'zh-CN': ['变频空压机', '变频压缩机', 'VFD空压机'],
        'zh-TW': ['變頻空壓機', '變頻壓縮機'],
        'en': ['variable frequency compressor', 'VFD compressor', 'inverter compressor'],
        'ja': ['インバーターコンプレッサー', '可変周波数コンプレッサー'],
        'ko': ['인버터 컴프레서', '가변 주파수 컴프레서'],
        'fr': ['compresseur à vitesse variable'],
        'de': ['Frequenzumrichterkompressor'],
        'es': ['compresor de frecuencia variable'],
        'ru': ['компрессор с частотным преобразователем']
      }
    });

    // 微型空压机
    this.synonymMappings.set('mini_compressor', {
      canonical: 'mini compressor',
      category: 'Miniature Air Compressor',
      languages: {
        'zh-CN': ['微型空压机', '小型空压机', '迷你空压机'],
        'zh-TW': ['微型空壓機', '小型空壓機'],
        'en': ['mini compressor', 'miniature compressor', 'small compressor'],
        'ja': ['ミニコンプレッサー', '小型コンプレッサー'],
        'ko': ['미니 컴프레서', '소형 컴프레서'],
        'fr': ['mini compresseur', 'compresseur miniature'],
        'de': ['Minikompressor', 'kleiner Kompressor'],
        'es': ['compresor mini', 'compresor pequeño'],
        'ru': ['мини-компрессор']
      }
    });
  }

  /**
   * 检测文本语言
   */
  public detectLanguage(text: string): LanguageDetectionResult {
    // 检查缓存
    if (this.detectionCache.has(text)) {
      return this.detectionCache.get(text)!;
    }

    const trimmedText = text.trim();
    const alternatives: Array<{ language: LanguageCode; confidence: number }> = [];

    // 简单语言检测（基于字符集）
    let detectedLanguage: LanguageCode = 'en';
    let confidence = 0.5;

    // 中文字符检测
    const chineseChars = trimmedText.match(/[\u4e00-\u9fa5]/g);
    if (chineseChars && chineseChars.length > 0) {
      detectedLanguage = 'zh-CN';
      confidence = 0.9;

      // 简体 vs 繁体检测（简化版）
      const simplified = trimmedText.match(/[个么了不]/g);
      const traditional = trimmedText.match(/[個麼了不]/g);

      if (traditional && traditional.length > (simplified?.length || 0)) {
        detectedLanguage = 'zh-TW';
      }

      alternatives.push({ language: 'zh-CN', confidence: 0.85 });
      alternatives.push({ language: 'zh-TW', confidence: 0.75 });
    }

    // 日文字符检测
    const japaneseChars = trimmedText.match(/[\u3040-\u309f\u30a0-\u30ff]/g);
    if (japaneseChars && japaneseChars.length > 0) {
      detectedLanguage = 'ja';
      confidence = 0.85;
      alternatives.push({ language: 'ja', confidence: 0.85 });
    }

    // 韩文字符检测
    const koreanChars = trimmedText.match(/[\uac00-\ud7af]/g);
    if (koreanChars && koreanChars.length > 0) {
      detectedLanguage = 'ko';
      confidence = 0.85;
      alternatives.push({ language: 'ko', confidence: 0.85 });
    }

    // 俄文字符检测
    const russianChars = trimmedText.match(/[\u0400-\u04FF]/g);
    if (russianChars && russianChars.length > 0) {
      detectedLanguage = 'ru';
      confidence = 0.85;
      alternatives.push({ language: 'ru', confidence: 0.85 });
    }

    // 添加英文作为备选
    alternatives.push({ language: 'en', confidence: 0.5 });

    // 按置信度排序
    alternatives.sort((a, b) => b.confidence - a.confidence);

    const result: LanguageDetectionResult = {
      text: trimmedText,
      language: detectedLanguage,
      confidence,
      alternatives
    };

    // 缓存结果
    this.detectionCache.set(text, result);

    return result;
  }

  /**
   * 翻译文本（模拟实现）
   */
  public async translate(
    text: string,
    targetLanguage: LanguageCode
  ): Promise<TranslationResult> {
    const cacheKey = `${text}_${targetLanguage}`;

    // 检查缓存
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey)!;
    }

    // 检测源语言
    const detection = this.detectLanguage(text);

    // 如果已经是目标语言，直接返回
    if (detection.language === targetLanguage) {
      const result: TranslationResult = {
        originalText: text,
        originalLanguage: detection.language,
        translatedText: text,
        targetLanguage,
        confidence: 1.0,
        provider: 'none'
      };

      this.translationCache.set(cacheKey, result);
      return result;
    }

    // 模拟翻译（实际应用中应使用翻译 API）
    const translatedText = this.simulateTranslation(text, detection.language, targetLanguage);

    const result: TranslationResult = {
      originalText: text,
      originalLanguage: detection.language,
      translatedText,
      targetLanguage,
      confidence: 0.8,  // 模拟置信度
      provider: 'simulated'
    };

    // 缓存结果
    this.translationCache.set(cacheKey, result);

    return result;
  }

  /**
   * 模拟翻译（实际应用中应使用翻译 API）
   */
  private simulateTranslation(
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode
  ): string {
    // 在实际应用中，这里应该调用翻译 API，如 Google Translate、DeepL 等
    // 这里使用同义词映射进行简单的"翻译"

    for (const [canonical, mapping] of this.synonymMappings) {
      const sourceSynonyms = mapping.languages[sourceLanguage] || [];
      const targetSynonyms = mapping.languages[targetLanguage] || [];

      for (const sourceSynonym of sourceSynonyms) {
        if (text.includes(sourceSynonym)) {
          return text.replace(sourceSynonym, targetSynonyms[0] || canonical);
        }
      }
    }

    // 如果没有找到匹配，返回原文
    return text;
  }

  /**
   * 跨语言匹配
   */
  public async match(
    query: string,
    products: Array<{ name: string; description?: string }>,
    targetLanguage?: LanguageCode
  ): Promise<CrossLanguageMatchResult[]> {
    // 检测查询语言
    const detection = this.detectLanguage(query);

    // 如果未指定目标语言，使用英文
    const targetLang = targetLanguage || 'en';

    // 如果查询语言已经是目标语言，直接匹配
    if (detection.language === targetLang) {
      return this.matchSameLanguage(query, products, detection.language);
    }

    // 翻译查询
    const translation = await this.translate(query, targetLang);

    const results: CrossLanguageMatchResult[] = [];

    for (const product of products) {
      // 计算翻译后查询与产品的相似度
      const productText = product.name + ' ' + (product.description || '');
      const similarityResult = await this.embedding.calculateSimilarity(translation.translatedText, productText);

      results.push({
        originalQuery: query,
        queryLanguage: detection.language,
        translatedQuery: translation.translatedText,
        targetLanguage: targetLang,
        similarity: similarityResult.similarity,
        productName: product.name,
        matchedLanguages: [detection.language, targetLang],
        confidence: similarityResult.similarity * translation.confidence
      });
    }

    // 按相似度排序
    results.sort((a, b) => b.similarity - a.similarity);

    return results;
  }

  /**
   * 同语言匹配
   */
  private async matchSameLanguage(
    query: string,
    products: Array<{ name: string; description?: string }>,
    language: LanguageCode
  ): Promise<CrossLanguageMatchResult[]> {
    const results: CrossLanguageMatchResult[] = [];

    for (const product of products) {
      const productText = product.name + ' ' + (product.description || '');
      const similarityResult = await this.embedding.calculateSimilarity(query, productText);

      results.push({
        originalQuery: query,
        queryLanguage: language,
        translatedQuery: query,
        targetLanguage: language,
        similarity: similarityResult.similarity,
        productName: product.name,
        matchedLanguages: [language],
        confidence: similarityResult.similarity
      });
    }

    results.sort((a, b) => b.similarity - a.similarity);

    return results;
  }

  /**
   * 添加多语言同义词映射
   */
  public addSynonymMapping(mapping: MultilingualSynonymMapping): void {
    this.synonymMappings.set(mapping.canonical, mapping);
  }

  /**
   * 获取支持的语言列表
   */
  public getSupportedLanguages(): Array<{ code: LanguageCode; name: string }> {
    return Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({ code: code as LanguageCode, name }));
  }

  /**
   * 清空缓存
   */
  public clearCache(): void {
    this.translationCache.clear();
    this.detectionCache.clear();
  }

  /**
   * 获取统计信息
   */
  public getStats(): {
    synonymMappings: number;
    translationCacheSize: number;
    detectionCacheSize: number;
    supportedLanguages: number;
  } {
    return {
      synonymMappings: this.synonymMappings.size,
      translationCacheSize: this.translationCache.size,
      detectionCacheSize: this.detectionCache.size,
      supportedLanguages: Object.keys(LANGUAGE_NAMES).length
    };
  }
}

/**
 * 导出单例
 */
export const crossLanguageMatcher = CrossLanguageMatcher.getInstance();
