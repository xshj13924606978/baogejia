// ✅ 优化后的 price-matching.ts 已加载
console.log('✅ 优化后的 price-matching.ts 已加载 - 新增调试日志和参数匹配优化');

import { ServerDatabaseUtils } from './server-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface PriceMatchResult {
  price: number;
  source: 'database' | 'knowledge' | 'estimate' | 'default' | 'market';
  confidence: number; // 0-100
  confidenceLevel?: '极高' | '高' | '中' | '低' | '极低'; // 新增：置信度等级
  productName?: string;
  model?: string;
  sourceId?: string;
  sourceUrl?: string;
  marketPrice?: number; // 市场价兜底
  marketSource?: string; // 市场价来源
  // 完整数据库字段
  brand?: string; // 品牌
  parameterDescription?: string; // 参数描述
  costPrice?: number; // 成本价
  minPrice?: number; // 最低售价
  description?: string; // 完整描述
  currency?: string; // 货币单位（CNY、USD等）
  category?: string; // 产品分类
  // 多品牌对比字段
  supplier?: string;
  contactPhone?: string;
  bidAmount?: number;
  quoteCount?: number;
  rating?: number;
  responseTime?: number;
  tags?: string[];
  // 新增：模糊查询标记
  needsConfirmation?: boolean; // 是否需要用户确认产品类别
  possibleCategories?: string[]; // 可能的产品类别列表
  matchedBy?: string; // 新增：匹配方式（如 '精确匹配'、'名称+型号+参数'、'参数关键词'等）
  matchLevel?: number; // 新增：1-6匹配级别
  matchDetails?: { // 新增：匹配详情
    nameScore: number;
    modelScore: number;
    paramScore: number;
    numberAdjustment: number;
  };
  alternatives?: Array<{ // 新增：备选产品
    price: number;
    productName: string;
    model: string;
    confidence: number;
  }>;
  // 新增：所有匹配的产品（包含推荐产品）
  matchedProducts?: Array<{
    price: number;
    productName: string;
    model: string;
    confidence: number;
    brand?: string;
    parameterDescription?: string;
    matchLevel?: number;
    matchedBy?: string;
    isRecommended?: boolean; // 是否为推荐产品（第一个）
    parameters?: Record<string, any>; // 提取的参数（minPrice, guidePrice, flowRate 等）
    // 多品牌对比字段
    supplier?: string;
    contactPhone?: string;
    bidAmount?: number;
    quoteCount?: number;
    rating?: number;
    responseTime?: number;
    tags?: string[];
  }>;
}

export interface ProductMatch {
  name: string;
  productName?: string;  // 新增：与name兼容
  model?: string;
  category?: string;
  parameter_description?: string;
  params?: string;  // 新增：与parameter_description兼容
  brand?: string;  // 新增
  quantity?: number;
  unit?: string;
  numbers?: number[];  // 新增
  units?: string[];  // 新增
}

export class PriceMatcher {
  // 跟踪已输出的错误，避免重复输出
  private static loggedErrors: Set<string> = new Set();

  // 中文数字映射表
  private static chineseNumberMap: Record<string, string> = {
    '零': '0', '一': '1', '二': '2', '三': '3', '四': '4',
    '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
    '十': '10', '百': '100', '千': '1000', '万': '10000'
  };

  // 单位映射表
  private static unitMap: Record<string, string> = {
    '立方': 'm³', '立方米': 'm³', '方': 'm³',
    '升': 'L', '公升': 'L',
    '米': 'm', '公尺': 'm', '毫米': 'mm', '厘米': 'cm',
    '千瓦': 'kW', '瓦': 'W', '马力': 'HP'
  };

  private static shouldLogError(prefix: string, error: any): boolean {
    const errorKey = `${prefix}-${error.code}-${error.message}`;
    if (this.loggedErrors.has(errorKey)) {
      return false;
    }
    this.loggedErrors.add(errorKey);
    return true;
  }

  /**
   * 提取单位
   */
  private static extractUnits(input: string): string[] {
    const unitPattern = /(个|台|套|m³|L|kW|吨|千克|米|厘米)/g;
    return input.match(unitPattern) || [];
  }

  /**
   * 提取数字
   */
  private static extractNumbers(input: string): number[] {
    const numberPattern = /\d+(\.\d+)?/g;
    return (input.match(numberPattern) || []).map(Number);
  }

  /**
   * 输入预处理（按照用户要求实现）
   * - 中文数字转换（一→1，两→2）
   * - 单位标准化（立方→m³，升→L）
   * - 数字提取
   */
  private static preprocessInput(input: string): {
    original: string;
    normalized: string;
    units: string[];
    numbers: number[];
  } {
    if (!input) return { original: '', normalized: '', units: [], numbers: [] };

    let normalized = input.toLowerCase()
      .replace(/[的\s]/g, '');  // 去掉"的"和空格

    // 中文数字转换（支持"两"）
    const chineseNumberMap: Record<string, string> = {
      '一': '1', '二': '2', '两': '2', '三': '3', '四': '4',
      '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10'
    };

    const chineseNumbers = Object.keys(chineseNumberMap);
    chineseNumbers.forEach(cn => {
      normalized = normalized.replace(new RegExp(cn, 'g'), chineseNumberMap[cn]);
    });

    // 单位标准化
    normalized = normalized.replace(/立方|立方米/g, 'm³');
    normalized = normalized.replace(/升/g, 'L');
    normalized = normalized.replace(/千瓦/g, 'kW');

    // 识别单位
    const units = this.extractUnits(input);

    // 识别数字
    const numbers = this.extractNumbers(input);

    return {
      original: input,
      normalized,
      units,
      numbers
    };
  }

  /**
   * 数字匹配调整（按照用户要求实现）
   * - 完全匹配（数字相同且顺序一致）：奖励20%
   * - 数字存在但顺序不同：奖励10%
   * - 部分匹配：惩罚15%
   * - 完全不匹配：惩罚30%
   */
  private static adjustScoreByNumberMatch(
    product: any,
    query: ProductMatch,
    baseScore: number
  ): number {
    // 提取产品中的数字
    const productNumbers = this.extractNumbers(
      (product.model || '') + ' ' + (product.parameter_description || '')
    );

    // 从预处理结果中获取查询数字
    const queryNumbers: number[] = [];
    const queryText = `${query.model || ''} ${query.parameter_description || ''}`;
    const queryNumMatches = queryText.match(/\d+(\.\d+)?/g);
    if (queryNumMatches) {
      queryNumbers.push(...queryNumMatches.map(n => parseFloat(n)));
    }

    if (queryNumbers.length === 0) return baseScore;

    // 数字完全匹配且顺序一致
    const exactMatch = queryNumbers.every((qn: number, i: number) =>
      productNumbers[i] !== undefined && Math.abs(productNumbers[i] - qn) < 0.01
    );

    if (exactMatch) {
      console.log('[PriceMatcher] 数字完全匹配且顺序一致，奖励20%');
      return baseScore * 1.2; // 奖励20%
    }

    // 数字存在但顺序不同
    const allPresent = queryNumbers.every((qn: number) =>
      productNumbers.some((pn: number) => Math.abs(pn - qn) < 0.01)
    );

    if (allPresent) {
      console.log('[PriceMatcher] 数字存在但顺序不同，奖励10%');
      return baseScore * 1.1; // 奖励10%
    }

    // 部分匹配
    const somePresent = queryNumbers.some((qn: number) =>
      productNumbers.some((pn: number) => Math.abs(pn - qn) < 0.01)
    );

    if (!somePresent) {
      console.log('[PriceMatcher] 数字完全不匹配，惩罚30%');
      return baseScore * 0.7; // 完全不匹配，惩罚30%
    }

    console.log('[PriceMatcher] 数字部分匹配，惩罚15%');
    return baseScore * 0.85; // 部分匹配，惩罚15%
  }

  /**
   * 获取置信度等级
   */
  private static getConfidenceLevel(confidence: number): '极高' | '高' | '中' | '低' | '极低' {
    const score = confidence / 100; // 转换为0-1范围
    if (score >= 0.9) return '极高';
    if (score >= 0.7) return '高';
    if (score >= 0.5) return '中';
    if (score >= 0.3) return '低';
    return '极低';
  }

  /**
   * 获取匹配方式说明
   */
  private static getMatchedByDescription(level: number): string {
    const descriptions: Record<number, string> = {
      1: '精确匹配（名称+型号+参数）',
      1.2: '名称+型号+参数模糊匹配',
      1.5: '名称+参数描述匹配',
      2: '名称+型号精确匹配',
      2.5: '名称+型号模糊匹配',
      3: '名称模糊+型号模糊',
      3.5: '名称+参数关键词匹配',
      3.6: '参数关键词匹配',
      4: '仅名称匹配',
      5: '仅型号匹配',
      6: '仅参数描述匹配'
    };
    return descriptions[level] || '未知匹配方式';
  }

  /**
   * 获取置信度颜色（用于前端）
   */
  private static getConfidenceColor(level: string): string {
    const colors: Record<string, string> = {
      '极高': 'green',
      '高': 'light-green',
      '中': 'yellow',
      '低': 'orange',
      '极低': 'red'
    };
    return colors[level] || 'gray';
  }

  /**
   * 检测产品类别是否明确
   * 当用户只提供参数（如"功率：300KW，柴油机型号：六缸"）而没有明确产品类别时，
   * 需要先询问用户确认具体需求
   * 
   * @param product 产品信息
   * @returns true 表示类别明确，false 表示需要确认
   */
  static isProductCategoryClear(product: ProductMatch): boolean {
    console.log('[PriceMatcher] ========== 检测产品类别是否明确 ==========');
    console.log('[PriceMatcher] 产品名称:', product.name);
    console.log('[PriceMatcher] 产品型号:', product.model);

    // 第一步：检测是否是反馈/确认文本
    const feedbackPatterns = [
      /当["'].+时你要/, /确认/, /确定/, /这样才是/, /这样才算/,
      /请问你/, /你是否/, /你需要/, /你要不要/,
      /咨询/, /了解/, /想要/, /需要/, /购买/,
      /没有明确指定/, /到底是想/, /时你要我/,
      /应该/, /应该先/, /是否应该/,
      /人性化/, /智能/, /合理/
    ];

    for (const pattern of feedbackPatterns) {
      if (pattern.test(product.name)) {
        console.log('[PriceMatcher] ⚠️ 检测到反馈或确认文本，产品类别不明确');
        return false;
      }
    }

    // 第一步扩展：检测询问句和指代词（如"这参数"、"这个产品"、"能告诉我"等）
    const questionPatterns = [
      /这.+参数/, /这.+产品/, /这.+型号/, /这.+规格/, // 指代词
      /能告诉/, /可以告诉/, /能否告诉/, /帮我看看/, // 询问类
      /好像有/, /可能有/, /应该有/, /是不是/, // 推测类
      /有没有/, /有没有卖/, /有吗/, /有卖吗/, // 存在性询问
      /产库/, /库里/, /产品库/, /资料库/, // 库类词汇（"产库"可能是错别字）
      /满足.+的/, /符合.+的/, /匹配.+的/, // 匹配类
      /告诉我/, /告诉我/, /请问/, /问一下/ // 直接询问
    ];

    for (const pattern of questionPatterns) {
      if (pattern.test(product.name)) {
        console.log('[PriceMatcher] ⚠️ 检测到询问句或指代词，产品类别不明确');
        return false;
      }
    }

    // 第二步：检测是否是纯参数描述（如"功率：300KW，柴油机型号：六缸"）
    // 检查是否包含冒号（参数描述的特征）
    const hasColon = product.name.includes(':') || product.name.includes('：');
    
    // 参数关键词
    const paramKeywords = ['功率', '电压', '电流', '转速', '流量', '扬程', '压力', 
                          '温度', '容量', '规格', '型号', '材质', '尺寸', '重量',
                          'kw', 'w', 'v', 'a', 'rpm', 'mpa', 'bar'];
    
    const hasParamKeywords = paramKeywords.some(keyword => 
      product.name.toLowerCase().includes(keyword.toLowerCase())
    );

    // 查询意图关键词（表示用户明确想查询产品）
    const queryIntentKeywords = [
      '我要', '我要买', '我想买', '想买', '要买', // 明确购买意图
      '查询', // 明确查询意图
      '报价', // 明确报价意图
      '这个是', '这个是.*吗', // 确认这个是什么
      '我要.*的' // 我要某个产品
    ];

    const hasQueryIntent = queryIntentKeywords.some(keyword => 
      product.name.toLowerCase().includes(keyword.toLowerCase())
    );

    // 如果包含冒号和参数关键词，但没有明确的查询意图，可能是参数描述
    if (hasColon && hasParamKeywords && !hasQueryIntent) {
      console.log('[PriceMatcher] ⚠️ 检测到参数描述特征（冒号+参数关键词），但无明确查询意图');
      
      // 检查是否以产品名称开头（如"化粪池：功率：300KW"）
      const productTypes = [
        '发电机组', '发电机', '发动机', '柴油机', '汽油机',
        '水泵', '油泵', '水泵组', '化粪池', '搅拌罐', '搅拌机',
        '反应釜', '混合机', '搅拌器', '换热器', '冷却器',
        '管', '阀门', '泵', '电机', '压缩机', '空压机', '空气压缩机', '风机',
        '输送机', '提升机', '破碎机', '筛分机', '过滤器',
        '分离器', '干燥机', '烘干机', '粉碎机', '磨粉机',
        '成型机', '包装机', '封口机', '贴标机', '喷码机'
      ];

      // 检查第一个冒号前面是否有产品类型词
      const firstColonIndex = Math.max(product.name.indexOf(':'), product.name.indexOf('：'));
      if (firstColonIndex > 0) {
        const beforeColon = product.name.substring(0, firstColonIndex);
        const hasProductTypeBeforeColon = productTypes.some(type => 
          beforeColon.includes(type)
        );
        
        if (hasProductTypeBeforeColon) {
          console.log('[PriceMatcher] ✅ 冒号前有明确的产品类型词，类别明确');
          return true;
        }
      }
      
      console.log('[PriceMatcher] ⚠️ 参数描述中未检测到明确的产品类型词，需要确认');
      return false;
    }

    // 第三步：检查产品名称长度和结构
    const cleanedName = this.cleanProductName(product.name);
    
    // 如果产品名称太长（>30字）且包含冒号、引号等标点，可能是多行描述或复制粘贴
    const isLongText = product.name.length > 30 && 
      (product.name.includes(':') || product.name.includes('：') || 
       product.name.includes('"') || product.name.includes("'"));
    
    if (isLongText) {
      console.log('[PriceMatcher] ⚠️ 产品名称过长且包含标点，可能是描述文本');
      
      // 检查是否包含明确的产品类型词
      const productTypes = [
        '发电机组', '发电机', '发动机', '柴油机', '汽油机',
        '水泵', '油泵', '水泵组', '化粪池', '搅拌罐', '搅拌机',
        '反应釜', '混合机', '搅拌器', '换热器', '冷却器',
        '管', '阀门', '泵', '电机', '压缩机', '空压机', '空气压缩机', '风机'
      ];

      const hasProductType = productTypes.some(type => 
        product.name.toLowerCase().includes(type.toLowerCase())
      );

      // 如果没有明确的产品类型词，返回 false
      if (!hasProductType) {
        console.log('[PriceMatcher] ⚠️ 未检测到明确的产品类型词');
        return false;
      }
      
      // 即使有产品类型词，但如果它在引号里或描述性语句中，也可能是示例文本
      if (product.name.includes("'") || product.name.includes('"')) {
        console.log('[PriceMatcher] ⚠️ 产品类型词可能在引号中，可能是示例文本');
        return false;
      }
    }

    // 第四步：检查是否只有参数描述而没有产品名称（无冒号的情况）
    // 如果清理后的名称很短（<=6个字）且包含参数关键词，说明可能只是参数描述
    if (cleanedName.length <= 6 && hasParamKeywords && !hasQueryIntent) {
      console.log('[PriceMatcher] ⚠️ 产品名称过短且包含参数关键词，可能是参数描述');
      return false;
    }

    // 第五步：正常的产品名称检测
    // 如果产品名称包含明确的产品类型词，则认为类别明确
    // 使用通用后缀匹配替代有限白名单，避免遗漏产品类型
    const productTypeSuffixes = [
      '发电机组', '发电机', '发动机', '柴油机', '汽油机',
      '水泵', '油泵', '水泵组', '化粪池', '搅拌罐', '搅拌机',
      '反应釜', '混合机', '搅拌器', '换热器', '冷却器',
      '管', '阀门', '泵', '电机', '压缩机', '空压机', '空气压缩机', '风机',
      '输送机', '提升机', '破碎机', '筛分机', '过滤器',
      '分离器', '干燥机', '烘干机', '粉碎机', '磨粉机',
      '成型机', '包装机', '封口机', '贴标机', '喷码机',
      // 补充：水处理/环保/化工设备
      '发生器', '消毒设备', '加药装置', '加药设备', '清洗设备', '清洗机',
      '净水器', '净水设备', '纯水设备', '软化设备', '除垢设备',
      '除尘器', '除尘设备', '脱硫设备', '脱硝设备', '废气处理',
      '蒸发器', '冷凝器', '加热器', '锅炉', '燃烧器',
      '流量计', '压力表', '传感器', '控制器', '配电柜',
      '变频器', '变压器', '整流器', '逆变器',
      '电梯', '起重机', '行车', '叉车', '吊车',
      '电缆', '电线', '桥架', '线槽',
      '冷却塔', '空调', '制冷机', '冷库',
      '试验机', '检测仪', '分析仪', '记录仪',
      '摄像机', '监控', '报警器', '探测器',
    ];

    const hasProductType = productTypeSuffixes.some(type => 
      product.name.toLowerCase().includes(type.toLowerCase())
    );

    if (hasProductType) {
      console.log('[PriceMatcher] ✅ 产品类别明确，包含产品类型词');
      return true;
    }

    // 第六步：即使没有匹配到产品类型词，如果名称满足以下条件也认为类别明确：
    // 1. 名称长度 >= 4 个汉字（如"二氧化氯发生器"8字）
    // 2. 名称不以疑问词/指代词开头
    // 3. 名称不以动词开头（如"查询"、"看看"、"帮我"）
    const verbStarters = ['查询', '查找', '搜索', '帮我', '我想', '请', '有没有', '了解', '咨询', '看看', '找'];
    const startsWithVerb = verbStarters.some(v => product.name.startsWith(v));
    const hasQuestionMark = product.name.includes('?') || product.name.includes('？');
    
    const chineseCharCount = (product.name.match(/[一-鿿]/g) || []).length;
    
    if (!startsWithVerb && !hasQuestionMark && chineseCharCount >= 4) {
      console.log('[PriceMatcher] ✅ 产品名称满足通用条件（长度>=4汉字，非疑问/指代），类别明确');
      return true;
    }

    console.log('[PriceMatcher] ⚠️ 产品类别不明确，未检测到产品类型词');
    return false;
  }

  /**
   * 获取可能的产品类别列表
   * 基于参数描述推断可能的产品类别
   */
  static getPossibleCategories(product: ProductMatch): string[] {
    const categories: string[] = [];

    const fullText = `${product.name} ${product.model || ''} ${product.parameter_description || ''}`.toLowerCase();

    // 根据参数关键词推断可能的类别
    if (fullText.includes('功率') && (fullText.includes('kw') || fullText.includes('瓦'))) {
      if (fullText.includes('发电机') || fullText.includes('柴油')) {
        categories.push('柴油发电机组');
        categories.push('柴油发动机');
      }
    }

    if (fullText.includes('流量') || fullText.includes('扬程') || fullText.includes('水泵')) {
      categories.push('水泵');
      categories.push('水泵组');
    }

    if (fullText.includes('化粪池') || fullText.includes('立方') || fullText.includes('方')) {
      categories.push('化粪池');
      categories.push('储水罐');
    }

    if (fullText.includes('搅拌') || fullText.includes('混合')) {
      categories.push('搅拌罐');
      categories.push('搅拌机');
    }

    return categories;
  }

  /**
   * 多级价格匹配（优化版）
   * 1. 产品库优先（置信度 90-100）- 最高优先级
   * 2. 知识库次之（置信度 60-80）
   * 3. 市场价兜底（置信度 40-50）- 新增兜底
   * 4. 按类别估算（置信度 30-40）
   * 5. 默认兜底（置信度 20-30）
   */
  static async matchPrice(
    product: ProductMatch,
    userId?: string
  ): Promise<PriceMatchResult> {
    console.log('[PriceMatcher] ========== 开始价格匹配 ==========');
    console.log('[PriceMatcher] 产品信息:', product);

    // 检测产品类别是否明确
    if (!this.isProductCategoryClear(product)) {
      console.log('[PriceMatcher] ⚠️ 产品类别不明确，需要用户确认');
      
      const possibleCategories = this.getPossibleCategories(product);
      console.log('[PriceMatcher] 可能的产品类别:', possibleCategories);

      return {
        price: 0,
        source: 'default',
        confidence: 20,
        productName: product.name,
        needsConfirmation: true,
        possibleCategories: possibleCategories
      };
    }

    // 第1级：产品库匹配（最高优先级）
    const dbResult = await this.matchFromDatabase(product);
    if (dbResult) {
      console.log('[PriceMatcher] ✅ 产品库匹配成功:', dbResult);
      return dbResult;
    }

    // 第2级：知识库匹配（历史报价、案例）
    const knowledgeResult = await this.matchFromKnowledge(product, userId);
    if (knowledgeResult) {
      console.log('[PriceMatcher] ✅ 知识库匹配成功:', knowledgeResult);
      return knowledgeResult;
    }

    // 第3级：市场价兜底（新增）
    const marketResult = await this.matchFromMarket(product);
    if (marketResult) {
      console.log('[PriceMatcher] ✅ 市场价兜底成功:', marketResult);
      return marketResult;
    }

    // 第4级：按类别估算
    const estimateResult = this.estimateByCategory(product);
    if (estimateResult) {
      console.log('[PriceMatcher] ⚠️ 使用类别估算:', estimateResult);
      return estimateResult;
    }

    // 第5级：默认兜底
    const defaultResult = this.getDefaultPrice();
    console.log('[PriceMatcher] ⚠️ 使用默认价格:', defaultResult);
    return defaultResult;
  }

  /**
   * 清理产品名称，移除规格描述，保留核心产品名称
   *
   * 支持的清理规则（按优先级）：
   * 1. 容量规格（立方、立方米、m³等）
   * 2. 管径规格（DN、Φ等）
   * 3. 尺寸规格（长×宽×高）
   * 4. 常见规格关键词
   * 5. 括号内容
   */
  private static cleanProductName(name: string): string {
    if (!name) return name;

    let cleaned = name;

    // 1. 移除容量规格（最优先，避免干扰其他规则）
    // 支持：2立方、2立方米、2m³、2m3、2方、两立方、二立方等
    cleaned = cleaned.replace(/\d+(\.\d+)?\s*(立方|立方米|m³|m3|方)\b/gi, '');
    cleaned = cleaned.replace(/[一两二三四五六七八九十百千万亿]+\s*立方(米)?\b/g, '');

    // 2. 移除管径规格（DN数字、Φ数字、英寸规格）
    cleaned = cleaned.replace(/\b(DN|Φ|inch|\")\s*\d+(\.\d+)?\b/gi, '');

    // 3. 移除尺寸规格（长×宽×高、长度单位）
    cleaned = cleaned.replace(/\d+(\.\d+)?\s*[×x*]\s*\d+(\.\d+)?(\s*[×x*]\s*\d+(\.\d+)?)?/g, '');
    cleaned = cleaned.replace(/\d+(\.\d+)?\s*(mm|cm|m|米|毫米|厘米)\b/gi, '');

    // 4. 移除材质描述（但保留材质作为产品名的一部分，如PVC管）
    // 不移除 PVC-U、FRP 等材质标识

    // 5. 移除常见规格关键词（注意：不移除"管"、"阀"、"泵"、"器"、"机"等产品类型核心字）
    cleaned = cleaned.replace(/\b(重型|轻型|标准|加强|普通|防水|耐腐蚀|密封|C20|座|台|套|件|个|只|支)\b/gi, '');

    // 6. 移除括号内的内容（规格说明）
    cleaned = cleaned.replace(/（[^）]*）/g, '');
    cleaned = cleaned.replace(/\([^)]*\)/g, '');

    // 7. 清理多余空格和符号
    cleaned = cleaned.trim()
      .replace(/\s+/g, ' ')
      .replace(/[，,、；;。]/g, '');

    return cleaned;
  }

  /**
   * 提取产品关键词（万能匹配关键）
   * 从产品名称中提取核心关键词，用于宽泛匹配
   *
   * 策略：
   * 1. 提取所有中文词（2个字以上）
   * 2. 提取英文单词（3个字母以上）
   * 3. 保留品牌名、产品类型名
   * 4. 过滤常见无意义词
   */
  private static extractKeywords(name: string): string[] {
    if (!name) return [];

    // 先检查是否是反馈文本或确认文本
    const feedbackPatterns = [
      /当[""].+时你要/, /确认/, /确定/, /这样才是/, /这样才算/,
      /请问你/, /你是否/, /你需要/, /你要不要/,
      /咨询/, /了解/, /想要/, /需要/, /购买/,
      /没有明确指定/, /到底是想/
    ];

    for (const pattern of feedbackPatterns) {
      if (pattern.test(name)) {
        console.log('[PriceMatcher] 检测到反馈或确认文本，不提取关键词');
        return [];
      }
    }

    const keywords: string[] = [];

    // 1. 提取中文词（2个字以上的有意义词汇）
    // 匹配连续的中文字符
    const chineseMatches = name.match(/[\u4e00-\u9fa5]{2,}/g);
    if (chineseMatches) {
      // 过滤掉常见无意义词（扩展版）
      const stopWords = new Set([
        // 产品相关
        '设备', '机器', '装置', '系统', '配件', '组件', '部件',
        '产品', '商品', '物品', '用品', '工具', '器材',
        // 商业相关
        '有限公司', '厂家', '生产', '制造', '销售', '批发', '零售',
        // 价格相关
        '价格', '报价', '多少钱', '哪里有', '哪里买',
        // 询问相关
        '请问', '咨询', '了解', '需要', '想要', '购买',
        // 确认相关
        '确认', '确定', '这样才是', '这样才算', '是否',
        // 反馈相关
        '没有明确指定', '到底是想', '时你要我',
        // 动词
        '进行', '确定', '咨询', '需要', '想要', '了解', '可以',
        // 形容词
        '明确', '明确指定', '比较', '比较人性化'
      ]);

      chineseMatches.forEach(word => {
        if (!stopWords.has(word) && word.length >= 2) {
          keywords.push(word);
        }
      });
    }

    // 2. 提取英文单词和缩写（如 FC, PVC, PE, LED 等）
    const englishMatches = name.match(/[A-Za-z]{2,}/g);
    if (englishMatches) {
      englishMatches.forEach(word => {
        // 保留所有英文缩写和品牌名
        const upperWord = word.toUpperCase();
        if (!keywords.includes(upperWord)) {
          keywords.push(upperWord);
        }
      });
    }

    // 3. 提取数字（可能表示型号或规格）
    const numberMatches = name.match(/\d+/g);
    if (numberMatches) {
      numberMatches.forEach(num => {
        // 保留较大的数字（可能是型号）
        if (parseInt(num) >= 10 && !keywords.includes(num)) {
          keywords.push(num);
        }
      });
    }

    // 过滤掉过长或无意义的关键词
    const validKeywords = keywords.filter(keyword => {
      // 关键词长度不能超过15个字
      if (keyword.length > 15) return false;
      
      // 不能全是常见字符
      if (/^[确定咨询需要想要了解可以是否明确比较]+$/.test(keyword)) return false;
      
      return true;
    });

    console.log('[PriceMatcher] 提取的关键词:', validKeywords);
    return validKeywords;
  }

  /**
   * 提取参数描述关键词（多维度匹配关键）
   * 从参数描述中提取技术规格关键词
   *
   * 策略：
   * 1. 提取关键规格（容量、尺寸、材质等）
   * 2. 提取技术参数（功率、电压、转速等）
   * 3. 提取材质关键词
   * 4. 保留数字和单位组合
   */
  private static extractSpecKeywords(paramDescription: string): string[] {
    if (!paramDescription) return [];

    const keywords: string[] = [];

    // 1. 提取数字+单位组合（如 1m³、DN100、200W 等）
    const numUnitMatches = paramDescription.match(/\d+(\.\d+)?\s*(m³|m3|立方|立方米|mm|cm|m|米|毫米|厘米|DN|W|KW|V|KV|A|rpm|L|升|吨|方|公斤|kg|kgf|bar|MPa|帕)/gi);
    if (numUnitMatches) {
      numUnitMatches.forEach(match => {
        keywords.push(match.toUpperCase());
      });
    }

    // 2. 提取材质关键词（PVC、不锈钢、碳钢等）
    const materialMatches = paramDescription.match(/(不锈钢|碳钢|PVC|PE|PP|ABS|PVC-U|UPVC|FRP|玻璃钢|铸铁|铝合金|铜|聚乙烯|聚丙烯)/gi);
    if (materialMatches) {
      materialMatches.forEach(match => {
        const upperMatch = match.toUpperCase();
        if (!keywords.includes(upperMatch)) {
          keywords.push(upperMatch);
        }
      });
    }

    // 3. 提取关键参数词
    const paramMatches = paramDescription.match(/(功率|电压|电流|转速|流量|扬程|压力|温度|容量|规格|型号|材质|尺寸|重量|效率)/g);
    if (paramMatches) {
      paramMatches.forEach(match => {
        if (!keywords.includes(match)) {
          keywords.push(match);
        }
      });
    }

    // 4. 提取较大的纯数字（可能表示容量、尺寸等）
    const numMatches = paramDescription.match(/\b\d{3,}\b/g);
    if (numMatches) {
      numMatches.forEach(num => {
        if (!keywords.includes(num)) {
          keywords.push(num);
        }
      });
    }

    console.log('[PriceMatcher] 提取的参数关键词:', keywords);
    return keywords;
  }

  /**
   * 从产品描述解析产品参数
   * 从 description 或 parameter_description 中提取结构化参数
   */
  static parseProductDescription(description: string): any {
    const params: any = {};

    if (!description) return params;

    // 调试日志
    console.log('[PriceMatcher] 解析参数描述:', description);

    // 解析控制方式
    if (description.includes('永磁变频')) {
      params.controlType = '永磁变频';
    } else if (description.includes('工频')) {
      params.controlType = '工频';
    }

    // 解析储气罐类型
    if (description.includes('单储气罐')) {
      params.tankType = '单储气罐';
    } else if (description.includes('双储气罐')) {
      params.tankType = '双储气罐';
    }

    // 解析功率
    const powerMatch = description.match(/功率[：:]?\s*(\d+(?:\.\d+)?)\s*KW/i);
    if (powerMatch) {
      params.power = parseFloat(powerMatch[1]);
    }

    // 解析工作压力
    const pressureMatch = description.match(/工作压力[：:]?\s*(\d+(?:\.\d+)?)\s*Mpa/i);
    if (pressureMatch) {
      params.pressure = parseFloat(pressureMatch[1]);
      console.log('[PriceMatcher] 解析到工作压力:', params.pressure);
    }

    // 解析排气量（必须能匹配 "排气量：0.5 m³/min" 这种格式）
    const flowMatch = description.match(/排气量[：:]?\s*(\d+(?:\.\d+)?)\s*m³\/min/i);
    if (flowMatch) {
      params.flowRate = parseFloat(flowMatch[1]);
      console.log('[PriceMatcher] 解析到排气量:', params.flowRate);
    }

    // 解析电压
    const voltageMatch = description.match(/电压[：:]?\s*(\d+)V/i);
    if (voltageMatch) {
      params.voltage = `${voltageMatch[1]}V`;
      console.log('[PriceMatcher] 解析到电压:', params.voltage);
    }

    // 解析重量
    const weightMatch = description.match(/重量[：:]?\s*(\d+)\s*Kg/i);
    if (weightMatch) {
      params.weight = parseInt(weightMatch[1]);
    }

    // 解析尺寸
    const sizeMatch = description.match(/尺寸[：:]?\s*([\d\*\s]+)mm/i);
    if (sizeMatch) {
      params.dimensions = sizeMatch[1].trim();
    }

    return params;
  }

  /**
   * 多维度相似度计算（优化版）
   * 权重分配：
   * - 产品名称: 35%
   * - 规格型号: 30%
   * - 参数描述: 20%
   * - 产品分类: 10% (如果匹配)
   * - 品牌: 5% (如果匹配)
   */
  private static calculateMultiDimensionalSimilarity(target: ProductMatch, product: any): number {
    let score = 0;

    // 1. 名称相似度 (35%)
    const nameScore = this.calculateNameSimilarity(target.name || target.productName || '', product.name || '');
    score += nameScore * 0.35;

    // 2. 型号相似度 (30%)
    const modelScore = this.calculateModelSimilarity(target.model || '', product.model || '');
    score += modelScore * 0.30;

    // 3. 参数描述相似度 (20%)
    const targetParams = target.params || target.parameter_description || '';
    const specScore = this.calculateSpecSimilarity(
      targetParams,
      product.parameter_description || ''
    );
    score += specScore * 0.20;

    // 4. 分类匹配加分 (10%)
    const targetCategory = target.category || product.category;
    if (targetCategory && product.category) {
      // 完全匹配得满分，部分匹配得一半
      const categoryMatch = product.category === targetCategory ? 1.0 : 0.5;
      score += categoryMatch * 0.10;
    }

    // 5. 品牌匹配加分 (5%)
    const targetBrand = target.brand || product.brand;
    if (targetBrand && product.brand) {
      // 完全匹配得满分，部分匹配得一半
      const brandMatch = product.brand === targetBrand ? 1.0 : 0.5;
      score += brandMatch * 0.05;
    }

    // 应用数字匹配惩罚/奖励机制
    const finalScore = this.adjustScoreByNumberMatch(product, target, score);

    // 确保分数不超过1
    return Math.min(finalScore, 1);
  }

  /**
   * 计算产品名称相似度
   */
  private static calculateNameSimilarity(targetName: string, productName: string): number {
    if (!targetName || !productName) return 0;

    // 清理名称
    const cleanedTarget = this.cleanProductName(targetName);
    const cleanedProduct = this.cleanProductName(productName);

    // 完全相同
    if (cleanedTarget.toLowerCase() === cleanedProduct.toLowerCase()) {
      return 1.0;
    }

    // 包含关系
    if (cleanedTarget.toLowerCase().includes(cleanedProduct.toLowerCase()) ||
        cleanedProduct.toLowerCase().includes(cleanedTarget.toLowerCase())) {
      return 0.9;
    }

    // 计算相似度
    return this.calculateSimilarity(cleanedTarget.toLowerCase(), cleanedProduct.toLowerCase());
  }

  /**
   * 计算规格型号相似度
   */
  private static calculateModelSimilarity(targetModel: string, productModel: string | number): number {
    if (!targetModel) return 0;
    if (!productModel && productModel !== 0) return 0;

    // 标准化型号
    const normalizedTarget = this.normalizeModel(targetModel);
    const normalizedProduct = this.normalizeModel(String(productModel));

    if (!normalizedTarget || !normalizedProduct) return 0;

    // 完全相同
    if (normalizedTarget.toLowerCase() === normalizedProduct.toLowerCase()) {
      return 1.0;
    }

    // 数字比较
    const targetNum = parseFloat(normalizedTarget);
    const productNum = parseFloat(normalizedProduct);
    if (!isNaN(targetNum) && !isNaN(productNum) && targetNum === productNum) {
      return 0.95;
    }

    // 包含关系（谨慎使用，避免错误匹配）
    if (normalizedTarget.length > 2 && normalizedProduct.length > 2) {
      if (normalizedTarget.toLowerCase().includes(normalizedProduct.toLowerCase()) ||
          normalizedProduct.toLowerCase().includes(normalizedTarget.toLowerCase())) {
        return 0.6;
      }
    }

    return 0;
  }

  /**
   * 计算参数描述相似度
   */
  private static calculateSpecSimilarity(targetSpec: string, productSpec: string): number {
    if (!targetSpec || !productSpec) return 0;

    // 提取关键词
    const targetKeywords = this.extractSpecKeywords(targetSpec);
    const productKeywords = this.extractSpecKeywords(productSpec);

    if (targetKeywords.length === 0 || productKeywords.length === 0) {
      // 如果没有提取到关键词，使用普通相似度计算
      return this.calculateSimilarity(targetSpec.toLowerCase(), productSpec.toLowerCase()) * 0.5;
    }

    // 计算关键词匹配度
    let matchCount = 0;
    targetKeywords.forEach(keyword => {
      if (productKeywords.some(pk => pk.toLowerCase() === keyword.toLowerCase())) {
        matchCount++;
      }
    });

    const matchRatio = matchCount / targetKeywords.length;

    // 完全匹配所有关键词
    if (matchRatio === 1.0) {
      return 1.0;
    }

    // 部分匹配
    return matchRatio;
  }

  /**
   * 关键词宽泛匹配（万能匹配核心）
   * 只要产品名称包含任意一个关键词，就认为匹配
   */
  private static async matchByKeywords(
    product: ProductMatch,
    keywords: string[]
  ): Promise<PriceMatchResult | null> {
    if (!keywords || keywords.length === 0) {
      return null;
    }

    const supabase = getSupabaseClient();
    const allMatches: any[] = [];

    console.log('[PriceMatcher] ========== 级别3.5：关键词宽泛匹配 ==========');

    // 为每个关键词执行匹配
    for (const keyword of keywords) {
      const query = supabase
        .from('products')
        .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
        .ilike('name', `%${keyword}%`)
        .limit(10);

      const { data: matches, error } = await query;
      if (!error && matches && matches.length > 0) {
        console.log(`[PriceMatcher] 关键词 "${keyword}" 匹配到 ${matches.length} 个产品`);
        allMatches.push(...matches);
      }
    }

    // 去重
    const uniqueMatches = this.deduplicateProducts(allMatches);
    console.log('[PriceMatcher] 关键词匹配去重后结果数量:', uniqueMatches.length);

    if (uniqueMatches.length > 0) {
      // 如果有型号，优先选择型号匹配的
      let bestMatch = uniqueMatches[0];
      if (product.model) {
        bestMatch = this.findBestMatch(uniqueMatches, product);
      } else {
        // 否则选择关键词匹配最多的
        bestMatch = this.findBestKeywordMatch(uniqueMatches, keywords);
      }

      console.log('[PriceMatcher] ✅ 级别3.5关键词匹配成功:', bestMatch.name, bestMatch.model);
      return this.buildPriceResult(bestMatch, 65);
    }

    return null;
  }

  /**
   * 产品去重（基于ID）
   */
  private static deduplicateProducts(products: any[]): any[] {
    const seen = new Set();
    return products.filter(p => {
      if (seen.has(p.id)) {
        return false;
      }
      seen.add(p.id);
      return true;
    });
  }

  /**
   * 根据关键词匹配度选择最佳产品
   */
  private static findBestKeywordMatch(products: any[], keywords: string[]): any {
    if (products.length === 0) return null;

    let bestProduct = products[0];
    let bestScore = 0;

    products.forEach(product => {
      let score = 0;
      const productName = product.name || '';

      // 计算关键词匹配数量
      keywords.forEach(keyword => {
        if (productName.toLowerCase().includes(keyword.toLowerCase())) {
          score += 10;
        }
      });

      // 长度匹配（名称越短越精确）
      score -= productName.length * 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    });

    return bestProduct;
  }

  /**
   * 标准化型号，将各种型号表达统一为标准格式
   *
   * 支持的标准化规则：
   * 1. 转换中文数字（如"六缸" -> "6缸"）
   * 2. 移除容量单位（保留数字）
   * 3. 移除长度单位（保留数字）
   * 4. 统一格式（去除空格，但保留连字符等特殊字符用于精确匹配）
   */
  private static normalizeModel(model: string | undefined): string | undefined {
    if (!model) return undefined;

    let normalized = model;

    // 新增：转换中文数字
    const chineseNumbers = Object.keys(this.chineseNumberMap);
    chineseNumbers.forEach(cn => {
      normalized = normalized.replace(new RegExp(cn, 'g'), this.chineseNumberMap[cn]);
    });

    // 标准化产量单位（g/h → g/h, kg/h → kg/h, t/h → t/h 等）
    // 这些单位不应该被移除，因为它们是型号的核心标识
    const productionRatePattern = /(\d+(?:\.\d+)?)\s*(g|kg|t|ml|l)\s*(\/\s*(h|min|s|d|hr|小时|分钟|秒|天))?/i;
    const productionMatch = normalized.match(productionRatePattern);
    if (productionMatch) {
      // 保留数字+单位+速率的完整格式，如 "50g/h"、"2kg/h"
      const num = productionMatch[1];
      const unit = productionMatch[2].toLowerCase();
      const rate = productionMatch[3] ? productionMatch[3].replace(/\s/g, '').toLowerCase() : '';
      normalized = `${num}${unit}${rate}`;
      console.log('[PriceMatcher] normalizeModel 产量型号标准化:', model, '->', normalized);
    } else {
      // 容量单位标准化：将各种容量单位统一为数据库中的 "m³" 格式
      // 数据库中 model 字段统一使用 "m³"（如 "5m³"、"25m³"、"100m³"）
      const volumeNormMap: [RegExp, string][] = [
        [/(\d+(?:\.\d+)?)\s*立方米/i, '$1m³'],
        [/(\d+(?:\.\d+)?)\s*立方/i, '$1m³'],
        [/(\d+(?:\.\d+)?)\s*方/i, '$1m³'],
        [/(\d+(?:\.\d+)?)\s*m3\b/i, '$1m³'],
      ];
      let volumeNormalized = false;
      for (const [pattern, replacement] of volumeNormMap) {
        if (pattern.test(normalized)) {
          normalized = normalized.replace(pattern, replacement);
          volumeNormalized = true;
          console.log('[PriceMatcher] normalizeModel 容量单位标准化:', model, '->', normalized);
          break;
        }
      }

      // 非容量单位：移除无关单位（长度、重量等）
      if (!volumeNormalized) {
        const irrelevantUnitPattern = /(毫米|mm|厘米|cm|米|m(?!³|3)|吨|升|L(?!M)|ML|kg|g|万|亿|瓦|W|伏|V|安|A|Hz)$/i;
        if (irrelevantUnitPattern.test(normalized)) {
          const numberMatch = normalized.match(/(\d+(\.\d+)?)/);
          if (numberMatch) {
            normalized = numberMatch[1];
          }
        }
      }
    }

    // 清理多余空格，但保留连字符和字母
    normalized = normalized.trim()
      .replace(/\s+/g, '');

    return normalized || undefined;
  }

  /**
   * 收集所有匹配的产品（用于返回多个结果）
   * 
   * @returns 所有匹配的产品，按匹配级别排序
   */
  private static async collectAllMatches(
    product: ProductMatch
  ): Promise<Array<{
    product: any;
    confidence: number;
    matchLevel: number;
    matchedBy: string;
    matchDetails?: any;
  }>> {
    // 调试日志
    console.log('[PriceMatcher] collectAllMatches 被调用, 查询参数:', JSON.stringify(product));

    const allMatches: Array<{
      product: any;
      confidence: number;
      matchLevel: number;
      matchedBy: string;
      matchDetails?: any;
    }> = [];

    let cleanedName = this.cleanProductName(product.name);
    let normalizedModel = this.normalizeModel(product.model);
    let paramDesc = product.parameter_description || '';
    const supabase = getSupabaseClient();

    // ========== 参数识别：如果 model 是参数值（非型号），重定向到参数搜索 ==========
    // 典型参数格式：1.1 m³/min, 0.8 MPa, 5.5KW, 220V 等
    const parameterModelPattern = /\d+(?:\.\d+)?\s*(m[³3]\s*\/\s*min|MPa|Mpa|mpa|KW|kW|kw|伏|V|bar|巴|Hz)/i;
    let isParamQuery = false; // 标记是否为参数型查询
    let originalParamModel: string | undefined; // 保存原始参数值
    let paramTypeName = ''; // 参数类型名（排气量/工作压力/功率等）

    if (normalizedModel && parameterModelPattern.test(normalizedModel)) {
      console.log('[PriceMatcher] 检测到参数型 model（非型号）:', normalizedModel, '→ 转入参数搜索');
      isParamQuery = true;

      // 将 model 内容并入 parameter_description，model 置空
      product.parameter_description = paramDesc ? `${paramDesc}，${normalizedModel}` : normalizedModel;
      product.model = undefined;
      originalParamModel = normalizedModel;
      normalizedModel = undefined;
      paramDesc = product.parameter_description;

      // 根据单位判断参数类型
      const paramTypeMap: [RegExp, string][] = [
        [/m[³3]\s*\/\s*min/i, '排气量'],
        [/MPa|Mpa|mpa/i, '工作压力'],
        [/KW|kW|kw/i, '功率'],
        [/伏|V(?!$)/i, '电压'],
      ];
      for (const [pattern, name] of paramTypeMap) {
        if (pattern.test(originalParamModel || '')) {
          paramTypeName = name;
          break;
        }
      }

      console.log('[PriceMatcher] 参数搜索模式: name=', cleanedName, ', type=', paramTypeName, ', value=', originalParamModel);
    }

    // 辅助函数：去重添加到结果列表
    const addMatches = (
      products: any[] | null | undefined,
      confidence: number,
      matchLevel: number,
      matchedBy: string
    ) => {
      if (!products || products.length === 0) return;

      products.forEach(dbProduct => {
        // 参数型查询时，低级别匹配必须限制在同一产品名下
        // 防止 "空压机排气量1.1" 回退到 "化粪池" 等无关产品
        if (isParamQuery && matchLevel >= 2 && cleanedName) {
          const dbName = (dbProduct.name || '').toLowerCase();
          const searchName = cleanedName.toLowerCase();
          if (!dbName.includes(searchName) && !searchName.includes(dbName)) {
            return;
          }
        }

        const exists = allMatches.some(m => m.product.id === dbProduct.id);
        if (!exists) {
          allMatches.push({
            product: dbProduct,
            confidence,
            matchLevel,
            matchedBy
          });
        }
      });
    };

    // ========== 级别0.5：参数型查询的专属搜索路径 ==========
    // 当用户以参数查询产品（如 "排气量1.1 m³/min的空压机"），
    // 在产品名下按参数值搜索最接近的产品
    if (isParamQuery && originalParamModel && cleanedName && paramTypeName) {
      const numMatch = originalParamModel.match(/(\d+(?:\.\d+)?)/);
      const targetNum = numMatch ? parseFloat(numMatch[1]) : NaN;

      if (!isNaN(targetNum)) {
        console.log('[PriceMatcher] 参数搜索: type=', paramTypeName, ', value=', targetNum);
        const paramProducts = await supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .ilike('parameter_description', `%${paramTypeName}%`)
          .limit(50);

        if (paramProducts.data && paramProducts.data.length > 0) {
          const escapedParamType = paramTypeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const filtered = paramProducts.data.filter((p: any) => {
            const paramText = p.parameter_description || '';
            const paramValueMatch = paramText.match(
              new RegExp(`${escapedParamType}\\s*[：:：]\\s*(\\d+(?:\\.\\d+)?)`, 'i')
            );
            if (!paramValueMatch) return false;
            const productValue = parseFloat(paramValueMatch[1]);
            if (isNaN(productValue)) return false;
            const ratio = productValue / targetNum;
            return ratio >= 0.8 && ratio <= 1.2; // ±20% 容差
          });
          if (filtered.length > 0) {
            addMatches(filtered, 90, 1, `参数匹配（${paramTypeName}≈${targetNum}）`);
            console.log(`[PriceMatcher] 参数搜索找到 ${filtered.length} 个匹配产品`);
          }
        }
      }
    }

    // ========== 级别1：名称和型号都精确匹配 ==========
    if (normalizedModel && cleanedName) {
      // 方式1：字符串精确匹配（使用 % 通配符支持包含关系）
      const exactMatches = await supabase
        .from('products')
        .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
        .ilike('name', `%${cleanedName}%`)
        .eq('model', normalizedModel)
        .limit(20);
      
      addMatches(exactMatches.data, 95, 1, '精确匹配（名称+型号）');

      // 方式2：数字精确匹配（使用 % 通配符）
      const modelNum = parseFloat(normalizedModel);
      if (!isNaN(modelNum)) {
        const exactMatchesNum = await supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .eq('model', modelNum)
          .limit(20);
        
        addMatches(exactMatchesNum.data, 95, 1, '精确匹配（名称+型号-数字）');
      }

      // 方式3：型号前缀匹配（避免子字符串误匹配，如 100g/h 匹配 1000g/h）
      const exactMatchesFuzzy = await supabase
        .from('products')
        .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
        .ilike('name', `%${cleanedName}%`)
        .ilike('model', `${normalizedModel}%`)
        .limit(20);
      
      addMatches(exactMatchesFuzzy.data, 90, 1, '名称+型号前缀匹配');

      // 方式4：名称+型号+参数描述匹配
      if (product.parameter_description) {
        const exactMatchesSpec = await supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .ilike('model', `${normalizedModel}%`)
          .ilike('parameter_description', `%${product.parameter_description}%`)
          .limit(20);

        addMatches(exactMatchesSpec.data, 95, 1, '名称+型号+参数精确匹配');
      }
    }

    // ========== 级别1.5：名称+参数描述匹配 ==========
    if (cleanedName && product.parameter_description) {
      const nameSpecMatches = await supabase
        .from('products')
        .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
        .ilike('name', `%${cleanedName}%`)
        .ilike('parameter_description', `%${product.parameter_description}%`)
        .limit(20);

      addMatches(nameSpecMatches.data, 88, 1.5, '名称+参数描述匹配');
    }

    // ========== 级别1.7：产量/流量型号匹配 ==========
    // 专门处理 "50g/h"、"2kg/h"、"100L/h" 等产量型号格式
    // 在 model 或 parameter_description 中搜索产量值
    if (cleanedName) {
      const productionRatePattern = /(\d+(?:\.\d+)?)\s*(g|kg|t|ml|l)\s*(\/\s*(h|min|s|d|hr))?/i;
      const rateMatch = (product.model || '').match(productionRatePattern);
      if (rateMatch) {
        const rateValue = rateMatch[1]; // 数字部分，如 "50"
        const rateUnit = (rateMatch[2] || '').toLowerCase(); // 单位，如 "g"
        const ratePer = rateMatch[3] ? rateMatch[3].replace(/\s/g, '').toLowerCase() : ''; // 速率，如 "/h"

        // 构建多种搜索模式
        const searchPatterns = [
          `${rateValue}${rateUnit}${ratePer}`,  // 精确格式 "50g/h"
          `${rateValue} ${rateUnit}${ratePer}`,  // 带空格 "50 g/h"
          `${rateValue}${rateUnit}/${ratePer ? ratePer.replace('/', '') : 'h'}`,  // 替代格式
        ];

        for (const pattern of searchPatterns) {
          if (!pattern || pattern.length < 2) continue;

          // 在 model 字段中搜索（前缀匹配，避免 100g/h 匹配 1000g/h）
          const modelRateMatches = await supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', `%${cleanedName}%`)
            .eq('model', pattern)
            .limit(20);

          addMatches(modelRateMatches.data, 92, 1.7, `产量型号匹配（${pattern}）`);

          // 在 parameter_description 字段中搜索
          const specRateMatches = await supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', `%${cleanedName}%`)
            .ilike('parameter_description', `%${pattern}%`)
            .limit(20);

          addMatches(specRateMatches.data, 89, 1.7, `产量参数匹配（${pattern}）`);
        }

        // 如果型号是纯数字（如 "50"），尝试精确匹配 model 等于该数字的记录
        const pureNum = parseFloat(rateValue);
        if (!isNaN(pureNum)) {
          const numModelMatches = await supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', `%${cleanedName}%`)
            .eq('model', String(pureNum))
            .limit(20);

          addMatches(numModelMatches.data, 85, 2, `产量数字型号匹配（${rateValue}）`);
        }
      }
    }

    // ========== 级别2：名称包含 + 型号精确匹配 ==========
    if (normalizedModel && cleanedName) {
      // 方式1：字符串精确匹配
      const nameMatches = await supabase
        .from('products')
        .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
        .ilike('name', `%${cleanedName}%`)
        .eq('model', normalizedModel)
        .limit(20);
      
      addMatches(nameMatches.data, 85, 2, '名称包含+型号精确');

      // 方式2：数字精确匹配
      const modelNum = parseFloat(normalizedModel);
      if (!isNaN(modelNum)) {
        const nameMatchesNum = await supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .eq('model', modelNum)
          .limit(20);
        
        addMatches(nameMatchesNum.data, 85, 2, '名称包含+型号精确（数字）');
      }

      // 方式3：名称+型号+参数描述匹配
      if (product.parameter_description) {
        const nameModelSpecMatches = await supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .eq('model', normalizedModel)
          .ilike('parameter_description', `%${product.parameter_description}%`)
          .limit(20);

        addMatches(nameModelSpecMatches.data, 87, 2, '名称包含+型号+参数匹配');
      }
    }

    // ========== 级别3：名称包含 + 型号包含（模糊匹配）==========
    if (normalizedModel && cleanedName) {
      // 当型号是纯数字时，使用精确匹配+前缀匹配避免子字符串误匹配
      // 例如：model="5" 不应匹配 model="15"、"50"、"500"
      const isPureNumber = /^\d+(\.\d+)?$/.test(normalizedModel);

      if (isPureNumber) {
        // 纯数字型号：model 精确等于该数字，或以该数字开头后跟非数字字符
        console.log(`[PriceMatching] 级别3使用数字边界匹配: model="${normalizedModel}"`);

        // 方式1: model 精确等于该数字
        const exactMatches = await supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .eq('model', normalizedModel)
          .limit(20);

        addMatches(exactMatches.data, 75, 3, '名称+型号模糊匹配（数字精确）');

        // 方式2: model 以该数字开头后跟非数字（如 "5"、"5A"、"5L" 但不匹配 "15"）
        // 使用 ilike 前缀匹配排除纯数字的情况
        const prefixMatches = await supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .ilike('model', `${normalizedModel}%`)
          .not('model', 'eq', normalizedModel)
          .neq('model', normalizedModel)
          .limit(20);

        addMatches(prefixMatches.data, 73, 3, '名称+型号前缀匹配（数字边界）');
      } else {
        // 非纯数字型号：前缀匹配（避免子字符串误匹配）
        const fuzzyMatches = await supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .ilike('model', `${normalizedModel}%`)
          .limit(20);

        addMatches(fuzzyMatches.data, 75, 3, '名称+型号前缀匹配');
      }

      // 方式2：名称+型号+参数描述模糊匹配
      if (product.parameter_description) {
        if (isPureNumber) {
          // 精确匹配
          const fuzzySpecMatches = await supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', `%${cleanedName}%`)
            .eq('model', normalizedModel)
            .ilike('parameter_description', `%${product.parameter_description}%`)
            .limit(20);

          addMatches(fuzzySpecMatches.data, 77, 3, '名称+型号+参数模糊匹配（数字边界）');
        } else {
          const fuzzySpecMatches = await supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', `%${cleanedName}%`)
            .ilike('model', `${normalizedModel}%`)
            .ilike('parameter_description', `%${product.parameter_description}%`)
            .limit(20);

          addMatches(fuzzySpecMatches.data, 77, 3, '名称+型号+参数前缀匹配');
        }
      }
    }

    // ========== 级别3.5：参数描述关键词匹配 ==========
    if (product.parameter_description) {
      const specKeywords = this.extractSpecKeywords(product.parameter_description);
      if (specKeywords.length > 0) {
        for (const keyword of specKeywords) {
          const specKeywordMatches = await supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('parameter_description', `%${keyword}%`)
            .limit(20);

          addMatches(specKeywordMatches.data, 63, 3.5, `参数关键词匹配（${keyword}）`);
        }
      }
    }

    // ========== 级别4：仅名称匹配（宽泛匹配）==========
    const searchName = (!cleanedName || cleanedName.length < 2) ? product.name : cleanedName;
    if (searchName) {
      const nameOnlyMatches = await supabase
        .from('products')
        .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
        .ilike('name', `%${searchName}%`)
        .limit(50); // 增加返回数量

      addMatches(nameOnlyMatches.data, 60, 4, '仅名称匹配');
    }

    // ========== 级别5：仅型号匹配 ==========
    if (normalizedModel) {
      const modelOnlyMatches = await supabase
        .from('products')
        .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
        .ilike('model', `${normalizedModel}%`)
        .limit(20);
      
      addMatches(modelOnlyMatches.data, 40, 5, '仅型号前缀匹配');
    }

    // ========== 级别6：仅参数描述匹配 ==========
    if (product.parameter_description) {
      const specOnlyMatches = await supabase
        .from('products')
        .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
        .ilike('parameter_description', `%${product.parameter_description}%`)
        .limit(20);
      
      addMatches(specOnlyMatches.data, 35, 6, '仅参数描述匹配');
    }

    // ========== 增强匹配：基于参数的匹配和评分 ==========
    // 如果查询包含参数描述，进行参数匹配
    if (product.parameter_description) {
      console.log('[PriceMatcher] 基于参数进行增强匹配...');
      
      // 解析查询参数
      const queryParams = this.parseProductDescription(product.parameter_description);
      
      if (Object.keys(queryParams).length > 0) {
        console.log('[PriceMatcher] 查询参数:', queryParams);
        
        // 为每个匹配产品添加参数匹配分数和详情
        allMatches.forEach(match => {
          // 解析产品参数
          const productParams = this.parseProductDescription(
            match.product.parameter_description || ''
          );
          
          // 计算参数匹配分数（按照重要性排序）
          let paramMatchScore = 0;
          const paramMatchDetails: any = {};
          
          // 【优先级1】排气量精确匹配（核心参数，权重最高：100分）
          if (queryParams.flowRate && productParams.flowRate) {
            const diff = Math.abs(productParams.flowRate - queryParams.flowRate);
            if (diff < 0.01) { // 精确匹配 0.5
              paramMatchScore += 100;
              paramMatchDetails.flowRate = '✓ 精确匹配';
              match.matchLevel = Math.min(match.matchLevel, 1);
              console.log(`[PriceMatcher] 排气量精确匹配: 产品 ${match.product.model} 得分+100, 级别=1`);
            } else if (diff <= 0.1) { // 近似 0.4-0.6
              paramMatchScore += 50;
              paramMatchDetails.flowRate = `≈ ${productParams.flowRate} m³/min (相近)`;
              match.matchLevel = Math.min(match.matchLevel, 2);
              console.log(`[PriceMatcher] 排气量相近匹配: 产品 ${match.product.model} 得分+50, 级别=2`);
            } else {
              paramMatchDetails.flowRate = `${productParams.flowRate} m³/min`;
            }
          }
          
          // 【优先级2】工作压力匹配（权重：80分）
          if (queryParams.pressure && productParams.pressure) {
            const pressureDiff = Math.abs(productParams.pressure - queryParams.pressure);
            if (pressureDiff < 0.01) { // 精确匹配
              paramMatchScore += 80;
              paramMatchDetails.pressure = '✓ 压力匹配';
              match.matchLevel = Math.min(match.matchLevel, 1);
              console.log(`[PriceMatcher] 压力精确匹配: 产品 ${match.product.model} 得分+80, 级别=1`);
            } else {
              paramMatchDetails.pressure = `${productParams.pressure} MPa`;
            }
          }
          
          // 【优先级3】电压匹配（权重：60分）
          if (queryParams.voltage && productParams.voltage) {
            if (productParams.voltage === queryParams.voltage) {
              paramMatchScore += 60;
              paramMatchDetails.voltage = '✓ 电压匹配';
              console.log(`[PriceMatcher] 电压匹配: 产品 ${match.product.model} 得分+60`);
            } else {
              paramMatchDetails.voltage = productParams.voltage;
            }
          }
          
          // 【优先级4】控制方式匹配（权重：40分）
          if (queryParams.controlType && productParams.controlType) {
            if (productParams.controlType === queryParams.controlType) {
              paramMatchScore += 40;
              paramMatchDetails.controlType = `✓ ${queryParams.controlType}`;
            }
          }
          
          // 【优先级5】功率范围匹配（权重：20分，降低权重）
          if (queryParams.power && productParams.power) {
            const powerDiff = Math.abs(productParams.power - queryParams.power);
            if (powerDiff <= 1) {
              paramMatchScore += 20;
              paramMatchDetails.power = '相近';
            }
          }
          
          // 更新匹配详情
          match.matchDetails = {
            ...match.matchDetails,
            paramMatchScore,
            paramMatchDetails,
            parameters: productParams
          };
          
          // 如果有参数匹配，调整置信度
          if (paramMatchScore > 0) {
            match.confidence = Math.min(match.confidence + Math.floor(paramMatchScore * 0.2), 100);
          }
        });
      }
    }
    
    // 按匹配级别、置信度和竞价字段排序
    allMatches.sort((a, b) => {
      if (a.matchLevel !== b.matchLevel) {
        return a.matchLevel - b.matchLevel; // 级别越小越优先
      }
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence; // 级别相同时，置信度高的优先
      }
      // 置信度相同时，按成本价排序（简化排序，移除不存在的列引用）
      const costA = a.product.cost_price || 0;
      const costB = b.product.cost_price || 0;
      if (costA !== costB) return costA - costB;
      return 0;
    });

    console.log(`[PriceMatcher] 收集到 ${allMatches.length} 个匹配结果`);
    allMatches.forEach(m => {
      const details = m.matchDetails?.paramMatchDetails 
        ? ` | 参数: ${JSON.stringify(m.matchDetails.paramMatchDetails)}`
        : '';
      console.log(`  - [级别${m.matchLevel}] ${m.product.name} ${m.product.model} (置信度: ${m.confidence}%)${details}`);
    });

    // 过滤掉无有效价格的产品
    const validMatches = allMatches.filter(m => {
      const p = m.product;
      const hasPrice = p.price != null && p.price !== '' && p.price !== 0;
      const hasMinPrice = p.min_price != null && p.min_price > 0;
      const hasCostPrice = p.cost_price != null && p.cost_price > 0;
      const isValid = hasPrice || hasMinPrice || hasCostPrice;
      if (!isValid) {
        console.log(`[PriceMatcher] 过滤无价格产品: ${p.name} ${p.model} (price=${p.price}, min_price=${p.min_price})`);
      }
      return isValid;
    });

    if (validMatches.length === 0 && allMatches.length > 0) {
      console.log(`[PriceMatcher] 所有 ${allMatches.length} 个匹配产品都无有效价格，返回空结果`);
    }

    return validMatches;
  }

  /**
   * 从产品库匹配（最高优先级）
   * 
   * 多级匹配策略：
   * 级别1：标准化后的名称和型号精确匹配
   * 级别2：标准化后的名称包含 + 型号精确匹配
   * 级别3：标准化后的名称包含 + 型号包含
   * 级别4：仅名称匹配，忽略型号（回退策略）
   * 级别5：仅型号匹配（如果有型号，作为最后回退）
   */
  private static async matchFromDatabase(
    product: ProductMatch
  ): Promise<PriceMatchResult | null> {
    try {
      console.log('[PriceMatcher] ====== 开始产品库匹配 ======');
      console.log('[PriceMatcher] 原始产品名称:', product.name);
      console.log('[PriceMatcher] 原始产品型号:', product.model);
      console.log('[PriceMatcher] 原始参数描述:', product.parameter_description);

      // 清理产品名称，移除规格描述
      const cleanedName = this.cleanProductName(product.name);
      console.log('[PriceMatcher] 清理后产品名称:', cleanedName);

      // 标准化型号
      const normalizedModel = this.normalizeModel(product.model);
      console.log('[PriceMatcher] 标准化后型号:', normalizedModel);

      // 收集所有匹配的产品
      const allMatches = await this.collectAllMatches(product);
      
      if (allMatches.length === 0) {
        console.log('[PriceMatcher] ❌ 未找到任何匹配产品');
        return null;
      }

      // 第一个匹配项作为推荐产品
      const bestMatch = allMatches[0];
      console.log('[PriceMatcher] ✅ 推荐产品:', bestMatch.product.name, bestMatch.product.model);
      
      // 构建价格结果
      const result = this.buildPriceResult(bestMatch.product, bestMatch.confidence, bestMatch.matchedBy, bestMatch.matchDetails);
      
      // 添加所有匹配产品到结果中
      result.matchedProducts = allMatches.map((match, index) => {
        // 价格提取（与 buildPriceResult 逻辑一致）
        const extractPrice = (value: any): number => {
          if (value == null || value === '') return 0;
          if (typeof value === 'number') return value > 0 ? value : 0;
          const str = String(value).trim();
          if (!str) return 0;
          if (str.startsWith('{')) {
            const m = str.match(/([0-9.]+)/);
            if (m) {
              const raw = parseFloat(m[1]);
              return raw > 1000000 ? raw / 100 : raw;
            }
            return 0;
          }
          const num = parseFloat(str);
          return (!isNaN(num) && num > 0) ? num : 0;
        };

        // 优先级：min_price > price > cost_price（仅使用数据库实际存在的字段）
        let productPrice = 0;
        const minP = extractPrice(match.product.min_price);
        const costP = extractPrice(match.product.cost_price);
        const priceP = extractPrice(match.product.price);

        if (minP > 0) productPrice = minP;
        else if (priceP > 0) productPrice = priceP;
        else if (costP > 0) productPrice = costP;

        // 提取关键参数
        const parameters: any = {};

        // 添加价格信息
        if (minP > 0) parameters.minPrice = minP;
        else if (match.product.min_price != null && match.product.min_price !== '') {
          parameters.minPrice = typeof match.product.min_price === 'string' ? parseFloat(match.product.min_price) : match.product.min_price;
        }
        if (costP > 0) parameters.costPrice = costP;

        // 从产品数据中提取排气量
        if (match.product.flow_rate !== undefined && match.product.flow_rate !== null) {
          parameters.flowRate = parseFloat(String(match.product.flow_rate));
        }
        
        // 从parameterDescription中提取排气量
        if (!parameters.flowRate && match.product.parameter_description) {
          const flowMatch = match.product.parameter_description.match(/排气量\s*[：:：]\s*(\d+\.?\d*)\s*(m³|立方)/i);
          if (flowMatch) {
            parameters.flowRate = parseFloat(flowMatch[1]);
          }
        }
        
        // 从产品数据中提取压力
        if (match.product.pressure !== undefined && match.product.pressure !== null) {
          parameters.pressure = parseFloat(String(match.product.pressure));
        }
        
        // 从parameterDescription中提取压力
        if (!parameters.pressure && match.product.parameter_description) {
          const pressureMatch = match.product.parameter_description.match(/压力\s*[：:：]\s*(\d+\.?\d*)\s*(MPa|兆帕)/i);
          if (pressureMatch) {
            parameters.pressure = parseFloat(pressureMatch[1]);
          }
        }
        
        // 从产品数据中提取功率
        if (match.product.power !== undefined && match.product.power !== null) {
          parameters.power = parseFloat(String(match.product.power));
        }
        
        // 从parameterDescription中提取功率
        if (!parameters.power && match.product.parameter_description) {
          const powerMatch = match.product.parameter_description.match(/功率\s*[：:：]\s*(\d+\.?\d*)\s*(kW|千瓦)/i);
          if (powerMatch) {
            parameters.power = parseFloat(powerMatch[1]);
          }
        }
        
        // 从产品数据中提取电压
        if (match.product.voltage) {
          parameters.voltage = match.product.voltage;
        }
        
        // 从parameterDescription中提取电压
        if (!parameters.voltage && match.product.parameter_description) {
          const voltageMatch = match.product.parameter_description.match(/电压|电源\s*[：:：]\s*(\d+V|\d+伏|三相|单相)/i);
          if (voltageMatch) {
            parameters.voltage = voltageMatch[1];
          }
        }

        return {
          price: productPrice,
          productName: match.product.name,
          model: match.product.model,
          confidence: match.confidence,
          brand: match.product.brand,
          parameterDescription: match.product.parameter_description,
          matchLevel: match.matchLevel,
          matchedBy: match.matchedBy,
          isRecommended: index === 0, // 第一个为推荐产品
          parameters: Object.keys(parameters).length > 0 ? parameters : undefined, // 添加提取的参数
          // 多品牌对比字段
          supplier: match.product.supplier || undefined,
          contactPhone: match.product.contact_phone || undefined,
          tags: [],
        };
      });

      console.log(`[PriceMatcher] 返回 ${result.matchedProducts.length} 个匹配结果`);
      return result;
      
      // 以下是原有的分级匹配逻辑，现在已被collectAllMatches替代
      // 保留注释以便参考
      /*

      // 直接使用 Supabase 进行查询
      const supabase = getSupabaseClient();

      // 调试：查看数据库中相关产品
      const debugQuery = supabase
        .from('products')
        .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
        .ilike('name', `%${cleanedName}%`)
        .limit(20);
      
      const { data: debugProducts, error: debugError } = await debugQuery;
      if (!debugError && debugProducts && debugProducts.length > 0) {
        console.log('[PriceMatcher] 数据库中包含"' + cleanedName + '"的产品:', debugProducts.map(p => ({
          name: p.name,
          model: p.model,
          price: p.price,
          min_price: p.min_price
        })));
      }
      
      // ========== 级别1：名称和型号都精确匹配 ==========
      console.log('[PriceMatcher] ========== 级别1：名称和型号精确匹配 ==========');
      if (normalizedModel && cleanedName) {
        // 尝试多种匹配方式，以适应不同的数据类型
        
        // 方式1：字符串精确匹配（model 作为字符串）
        const exactMatchQuery = supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', cleanedName)
          .eq('model', normalizedModel)
          .limit(10);
        
        const { data: exactMatches } = await exactMatchQuery;
        console.log('[PriceMatcher] 级别1-方式1（字符串精确）查询结果数量:', exactMatches?.length || 0);
        
        if (exactMatches && exactMatches.length > 0) {
          const bestMatch = this.findBestMatch(exactMatches, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别1-方式1匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 95, '精确匹配（名称+型号）');
          }
        }

        // 方式2：数字精确匹配（model 作为数字）
        const modelNum = parseFloat(normalizedModel);
        if (!isNaN(modelNum)) {
          const exactMatchNumQuery = supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', cleanedName)
            .eq('model', modelNum)
            .limit(10);
          
          const { data: exactMatchesNum } = await exactMatchNumQuery;
          console.log('[PriceMatcher] 级别1-方式2（数字精确）查询结果数量:', exactMatchesNum?.length || 0);
          
          if (exactMatchesNum && exactMatchesNum.length > 0) {
            const bestMatch = this.findBestMatch(exactMatchesNum, product);
            if (bestMatch) {
              console.log('[PriceMatcher] ✅ 级别1-方式2匹配成功:', bestMatch.name, bestMatch.model);
              return this.buildPriceResult(bestMatch, 95, '精确匹配（名称+型号）');
            }
          }
        }

        // 方式3：型号前缀匹配（避免子字符串误匹配）
        const exactMatchFuzzyQuery = supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', cleanedName)
          .ilike('model', `${normalizedModel}%`)
          .limit(10);
        
        const { data: exactMatchesFuzzy } = await exactMatchFuzzyQuery;
        console.log('[PriceMatcher] 级别1-方式3（型号包含）查询结果数量:', exactMatchesFuzzy?.length || 0);
        
        if (exactMatchesFuzzy && exactMatchesFuzzy.length > 0) {
          const bestMatch = this.findBestMatch(exactMatchesFuzzy, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别1-方式3匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 90, '名称+型号包含匹配');
          }
        }

        // 方式4：名称+型号+参数描述匹配（新增多维度匹配）
        if (product.parameter_description) {
          const exactMatchSpecQuery = supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', cleanedName)
            .ilike('model', `${normalizedModel}%`)
            .ilike('parameter_description', `%${product.parameter_description}%`)
            .limit(10);

          const { data: exactMatchesSpec } = await exactMatchSpecQuery;
          console.log('[PriceMatcher] 级别1-方式4（名称+型号+参数）查询结果数量:', exactMatchesSpec?.length || 0);

          if (exactMatchesSpec && exactMatchesSpec.length > 0) {
            const bestMatch = this.findBestMatch(exactMatchesSpec, product);
            if (bestMatch) {
              console.log('[PriceMatcher] ✅ 级别1-方式4匹配成功:', bestMatch.name, bestMatch.model);
              return this.buildPriceResult(bestMatch, 95);
            }
          }
        }
      }

      // ========== 级别1.5：名称+参数描述匹配（中间级别）==========
      console.log('[PriceMatcher] ========== 级别1.5：名称+参数描述匹配 ==========');
      if (cleanedName && product.parameter_description) {
        const nameSpecQuery = supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .ilike('parameter_description', `%${product.parameter_description}%`)
          .limit(10);

        const { data: nameSpecMatches } = await nameSpecQuery;
        console.log('[PriceMatcher] 级别1.5查询结果数量:', nameSpecMatches?.length || 0);

        if (nameSpecMatches && nameSpecMatches.length > 0) {
          const bestMatch = this.findBestMatch(nameSpecMatches, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别1.5匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 88, '名称+参数描述匹配');
          }
        }
      }

      // ========== 级别2：名称包含 + 型号精确匹配 ==========
      console.log('[PriceMatcher] ========== 级别2：名称包含 + 型号精确匹配 ==========');
      if (normalizedModel && cleanedName) {
        // 方式1：字符串精确匹配
        const nameMatchQuery = supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .eq('model', normalizedModel)
          .limit(10);
        
        const { data: nameMatches } = await nameMatchQuery;
        console.log('[PriceMatcher] 级别2-方式1查询结果数量:', nameMatches?.length || 0);
        
        if (nameMatches && nameMatches.length > 0) {
          const bestMatch = this.findBestMatch(nameMatches, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别2-方式1匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 85, '名称包含+型号精确');
          }
        }

        // 方式2：数字精确匹配
        const modelNum = parseFloat(normalizedModel);
        if (!isNaN(modelNum)) {
          const nameMatchNumQuery = supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', `%${cleanedName}%`)
            .eq('model', modelNum)
            .limit(10);
          
          const { data: nameMatchesNum } = await nameMatchNumQuery;
          console.log('[PriceMatcher] 级别2-方式2查询结果数量:', nameMatchesNum?.length || 0);
          
          if (nameMatchesNum && nameMatchesNum.length > 0) {
            const bestMatch = this.findBestMatch(nameMatchesNum, product);
            if (bestMatch) {
              console.log('[PriceMatcher] ✅ 级别2-方式2匹配成功:', bestMatch.name, bestMatch.model);
              return this.buildPriceResult(bestMatch, 85, '名称包含+型号精确');
            }
          }
        }

        // 方式3：名称+型号+参数描述匹配（增强版）
        if (product.parameter_description) {
          const nameModelSpecQuery = supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', `%${cleanedName}%`)
            .eq('model', normalizedModel)
            .ilike('parameter_description', `%${product.parameter_description}%`)
            .limit(10);

          const { data: nameModelSpecMatches } = await nameModelSpecQuery;
          console.log('[PriceMatcher] 级别2-方式3查询结果数量:', nameModelSpecMatches?.length || 0);

          if (nameModelSpecMatches && nameModelSpecMatches.length > 0) {
            const bestMatch = this.findBestMatch(nameModelSpecMatches, product);
            if (bestMatch) {
              console.log('[PriceMatcher] ✅ 级别2-方式3匹配成功:', bestMatch.name, bestMatch.model);
              return this.buildPriceResult(bestMatch, 87);
            }
          }
        }
      }

      // ========== 级别3：名称包含 + 型号包含（模糊匹配）==========
      console.log('[PriceMatcher] ========== 级别3：名称包含 + 型号包含 ==========');
      if (normalizedModel && cleanedName) {
        const fuzzyMatchQuery = supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${cleanedName}%`)
          .ilike('model', `${normalizedModel}%`)
          .limit(10);

        const { data: fuzzyMatches } = await fuzzyMatchQuery;
        console.log('[PriceMatcher] 级别3查询结果数量:', fuzzyMatches?.length || 0);

        if (fuzzyMatches && fuzzyMatches.length > 0) {
          const bestMatch = this.findBestMatch(fuzzyMatches, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别3匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 75, '名称+型号模糊匹配');
          }
        }

        // 方式2：名称+型号+参数描述模糊匹配
        if (product.parameter_description) {
          const fuzzySpecQuery = supabase
            .from('products')
            .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
            .ilike('name', `%${cleanedName}%`)
            .ilike('model', `${normalizedModel}%`)
            .ilike('parameter_description', `%${product.parameter_description}%`)
            .limit(10);

          const { data: fuzzySpecMatches } = await fuzzySpecQuery;
          console.log('[PriceMatcher] 级别3-方式2查询结果数量:', fuzzySpecMatches?.length || 0);

          if (fuzzySpecMatches && fuzzySpecMatches.length > 0) {
            const bestMatch = this.findBestMatch(fuzzySpecMatches, product);
            if (bestMatch) {
              console.log('[PriceMatcher] ✅ 级别3-方式2匹配成功:', bestMatch.name, bestMatch.model);
              return this.buildPriceResult(bestMatch, 77);
            }
          }
        }
      }

      // ========== 级别3.5：关键词宽泛匹配（万能匹配核心）==========
      console.log('[PriceMatcher] ========== 级别3.5：关键词宽泛匹配 ==========');
      const keywords = this.extractKeywords(product.name);
      if (keywords.length > 0) {
        const keywordResult = await this.matchByKeywords(product, keywords);
        if (keywordResult) {
          console.log('[PriceMatcher] ✅ 级别3.5关键词匹配成功');
          return keywordResult;
        }
      }

      // ========== 级别3.6：参数描述关键词匹配（新增）==========
      console.log('[PriceMatcher] ========== 级别3.6：参数描述关键词匹配 ==========');
      if (product.parameter_description) {
        const specKeywords = this.extractSpecKeywords(product.parameter_description);
        if (specKeywords.length > 0) {
          for (const keyword of specKeywords) {
            const specKeywordQuery = supabase
              .from('products')
              .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
              .ilike('parameter_description', `%${keyword}%`)
              .limit(10);

            const { data: specKeywordMatches } = await specKeywordQuery;
            console.log(`[PriceMatcher] 参数关键词"${keyword}"匹配数量:`, specKeywordMatches?.length || 0);

            if (specKeywordMatches && specKeywordMatches.length > 0) {
              const bestMatch = this.findBestMatch(specKeywordMatches, product);
              if (bestMatch) {
                console.log('[PriceMatcher] ✅ 级别3.6参数关键词匹配成功:', bestMatch.name, bestMatch.model);
                return this.buildPriceResult(bestMatch, 63, '参数关键词匹配');
              }
            }
          }
        }
      }

      // ========== 级别4：仅名称匹配（忽略型号，宽泛匹配）==========
      console.log('[PriceMatcher] ========== 级别4：仅名称匹配（宽泛）==========');

      // 如果清理后的名称为空或太短，尝试使用原始名称
      const searchName = (!cleanedName || cleanedName.length < 2) ? product.name : cleanedName;

      if (searchName) {
        const nameOnlyQuery = supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('name', `%${searchName}%`)
          .limit(20); // 增加返回数量，提高匹配概率

        const { data: nameOnlyMatches } = await nameOnlyQuery;
        console.log('[PriceMatcher] 级别4查询结果数量（使用"' + searchName + '"）:', nameOnlyMatches?.length || 0);

        if (nameOnlyMatches && nameOnlyMatches.length > 0) {
          // 如果有多个匹配，尝试找到最接近的（考虑型号和参数）
          const bestMatch = this.findBestMatch(nameOnlyMatches, product);
          if (bestMatch) {
            console.log('[PriceMatcher] ✅ 级别4匹配成功:', bestMatch.name, bestMatch.model);
            return this.buildPriceResult(bestMatch, 60, '仅名称匹配');
          }
        }
      }

      // ========== 级别5：仅型号匹配（回退策略）==========
      console.log('[PriceMatcher] ========== 级别5：仅型号匹配 ==========');
      if (normalizedModel) {
        const modelOnlyQuery = supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('model', `${normalizedModel}%`)
          .limit(10);
        
        const { data: modelOnlyMatches } = await modelOnlyQuery;
        console.log('[PriceMatcher] 级别5查询结果数量:', modelOnlyMatches?.length || 0);
        
        if (modelOnlyMatches && modelOnlyMatches.length > 0) {
          const bestMatch = this.findBestMatch(modelOnlyMatches, product);
          console.log('[PriceMatcher] ✅ 级别5匹配成功:', bestMatch.name, bestMatch.model);
          return this.buildPriceResult(bestMatch, 40, '仅型号匹配');
        }
      }

      // ========== 级别6：仅参数描述匹配（最后回退）==========
      console.log('[PriceMatcher] ========== 级别6：仅参数描述匹配 ==========');
      if (product.parameter_description) {
        const specOnlyQuery = supabase
          .from('products')
          .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category, supplier, contact_person, contact_phone, unit, stock, image_url')
          .ilike('parameter_description', `%${product.parameter_description}%`)
          .limit(10);

        const { data: specOnlyMatches } = await specOnlyQuery;
        console.log('[PriceMatcher] 级别6查询结果数量:', specOnlyMatches?.length || 0);

        if (specOnlyMatches && specOnlyMatches.length > 0) {
          const bestMatch = this.findBestMatch(specOnlyMatches, product);
          console.log('[PriceMatcher] ✅ 级别6匹配成功:', bestMatch.name, bestMatch.model);
          return this.buildPriceResult(bestMatch, 35, '仅参数描述匹配');
        }
      }
      
      console.log('[PriceMatcher] ❌ 所有匹配级别都失败，未找到匹配项');
      */ // 结束注释原有逻辑
      
    } catch (error) {
      // 只在第一次遇到此错误时输出，避免重复
      if (this.shouldLogError('database-match', error)) {
        console.log('[PriceMatcher] 数据库匹配失败:', error);
      }
    }
    return null;
  }

  /**
   * 构建价格结果
   *
   * 新设计：使用display_price字段（NUMERIC类型）
   * - display_price: 实际价格值，直接使用，无需转换
   * - currency: 货币单位（CNY、USD等）
   * - 存储什么就是什么，上传什么就是什么
   *
   * 新增：置信度等级和匹配方式
   */
  private static buildPriceResult(
    product: any,
    confidence: number,
    matchedBy?: string,
    matchDetails?: {
      nameScore: number;
      modelScore: number;
      paramScore: number;
      numberAdjustment: number;
    }
  ): PriceMatchResult {
    let finalPrice: number = 0;
    let costPrice: number | null = null;
    let minPrice: number | null = null;
    let guidePrice: number | null = null;

    // 调试：输出所有价格相关字段（仅使用数据库实际存在的字段）
    console.log('[PriceMatcher] buildPriceResult 产品:', product.name, product.model,
      'price:', product.price, 'min_price:', product.min_price, 'cost_price:', product.cost_price);

    // 提取 min_price 和 cost_price（数据库实际存在的字段）
    if (product.min_price != null && product.min_price !== '') {
      const mp = typeof product.min_price === 'string' ? parseFloat(product.min_price) : Number(product.min_price);
      if (!isNaN(mp) && mp > 0) minPrice = mp;
    }

    // 提取 cost_price
    if (product.cost_price != null && product.cost_price !== '') {
      const cp = typeof product.cost_price === 'string' ? parseFloat(product.cost_price) : Number(product.cost_price);
      if (!isNaN(cp) && cp > 0) costPrice = cp;
    }

    // 提取 price（主价格字段）
    const extractNumericPrice = (value: any): number => {
      if (value == null || value === '') return 0;
      if (typeof value === 'number') return value > 0 ? value : 0;
      const str = String(value).trim();
      if (!str) return 0;
      // NUMRANGE 格式：{490900 ...} → 提取第一个数字
      if (str.startsWith('{')) {
        const m = str.match(/([0-9.]+)/);
        if (m) {
          const raw = parseFloat(m[1]);
          // 如果值大于合理范围（如 > 1000000 且看起来像分单位），除以100
          if (raw > 1000000) return raw / 100;
          return raw;
        }
        return 0;
      }
      // 普通数字字符串
      const num = parseFloat(str);
      return (!isNaN(num) && num > 0) ? num : 0;
    };

    const priceValue = extractNumericPrice(product.price);

    // 价格优先级：min_price > price > cost_price
    if (minPrice && minPrice > 0) {
      finalPrice = minPrice;
      console.log('[PriceMatcher] 使用min_price:', finalPrice);
    } else if (priceValue > 0) {
      finalPrice = priceValue;
      console.log('[PriceMatcher] 使用price:', finalPrice);
    } else if (costPrice && costPrice > 0) {
      finalPrice = costPrice;
      console.log('[PriceMatcher] 使用cost_price:', finalPrice);
    }

    // 最终验证价格
    if (finalPrice <= 0 || !isFinite(finalPrice)) {
      console.warn('[PriceMatcher] 最终价格无效:', finalPrice, '产品:', product.name, product.model);
      finalPrice = 0;
    }

    console.log('[PriceMatcher] 最终价格:', finalPrice, '来源:', minPrice ? 'min_price' : priceValue ? 'price' : costPrice ? 'cost_price' : 'none');

    return {
      price: finalPrice,
      source: 'database',
      confidence,
      confidenceLevel: this.getConfidenceLevel(confidence),
      productName: product.name,
      model: product.model,
      sourceId: product.id,
      // 返回完整的数据库字段
      brand: product.brand,
      parameterDescription: product.parameter_description,
      costPrice: costPrice ?? undefined,
      minPrice: minPrice ?? undefined,
      category: product.category,
      // 新增字段
      matchedBy: matchedBy || '多维度匹配',
      matchDetails: matchDetails || undefined,
      // 多品牌对比字段
      supplier: product.supplier || undefined,
      contactPhone: product.contact_phone || undefined,
      // 注意：bid_amount, quote_count, rating, response_time 列在数据库中不存在，暂不使用
      tags: [],
    };
  }

  /**
   * 从知识库匹配（历史报价、案例）- 万能匹配优化
   */
  private static async matchFromKnowledge(
    product: ProductMatch,
    userId?: string
  ): Promise<PriceMatchResult | null> {
    try {
      const supabase = getSupabaseClient();

      console.log('[PriceMatcher] ====== 开始知识库匹配 ======');

      // 提取关键词，用于宽泛匹配
      const keywords = this.extractKeywords(product.name);
      console.log('[PriceMatcher] 知识库匹配提取的关键词:', keywords);

      const allEntries: any[] = [];

      // 策略1：使用产品名称进行模糊匹配
      if (product.name) {
        const nameQuery = supabase
          .from('knowledge_entries')
          .select('*')
          .eq('status', 'approved')
          .in('type', ['quote', 'case', 'quota', 'drawing'])
          .ilike('title', `%${product.name}%`)
          .limit(10);

        const { data: nameEntries, error: nameError } = await nameQuery;
        if (!nameError && nameEntries) {
          console.log('[PriceMatcher] 知识库名称匹配数量:', nameEntries.length);
          allEntries.push(...nameEntries);
        }
      }

      // 策略2：使用关键词进行匹配
      if (keywords.length > 0) {
        for (const keyword of keywords) {
          const keywordQuery = supabase
            .from('knowledge_entries')
            .select('*')
            .eq('status', 'approved')
            .in('type', ['quote', 'case', 'quota', 'drawing'])
            .ilike('title', `%${keyword}%`)
            .limit(10);

          const { data: keywordEntries, error: keywordError } = await keywordQuery;
          if (!keywordError && keywordEntries) {
            console.log(`[PriceMatcher] 知识库关键词"${keyword}"匹配数量:`, keywordEntries.length);
            allEntries.push(...keywordEntries);
          }
        }
      }

      // 策略3：使用型号进行匹配
      if (product.model) {
        const modelQuery = supabase
          .from('knowledge_entries')
          .select('*')
          .eq('status', 'approved')
          .in('type', ['quote', 'case', 'quota', 'drawing'])
          .ilike('title', `%${product.model}%`)
          .limit(10);

        const { data: modelEntries, error: modelError } = await modelQuery;
        if (!modelError && modelEntries) {
          console.log('[PriceMatcher] 知识库型号匹配数量:', modelEntries.length);
          allEntries.push(...modelEntries);
        }
      }

      // 去重
      const uniqueEntries = this.deduplicateProducts(allEntries);
      console.log('[PriceMatcher] 知识库去重后匹配数量:', uniqueEntries.length);

      if (uniqueEntries.length > 0) {
        // 尝试从metadata中提取价格
        for (const entry of uniqueEntries) {
          // 检查是否有直接价格
          if (entry.metadata?.price) {
            console.log('[PriceMatcher] ✅ 知识库匹配成功（直接价格）:', entry.title);
            return {
              price: entry.metadata.price,
              source: 'knowledge',
              confidence: 75,
              productName: entry.title,
              sourceId: entry.id,
              sourceUrl: entry.file_url
            };
          }

          // 检查是否有估算价格
          if (entry.metadata?.estimatedPrice) {
            console.log('[PriceMatcher] ✅ 知识库匹配成功（估算价格）:', entry.title);
            return {
              price: entry.metadata.estimatedPrice,
              source: 'knowledge',
              confidence: 65,
              productName: entry.title,
              sourceId: entry.id,
              sourceUrl: entry.file_url
            };
          }

          // 检查是否有市场价格
          if (entry.metadata?.marketPrice) {
            console.log('[PriceMatcher] ✅ 知识库匹配成功（市场价格）:', entry.title);
            return {
              price: entry.metadata.marketPrice,
              source: 'knowledge',
              confidence: 70,
              productName: entry.title,
              sourceId: entry.id,
              sourceUrl: entry.file_url
            };
          }
        }

        // 如果没有直接的价格，使用第一个匹配项的均价（如果有）
        if (uniqueEntries[0].metadata?.averagePrice) {
          console.log('[PriceMatcher] ✅ 知识库匹配成功（均价）:', uniqueEntries[0].title);
          return {
            price: uniqueEntries[0].metadata.averagePrice,
            source: 'knowledge',
            confidence: 60,
            productName: uniqueEntries[0].title,
            sourceId: uniqueEntries[0].id,
            sourceUrl: uniqueEntries[0].file_url
          };
        }
      }

      console.log('[PriceMatcher] 知识库未找到匹配');
    } catch (error) {
      // 只在第一次遇到此错误时输出，避免重复
      if (this.shouldLogError('knowledge-match', error)) {
        console.log('[PriceMatcher] 知识库匹配失败:', error);
      }
    }
    return null;
  }

  /**
   * 从市场价兜底（新增）
   */
  private static async matchFromMarket(
    product: ProductMatch
  ): Promise<PriceMatchResult | null> {
    try {
      console.log('[PriceMatcher] 尝试市场价兜底:', product.name);
      
      // 在服务端构建正确的 URL
      const baseUrl = typeof window === 'undefined' 
        ? 'http://localhost:5000' 
        : window.location.origin;
      
      const apiUrl = `${baseUrl}/api/quotes/market-price`;
      
      // 调用市场价API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [{
            name: product.name,
            model: product.model || '',
            specs: product.parameter_description || product.model || '',
          }]
        }),
      });

      if (!response.ok) {
        console.log('[PriceMatcher] 市场价API调用失败:', response.status);
        return null;
      }

      const result = await response.json();
      console.log('[PriceMatcher] 市场价API响应:', result);

      // 提取市场价
      const marketData = result.data?.[0] || result;
      const marketPrice = marketData.averageMarketPrice ||
                         marketData.price ||
                         marketData.marketPrice ||
                         marketData.value ||
                         marketData.unitPrice ||
                         0;

      if (marketPrice > 0) {
        // 获取市场价来源
        let marketSource = '市场参考价';
        if (marketData.source) {
          marketSource = marketData.source;
        } else if (marketData.provider) {
          marketSource = marketData.provider;
        }

        return {
          price: marketPrice,
          source: 'market',
          confidence: 45, // 市场价置信度适中
          productName: marketData.productName || product.name,
          model: marketData.model || product.model,
          sourceId: marketData.id,
          marketPrice: marketPrice,
          marketSource: marketSource
        };
      }
    } catch (error) {
      // 只输出错误消息，避免输出完整堆栈
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('[PriceMatcher] 市场价兜底失败:', errorMessage);
    }
    return null;
  }

  /**
   * 按类别估算价格
   */
  private static estimateByCategory(product: ProductMatch): PriceMatchResult | null {
    const category = this.inferCategory(product);
    const price = this.getCategoryBasePrice(category);
    
    if (price > 0) {
      return {
        price,
        source: 'estimate',
        confidence: 35,
        productName: product.name
      };
    }
    return null;
  }

  /**
   * 获取默认价格
   */
  private static getDefaultPrice(): PriceMatchResult {
    return {
      price: 1000,
      source: 'default',
      confidence: 20
    };
  }

  /**
   * 查找最佳匹配产品（多维度匹配优化版）
   * 从产品名称、规格型号、参数描述三个维度进行综合评分
   *
   * 权重分配：
   * - 产品名称：40%
   * - 规格型号：35%
   * - 参数描述：25%
   */
  private static findBestMatch(products: any[], target: ProductMatch): any | null {
    if (!products || products.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;
    let bestDetails: any = {};

    console.log('[PriceMatcher] ========== 开始多维度匹配 ==========');
    console.log('[PriceMatcher] 目标产品:', {
      名称: target.name,
      型号: target.model,
      参数: target.parameter_description
    });

    for (const product of products) {
      console.log('[PriceMatcher] 评估候选产品:', {
        名称: product.name,
        型号: product.model,
        参数: product.parameter_description
      });

      // 使用多维度相似度算法
      const similarity = this.calculateMultiDimensionalSimilarity(target, product);

      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = product;
        bestDetails = {
          名称相似度: this.calculateNameSimilarity(target.name || '', product.name || '').toFixed(2),
          型号相似度: this.calculateModelSimilarity(target.model || '', product.model || '').toFixed(2),
          参数相似度: this.calculateSpecSimilarity(
            target.parameter_description || '',
            product.parameter_description || ''
          ).toFixed(2),
          综合得分: similarity.toFixed(2)
        };
      }
    }

    console.log('[PriceMatcher] 最佳匹配详情:', bestDetails);
    console.log('[PriceMatcher] 最佳匹配产品:', bestMatch?.name, bestMatch?.model);
    
    // 只有得分超过阈值才返回最佳匹配
    if (bestScore >= 0.3) {
      return bestMatch;
    }

    console.log('[PriceMatcher] 所有候选产品得分都低于阈值(0.3)，返回第一个结果');
    return products[0];
  }

  /**
   * 计算字符串相似度（简单的Levenshtein实现）
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;

    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);
    
    // 如果字符串包含关系
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.8;
    }

    // 简单计算共同词的数量
    const words1 = str1.split(/[\s,，、\-_]/);
    const words2 = str2.split(/[\s,，、\-_]/);
    
    let commonWords = 0;
    for (const word of words1) {
      if (word.length > 1 && words2.includes(word)) {
        commonWords++;
      }
    }

    const totalUniqueWords = new Set([...words1, ...words2]).size;
    return totalUniqueWords > 0 ? commonWords / totalUniqueWords : 0;
  }

  /**
   * 推断产品类别
   */
  static inferCategory(product: ProductMatch): string {
    const name = product.name.toLowerCase();
    const model = (product.model || '').toLowerCase();
    const specs = (product.parameter_description || '').toLowerCase();

    // 关键词映射到类别（扩展版）
    const categoryMap: Record<string, string[]> = {
      '搅拌设备': ['搅拌罐', '搅拌系统', '反应釜', '混合机', '搅拌器', '搅拌机', '搅拌装置'],
      '泵类': ['泵', '离心泵', '螺杆泵', '隔膜泵', '齿轮泵', '柱塞泵', '潜水泵', '排污泵'],
      '阀门': ['阀', '蝶阀', '球阀', '闸阀', '截止阀', '止回阀', '安全阀', '调节阀'],
      '管道': ['管', '管道', '法兰', '弯头', '三通', '接头', '管件', '波纹管'],
      '电机': ['电机', '电动机', '减速机', '马达', '变频电机', '防爆电机'],
      '仪表': ['仪表', '传感器', '变送器', '控制器', 'PLC', '流量计', '压力表', '温度计'],
      '过滤设备': ['过滤器', '滤芯', '滤袋', '滤网', '压滤机', '过滤机'],
      '换热设备': ['换热器', '冷凝器', '冷却器', '加热器', '散热器'],
      '风机': ['风机', '鼓风机', '引风机', '轴流风机', '离心风机'],
      '压缩机': ['压缩机', '空压机', '空气压缩机'],
      '环保设备': ['除尘器', '脱硫', '脱硝', '污水处理', '废气处理'],
      '电气设备': ['配电箱', '配电柜', '开关柜', '控制柜', '变频柜']
    };

    for (const [category, keywords] of Object.entries(categoryMap)) {
      for (const keyword of keywords) {
        if (name.includes(keyword) || model.includes(keyword) || specs.includes(keyword)) {
          return category;
        }
      }
    }

    return '其他';
  }

  /**
   * 获取类别基准价格（扩展版）
   */
  static getCategoryBasePrice(category: string): number {
    const priceMap: Record<string, number> = {
      '搅拌设备': 8000,
      '泵类': 3500,
      '阀门': 850,
      '管道': 500,
      '电机': 2200,
      '仪表': 1200,
      '过滤设备': 1500,
      '换热设备': 5000,
      '风机': 4000,
      '压缩机': 6000,
      '环保设备': 10000,
      '电气设备': 3000,
      '其他': 1000
    };
    return priceMap[category] || 1000;
  }

  /**
   * 批量匹配价格（优化版）
   */
  static async matchPrices(
    products: ProductMatch[],
    userId?: string
  ): Promise<PriceMatchResult[]> {
    console.log('[PriceMatcher] 开始批量价格匹配，数量:', products.length);
    
    const results: PriceMatchResult[] = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`[PriceMatcher] 匹配第 ${i + 1}/${products.length} 个产品:`, product.name);
      
      const result = await this.matchPrice(product, userId);
      results.push(result);
    }

    // 统计匹配结果
    const stats = {
      total: results.length,
      database: results.filter(r => r.source === 'database').length,
      knowledge: results.filter(r => r.source === 'knowledge').length,
      market: results.filter(r => r.source === 'market').length,
      estimate: results.filter(r => r.source === 'estimate').length,
      default: results.filter(r => r.source === 'default').length
    };
    
    console.log('[PriceMatcher] 批量匹配完成，统计:', stats);

    return results;
  }

  /**
   * 获取价格区间（用于显示）
   */
  static getPriceRange(price: number, confidence: number): {
    min: number;
    max: number;
    suggested: number;
  } {
    let range = 0.2; // 默认±20%
    
    if (confidence >= 90) {
      range = 0.1; // 高置信度 ±10%
    } else if (confidence >= 70) {
      range = 0.15; // 中置信度 ±15%
    } else if (confidence >= 50) {
      range = 0.2; // 低置信度 ±20%
    } else {
      range = 0.3; // 极低置信度 ±30%
    }

    return {
      min: Math.round(price * (1 - range)),
      max: Math.round(price * (1 + range)),
      suggested: price
    };
  }

  /**
   * 分配产品推荐标签
   */
  private static assignProductTags(_product: any): string[] {
    // 注意：bid_amount, quote_count, rating 列在数据库中不存在，暂返回空数组
    return [];
  }

  /**
   * 格式化价格显示
   */
  static formatPriceWithSource(result: PriceMatchResult): string {
    const sourceMap = {
      'database': '📦 价格库',
      'knowledge': '📚 知识库',
      'market': '💰 市场价',
      'estimate': '📊 估算价',
      'default': '⚡ 默认价'
    };

    const sourceText = sourceMap[result.source] || result.source;
    let resultStr = `¥${result.price.toFixed(2)} (${sourceText}, 置信度${result.confidence}%)`;
    
    if (result.marketPrice && result.source !== 'market') {
      resultStr += ` [市场价: ¥${result.marketPrice.toFixed(2)}]`;
    }
    
    return resultStr;
  }

  /**
   * 获取匹配建议
   */
  static getMatchAdvice(result: PriceMatchResult): string {
    if (result.confidence >= 80) {
      return '✅ 推荐使用此价格';
    } else if (result.confidence >= 60) {
      return '⚠️ 建议人工复核';
    } else {
      return '❌ 仅供参考，请核实';
    }
  }
}
