/**
 * 产品名称同义词映射系统
 * 
 * 功能：
 * 1. 支持产品名称的同义词映射
 * 2. 支持模糊匹配和标准化
 * 3. 提供名称相似度计算
 * 4. 支持动态添加同义词
 */

/**
 * 同义词映射配置
 */
export interface SynonymMapping {
  canonical: string;        // 规范名称
  synonyms: string[];      // 同义词列表
  category?: string;       // 产品类别
  priority?: number;       // 优先级（数值越大优先级越高）
}

/**
 * 名称匹配结果
 */
export interface NameMatchResult {
  canonical: string;        // 匹配到的规范名称
  original: string;         // 原始输入
  similarity: number;       // 相似度 (0-1)
  matchType: 'exact' | 'synonym' | 'fuzzy' | 'none';  // 匹配类型
  category?: string;        // 产品类别
}

/**
 * 同义词映射管理器类
 */
export class ProductSynonymMapper {
  private static instance: ProductSynonymMapper;
  private mappings: Map<string, SynonymMapping> = new Map();
  private synonymIndex: Map<string, string> = new Map(); // 同义词 -> 规范名称

  private constructor() {
    this.initializeDefaultMappings();
    console.log('[ProductSynonymMapper] 同义词映射管理器初始化完成');
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ProductSynonymMapper {
    if (!ProductSynonymMapper.instance) {
      ProductSynonymMapper.instance = new ProductSynonymMapper();
    }
    return ProductSynonymMapper.instance;
  }

  /**
   * 初始化默认的同义词映射
   */
  private initializeDefaultMappings(): void {
    // 空压机相关
    this.addMapping({
      canonical: '空压机',
      synonyms: [
        '空压机',
        '压缩机',
        '空气压缩机',
        '空气压缩机组',
        '空压',
        '压机',
        '压缩空气设备',
        'air compressor',
        '压缩机设备'
      ],
      category: '空气压缩设备',
      priority: 100
    });

    // 螺杆空压机
    this.addMapping({
      canonical: '一体式螺杆空压机',
      synonyms: [
        '一体式螺杆空压机',
        '螺杆空压机',
        '螺杆机',
        '螺杆压缩机',
        'screw compressor',
        '螺杆空压',
        '双螺杆空压机'
      ],
      category: '螺杆式空压机',
      priority: 95
    });

    // 活塞空压机
    this.addMapping({
      canonical: '活塞空压机',
      synonyms: [
        '活塞空压机',
        '活塞压缩机',
        '往复式空压机',
        'reciprocating compressor',
        '活塞机',
        '往复式压缩机'
      ],
      category: '活塞式空压机',
      priority: 90
    });

    // 无油空压机
    this.addMapping({
      canonical: '无油空压机',
      synonyms: [
        '无油空压机',
        '无油压缩机',
        'oil-free compressor',
        '无油机'
      ],
      category: '无油空压机',
      priority: 85
    });

    // 静音空压机
    this.addMapping({
      canonical: '静音空压机',
      synonyms: [
        '静音空压机',
        '静音压缩机',
        '低噪音空压机',
        '低噪音压缩机',
        'silent compressor',
        '静音机'
      ],
      category: '静音空压机',
      priority: 80
    });

    // 移动空压机
    this.addMapping({
      canonical: '移动空压机',
      synonyms: [
        '移动空压机',
        '移动式空压机',
        '便携空压机',
        'portable compressor',
        '可移动空压机'
      ],
      category: '移动空压机',
      priority: 75
    });

    // 变频空压机
    this.addMapping({
      canonical: '变频空压机',
      synonyms: [
        '变频空压机',
        '变频压缩机',
        'vfd compressor',
        'variable frequency compressor'
      ],
      category: '变频空压机',
      priority: 85
    });

    // 永磁变频空压机
    this.addMapping({
      canonical: '永磁变频空压机',
      synonyms: [
        '永磁变频空压机',
        '永磁变频压缩机',
        'pm vfd compressor',
        'permanent magnet vfd',
        '永磁变频',
        '变频永磁'
      ],
      category: '永磁变频空压机',
      priority: 90
    });

    // 工频空压机
    this.addMapping({
      canonical: '工频空压机',
      synonyms: [
        '工频空压机',
        '工频压缩机',
        '定频空压机',
        '定频压缩机',
        '固定频率空压机',
        '工频机',
        '定频机'
      ],
      category: '工频空压机',
      priority: 80
    });

    // 高压空压机
    this.addMapping({
      canonical: '高压空压机',
      synonyms: [
        '高压空压机',
        '高压压缩机',
        'high pressure compressor',
        '高压机',
        '大压力空压机'
      ],
      category: '高压空压机',
      priority: 85
    });

    // 低压空压机
    this.addMapping({
      canonical: '低压空压机',
      synonyms: [
        '低压空压机',
        '低压压缩机',
        'low pressure compressor',
        '低压机',
        '小压力空压机'
      ],
      category: '低压空压机',
      priority: 80
    });

    // 微型空压机
    this.addMapping({
      canonical: '微型空压机',
      synonyms: [
        '微型空压机',
        '微型压缩机',
        'mini compressor',
        '小型空压机',
        '小空压机',
        '迷你空压机'
      ],
      category: '微型空压机',
      priority: 75
    });

    // 便携式空压机
    this.addMapping({
      canonical: '便携式空压机',
      synonyms: [
        '便携式空压机',
        '便携压缩机',
        'portable compressor',
        '手提空压机',
        '手持空压机',
        '移动便携空压机'
      ],
      category: '便携式空压机',
      priority: 70
    });

    // 直联空压机
    this.addMapping({
      canonical: '直联空压机',
      synonyms: [
        '直联空压机',
        '直联压缩机',
        'direct drive compressor',
        '直连空压机',
        '直连压缩机',
        '直驱空压机'
      ],
      category: '直联空压机',
      priority: 70
    });

    // 皮带传动空压机
    this.addMapping({
      canonical: '皮带传动空压机',
      synonyms: [
        '皮带传动空压机',
        '皮带传动压缩机',
        'belt drive compressor',
        '皮带机',
        '皮带传动机'
      ],
      category: '皮带传动空压机',
      priority: 65
    });

    // 双级空压机
    this.addMapping({
      canonical: '双级空压机',
      synonyms: [
        '双级空压机',
        '双级压缩机',
        'two-stage compressor',
        '两级空压机',
        '两级压缩机',
        '二级压缩空压机'
      ],
      category: '双级空压机',
      priority: 75
    });

    // 单级空压机
    this.addMapping({
      canonical: '单级空压机',
      synonyms: [
        '单级空压机',
        '单级压缩机',
        'single-stage compressor',
        '一级空压机',
        '一级压缩机',
        '单缸空压机'
      ],
      category: '单级空压机',
      priority: 70
    });

    // 涡旋空压机
    this.addMapping({
      canonical: '涡旋空压机',
      synonyms: [
        '涡旋空压机',
        '涡旋压缩机',
        'scroll compressor',
        '涡旋机'
      ],
      category: '涡旋空压机',
      priority: 80
    });

    // 离心空压机
    this.addMapping({
      canonical: '离心空压机',
      synonyms: [
        '离心空压机',
        '离心压缩机',
        'centrifugal compressor',
        '涡轮空压机',
        '涡轮压缩机'
      ],
      category: '离心空压机',
      priority: 80
    });

    // 工业空压机
    this.addMapping({
      canonical: '工业空压机',
      synonyms: [
        '工业空压机',
        '工业压缩机',
        'industrial compressor',
        '工业级空压机',
        '工厂用空压机',
        '车间空压机'
      ],
      category: '工业空压机',
      priority: 85
    });

    // 家用空压机
    this.addMapping({
      canonical: '家用空压机',
      synonyms: [
        '家用空压机',
        '家用压缩机',
        'home compressor',
        '家庭空压机',
        '民用空压机',
        '小型家用空压机'
      ],
      category: '家用空压机',
      priority: 70
    });

    // 商用空压机
    this.addMapping({
      canonical: '商用空压机',
      synonyms: [
        '商用空压机',
        '商用压缩机',
        'commercial compressor',
        '商业空压机',
        '商务空压机'
      ],
      category: '商用空压机',
      priority: 75
    });

    // 柴油机空压机
    this.addMapping({
      canonical: '柴油机空压机',
      synonyms: [
        '柴油机空压机',
        '柴油压缩机',
        'diesel compressor',
        '柴油驱动空压机',
        '柴油空压机'
      ],
      category: '柴油机空压机',
      priority: 70
    });

    // 电动空压机
    this.addMapping({
      canonical: '电动空压机',
      synonyms: [
        '电动空压机',
        '电动压缩机',
        'electric compressor',
        '电机驱动空压机',
        '电力空压机'
      ],
      category: '电动空压机',
      priority: 75
    });

    // 车载空压机
    this.addMapping({
      canonical: '车载空压机',
      synonyms: [
        '车载空压机',
        '车载压缩机',
        'vehicle compressor',
        '汽车空压机',
        '车载充气泵',
        '车载打气泵'
      ],
      category: '车载空压机',
      priority: 65
    });

    // 医用空压机
    this.addMapping({
      canonical: '医用空压机',
      synonyms: [
        '医用空压机',
        '医用压缩机',
        'medical compressor',
        '医疗空压机',
        '医院用空压机'
      ],
      category: '医用空压机',
      priority: 85
    });

    // 实验室空压机
    this.addMapping({
      canonical: '实验室空压机',
      synonyms: [
        '实验室空压机',
        '实验室压缩机',
        'laboratory compressor',
        '实验用空压机',
        '科研空压机'
      ],
      category: '实验室空压机',
      priority: 80
    });

    // 矿用空压机
    this.addMapping({
      canonical: '矿用空压机',
      synonyms: [
        '矿用空压机',
        '矿用压缩机',
        'mining compressor',
        '矿山空压机',
        '矿井空压机'
      ],
      category: '矿用空压机',
      priority: 80
    });

    console.log(`[ProductSynonymMapper] 已加载 ${this.mappings.size} 个同义词映射`);
  }

  /**
   * 添加同义词映射
   */
  public addMapping(mapping: SynonymMapping): void {
    // 存储映射
    this.mappings.set(mapping.canonical, mapping);

    // 建立同义词索引
    mapping.synonyms.forEach(synonym => {
      const normalized = this.normalizeText(synonym);
      this.synonymIndex.set(normalized, mapping.canonical);
    });
  }

  /**
   * 标准化文本（用于匹配）
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, '')      // 移除空格
      .replace(/[\/\-_\\]/g, '') // 移除分隔符
      .replace(/[，,、]/g, '');  // 移除标点
  }

  /**
   * 计算文本相似度（Levenshtein距离）
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const len1 = text1.length;
    const len2 = text2.length;

    if (len1 === 0) return len2 === 0 ? 1.0 : 0.0;
    if (len2 === 0) return 0.0;

    const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    // 初始化
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    // 填充矩阵
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = text1[i - 1] === text2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // 删除
          matrix[i][j - 1] + 1,      // 插入
          matrix[i - 1][j - 1] + cost // 替换
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLength = Math.max(len1, len2);
    return 1.0 - (distance / maxLength);
  }

  /**
   * 匹配产品名称
   */
  public matchProductName(input: string, threshold: number = 0.7): NameMatchResult {
    const normalizedInput = this.normalizeText(input);
    
    // 1. 精确匹配（直接查找同义词）
    const canonicalFromSynonym = this.synonymIndex.get(normalizedInput);
    if (canonicalFromSynonym) {
      const mapping = this.mappings.get(canonicalFromSynonym);
      return {
        canonical: canonicalFromSynonym,
        original: input,
        similarity: 1.0,
        matchType: 'synonym',
        category: mapping?.category
      };
    }

    // 2. 模糊匹配（查找相似度高的规范名称）
    let bestMatch: string | null = null;
    let bestSimilarity = 0.0;

    for (const [canonical, mapping] of this.mappings) {
      const normalizedCanonical = this.normalizeText(canonical);

      // 检查同义词
      for (const synonym of mapping.synonyms) {
        const normalizedSynonym = this.normalizeText(synonym);
        const similarity = this.calculateSimilarity(normalizedInput, normalizedSynonym);

        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = canonical;
        }
      }
    }

    // 3. 检查是否达到阈值
    if (bestMatch && bestSimilarity >= threshold) {
      const mapping = this.mappings.get(bestMatch);
      return {
        canonical: bestMatch,
        original: input,
        similarity: bestSimilarity,
        matchType: 'fuzzy',
        category: mapping?.category
      };
    }

    // 4. 未匹配
    return {
      canonical: input,
      original: input,
      similarity: 0.0,
      matchType: 'none'
    };
  }

  /**
   * 批量匹配产品名称
   */
  public matchProductNames(inputs: string[], threshold: number = 0.7): Map<string, NameMatchResult> {
    const results = new Map<string, NameMatchResult>();
    
    inputs.forEach(input => {
      const result = this.matchProductName(input, threshold);
      results.set(input, result);
    });

    return results;
  }

  /**
   * 获取同义词列表
   */
  public getSynonyms(canonical: string): string[] | undefined {
    const mapping = this.mappings.get(canonical);
    return mapping?.synonyms;
  }

  /**
   * 检查是否为同义词
   */
  public isSynonym(input: string, canonical: string): boolean {
    const normalizedInput = this.normalizeText(input);
    const normalizedCanonical = this.normalizeText(canonical);

    const mapping = this.mappings.get(canonical);
    if (!mapping) return false;

    return mapping.synonyms.some(synonym => {
      return this.normalizeText(synonym) === normalizedInput;
    });
  }

  /**
   * 获取所有映射
   */
  public getAllMappings(): SynonymMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * 根据类别获取映射
   */
  public getMappingsByCategory(category: string): SynonymMapping[] {
    return this.getAllMappings().filter(m => m.category === category);
  }

  /**
   * 更新同义词映射
   */
  public updateMapping(canonical: string, newSynonyms: string[]): boolean {
    const mapping = this.mappings.get(canonical);
    if (!mapping) return false;

    // 移除旧的同义词索引
    mapping.synonyms.forEach(synonym => {
      const normalized = this.normalizeText(synonym);
      this.synonymIndex.delete(normalized);
    });

    // 更新同义词
    mapping.synonyms = newSynonyms;

    // 重建索引
    newSynonyms.forEach(synonym => {
      const normalized = this.normalizeText(synonym);
      this.synonymIndex.set(normalized, canonical);
    });

    return true;
  }

  /**
   * 删除映射
   */
  public removeMapping(canonical: string): boolean {
    const mapping = this.mappings.get(canonical);
    if (!mapping) return false;

    // 删除同义词索引
    mapping.synonyms.forEach(synonym => {
      const normalized = this.normalizeText(synonym);
      this.synonymIndex.delete(normalized);
    });

    // 删除映射
    this.mappings.delete(canonical);

    return true;
  }

  /**
   * 获取统计信息
   */
  public getStats(): {
    totalMappings: number;
    totalSynonyms: number;
    categories: string[];
  } {
    const mappings = this.getAllMappings();
    const categories = [...new Set(mappings.map(m => m.category).filter((c): c is string => c !== null && c !== undefined))];
    const totalSynonyms = mappings.reduce((sum, m) => sum + m.synonyms.length, 0);

    return {
      totalMappings: mappings.length,
      totalSynonyms,
      categories
    };
  }
}

// 导出单例
export const productSynonymMapper = ProductSynonymMapper.getInstance();
