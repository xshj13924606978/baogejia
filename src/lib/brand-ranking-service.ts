import { createClient } from '@supabase/supabase-js';

/**
 * 简单的内存缓存类
 */
class SimpleCache {
  private cache: Map<string, { data: any; expiresAt: number }>;
  private defaultTTL: number;

  constructor(defaultTTL: number = 300) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  set(key: string, value: any, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL) * 1000;
    this.cache.set(key, { data: value, expiresAt });
  }

  get<T>(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return item.data as T;
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  flushAll(): void {
    this.cache.clear();
  }
}

/**
 * 品牌供应商类型定义
 */
export interface BrandVendor {
  id: string;
  brand_name: string;
  brand_code?: string;
  brand_logo?: string;
  brand_description?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;

  // 付费相关字段
  payment_level: number; // 1-5，1级最高，5级为免费
  payment_status: 'active' | 'expired' | 'inactive';
  total_payment_amount: number;
  start_date?: string;
  end_date?: string;

  // 排序权重
  display_weight: number;

  // 状态字段
  is_active: boolean;
  is_featured: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * 展示规则配置
 */
export interface DisplayRules {
  level_1_quota: number; // VIP品牌配额
  level_2_quota: number; // 高级品牌配额
  level_3_quota: number; // 合作品牌配额
  level_4_quota: number; // 标准品牌配额
  level_5_quota: number; // 免费品牌配额

  enable_same_level_random: boolean; // 同等级内是否随机排序
  enable_free_brands: boolean; // 是否展示免费品牌
  max_total_brands: number; // 最多展示品牌总数

  payment_level_weight: number; // 付费等级权重
  payment_amount_weight: number; // 付费金额权重
  display_weight_weight: number; // 展示权重

  enable_cache: boolean; // 是否启用缓存
  cache_ttl: number; // 缓存过期时间（秒）
}

/**
 * 排序后的品牌结果
 */
export interface RankedBrand extends BrandVendor {
  ranking_score: number; // 综合评分
  rank_position?: number; // 排名位置
}

/**
 * 品牌排名服务类
 *
 * 功能：
 * 1. 按付费等级对品牌进行排序
 * 2. 根据配置的配额选择品牌
 * 3. 计算推荐权重
 * 4. 支持缓存
 */
export class BrandRankingService {
  private supabase;
  private cache: SimpleCache;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    this.cache = new SimpleCache(300); // 默认5分钟缓存
  }

  /**
   * 获取展示规则配置
   */
  async getDisplayRules(): Promise<DisplayRules | null> {
    const { data, error } = await this.supabase
      .from('brand_display_rules')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      console.error('[BrandRanking] 获取展示规则失败:', error);
      return null;
    }

    return {
      level_1_quota: data.level_1_quota,
      level_2_quota: data.level_2_quota,
      level_3_quota: data.level_3_quota,
      level_4_quota: data.level_4_quota,
      level_5_quota: data.level_5_quota,

      enable_same_level_random: data.enable_same_level_random,
      enable_free_brands: data.enable_free_brands,
      max_total_brands: data.max_total_brands,

      payment_level_weight: data.payment_level_weight,
      payment_amount_weight: data.payment_amount_weight,
      display_weight_weight: data.display_weight_weight,

      enable_cache: data.enable_cache,
      cache_ttl: data.cache_ttl,
    };
  }

  /**
   * 获取所有有效品牌
   */
  async getActiveBrands(): Promise<BrandVendor[]> {
    const { data, error } = await this.supabase
      .from('brand_vendors')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[BrandRanking] 获取品牌列表失败:', error);
      return [];
    }

    return data || [];
  }

  /**
   * 计算品牌综合评分
   *
   * 评分公式：
   * score = payment_level_weight * level_score +
   *         payment_amount_weight * amount_score +
   *         display_weight_weight * weight_score
   *
   * @param brand 品牌信息
   * @param rules 展示规则
   * @returns 综合评分（0-100）
   */
  private calculateRankingScore(brand: BrandVendor, rules: DisplayRules): number {
    // 付费等级评分：1级=100，5级=20
    const levelScore = (6 - brand.payment_level) * 20;

    // 付费金额评分：标准化到0-100
    const maxAmount = 100000; // 假设最高10万元
    const amountScore = Math.min((brand.total_payment_amount / maxAmount) * 100, 100);

    // 展示权重评分：标准化到0-100
    const weightScore = Math.min((brand.display_weight / 1000) * 100, 100);

    // 综合评分
    const score =
      rules.payment_level_weight * levelScore +
      rules.payment_amount_weight * amountScore +
      rules.display_weight_weight * weightScore;

    return score;
  }

  /**
   * 对品牌进行排序
   *
   * 排序规则：
   * 1. 优先按付费等级排序（1级最高）
   * 2. 同等级内按综合评分排序
   * 3. 可选择同等级内随机排序
   *
   * @param brands 品牌列表
   * @param rules 展示规则
   * @returns 排序后的品牌列表
   */
  private rankBrands(brands: BrandVendor[], rules: DisplayRules): RankedBrand[] {
    // 计算每个品牌的评分
    const rankedBrands: RankedBrand[] = brands.map((brand) => ({
      ...brand,
      ranking_score: this.calculateRankingScore(brand, rules),
    }));

    // 按付费等级分组
    const levelGroups = new Map<number, RankedBrand[]>();
    rankedBrands.forEach((brand) => {
      const level = brand.payment_level;
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(brand);
    });

    // 对每个等级内的品牌进行排序
    levelGroups.forEach((brands, level) => {
      if (rules.enable_same_level_random) {
        // 随机排序
        this.shuffleArray(brands);
      } else {
        // 按评分降序排序
        brands.sort((a, b) => b.ranking_score - a.ranking_score);
      }
    });

    // 按等级顺序（1-5）合并所有品牌
    const result: RankedBrand[] = [];
    for (let level = 1; level <= 5; level++) {
      const brandsInLevel = levelGroups.get(level) || [];
      result.push(...brandsInLevel);
    }

    // 添加排名位置
    result.forEach((brand, index) => {
      brand.rank_position = index + 1;
    });

    return result;
  }

  /**
   * 根据配额选择品牌
   *
   * @param rankedBrands 排序后的品牌列表
   * @param rules 展示规则
   * @returns 选中的品牌列表
   */
  private selectBrandsByQuota(rankedBrands: RankedBrand[], rules: DisplayRules): RankedBrand[] {
    const selected: RankedBrand[] = [];
    const usedIds = new Set<string>();

    // 定义各等级配额
    const quotas = {
      1: rules.level_1_quota,
      2: rules.level_2_quota,
      3: rules.level_3_quota,
      4: rules.level_4_quota,
      5: rules.level_5_quota,
    };

    // 按等级选择品牌
    for (let level = 1; level <= 5; level++) {
      // 如果是5级（免费）且不展示免费品牌，跳过
      if (level === 5 && !rules.enable_free_brands) {
        continue;
      }

      const quota = quotas[level as keyof typeof quotas];
      if (quota <= 0) continue;

      // 选择该等级的前N个品牌
      let count = 0;
      for (const brand of rankedBrands) {
        if (brand.payment_level === level && !usedIds.has(brand.id)) {
          selected.push(brand);
          usedIds.add(brand.id);
          count++;

          if (count >= quota) break;
        }
      }
    }

    // 检查总数限制
    if (selected.length > rules.max_total_brands) {
      return selected.slice(0, rules.max_total_brands);
    }

    return selected;
  }

  /**
   * 获取推荐品牌列表
   *
   * @param cacheKey 缓存键（可选）
   * @returns 推荐品牌列表
   */
  async getRecommendedBrands(cacheKey?: string): Promise<RankedBrand[]> {
    const rules = await this.getDisplayRules();
    if (!rules) {
      console.warn('[BrandRanking] 未找到展示规则，返回空列表');
      return [];
    }

    // 检查缓存
    if (rules.enable_cache && cacheKey) {
      const cached = this.cache.get<RankedBrand[]>(cacheKey);
      if (cached) {
        console.log('[BrandRanking] 使用缓存数据');
        return cached;
      }
    }

    // 获取所有有效品牌
    const brands = await this.getActiveBrands();

    // 排序品牌
    const rankedBrands = this.rankBrands(brands, rules);

    // 按配额选择品牌
    const selectedBrands = this.selectBrandsByQuota(rankedBrands, rules);

    // 设置缓存
    if (rules.enable_cache && cacheKey) {
      this.cache.set(cacheKey, selectedBrands, rules.cache_ttl);
    }

    return selectedBrands;
  }

  /**
   * 清除缓存
   *
   * @param cacheKey 缓存键（可选，不传则清除所有缓存）
   */
  clearCache(cacheKey?: string): void {
    if (cacheKey) {
      this.cache.del(cacheKey);
    } else {
      this.cache.flushAll();
    }
  }

  /**
   * Fisher-Yates 洗牌算法
   */
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

// 导出单例实例
export const brandRankingService = new BrandRankingService();
