/**
 * 判重配置接口
 */
export interface DuplicateCheckConfig {
  fields: string[]; // 判重字段列表，如 ['name', 'model', 'brand']
  matchRule: 'and' | 'or'; // 匹配规则（目前仅支持and）
}

/**
 * 判重结果接口
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateProduct?: any;
  matchedFields?: string[];
  matchValues?: Record<string, any>;
}

/**
 * 判重检查器类
 * 用于检查产品是否重复，支持自定义判重字段组合
 */
export class DuplicateChecker {
  private config: DuplicateCheckConfig;
  private db?: any;

  constructor(config?: DuplicateCheckConfig, db?: any) {
    // 默认配置：name + model
    this.config = config || { fields: ['name', 'model'], matchRule: 'and' };
    this.db = db;
  }

  /**
   * 设置判重配置
   */
  setConfig(config: DuplicateCheckConfig) {
    this.config = config;
    console.log('⚙️ 判重规则已更新:', this.config);
  }

  /**
   * 设置数据库实例
   */
  setDB(db: any) {
    this.db = db;
  }

  /**
   * 获取当前配置
   */
  getConfig(): DuplicateCheckConfig {
    return this.config;
  }

  /**
   * 检查产品是否重复
   * @param product 产品数据
   * @param existingProducts 已有产品列表（内存查重时使用）
   * @returns 判重结果
   */
  async checkDuplicate(
    product: any,
    existingProducts?: any[],
  ): Promise<DuplicateCheckResult> {
    const fields = this.config.fields;

    if (!fields || fields.length === 0) {
      return { isDuplicate: false };
    }

    // 如果有数据库实例，使用数据库查询
    if (this.db) {
      return await this.checkDuplicateInDB(product);
    }

    // 否则在内存中检查
    return this.checkDuplicateInMemory(product, existingProducts || []);
  }

  /**
   * 数据库查重
   * @param product 产品数据
   * @returns 判重结果
   */
  private async checkDuplicateInDB(product: any): Promise<DuplicateCheckResult> {
    const fields = this.config.fields;

    if (!this.db) {
      throw new Error('数据库实例未设置');
    }

    console.log('[DuplicateChecker] 开始数据库查重，判重字段:', fields.join(', '));

    // 构建查询条件
    let query = this.db.from('products').select('id, name, model, brand, parameter_description, price');

    // 根据判重字段添加条件
    const matchValues: Record<string, any> = {};

    fields.forEach(field => {
      const fieldValue = this.normalizeFieldValue(product[field], field);
      if (fieldValue !== null && fieldValue !== '') {
        // 对于参数描述字段，不进行精确匹配查询
        // 改为在内存中进行比较，避免因格式差异导致误判
        if (field === 'parameter_description') {
          matchValues[field] = fieldValue;
          return; // 跳过数据库查询条件
        }
        query = query.eq(field, fieldValue);
        matchValues[field] = fieldValue;
      } else {
        // 如果字段值为空，查询该字段为空的记录
        query = query.is(field, null);
        matchValues[field] = null;
      }
    });

    console.log('[DuplicateChecker] 查询条件:', matchValues);

    const { data: existingList, error } = await query;

    if (error) {
      console.error('[DuplicateChecker] 查重失败:', error);
      return { isDuplicate: false };
    }

    // 如果查询结果为空，直接返回不重复
    if (!existingList || existingList.length === 0) {
      console.log('[DuplicateChecker] 未发现重复产品');
      return { isDuplicate: false };
    }

    // 如果配置中包含参数描述字段，需要额外比较
    if (fields.includes('parameter_description')) {
      const normalizedParamDesc = this.normalizeFieldValue(product.parameter_description, 'parameter_description');
      
      for (const existing of existingList) {
        const existingParamDesc = this.normalizeFieldValue(existing.parameter_description, 'parameter_description');
        
        // 参数描述比较：必须完全匹配才算重复
        // 因为参数描述中的任何差异（电压、压力、尺寸等）都意味着是不同的产品
        if (normalizedParamDesc && existingParamDesc) {
          // 使用精确匹配而非相似度匹配
          if (normalizedParamDesc !== existingParamDesc) {
            console.log('[DuplicateChecker] 参数描述不同，不是重复产品:', {
              new: normalizedParamDesc.substring(0, 80) + '...',
              existing: existingParamDesc.substring(0, 80) + '...'
            });
            continue; // 参数描述不同，跳过这条记录
          }
        } else if (normalizedParamDesc !== existingParamDesc) {
          // 一个有值一个没值，不匹配
          continue;
        }
        
        // 所有条件都满足，判定为重复
        console.log('[DuplicateChecker] 发现重复产品:', existing);
        return {
          isDuplicate: true,
          duplicateProduct: existing,
          matchedFields: fields,
          matchValues,
        };
      }
      
      // 所有记录的参数描述都不匹配
      console.log('[DuplicateChecker] 未发现完全匹配的重复产品');
      return { isDuplicate: false };
    }

    // 不包含参数描述字段，直接返回第一条匹配记录
    const existing = existingList[0];
    console.log('[DuplicateChecker] 发现重复产品:', existing);
    return {
      isDuplicate: true,
      duplicateProduct: existing,
      matchedFields: fields,
      matchValues,
    };
  }

  /**
   * 标准化字段值
   * @param value 原始值
   * @param field 字段名
   * @returns 标准化后的值
   */
  private normalizeFieldValue(value: any, field: string): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    
    // 转换为字符串并去除首尾空格
    let normalized = value.toString().trim();
    
    // 对于参数描述字段，进行额外处理
    if (field === 'parameter_description') {
      // 移除多余空白字符
      normalized = normalized.replace(/\s+/g, ' ');
      // 移除常见的格式符号
      normalized = normalized.replace(/[，。、；：""''（）【】《》]/g, '');
    }
    
    return normalized;
  }

  /**
   * 判断两个参数描述是否匹配
   * @param desc1 参数描述1
   * @param desc2 参数描述2
   * @returns 是否匹配
   */
  private isParameterDescriptionMatch(desc1: string, desc2: string): boolean {
    // 完全相同
    if (desc1 === desc2) {
      return true;
    }
    
    // 计算相似度（简单的字符重合度）
    const similarity = this.calculateSimilarity(desc1, desc2);
    
    // 相似度超过90%才认为是相同的参数描述
    return similarity >= 0.9;
  }

  /**
   * 计算两个字符串的相似度
   * @param str1 字符串1
   * @param str2 字符串2
   * @returns 相似度 (0-1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;
    
    const len1 = str1.length;
    const len2 = str2.length;
    
    // 使用Levenshtein距离计算相似度
    const matrix: number[][] = [];
    
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    
    return 1 - distance / maxLen;
  }

  /**
   * 内存查重（用于批量处理时提高性能）
   * @param product 产品数据
   * @param existingProducts 已有产品列表
   * @returns 判重结果
   */
  private checkDuplicateInMemory(product: any, existingProducts: any[]): DuplicateCheckResult {
    const fields = this.config.fields;

    console.log('[DuplicateChecker] 开始内存查重，判重字段:', fields.join(', '));

    for (const existing of existingProducts) {
      let isMatch = true;
      const matchValues: Record<string, any> = {};

      // 检查所有判重字段是否都匹配
      for (const field of fields) {
        const existingValue = this.normalizeFieldValue(existing[field], field);
        const productValue = this.normalizeFieldValue(product[field], field);

        // 对于参数描述字段，使用精确匹配
        // 因为参数描述中的任何差异（电压、压力、尺寸等）都意味着是不同的产品
        if (field === 'parameter_description') {
          if (existingValue && productValue) {
            // 精确匹配：必须完全相同才算重复
            if (existingValue !== productValue) {
              isMatch = false;
              break;
            }
          } else if (existingValue !== productValue) {
            // 一个有值一个没值，不匹配
            isMatch = false;
            break;
          }
          matchValues[field] = productValue;
          continue;
        }

        // 其他字段：标准化比较（精确匹配）
        if (existingValue !== productValue) {
          isMatch = false;
          break;
        }

        matchValues[field] = productValue;
      }

      if (isMatch) {
        console.log('[DuplicateChecker] 发现重复产品:', existing);
        return {
          isDuplicate: true,
          duplicateProduct: existing,
          matchedFields: fields,
          matchValues,
        };
      }
    }

    console.log('[DuplicateChecker] 未发现重复产品');
    return { isDuplicate: false };
  }

  /**
   * 从数据库加载判重配置
   * @param db 数据库实例
   * @returns 判重配置
   */
  static async loadFromDB(db?: any): Promise<DuplicateCheckConfig> {
    if (!db) {
      console.error('[DuplicateChecker] loadFromDB 需要提供数据库实例');
      return { fields: ['name', 'model'], matchRule: 'and' };
    }

    try {
      const { data, error } = await db
        .from('product_field_configs')
        .select('field_key')
        .eq('is_duplicate_check', true)
        .order('id', { ascending: true });

      if (error) {
        console.error('[DuplicateChecker] 加载判重配置失败:', error);
        return { fields: ['name', 'model'], matchRule: 'and' };
      }

      if (!data || data.length === 0) {
        console.log('[DuplicateChecker] 未配置判重字段，使用默认配置');
        return { fields: ['name', 'model'], matchRule: 'and' };
      }

      const fields = data.map((item: any) => item.field_key);

      // 确保 name 字段始终在列表中（如果已配置）
      // 注意：这里不再强制添加 name，尊重用户配置
      console.log('[DuplicateChecker] 加载判重配置成功:', fields);

      return { fields, matchRule: 'and' };
    } catch (error) {
      console.error('[DuplicateChecker] 加载判重配置异常:', error);
      return { fields: ['name', 'model'], matchRule: 'and' };
    }
  }

  /**
   * 生成判重结果描述
   * @param result 判重结果
   * @returns 描述文本
   */
  static formatResult(result: DuplicateCheckResult): string {
    if (!result.isDuplicate) {
      return '无重复';
    }

    if (!result.matchedFields || result.matchedFields.length === 0) {
      return '重复产品（未知字段）';
    }

    // 字段名称映射
    const labelMap: Record<string, string> = {
      name: '名称',
      model: '型号',
      brand: '品牌',
      category: '分类',
      price: '价格',
      parameter_description: '参数描述',
      unit: '单位',
      supplier: '供应商',
    };

    const matchedLabels = result.matchedFields.map(field => {
      const value = result.matchValues?.[field];
      const label = labelMap[field] || field;
      return `${label}: ${value || '-'}`;
    });

    return `重复产品（${matchedLabels.join(' | ')}）`;
  }

  /**
   * 批量检查重复（优化性能，先加载所有产品到内存）
   * @param products 待检查产品列表
   * @returns 检查结果数组
   */
  async batchCheckDuplicates(products: any[]): Promise<DuplicateCheckResult[]> {
    if (!this.db) {
      throw new Error('数据库实例未设置');
    }

    // 先加载数据库中的所有产品
    const { data: existingProducts, error } = await this.db
      .from('products')
      .select('*');

    if (error) {
      console.error('[DuplicateChecker] 批量加载产品失败:', error);
      // 降级为逐个检查
      return Promise.all(
        products.map(product => this.checkDuplicate(product))
      );
    }

    console.log(`[DuplicateChecker] 批量查重：加载了 ${existingProducts?.length || 0} 个已有产品`);

    // 在内存中进行批量检查
    return products.map(product =>
      this.checkDuplicateInMemory(product, existingProducts || [])
    );
  }

  /**
   * 判断两个产品是否重复（用于测试）
   * @param productA 产品A
   * @param productB 产品B
   * @returns 是否重复
   */
  isDuplicate(productA: any, productB: any): boolean {
    const fields = this.config.fields;
    
    return fields.every(field => {
      const valueA = productA[field]?.toString().trim() || '';
      const valueB = productB[field]?.toString().trim() || '';
      
      // 标准化比较：都为空时视为匹配
      const normalizedA = valueA === '' ? null : valueA;
      const normalizedB = valueB === '' ? null : valueB;
      
      return normalizedA === normalizedB;
    });
  }

  /**
   * 获取两个产品的匹配字段和值（用于测试结果展示）
   * @param productA 产品A
   * @param productB 产品B
   * @returns 匹配字段和值的映射
   */
  getMatchedFields(productA: any, productB: any): Record<string, any> {
    const fields = this.config.fields;
    const matchedValues: Record<string, any> = {};
    
    fields.forEach(field => {
      const valueA = productA[field]?.toString().trim() || '';
      const valueB = productB[field]?.toString().trim() || '';
      
      matchedValues[field] = valueA;
    });
    
    return matchedValues;
  }
}

/**
 * 创建判重检查器实例（便捷方法）
 * @param db 数据库实例（必填）
 * @param config 判重配置（可选，不传则从数据库加载）
 * @returns 判重检查器实例
 */
export async function createDuplicateChecker(db: any, config?: DuplicateCheckConfig): Promise<DuplicateChecker> {
  if (config) {
    return new DuplicateChecker(config, db);
  }

  // 从数据库加载配置
  const loadedConfig = await DuplicateChecker.loadFromDB(db);
  return new DuplicateChecker(loadedConfig, db);
}
