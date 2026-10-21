/**
 * 产品特征索引
 * 
 * 功能：
 * 1. 从数据库加载产品数据
 * 2. 提取产品特征（排气量、压力、电压、功率、控制方式等）
 * 3. 构建特征向量索引
 * 4. 支持快速特征检索
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 产品特征接口
 */
export interface ProductFeature {
  id: string;
  name: string;
  model: string;
  brand: string;

  // 核心技术参数
  flowRate: number | null;        // 排气量 (m³/min)
  pressure: number | null;        // 工作压力 (MPa)
  power: number | null;           // 功率 (KW)
  voltage: string | null;         // 电压 (220V/380V)
  controlType: string | null;     // 控制方式 (永磁变频/工频)
  tankType: string | null;        // 储气罐类型 (单储气罐/双储气罐)

  // 价格信息
  displayPrice: number | null;
  minPrice: number | null;
  guidePrice: number | null;

  // 原始数据
  parameterDescription: string | null;
  description: string | null;
  category: string | null;

  // 特征向量（用于快速匹配）
  featureVector: {
    flowRate: number | null;
    pressure: number | null;
    power: number | null;
    voltageCode: number;  // 220V=1, 380V=2
    controlCode: number;  // 工频=1, 变频=2
  };
}

/**
 * 特征索引配置
 */
export interface FeatureIndexConfig {
  batchSize?: number;      // 批量加载大小
  cacheEnabled?: boolean;  // 是否启用缓存
  refreshInterval?: number; // 缓存刷新间隔（毫秒）
}

/**
 * 产品特征索引类
 */
export class ProductFeatureIndex {
  private static instance: ProductFeatureIndex;
  private features: Map<string, ProductFeature> = new Map();
  private indexed = false;
  private cacheTime = 0;
  private config: FeatureIndexConfig;

  private constructor(config: FeatureIndexConfig = {}) {
    this.config = {
      batchSize: 100,
      cacheEnabled: true,
      refreshInterval: 300000, // 5分钟
      ...config
    };
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: FeatureIndexConfig): ProductFeatureIndex {
    if (!ProductFeatureIndex.instance) {
      ProductFeatureIndex.instance = new ProductFeatureIndex(config);
    }
    return ProductFeatureIndex.instance;
  }

  /**
   * 从数据库加载产品数据
   */
  private async loadProductsFromDB(): Promise<any[]> {
    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          name,
          model,
          brand,
          display_price,
          min_price,
          guide_price,
          parameter_description,
          description,
          category,
          flow_rate,
          pressure,
          power,
          voltage,
          control_type,
          tank_type
        `)
        .order('name', { ascending: true });

      if (error) {
        console.error('[ProductFeatureIndex] 数据库查询失败:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[ProductFeatureIndex] 加载产品数据异常:', error);
      return [];
    }
  }

  /**
   * 解析参数描述，提取特征值
   */
  private parseParameterDescription(description: string | null): {
    flowRate: number | null;
    pressure: number | null;
    power: number | null;
    voltage: string | null;
    controlType: string | null;
    tankType: string | null;
  } {
    if (!description) {
      return {
        flowRate: null,
        pressure: null,
        power: null,
        voltage: null,
        controlType: null,
        tankType: null
      };
    }

    const result = {
      flowRate: null as number | null,
      pressure: null as number | null,
      power: null as number | null,
      voltage: null as string | null,
      controlType: null as string | null,
      tankType: null as string | null
    };

    // 解析排气量
    const flowMatch = description.match(/排气量[：:：]?\s*(\d+\.?\d*)\s*(m³|m3|立方)/i);
    if (flowMatch) {
      result.flowRate = parseFloat(flowMatch[1]);
    }

    // 解析工作压力
    const pressureMatch = description.match(/工作压力[：:：]?\s*(\d+\.?\d*)\s*(MPa|兆帕)/i);
    if (pressureMatch) {
      result.pressure = parseFloat(pressureMatch[1]);
    }

    // 解析功率
    const powerMatch = description.match(/功率[：:：]?\s*(\d+\.?\d*)\s*(kW|千瓦)/i);
    if (powerMatch) {
      result.power = parseFloat(powerMatch[1]);
    }

    // 解析电压
    if (/220V|220伏|单相/i.test(description)) {
      result.voltage = '220V';
    } else if (/380V|380伏|三相/i.test(description)) {
      result.voltage = '380V';
    }

    // 解析控制方式
    if (/永磁变频|变频/i.test(description)) {
      result.controlType = '永磁变频';
    } else if (/工频/i.test(description)) {
      result.controlType = '工频';
    }

    // 解析储气罐类型
    if (/双罐|双储气罐/i.test(description)) {
      result.tankType = '双储气罐';
    } else if (/单罐|单储气罐/i.test(description)) {
      result.tankType = '单储气罐';
    }

    return result;
  }

  /**
   * 提取产品特征
   */
  private extractFeature(product: any): ProductFeature {
    // 优先使用数据库字段，否则从参数描述中解析
    const parsedParams = this.parseParameterDescription(product.parameter_description);

    // 电压编码：220V=1, 380V=2
    const voltage = product.voltage || parsedParams.voltage;
    const voltageCode = voltage === '220V' ? 1 : (voltage === '380V' ? 2 : 0);

    // 控制方式编码：工频=1, 变频=2
    const controlType = product.control_type || parsedParams.controlType;
    const controlCode = controlType === '工频' ? 1 : (controlType === '永磁变频' ? 2 : 0);

    return {
      id: product.id,
      name: product.name || '',
      model: product.model || '',
      brand: product.brand || '',

      // 核心技术参数
      flowRate: product.flow_rate !== null && product.flow_rate !== undefined 
        ? product.flow_rate 
        : parsedParams.flowRate,
      pressure: product.pressure !== null && product.pressure !== undefined
        ? product.pressure
        : parsedParams.pressure,
      power: product.power !== null && product.power !== undefined
        ? product.power
        : parsedParams.power,
      voltage: voltage,
      controlType: controlType,
      tankType: product.tank_type || parsedParams.tankType,

      // 价格信息
      displayPrice: product.display_price,
      minPrice: product.min_price,
      guidePrice: product.guide_price,

      // 原始数据
      parameterDescription: product.parameter_description,
      description: product.description,
      category: product.category,

      // 特征向量
      featureVector: {
        flowRate: product.flow_rate !== null && product.flow_rate !== undefined 
          ? product.flow_rate 
          : parsedParams.flowRate,
        pressure: product.pressure !== null && product.pressure !== undefined
          ? product.pressure
          : parsedParams.pressure,
        power: product.power !== null && product.power !== undefined
          ? product.power
          : parsedParams.power,
        voltageCode,
        controlCode
      }
    };
  }

  /**
   * 构建特征索引
   */
  public async buildIndex(): Promise<void> {
    try {

      // 检查缓存
      const now = Date.now();
      if (this.indexed && this.config.cacheEnabled && (now - this.cacheTime) < (this.config.refreshInterval || 300000)) {
        return;
      }

      // 加载产品数据
      const products = await this.loadProductsFromDB();
      if (products.length === 0) {
        console.warn('[ProductFeatureIndex] 没有产品数据，索引构建失败');
        return;
      }

      // 清空现有索引
      this.features.clear();

      // 提取特征并构建索引
      for (const product of products) {
        const feature = this.extractFeature(product);
        this.features.set(feature.id, feature);
      }

      this.indexed = true;
      this.cacheTime = now;


    } catch (error) {
      console.error('[ProductFeatureIndex] 构建索引异常:', error);
    }
  }

  /**
   * 根据ID获取产品特征
   */
  public getFeature(id: string): ProductFeature | undefined {
    return this.features.get(id);
  }

  /**
   * 获取所有产品特征
   */
  public getAllFeatures(): ProductFeature[] {
    return Array.from(this.features.values());
  }

  /**
   * 按产品名称搜索特征
   */
  public searchByName(keyword: string): ProductFeature[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.getAllFeatures().filter(
      f => f.name.toLowerCase().includes(lowerKeyword) ||
           f.model.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * 检查索引是否已构建
   */
  public isIndexed(): boolean {
    return this.indexed;
  }

  /**
   * 强制刷新索引
   */
  public async refreshIndex(): Promise<void> {
    this.indexed = false;
    await this.buildIndex();
  }

  /**
   * 获取索引统计信息
   */
  public getStats(): {
    total: number;
    brands: string[];
    categories: string[];
    voltageDistribution: Record<string, number>;
    controlTypeDistribution: Record<string, number>;
  } {
    const features = this.getAllFeatures();
    const brands = [...new Set(features.map(f => f.brand).filter((b): b is string => b !== null && b !== undefined))];
    const categories = [...new Set(features.map(f => f.category).filter((c): c is string => c !== null && c !== undefined))];

    const voltageDistribution: Record<string, number> = {};
    const controlTypeDistribution: Record<string, number> = {};

    features.forEach(f => {
      if (f.voltage) {
        voltageDistribution[f.voltage] = (voltageDistribution[f.voltage] || 0) + 1;
      }
      if (f.controlType) {
        controlTypeDistribution[f.controlType] = (controlTypeDistribution[f.controlType] || 0) + 1;
      }
    });

    return {
      total: features.length,
      brands,
      categories,
      voltageDistribution,
      controlTypeDistribution
    };
  }
}

// 导出单例
export const productFeatureIndex = ProductFeatureIndex.getInstance();
