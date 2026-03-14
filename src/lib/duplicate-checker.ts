import { getSupabaseClient } from '@/storage/database/supabase-client';

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
    const db = this.db || getSupabaseClient();

    console.log('[DuplicateChecker] 开始数据库查重，判重字段:', fields.join(', '));

    // 构建查询条件
    let query = db.from('products').select('id, name, model, brand, parameter_description, price');

    // 根据判重字段添加条件
    const matchValues: Record<string, any> = {};

    fields.forEach(field => {
      const fieldValue = product[field];
      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        query = query.eq(field, fieldValue);
        matchValues[field] = fieldValue;
      } else {
        // 如果字段值为空，查询该字段为空的记录
        query = query.is(field, null);
        matchValues[field] = null;
      }
    });

    console.log('[DuplicateChecker] 查询条件:', matchValues);

    const { data: existing, error } = await query.maybeSingle();

    if (error) {
      console.error('[DuplicateChecker] 查重失败:', error);
      return { isDuplicate: false };
    }

    if (existing) {
      console.log('[DuplicateChecker] 发现重复产品:', existing);
      return {
        isDuplicate: true,
        duplicateProduct: existing,
        matchedFields: fields,
        matchValues,
      };
    }

    console.log('[DuplicateChecker] 未发现重复产品');
    return { isDuplicate: false };
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
        const existingValue = existing[field];
        const productValue = product[field];

        // 标准化比较：都为 null/undefined/空字符串时视为匹配
        const normalizedExisting = existingValue === null || existingValue === undefined || existingValue === '' ? null : existingValue;
        const normalizedProduct = productValue === null || productValue === undefined || productValue === '' ? null : productValue;

        if (normalizedExisting !== normalizedProduct) {
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
   * @returns 判重配置
   */
  static async loadFromDB(): Promise<DuplicateCheckConfig> {
    try {
      const db = getSupabaseClient();

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

      const fields = data.map(item => item.field_key);

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
    const db = this.db || getSupabaseClient();

    // 先加载数据库中的所有产品
    const { data: existingProducts, error } = await db
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
}

/**
 * 创建判重检查器实例（便捷方法）
 * @param config 判重配置（可选，不传则从数据库加载）
 * @returns 判重检查器实例
 */
export async function createDuplicateChecker(config?: DuplicateCheckConfig): Promise<DuplicateChecker> {
  const db = getSupabaseClient();

  if (config) {
    return new DuplicateChecker(config, db);
  }

  // 从数据库加载配置
  const loadedConfig = await DuplicateChecker.loadFromDB();
  return new DuplicateChecker(loadedConfig, db);
}
