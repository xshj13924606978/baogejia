import { NextRequest, NextResponse } from 'next/server';
import { OcrHelper } from '@/utils/ocr-helper';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { PriceMatcher, ProductMatch } from '@/lib/price-matching';
import { InputProcessor, ProcessedInput } from '@/lib/input-processor';
import {  IntentResult } from '@/lib/intent-detector';
import { Logger } from '@/lib/logger';
// 导入 DeepSeek 客户端
import { aiClient } from '@/lib/deepseek-client';
// 导入智能对话处理器（替代固定意图检测）
import { smartChatProcessor } from '@/lib/smart-chat-processor';
// 导入增强版参数清洗函数
import { cleanParameterDescriptionEnhanced } from '@/utils/string-cleaner-enhanced';

// ============================================================================
// 类型定义
// ============================================================================

interface Product {
  name: string;
  model: string;
  brand: string;
  specs: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  remark: string;
  category?: string;
}

interface FileInfo {
  name: string;
  type: string;
  url: string;
  fileKey: string;
  buffer?: Buffer;
  isMock?: boolean;
}

interface ParseResult {
  products: Product[];
  globalRemarks: string[];
  parseLevel: string;
}

// ============================================================================
// 联网搜索服务（增强版，支持价格查询）
// ============================================================================

class WebSearchService {
  /**
   * 执行联网搜索并生成方案
   */
  async searchAndGenerate(query: string): Promise<{
    content: string;
    sources: Array<{ title: string; url: string }>;
    followUpQuestions?: string[];
  }> {
    console.log('[WebSearch] ========== 开始联网搜索 ==========');
    console.log('[WebSearch] 查询词:', query);

    try {
      // 模拟搜索结果（实际应调用搜索引擎API）
      const searchResults = await this.performSearch(query);
      console.log(`[WebSearch] 搜索到 ${searchResults.length} 条结果`);

      // 生成方案内容
      const content = this.generateSolution(query, searchResults);

      // 生成跟进问题
      const followUpQuestions = this.generateFollowUpQuestions(query);

      return {
        content,
        sources: searchResults.map((r) => ({ title: r.title, url: r.url })),
        followUpQuestions,
      };
    } catch (error) {
      console.error('[WebSearch] 搜索失败:', error);
      return {
        content: this.getFallbackContent(query),
        sources: [],
        followUpQuestions: this.generateFollowUpQuestions(query),
      };
    }
  }

  /**
   * 专门用于价格查询的联网搜索
   */
  async searchPrices(products: Product[]): Promise<{
    matchedProducts: Array<
      Product & {
        marketPrice: number;
        priceRange: { min: number; max: number };
        source: string;
        confidence: number;
        brandPrices?: Array<{ brand: string; price: number }>;
      }
    >;
    content: string;
    sources: Array<{ title: string; url: string }>;
  }> {
    console.log('[WebSearch] ========== 开始价格联网搜索 ==========');
    console.log('[WebSearch] 产品数量:', products.length);

    try {
      const matchedProducts = [];
      const allSources: Array<{ title: string; url: string }> = [];

      for (const product of products) {
        console.log(`[WebSearch] 搜索产品: ${product.name} ${product.specs || ''}`);

        // 构建搜索查询
        const searchQuery = `${product.name} ${product.specs || ''} 市场价格 采购价`.trim();

        // 执行搜索
        const searchResults = await this.performPriceSearch(searchQuery, product);

        // 提取价格信息
        const priceInfo = this.extractPriceFromResults(searchResults, product);

        matchedProducts.push({
          ...product,
          marketPrice: priceInfo.price,
          priceRange: priceInfo.range,
          source: priceInfo.source,
          confidence: priceInfo.confidence,
          brandPrices: priceInfo.brandPrices,
        });

        // 收集来源
        searchResults.slice(0, 3).forEach((r) => {
          if (!allSources.some((s) => s.url === r.url)) {
            allSources.push({ title: r.title, url: r.url });
          }
        });
      }

      // 生成价格报告
      const content = this.generatePriceReport(products, matchedProducts);

      console.log('[WebSearch] 价格搜索完成');

      return {
        matchedProducts,
        content,
        sources: allSources,
      };
    } catch (error) {
      console.error('[WebSearch] 价格搜索失败:', error);
      return {
        matchedProducts: products.map((p) => ({
          ...p,
          marketPrice: 0,
          priceRange: { min: 0, max: 0 },
          source: 'error',
          confidence: 0,
        })),
        content: '价格搜索失败，请稍后重试',
        sources: [],
      };
    }
  }

  /**
   * 执行价格搜索
   */
  private async performPriceSearch(
    query: string,
    product: Product
  ): Promise<
    Array<{
      title: string;
      url: string;
      snippet: string;
      content: string;
      price?: number;
      brand?: string;
    }>
  > {
    // 这里应该调用真实的搜索引擎API

    // 模拟搜索结果 - 根据不同产品类型返回不同的价格数据
    const results: Array<{
      title: string;
      url: string;
      snippet: string;
      content: string;
      price?: number;
      brand?: string;
    }> = [];

    // 污水处理设备
    if (product.name.includes('污水') || product.name.includes('处理')) {
      const scale = product.specs?.match(/(\d+)\s*吨/) || [];
      const capacity = scale[1] ? parseInt(scale[1]) : 50;

      results.push({
        title: `${capacity}吨污水处理设备最新报价`,
        url: 'https://example.com/wastewater-price-1',
        snippet: `${capacity}吨/天一体化污水处理设备价格分析`,
        content: `根据市场调研，${capacity}吨/天污水处理设备价格区间：碳钢设备${Math.round(capacity * 0.08)}-${Math.round(capacity * 0.12)}万元，不锈钢设备${Math.round(capacity * 0.15)}-${Math.round(capacity * 0.2)}万元`,
        price: capacity * 1000,
      });

      results.push({
        title: `2024年污水处理设备采购价格指南`,
        url: 'https://example.com/wastewater-price-guide',
        snippet: '包含不同材质、不同工艺的污水处理设备价格对比',
        content: `主流品牌价格：A/O工艺${Math.round(capacity * 0.1)}-${Math.round(capacity * 0.15)}万元，MBR工艺${Math.round(capacity * 0.25)}-${Math.round(capacity * 0.35)}万元`,
        price: capacity * 1200,
        brand: '主流品牌',
      });
    }

    // 水泵设备
    else if (product.name.includes('泵') || product.name.includes('水泵')) {
      const pumpTypes = {
        离心泵: { min: 1500, max: 8000 },
        螺杆泵: { min: 3000, max: 12000 },
        隔膜泵: { min: 2000, max: 6000 },
        潜水泵: { min: 1000, max: 5000 },
      };

      let pumpType = '离心泵';
      for (const [type, range] of Object.entries(pumpTypes)) {
        if (product.name.includes(type)) {
          pumpType = type;
          results.push({
            title: `${type}市场价格行情`,
            url: 'https://example.com/pump-price',
            snippet: `${type}不同品牌价格对比`,
            content: `${type}价格范围：${range.min}-${range.max}元，格兰富品牌价格约${Math.round(range.max * 1.5)}元`,
            price: (range.min + range.max) / 2,
          });
          break;
        }
      }

      // 添加品牌价格
      results.push({
        title: '格兰富水泵官方价格表',
        url: 'https://example.com/grundfos-price',
        snippet: '格兰富各型号水泵价格查询',
        content: `格兰富${pumpType}价格：基础型${Math.round(pumpTypes[pumpType as keyof typeof pumpTypes]?.max || 5000)}元，智能型${Math.round((pumpTypes[pumpType as keyof typeof pumpTypes]?.max || 5000) * 1.8)}元`,
        price: pumpTypes[pumpType as keyof typeof pumpTypes]?.max || 5000,
        brand: '格兰富',
      });

      results.push({
        title: '威乐水泵经销商报价',
        url: 'https://example.com/wilo-price',
        snippet: '威乐水泵区域代理价格',
        content: `威乐${pumpType}：标准款${Math.round((pumpTypes[pumpType as keyof typeof pumpTypes]?.max || 5000) * 0.9)}元`,
        price: (pumpTypes[pumpType as keyof typeof pumpTypes]?.max || 5000) * 0.9,
        brand: '威乐',
      });

      results.push({
        title: '南方泵业产品报价单',
        url: 'https://example.com/cnp-price',
        snippet: '南方泵业全系列产品价格',
        content: `南方${pumpType}：${Math.round(pumpTypes[pumpType as keyof typeof pumpTypes]?.min || 3000)}-${Math.round(pumpTypes[pumpType as keyof typeof pumpTypes]?.max || 6000)}元`,
        price: pumpTypes[pumpType as keyof typeof pumpTypes]?.min || 3000,
        brand: '南方泵业',
      });
    }

    // 搅拌罐/反应釜
    else if (product.name.includes('搅拌罐') || product.name.includes('反应釜')) {
      const volume = product.specs?.match(/(\d+)\s*(m³|立方|L)/) || [];
      const vol = volume[1] ? parseInt(volume[1]) : 5;

      results.push({
        title: `${vol}m³不锈钢搅拌罐价格`,
        url: 'https://example.com/mixer-price',
        snippet: `${vol}立方不锈钢搅拌罐最新报价`,
        content: `${vol}m³不锈钢搅拌罐价格：${vol * 3000}-${vol * 5000}元，带搅拌电机${vol * 6000}-${vol * 8000}元`,
        price: vol * 4000,
      });

      results.push({
        title: '反应釜市场价格分析',
        url: 'https://example.com/reactor-price',
        snippet: '不同材质、不同容积反应釜价格对比',
        content: `碳钢反应釜：${vol * 2000}-${vol * 3500}元，不锈钢反应釜：${vol * 4000}-${vol * 7000}元，搪瓷反应釜：${vol * 5000}-${vol * 9000}元`,
        price: vol * 5000,
      });
    }

    // 通用产品
    else {
      results.push({
        title: `${product.name}市场价格查询`,
        url: 'https://example.com/general-price',
        snippet: `${product.name}最新市场报价`,
        content: `${product.name}市场参考价：1000-5000元/台，具体价格取决于品牌、规格和采购数量`,
        price: 3000,
      });

      results.push({
        title: `2024年${product.name}采购指南`,
        url: 'https://example.com/buying-guide',
        snippet: `${product.name}选型要点和价格参考`,
        content: `主流品牌${product.name}价格范围：2000-8000元，建议批量采购可享受8-9折优惠`,
        price: 4000,
        brand: '主流品牌',
      });
    }

    return results;
  }

  /**
   * 从搜索结果中提取价格信息
   */
  private extractPriceFromResults(
    results: any[],
    product: Product
  ): {
    price: number;
    range: { min: number; max: number };
    source: string;
    confidence: number;
    brandPrices?: Array<{ brand: string; price: number }>;
  } {
    let prices: number[] = [];
    let brandPrices: Array<{ brand: string; price: number }> = [];

    // 提取所有价格
    for (const result of results) {
      if (result.price) {
        prices.push(result.price);
      }

      // 从内容中提取价格
      const priceMatches = result.content.match(/(\d+(?:\.?\d+)?)[,，]?(\d+(?:\.?\d+)?)?/g);
      if (priceMatches) {
        priceMatches.forEach((match: string) => {
          const num = parseFloat(match.replace(/[,，]/g, ''));
          if (!isNaN(num) && num > 10 && num < 1000000) {
            prices.push(num);
          }
        });
      }

      // 提取品牌价格
      if (result.brand && result.price) {
        brandPrices.push({
          brand: result.brand,
          price: result.price,
        });
      }
    }

    if (prices.length === 0) {
      // 根据产品类型估算默认价格
      let defaultPrice = 5000;
      if (product.name.includes('污水')) defaultPrice = 100000;
      else if (product.name.includes('泵')) defaultPrice = 3000;
      else if (product.name.includes('罐')) defaultPrice = 8000;

      return {
        price: defaultPrice,
        range: { min: defaultPrice * 0.7, max: defaultPrice * 1.3 },
        source: 'estimate',
        confidence: 0.3,
      };
    }

    // 计算价格区间
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

    return {
      price: Math.round(median),
      range: {
        min: Math.round(prices[0]),
        max: Math.round(prices[prices.length - 1]),
      },
      source: 'web_search',
      confidence: prices.length > 5 ? 0.8 : 0.6,
      brandPrices: brandPrices.length > 0 ? brandPrices : undefined,
    };
  }

  /**
   * 生成价格报告
   */
  private generatePriceReport(originalProducts: Product[], matchedProducts: any[]): string {
    let content = `### 💰 实时市场价格参考\n\n`;

    for (let i = 0; i < matchedProducts.length; i++) {
      const p = matchedProducts[i];
      const _original = originalProducts[i];

      content += `**${i + 1}. ${p.name}**`;
      if (p.specs) content += ` ${p.specs}`;
      content += `\n\n`;

      if (p.source === 'web_search') {
        content += `| 项目 | 价格 |\n`;
        content += `|------|------|\n`;
        content += `| 市场参考价 | ¥${p.marketPrice.toLocaleString()}/${p.unit || '台'} |\n`;
        content += `| 价格区间 | ¥${p.priceRange.min.toLocaleString()} - ¥${p.priceRange.max.toLocaleString()} |\n`;
        content += `| 数据来源 | 实时网络搜索 |\n`;
        content += `| 可信度 | ${Math.round(p.confidence * 100)}% |\n\n`;

        if (p.brandPrices && p.brandPrices.length > 0) {
          content += `**不同品牌价格参考：**\n`;
          p.brandPrices.forEach((bp: any) => {
            content += `- ${bp.brand}：¥${bp.price.toLocaleString()}\n`;
          });
          content += `\n`;
        }

        content += `**价格影响因素：**\n`;
        content += `- 品牌差异：不同品牌价格差异可达30-50%\n`;
        content += `- 材质选择：不锈钢比碳钢贵40-60%\n`;
        content += `- 自动化程度：全自动比手动贵20-30%\n`;
        content += `- 采购数量：批量采购可享受8-9折优惠\n\n`;
      } else {
        content += `**估算价格：** ¥${p.marketPrice.toLocaleString()}/${p.unit || '台'}\n`;
        content += `*注：此为系统估算价，实际价格可能有较大差异，建议进行联网搜索获取实时报价*\n\n`;
      }
    }

    content += `---\n\n`;
    content += `💡 **我可以为您：**\n`;
    content += `1️⃣ 生成详细报价单（含产品规格、价格明细）\n`;
    content += `2️⃣ 提供不同品牌价格对比\n`;
    content += `3️⃣ 根据您的预算推荐合适方案\n\n`;

    return content;
  }

  /**
   * 执行搜索（模拟实现）
   */
  private async performSearch(query: string): Promise<
    Array<{
      title: string;
      url: string;
      snippet: string;
      content: string;
    }>
  > {
    // 这里应该调用真实的搜索引擎API
    // 例如：Google Search API, Bing Search API, 或自建搜索服务

    // 模拟搜索结果 - 以污水设备为例
    if (query.includes('污水') || query.includes('处理') || query.includes('设备')) {
      return [
        {
          title: '一体化污水处理设备选型指南',
          url: 'https://example.com/sewage-guide',
          snippet: '本文详细介绍一体化污水处理设备的选型要点，包括处理规模、出水标准、工艺流程等。',
          content: `
            一体化污水处理设备根据处理工艺可分为：
            1. A/O工艺：适合生活污水，出水可达一级B标准
            2. A²/O工艺：脱氮除磷效果好，出水可达一级A标准
            3. MBR工艺：出水水质最好，可直接回用，但投资较高
            4. MBBR工艺：处理效率高，占地小，适合改造项目
          `,
        },
        {
          title: '50吨污水处理设备价格分析',
          url: 'https://example.com/50t-price',
          snippet:
            '详细分析日处理50吨污水处理设备的价格构成，包括设备材质、品牌、自动化程度等因素。',
          content: `
            50吨/天污水处理设备价格区间：
            - 基础碳钢设备：3-5万元
            - 标准A/O工艺：8-12万元
            - A²/O工艺设备：15-20万元
            - MBR膜设备：25-35万元
            - 全自动集装箱式：30-45万元
          `,
        },
        {
          title: 'MBR膜技术在污水处理中的应用',
          url: 'https://example.com/mbr-tech',
          snippet: 'MBR膜生物反应器技术介绍、优缺点分析及应用案例。',
          content: `
            MBR膜技术优势：
            - 出水水质好，可直接回用
            - 占地面积小
            - 污泥产量低
            - 自动化程度高
            
            缺点：
            - 投资成本高
            - 膜组件需定期更换
            - 能耗相对较高
          `,
        },
        {
          title: '污水处理设备材质对比',
          url: 'https://example.com/material-compare',
          snippet: '碳钢、不锈钢、玻璃钢三种材质在污水处理设备中的应用对比。',
          content: `
            材质对比：
            - 碳钢：价格低，需防腐处理，寿命8-10年
            - 不锈钢：耐腐蚀，寿命15年以上，价格是碳钢的2-3倍
            - 玻璃钢：轻质高强，耐腐蚀，适合地下安装
          `,
        },
        {
          title: '农村污水处理典型案例',
          url: 'https://example.com/rural-case',
          snippet: '某农村50吨/天污水处理站建设运营案例分析。',
          content: `
            案例：某村50吨/天污水处理站
            - 工艺：A²/O+深度过滤
            - 投资：85万元
            - 运行成本：0.8元/吨
            - 出水标准：一级A
            - 占地：120平方米
          `,
        },
      ];
    }

    // 默认搜索结果
    return [
      {
        title: `关于"${query}"的搜索结果`,
        url: 'https://example.com/search',
        snippet: '为您整理了相关信息和解决方案',
        content: `根据您的查询"${query}"，我们为您提供以下信息...`,
      },
    ];
  }

  /**
   * 生成方案内容
   */
  private generateSolution(query: string, results: any[]): string {
    // 提取关键信息
    const priceInfo = this.extractPriceInfo(query, results);
    const techInfo = this.extractTechInfo(query, results);
    const caseInfo = this.extractCaseInfo(results);

    // 构建方案内容
    let content = `关于您咨询的“${query}”，我为您整理了以下信息：\n\n`;

    // 添加价格信息
    if (priceInfo) {
      content += `### 💰 价格参考\n${priceInfo}\n\n`;
    }

    // 添加技术信息
    if (techInfo) {
      content += `### 🔧 技术方案\n${techInfo}\n\n`;
    }

    // 添加案例
    if (caseInfo) {
      content += `### 📋 典型案例\n${caseInfo}\n\n`;
    }

    // 添加选购建议
    content += this.getRecommendations(query, results);

    return content;
  }

  /**
   * 生成跟进问题
   */
  private generateFollowUpQuestions(_query: string): string[] {
    const questions = [
      '您需要处理的是什么类型的水？（生活污水/工业废水）',
      '对出水水质有什么要求？（排放标准/回用标准）',
      '项目预算大概是多少？',
      '现场条件如何？（有无电力、占地大小等）',
      '是否需要自动化控制系统？',
    ];

    return questions;
  }

  /**
   * 提取价格信息
   */
  private extractPriceInfo(query: string, _results: any): string {
    // 整理价格表格
    let table = '| 设备类型 | 参考价格 | 特点 |\n|---------|---------|-----|\n';

    if (query.includes('50吨') || query.includes('50t') || query.includes('50吨/天')) {
      table += '| 基础碳钢设备 | 3-5万元 | 传统工艺，适合预算有限的项目 |\n';
      table += '| 标准A/O工艺 | 8-12万元 | 性价比高，处理达标 |\n';
      table += '| A²/O工艺 | 15-20万元 | 脱氮除磷效果好 |\n';
      table += '| MBR膜设备 | 25-35万元 | 出水水质好，可回用 |\n';
      table += '| 全自动集装箱式 | 30-45万元 | 集成度高，安装便捷 |\n';
    } else {
      // 通用价格信息
      table += '| 处理规模 | 投资估算 | 运行成本 |\n';
      table += '|---------|---------|---------|\n';
      table += '| 10吨/天 | 15-25万元 | 0.8-1.2元/吨 |\n';
      table += '| 50吨/天 | 45-85万元 | 0.6-1.0元/吨 |\n';
      table += '| 100吨/天 | 80-150万元 | 0.5-0.8元/吨 |\n';
      table += '| 500吨/天 | 300-500万元 | 0.4-0.6元/吨 |\n';
    }

    return table;
  }

  /**
   * 提取技术信息
   */
  private extractTechInfo(_query: string, _results: any): string {
    let info = '';

    // 工艺对比
    info += '**主流工艺对比：**\n\n';
    info += '| 工艺 | 适用场景 | 优点 | 缺点 |\n';
    info += '|------|---------|------|------|\n';
    info += '| A/O工艺 | 生活污水 | 投资低，运行简单 | 脱氮效果一般 |\n';
    info += '| A²/O工艺 | 需脱氮除磷 | 处理效果好 | 运行管理要求高 |\n';
    info += '| MBR工艺 | 高标准排放 | 出水水质好 | 投资高，膜需更换 |\n';
    info += '| MBBR工艺 | 改造扩容 | 占地小，效率高 | 填料需补充 |\n';

    return info;
  }

  /**
   * 提取案例信息
   */
  private extractCaseInfo(_results: any): string {
    let info = '';

    info += '**成功案例：**\n\n';
    info += '1. **某农村50吨/天污水处理站**\n';
    info += '   - 工艺：A²/O+深度过滤\n';
    info += '   - 投资：85万元\n';
    info += '   - 运行成本：0.8元/吨\n';
    info += '   - 出水标准：一级A\n\n';

    info += '2. **某工业园区100吨/天废水处理**\n';
    info += '   - 工艺：预处理+MBR\n';
    info += '   - 投资：280万元\n';
    info += '   - 运行成本：1.5元/吨\n';
    info += '   - 回用率：70%\n';

    return info;
  }

  /**
   * 获取选购建议
   */
  private getRecommendations(query: string, _results: any): string {
    let recommendations = '### 💡 选购建议\n\n';

    if (query.includes('农村') || query.includes('生活污水')) {
      recommendations += '对于生活污水处理，建议：\n';
      recommendations += '1. **预算有限**：选择碳钢材质的A/O工艺设备\n';
      recommendations += '2. **要求达标**：选择A²/O工艺+深度过滤\n';
      recommendations += '3. **高标准回用**：选择MBR工艺\n';
      recommendations += '4. **考虑自动化**：配置PLC自动控制系统\n';
    } else if (query.includes('工业') || query.includes('废水')) {
      recommendations += '对于工业废水处理，建议：\n';
      recommendations += '1. **先做水质分析**，确定主要污染物\n';
      recommendations += '2. **考虑预处理**，根据水质选择调节、中和等工艺\n';
      recommendations += '3. **主工艺选择**：生化处理可选A/O、MBR\n';
      recommendations += '4. **深度处理**：根据排放标准选择过滤、消毒等\n';
    } else {
      recommendations += '选择污水处理设备时需考虑：\n';
      recommendations += '1. **处理规模**：根据实际水量确定\n';
      recommendations += '2. **出水标准**：明确排放或回用要求\n';
      recommendations += '3. **投资预算**：平衡初期投资和运行成本\n';
      recommendations += '4. **运维能力**：考虑自动化程度和维护要求\n';
    }

    return recommendations;
  }

  /**
   * 获取备用内容（搜索失败时）
   */
  private getFallbackContent(query: string): string {
    return `关于您咨询的“${query}”，我为您整理了以下基本信息：

### 💰 价格参考
| 设备类型 | 参考价格 | 特点 |
|---------|---------|-----|
| 基础碳钢设备 | 3-5万元 | 传统工艺，适合预算有限的项目 |
| 标准A/O工艺 | 8-12万元 | 性价比高，处理达标 |
| A²/O工艺 | 15-20万元 | 脱氮除磷效果好 |
| MBR膜设备 | 25-35万元 | 出水水质好，可回用 |

### 🔧 技术方案
**主流工艺对比：**
| 工艺 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| A/O工艺 | 生活污水 | 投资低，运行简单 | 脱氮效果一般 |
| A²/O工艺 | 需脱氮除磷 | 处理效果好 | 运行管理要求高 |
| MBR工艺 | 高标准排放 | 出水水质好 | 投资高，膜需更换 |

### 💡 选购建议
1. **处理规模**：根据实际水量确定
2. **出水标准**：明确排放或回用要求
3. **投资预算**：平衡初期投资和运行成本
4. **运维能力**：考虑自动化程度和维护要求

---
如需更详细的方案，请提供具体的水质参数、排放标准等要求。`;
  }
}

// ============================================================================
// 文字描述解析器（完全保留）
// ============================================================================

class TextParser {
  /**
   * 从文字描述中提取产品信息（增强版，避免错误分割）
   */
  parse(text: string): Product[] {
    console.log('[TextParser] ========== 开始解析文字描述 ==========');
    console.log('[TextParser] 原始文本:', text);

    const products: Product[] = [];

    // 1. 清理文本（去除多余空格、换行）
    const cleanText = text.replace(/\s+/g, ' ').trim();
    console.log('[TextParser] 清理后文本:', cleanText);

    // 2. 判断是否为单产品描述（包含规格说明但不应分割）
    const isSingleProduct = this.isSingleProductDescription(cleanText);
    console.log('[TextParser] 是否为单产品描述:', isSingleProduct);

    if (isSingleProduct) {
      // 如果是单产品描述，整体解析为一个产品
      console.log('[TextParser] 检测为单产品描述，整体解析');
      const product = this.parseAsSingleProduct(cleanText);
      if (product) {
        products.push(product);
      }
    } else {
      // 多产品描述，按分隔符分割
      console.log('[TextParser] 检测为多产品描述，尝试分割');

      // 尝试按常见分隔符分割
      const separators = ['；', ';', '。', '，', ',', '、'];
      let lines = [cleanText];

      for (const sep of separators) {
        if (cleanText.includes(sep)) {
          lines = cleanText
            .split(sep)
            .map((l) => l.trim())
            .filter((l) => l);
          console.log(`[TextParser] 使用分隔符 "${sep}" 分割为 ${lines.length} 部分`);
          break;
        }
      }

      // 逐行解析
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        console.log(`[TextParser] 解析第 ${i + 1} 行:`, line);

        const product = this.extractProductFromLine(line);
        if (product) {
          console.log(`[TextParser] 第 ${i + 1} 行解析到产品:`, product);
          products.push(product);
        } else {
          console.log(`[TextParser] 第 ${i + 1} 行未解析到产品`);
        }
      }
    }

    // 3. 如果仍然没有解析到产品，尝试按产品名称分割
    if (products.length === 0) {
      console.log('[TextParser] 未按行解析到产品，尝试全文解析');
      const product = this.parseAsSingleProduct(cleanText);
      if (product) {
        products.push(product);
      }
    }

    console.log(`[TextParser] 解析完成，共解析到 ${products.length} 个产品`);
    console.log('[TextParser] ========== 解析结束 ==========');

    return products;
  }

  /**
   * 判断是否为单产品描述
   * 规则：包含规格说明（数量、型号、处理量等），但不应分割
   */
  private isSingleProductDescription(text: string): boolean {
    // 特征1：包含数量词但没有明确的产品分隔符
    const hasQuantity = /(\d+)\s*(吨|套|台|个|只|件|组)/.test(text);

    // 特征2：包含规格描述（如"处理量"、"型号"等）
    const hasSpecKeywords = /处理量|处理能力|规格|型号|尺寸|φ|Φ|直径|容积|容量/.test(text);

    // 特征3：没有明显的产品分隔符（如多个产品名称）
    const productKeywords = ['泵', '阀', '罐', '机', '器', '设备', '系统', '装置'];
    const keywordCount = productKeywords.filter((k) => text.includes(k)).length;

    // 特征4：文本长度较短（通常单产品描述不会太长）
    const isShort = text.length < 50;

    // 特征5：包含"一套"、"一台"等数量单位，但没有明确分割
    const hasUnit = /一(套|台|个|只|件|组)/.test(text);

    console.log('[TextParser] 单产品判断特征:', {
      hasQuantity,
      hasSpecKeywords,
      keywordCount,
      isShort,
      hasUnit,
    });

    // 如果有规格描述且有数量词，但产品关键词数量<=1，认为是单产品
    return (hasSpecKeywords || hasQuantity || hasUnit) && keywordCount <= 1;
  }

  /**
   * 将整个文本解析为单个产品
   */
  private parseAsSingleProduct(text: string): Product | null {
    console.log('[TextParser] 解析为单个产品:', text);

    // 提取产品名称
    const name = this.extractProductName(text);
    if (!name) return null;

    // 提取型号/规格
    const model = this.extractModel(text);

    // 提取处理量/规格
    const specs = this.extractSpecs(text);

    // 提取数量
    let quantity = 1;
    const qtyMatch = text.match(/(\d+)\s*(套|台|个|只|件|组)/);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1]);
    }

    // 提取单位
    let unit = '套';
    const unitMatch = text.match(/(套|台|个|只|件|组)/);
    if (unitMatch) {
      unit = unitMatch[1];
    }

    // 组合完整的规格描述
    const fullSpecs = [model, specs].filter((s) => s).join(' ');

    return {
      name,
      model: model || '',
      brand: '',
      specs: fullSpecs || '',
      quantity,
      unit,
      price: 0,
      total: 0,
      remark: '来自文字描述',
    };
  }

  /**
   * 提取产品名称
   */
  private extractProductName(text: string): string | null {
    // 常见工业设备关键词（按优先级排序）
    const productKeywords = [
      '污水一体化设备',
      '一体化污水处理设备',
      '污水处理设备',
      '搅拌罐',
      '反应釜',
      '混合机',
      '搅拌器',
      '离心泵',
      '螺杆泵',
      '隔膜泵',
      '齿轮泵',
      '潜水泵',
      '排污泵',
      '蝶阀',
      '球阀',
      '闸阀',
      '截止阀',
      '止回阀',
      '过滤器',
      '滤芯',
      '压滤机',
      '换热器',
      '冷凝器',
      '冷却器',
      '风机',
      '鼓风机',
      '压缩机',
      '电机',
      '减速机',
      '仪表',
      '传感器',
      '变送器',
      '加药装置',
      '二氧化氯发生器',
      '消毒设备',
    ];

    // 优先匹配完整关键词
    for (const keyword of productKeywords) {
      if (text.includes(keyword)) {
        console.log(`[TextParser] 匹配到产品关键词: ${keyword}`);
        return keyword;
      }
    }

    // 如果没有匹配到完整关键词，尝试匹配包含关键词的短语
    const keywordPattern = /([^，,。.、\s]+(?:设备|装置|机|器|泵|阀|罐))/;
    const match = text.match(keywordPattern);
    if (match) {
      return match[1];
    }

    return null;
  }

  /**
   * 提取型号
   */
  private extractModel(text: string): string {
    // 型号模式：字母+数字的组合，如 IS150-125-250, LPD-2000, φ4000×3000
    const modelPatterns = [
      /([A-Za-z]+[\d\-]+[A-Za-z\d\-]*)/, // IS150-125-250
      /(φ|Φ)?\s*(\d+[xX×]\d+[xX×]?\d*)/, // φ4000×3000
      /([A-Z]+[\d\-]+)/, // LPD-2000
    ];

    for (const pattern of modelPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return '';
  }

  /**
   * 提取规格（处理量、尺寸等）
   */
  private extractSpecs(text: string): string {
    // 处理量模式：如 50吨/天, 100m³/h, 50t/d
    const capacityPatterns = [
      /(\d+)\s*(吨|t|T)\s*[\/每]\s*(天|日|d|D)/, // 50吨/天
      /(\d+)\s*(m³|立方)\s*[\/每]\s*(小时|h|H)/, // 100m³/h
      /处理量[：:]\s*(\d+)\s*(吨|t|m³|立方)/, // 处理量：50吨
      /(\d+)\s*吨/, // 50吨
      /(\d+)\s*立方/, // 50立方
    ];

    for (const pattern of capacityPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }

    // 尺寸模式
    const sizePatterns = [
      /(\d+[xX×]\d+[xX×]?\d*)/, // 4000×3000
      /φ\s*\d+/, // φ4000
    ];

    for (const pattern of sizePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return '';
  }

  /**
   * 从单行文本提取产品（用于多产品场景）
   */
  private extractProductFromLine(line: string): Product | null {
    // 先尝试整体解析为单个产品
    return this.parseAsSingleProduct(line);
  }
}

// ============================================================================
// 文件下载器（完全保留）
// ============================================================================

class FileDownloader {
  async download(file: any, _fileKey: any): Promise<Buffer | null> {
    console.log('[Downloader] 开始下载文件:', file?.name || '未知');

    if (file?.buffer) {
      console.log('[Downloader] 使用已有的 buffer');
      return file.buffer;
    }

    if (file?.url) {
      try {
        console.log('[Downloader] 从 URL 下载:', file.url);
        const response = await fetch(file.url, {
          signal: AbortSignal.timeout(30000), // 30秒超时
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          console.log('[Downloader] 下载成功，大小:', arrayBuffer.byteLength);
          return Buffer.from(arrayBuffer);
        } else {
          console.error('[Downloader] 下载失败，状态码:', response.status);
        }
      } catch (error) {
        console.error('[Downloader] 下载失败:', error);
        if (error instanceof Error && error.name === 'AbortError') {
          console.error('[Downloader] 下载超时（30秒）');
        }
      }
    }

    console.error('[Downloader] 无法获取文件内容');
    return null;
  }
}

// ============================================================================
// Excel 解析器（优化版 - 支持合并单元格和多行文本）
// ============================================================================

class ExcelParser {
  async parse(buffer: Buffer): Promise<ParseResult> {
    console.log('[Excel] 开始解析Excel文件');

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true, cellText: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // 获取合并单元格信息
      const merges = worksheet['!merges'] || [];
      console.log('[Excel] 合并单元格数量:', merges.length);

      // 转换为二维数组，保留原始格式
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const data: any[][] = [];

      for (let R = range.s.r; R <= range.e.r; ++R) {
        const row: any[] = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          row.push(cell ? cell.v : undefined);
        }
        data.push(row);
      }

      // 创建合并单元格值映射
      const mergeValueMap = new Map<string, any>();
      for (const merge of merges) {
        const topLeftAddress = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
        const topLeftCell = worksheet[topLeftAddress];
        if (topLeftCell && topLeftCell.v !== undefined) {
          mergeValueMap.set(`${merge.s.r},${merge.s.c}`, topLeftCell.v);
        }
      }

      // 辅助函数：获取单元格值（处理合并单元格）
      const getCellValue = (row: number, col: number): any => {
        if (row < 0 || row >= data.length) return undefined;
        const rowData = data[row];
        if (!rowData || col < 0 || col >= rowData.length) return undefined;

        // 如果当前单元格有值，直接返回
        if (rowData[col] !== undefined && rowData[col] !== '') {
          return rowData[col];
        }

        // 检查是否在合并区域内
        for (const merge of merges) {
          if (row >= merge.s.r && row <= merge.e.r && col >= merge.s.c && col <= merge.e.c) {
            return mergeValueMap.get(`${merge.s.r},${merge.s.c}`);
          }
        }

        return rowData[col];
      };

      // 查找表头行
      let headerRow = -1;
      let nameCol = -1;
      let specsCol = -1;
      let quantityCol = -1;
      let unitCol = -1;
      let brandCol = -1;  // 新增：品牌列

      console.log('[Excel] 开始查找表头...');
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        // 将行数据转换为字符串进行匹配
        const rowStr = row
          .map((cell) => (cell ? String(cell) : ''))
          .join('|')
          .toLowerCase();

        console.log(`[Excel] 第${i}行内容:`, rowStr);

        // 检测是否为表头行 - 更严格的匹配
        if (rowStr.includes('产品名称') || rowStr.includes('设备名称') || 
            (rowStr.includes('名称') && (rowStr.includes('规格') || rowStr.includes('数量')))) {
          headerRow = i;

          // 识别列位置 - 精确匹配
          row.forEach((cell, col) => {
            const cellStr = cell ? String(cell).trim().toLowerCase() : '';
            
            // 产品名称列 - 精确匹配
            if (cellStr === '产品名称' || cellStr === '设备名称' || 
                cellStr === '名称' || cellStr === '项目名称') {
              nameCol = col;
              console.log(`[Excel] 识别产品名称列: 第${col}列 (${cellStr})`);
            }
            
            // 规格型号列 - 精确匹配
            if (cellStr === '规格型号' || cellStr === '规格' || cellStr === '型号' ||
                cellStr === '参数描述' || cellStr === '技术参数' || cellStr === '参数' ||
                cellStr === '简介说明' || cellStr === '设备规格') {
              specsCol = col;
              console.log(`[Excel] 识别规格型号列: 第${col}列 (${cellStr})`);
            }
            
            // 数量列
            if (cellStr === '数量' || cellStr === '台数' || cellStr === '套数') {
              quantityCol = col;
              console.log(`[Excel] 识别数量列: 第${col}列 (${cellStr})`);
            }
            
            // 单位列
            if (cellStr === '单位') {
              unitCol = col;
              console.log(`[Excel] 识别单位列: 第${col}列 (${cellStr})`);
            }
            
            // 品牌列
            if (cellStr === '品牌' || cellStr === '厂家' || cellStr === '制造商') {
              brandCol = col;
              console.log(`[Excel] 识别品牌列: 第${col}列 (${cellStr})`);
            }
          });

          console.log('[Excel] 找到表头行:', i, '列位置:', {
            nameCol,
            specsCol,
            quantityCol,
            unitCol,
            brandCol,
          });
          break;
        }
      }

      if (headerRow === -1) {
        console.warn('[Excel] 未找到表头行，尝试使用默认列位置');
        headerRow = 0;
        nameCol = 0;  // 默认第一列
        specsCol = 1; // 默认第二列
        quantityCol = 2;
        unitCol = 3;
      }

      // 备注过滤关键词
      const remarkKeywords = [
        '备注', '说明', '注意', '注：', '注:', '以上', '以下', '合计', '总计',
        '小计', '本页', '共页', '审核', '批准', '编制', '日期', '签名',
        '技术要求', '质量要求', '交货期', '付款方式', '质保', '售后服务'
      ];
      
      // 检查是否是备注行的函数
      const isRemarkRow = (rowData: any[]): boolean => {
        const rowStr = rowData.map(cell => cell ? String(cell).trim() : '').join(' ').toLowerCase();
        
        // 如果整行以备注关键词开头，认为是备注行
        for (const keyword of remarkKeywords) {
          if (rowStr.startsWith(keyword.toLowerCase())) {
            return true;
          }
        }
        
        // 如果行中包含多个备注关键词，认为是备注行
        let keywordCount = 0;
        for (const keyword of remarkKeywords) {
          if (rowStr.includes(keyword.toLowerCase())) {
            keywordCount++;
          }
        }
        if (keywordCount >= 2) {
          return true;
        }
        
        // 如果第一列包含备注关键词且没有产品名称
        const firstCell = rowData[0] ? String(rowData[0]).trim().toLowerCase() : '';
        if (remarkKeywords.some(kw => firstCell.includes(kw.toLowerCase()))) {
          return true;
        }
        
        return false;
      };

      // 解析数据行
      const products: Product[] = [];
      const productMap = new Map<string, Product>(); // 用于去重：产品名称 -> 产品对象
      let lastProductName = ''; // 记录上一个产品名称

      console.log('[Excel] 开始解析数据行...');

      for (let i = headerRow + 1; i < data.length; i++) {
        const row = data[i];

        // 检查整行是否为空，如果是则跳过
        const isRowEmpty = row.every(
          (cell) => cell === undefined || cell === '' || String(cell).trim() === ''
        );

        if (isRowEmpty) {
          console.log(`[Excel] 第${i}行: 空行，跳过`);
          continue;
        }
        
        // 检查是否是备注行
        if (isRemarkRow(row)) {
          console.log(`[Excel] 第${i}行: 备注行，跳过 - ${row.slice(0, 3).join(' | ')}`);
          continue;
        }

        const nameValue = getCellValue(i, nameCol);
        const rawProductName = nameValue ? String(nameValue).trim() : '';
        
        // 跳过没有产品名称的行（除非有规格内容要追加到上一个产品）
        if (!rawProductName) {
          // 检查是否有规格内容要追加
          if (specsCol !== -1 && lastProductName !== '') {
            const specsValue = getCellValue(i, specsCol);
            if (specsValue && String(specsValue).trim()) {
              const currentProduct = productMap.get(lastProductName);
              if (currentProduct) {
                const specsStr = String(specsValue).trim();
                if (currentProduct.specs) {
                  currentProduct.specs += '\n' + specsStr;
                } else {
                  currentProduct.specs = specsStr;
                }
                console.log(`[Excel] 第${i}行: 规格追加到 ${lastProductName} - ${specsStr.substring(0, 30)}...`);
              }
            }
          }
          continue;
        }
        
        // 分离产品名称和参数描述（如果名称中包含换行符或参数描述）
        let productName = rawProductName;
        let extractedSpecs = '';
        
        // 检查产品名称是否包含多行内容（换行符分隔）
        if (rawProductName.includes('\n')) {
          const parts = rawProductName.split('\n').filter(p => p.trim());
          if (parts.length > 1) {
            // 第一部分作为产品名称，其余部分作为参数描述
            productName = parts[0].trim();
            extractedSpecs = parts.slice(1).join(' ').trim();
            console.log(`[Excel] 从产品名称中分离出参数描述: "${extractedSpecs.substring(0, 50)}..."`);
          }
        }
        
        // 检查产品名称是否以常见参数开头（如尺寸、功率等）- 更严格的判断
        const specPattern = /^[\dφΦ×xX\-]+\d|^功率\s*\d|^电压\s*\d|^容量\s*\d|^尺寸\s*\d/i;
        if (specPattern.test(productName) && lastProductName !== '' && productName.length < 50) {
          // 如果当前"产品名称"实际上是参数描述，追加到上一个产品
          const currentProduct = productMap.get(lastProductName);
          if (currentProduct) {
            if (currentProduct.specs) {
              currentProduct.specs += '\n' + productName;
            } else {
              currentProduct.specs = productName;
            }
            console.log(`[Excel] 第${i}行: 参数描述追加到 ${lastProductName}`);
            continue;
          }
        }

        // 如果当前行有产品名称且与上一个不同，说明是一个新产品
        if (productName !== '' && productName !== lastProductName) {
          // 保存上一个产品（如果有的话）
          if (lastProductName !== '' && productMap.has(lastProductName)) {
            const product = productMap.get(lastProductName)!;
            // 只有当产品还没有添加到数组时才添加
            if (!products.some((p) => p.name === product.name)) {
              products.push(product);
            }
          }

          // 创建新产品
          const specsValue = getCellValue(i, specsCol) || '';
          const quantityValue = getCellValue(i, quantityCol) || '';
          const unitValue = getCellValue(i, unitCol) || '';
          const brandValue = brandCol !== -1 ? getCellValue(i, brandCol) : '';

          let quantity = 1;
          const qtyMatch = String(quantityValue).match(/(\d+)/);
          if (qtyMatch) {
            quantity = parseInt(qtyMatch[1]);
          }

          // 合并从产品名称中提取的参数描述和规格列的内容
          let finalSpecs = '';
          if (extractedSpecs && String(specsValue).trim()) {
            finalSpecs = extractedSpecs + '\n' + String(specsValue).trim();
          } else if (extractedSpecs) {
            finalSpecs = extractedSpecs;
          } else {
            finalSpecs = String(specsValue).trim();
          }

          const newProduct: Product = {
            name: productName,
            model: '',
            brand: String(brandValue).trim(),
            specs: finalSpecs,
            quantity: quantity,
            unit: String(unitValue).trim() || '套',
            price: 0,
            total: 0,
            remark: '',
          };

          productMap.set(productName, newProduct);
          lastProductName = productName;
          console.log(`[Excel] 第${i}行: 新产品 - ${productName}`);
        } else {
          // 如果当前行没有产品名称或产品名称相同，追加规格说明
          if (lastProductName !== '' && productMap.has(lastProductName)) {
            const currentProduct = productMap.get(lastProductName)!;

            if (specsCol !== -1) {
              const specsValue = getCellValue(i, specsCol);
              if (
                specsValue !== undefined &&
                specsValue !== '' &&
                String(specsValue).trim() !== ''
              ) {
                const specsStr = String(specsValue).trim();
                if (currentProduct.specs) {
                  currentProduct.specs += '\n' + specsStr;
                } else {
                  currentProduct.specs = specsStr;
                }
                console.log(
                  `[Excel] 第${i}行: 追加规格到 ${productName || lastProductName} - ${specsStr}`
                );
              }
            }
          }
        }
      }

      // 保存最后一个产品
      if (lastProductName !== '' && productMap.has(lastProductName)) {
        const product = productMap.get(lastProductName)!;
        if (!products.some((p) => p.name === product.name)) {
          products.push(product);
        }
      }

      console.log(`[Excel] 解析完成，共 ${products.length} 个产品`);
      products.forEach((p, idx) => {
        console.log(`[Excel] 产品${idx + 1}: ${p.name}, 规格行数: ${p.specs.split('\n').length}`);
      });

      return {
        products,
        globalRemarks: [],
        parseLevel: 'excel',
      };
    } catch (error) {
      console.error('[Excel] 解析失败:', error);
      return {
        products: [],
        globalRemarks: ['Excel解析失败: ' + (error instanceof Error ? error.message : '未知错误')],
        parseLevel: 'error',
      };
    }
  }
}

// ============================================================================
// PDF 解析器（使用增强版解析器）
// ============================================================================

class PdfParser {
  private ocrHelper: OcrHelper;

  constructor() {
    this.ocrHelper = new OcrHelper();
  }

  async parse(fileInfo: FileInfo): Promise<ParseResult> {
    Logger.info('[PDF] 开始解析PDF文件', { name: fileInfo.name, size: fileInfo.buffer?.length });

    if (!fileInfo.buffer) {
      return { products: [], globalRemarks: ['无法读取PDF'], parseLevel: 'error' };
    }

    try {
      // 优先使用pdf-parse库解析（适用于文本型PDF）
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(fileInfo.buffer);

      Logger.info('[PDF] pdf-parse解析成功', {
        pageCount: data.numpages,
        textLength: data.text?.length || 0,
      });

      if (data.text && data.text.trim().length > 0) {
        const tableProducts = this.ocrHelper.extractProductsFromTable(data.text);

        const products = tableProducts.map((p) => {
          // 使用增强版清洗函数处理 specs
          const cleanResult = cleanParameterDescriptionEnhanced(p.specs || '');
          const cleanedSpecs = cleanResult.cleaned;
          
          // 记录清洗统计
          if (cleanResult.statistics.removedChars > 0) {
            Logger.info('[PDF] specs清洗统计', {
              productName: p.name,
              originalLength: cleanResult.statistics.originalLength,
              cleanedLength: cleanResult.statistics.cleanedLength,
              removedChars: cleanResult.statistics.removedChars,
            });
          }
          
          return {
            name: p.name,
            model: p.model || '',
            brand: '',
            specs: cleanedSpecs,  // 使用清洗后的 specs
            quantity: p.quantity,
            unit: p.unit,
            price: 0,
            total: 0,
            remark: '从PDF提取',
          };
        });

        Logger.info('[PDF] 解析成功', { productCount: products.length });
        return {
          products,
          globalRemarks: [],
          parseLevel: 'pdf-parse',
        };
      } else {
        Logger.warn('[PDF] 未提取到文本内容');
        return {
          products: [],
          globalRemarks: ['PDF未包含可提取的文本内容'],
          parseLevel: 'error',
        };
      }
    } catch (error) {
      Logger.error('[PDF] pdf-parse解析失败', error);

      // 如果pdf-parse失败，尝试使用OcrHelper的recognizePdf方法
      try {
        Logger.info('[PDF] 尝试使用OCR辅助解析...');
        const { text } = await this.ocrHelper.recognizePdf(fileInfo.buffer);

        if (text && text.trim().length > 0) {
          const tableProducts = this.ocrHelper.extractProductsFromTable(text);

          const products = tableProducts.map((p) => {
            // 使用增强版清洗函数处理 specs
            const cleanResult = cleanParameterDescriptionEnhanced(p.specs || '');
            const cleanedSpecs = cleanResult.cleaned;
            
            return {
              name: p.name,
              model: p.model || '',
              brand: '',
              specs: cleanedSpecs,  // 使用清洗后的 specs
              quantity: p.quantity,
              unit: p.unit,
              price: 0,
              total: 0,
              remark: '通过OCR提取',
            };
          });

          Logger.info('[PDF] OCR解析成功', { productCount: products.length });
          return {
            products,
            globalRemarks: [],
            parseLevel: 'ocr',
          };
        }
      } catch (ocrError) {
        Logger.error('[PDF] OCR解析也失败', ocrError);
      }

      return { products: [], globalRemarks: ['PDF解析失败'], parseLevel: 'error' };
    }
  }
}

// ============================================================================
// Word 解析器（完全保留）
// ============================================================================

class WordParser {
  async parse(fileInfo: FileInfo): Promise<ParseResult> {
    console.log('[Word] 开始解析Word文件');

    try {
      if (!fileInfo.buffer) {
        return { products: [], globalRemarks: [], parseLevel: 'error' };
      }

      const result = await mammoth.extractRawText({ buffer: fileInfo.buffer });
      const text = result.value;

      const products: Product[] = [];
      const lines = text.split('\n');

      // 简单的产品提取逻辑
      for (const line of lines) {
        if (line.includes('产品') || line.includes('型号')) {
          // TODO: 实现更复杂的Word解析逻辑
        }
      }

      return {
        products,
        globalRemarks: [],
        parseLevel: 'word',
      };
    } catch (error) {
      console.error('[Word] 解析失败:', error);
      return { products: [], globalRemarks: ['Word解析失败'], parseLevel: 'error' };
    }
  }
}

// ============================================================================
// 对话回复生成器（完全保留）
// ============================================================================

class ConversationGenerator {
  /**
   * 生成文字性回复
   */
  generateTextResponse(message: string): string {
    console.log('[Conversation] 生成文字回复:', message);

    // 检查是否是问候语
    if (this.isGreeting(message)) {
      return this.getGreetingResponse();
    }

    // 检查是否是常见问题
    if (this.isCommonQuestion(message)) {
      return this.getCommonQuestionResponse(message);
    }

    // 检查是否是价格询问
    if (this.isPriceInquiry(message)) {
      return this.getPriceInquiryResponse(message);
    }

    // 检查是否是技术咨询
    if (this.isTechnicalInquiry(message)) {
      return this.getTechnicalResponse(message);
    }

    // 默认回复
    return this.getDefaultResponse();
  }

  /**
   * 判断是否为问候语
   */
  private isGreeting(message: string): boolean {
    const greetings = [
      '你好',
      '您好',
      'hi',
      'hello',
      '在吗',
      '在不在',
      '早上好',
      '下午好',
      '晚上好',
    ];
    return greetings.some((g) => message.toLowerCase().includes(g));
  }

  /**
   * 获取问候回复
   */
  private getGreetingResponse(): string {
    return `您好！我是报个价助手，可以帮您：
• 查询产品价格
• 生成报价单
• 解析产品清单
• 提供技术方案

您可以直接描述产品需求，或上传Excel/PDF文件，我会为您处理。`;
  }

  /**
   * 判断是否为常见问题
   */
  private isCommonQuestion(message: string): boolean {
    const questions = ['怎么用', '如何使用', '功能介绍', '能做什么', '收费'];
    return questions.some((q) => message.includes(q));
  }

  /**
   * 获取常见问题回复
   */
  private getCommonQuestionResponse(message: string): string {
    if (message.includes('收费')) {
      return `目前基础报价功能免费使用，高级功能正在开发中，敬请期待！`;
    }

    return `我可以帮您：
1. 📊 生成报价单 - 上传Excel或描述产品需求
2. 💰 查询价格 - 直接输入产品名称和规格
3. 📁 解析文件 - 支持Excel、PDF格式
4. 📝 技术方案 - 提供产品选型建议

需要什么帮助，请随时告诉我！`;
  }

  /**
   * 判断是否为价格询问
   */
  private isPriceInquiry(message: string): boolean {
    const priceKeywords = ['价格', '多少钱', '报价', '价格表', '单价', '市场价'];
    return priceKeywords.some((k) => message.includes(k));
  }

  /**
   * 获取价格询问回复
   */
  private getPriceInquiryResponse(_message: any): string {
    return `关于您询问的价格，我可以为您：
1. 🔍 查询数据库中的历史价格
2. 📊 参考市场价格
3. 📄 生成详细报价单

请确认是否需要生成报价单？`;
  }

  /**
   * 判断是否为技术咨询
   */
  private isTechnicalInquiry(message: string): boolean {
    const techKeywords = ['技术', '工艺', '原理', '流程', '方案', '设计', '选型', '怎么选'];
    return techKeywords.some((k) => message.includes(k));
  }

  /**
   * 获取技术咨询回复
   */
  private getTechnicalResponse(_message: any): string {
    return `关于您咨询的技术问题，我可以为您：
1. 🔧 提供技术方案建议
2. 📋 分享典型案例
3. 📊 对比不同工艺
4. 💡 给出选型建议

请确认是否需要生成技术方案？`;
  }

  /**
   * 获取默认回复
   */
  private getDefaultResponse(): string {
    return `收到您的问题。我可以帮您：
• 查询产品价格
• 生成报价单
• 解析产品清单
• 提供技术方案

需要我为您生成报价单或技术方案吗？`;
  }

  /**
   * 生成意图选择提示
   */
  generateIntentPrompt(products?: Product[]): string {
    if (products && products.length > 0) {
      return `我理解您需要的是：\n${products.map((p) => `• ${p.name} ${p.specs || ''}`).join('\n')}\n\n请选择您需要的服务：`;
    }

    return `请选择您需要的服务：`;
  }
}

// ============================================================================
// 上下文记忆管理器（新增）
// ============================================================================

class ConversationMemory {
  private conversations: Map<
    string,
    {
      history: Array<{ role: string; content: string; timestamp: number }>;
      userInfo: Map<string, any>;
      lastTopic: string;
      preferences: Map<string, any>;
    }
  > = new Map();

  /**
   * 获取或创建对话记忆
   */
  getMemory(conversationId: string) {
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, {
        history: [],
        userInfo: new Map(),
        lastTopic: '',
        preferences: new Map(),
      });
    }
    return this.conversations.get(conversationId)!;
  }

  /**
   * 添加对话历史
   */
  addToHistory(conversationId: string, role: 'user' | 'assistant', content: string) {
    const memory = this.getMemory(conversationId);
    memory.history.push({
      role,
      content,
      timestamp: Date.now(),
    });

    // 只保留最近20条记录
    if (memory.history.length > 20) {
      memory.history = memory.history.slice(-20);
    }
  }

  /**
   * 获取最近的对话上下文
   */
  getContext(conversationId: string, maxLength: number = 5): string {
    const memory = this.getMemory(conversationId);
    const recent = memory.history.slice(-maxLength);
    return recent.map((h) => `${h.role === 'user' ? '用户' : '助手'}: ${h.content}`).join('\n');
  }

  /**
   * 更新用户信息
   */
  updateUserInfo(conversationId: string, key: string, value: any) {
    const memory = this.getMemory(conversationId);
    memory.userInfo.set(key, value);
  }

  /**
   * 获取用户信息
   */
  getUserInfo(conversationId: string, key: string) {
    const memory = this.getMemory(conversationId);
    return memory.userInfo.get(key);
  }

  /**
   * 更新最后讨论的主题
   */
  updateLastTopic(conversationId: string, topic: string) {
    const memory = this.getMemory(conversationId);
    memory.lastTopic = topic;
  }

  /**
   * 获取最后讨论的主题
   */
  getLastTopic(conversationId: string): string {
    const memory = this.getMemory(conversationId);
    return memory.lastTopic || '';
  }
}

// ============================================================================
// 专业领域知识库（新增）
// ============================================================================

class DomainKnowledgeBase {
  // 污水处理知识库
  private wastewaterKnowledge = {
    processes: {
      'A/O': {
        fullName: '缺氧/好氧工艺',
        application: '生活污水处理，适用于脱氮要求一般的场合',
        advantages: ['投资较低', '运行简单', '维护方便'],
        disadvantages: ['脱氮效率70-80%', '除磷效果有限', '占地面积较大'],
        suitable: '适用于COD浓度适中、氨氮要求一般的城镇污水',
        price: '8-12万元/50吨',
        case: '某农村50吨/天生活污水站，投资85万元，运行成本0.8元/吨',
      },
      'A²/O': {
        fullName: '厌氧-缺氧-好氧工艺',
        application: '生活污水处理，同时脱氮除磷',
        advantages: ['脱氮效率85-90%', '除磷效果好', '运行稳定'],
        disadvantages: ['运行管理要求高', '碳源需求量大', '污泥处理复杂'],
        suitable: '适用于对氮磷排放要求严格的生活污水',
        price: '15-20万元/50吨',
        case: '某住宅小区100吨/天污水处理站，投资180万元，出水一级A',
      },
      MBR: {
        fullName: '膜生物反应器',
        application: '高标准排放或回用要求的污水处理',
        advantages: ['出水水质好（可直接回用）', '占地面积小', '污泥产量低', '自动化程度高'],
        disadvantages: ['投资成本高', '膜组件需定期更换', '能耗较高'],
        suitable: '适用于出水要求高、占地有限的项目',
        price: '25-35万元/50吨',
        case: '某工业园区废水处理，MBR工艺，投资280万元，回用率70%',
      },
      MBBR: {
        fullName: '移动床生物膜反应器',
        application: '改造扩容或占地有限的项目',
        advantages: ['处理效率高', '占地小', '抗冲击负荷强'],
        disadvantages: ['填料需补充', '曝气系统要求高', '设计经验要求高'],
        suitable: '适用于现有设施改造或扩容',
        price: '18-25万元/50吨',
        case: '某工厂废水处理改造，MBBR工艺，处理效率提升40%',
      },
    },

    materials: {
      碳钢: {
        pros: '价格低，强度高',
        cons: '需防腐处理，寿命8-10年',
        price: '基础价格',
        suitable: '预算有限、室内安装',
      },
      不锈钢: {
        pros: '耐腐蚀，寿命15年以上',
        cons: '价格是碳钢的2-3倍',
        price: '+4-5万元/50吨',
        suitable: '恶劣环境、高标准要求',
      },
      玻璃钢: {
        pros: '轻质高强，耐腐蚀',
        cons: '抗冲击性较差',
        price: '+3-4万元/50吨',
        suitable: '地埋式安装、潮湿环境',
      },
    },

    standards: {
      一级B: {
        description: '适用于排入地表水体',
        indicators: 'COD≤60mg/L，BOD≤20mg/L，NH3-N≤8mg/L',
        application: '一般排放标准',
      },
      一级A: {
        description: '适用于敏感区域排放',
        indicators: 'COD≤50mg/L，BOD≤10mg/L，NH3-N≤5mg/L',
        application: '高标准排放',
      },
      回用标准: {
        description: '根据回用用途确定',
        indicators: 'COD≤30mg/L，BOD≤6mg/L，NH3-N≤1.5mg/L',
        application: '中水回用、绿化浇灌',
      },
    },
  };

  // 水泵知识库
  private pumpKnowledge = {
    types: {
      离心泵: {
        application: '清水、污水输送，流量大、扬程适中',
        price: '1500-8000元/台',
        brands: ['格兰富', '威乐', '南方泵业'],
      },
      螺杆泵: {
        application: '高粘度介质、污泥输送',
        price: '3000-12000元/台',
        brands: ['西派克', '耐驰', '艾迪'],
      },
      隔膜泵: {
        application: '含颗粒介质、计量输送',
        price: '2000-6000元/台',
        brands: ['英格索兰', '威尔顿', '边锋'],
      },
    },

    selectionGuide: `**水泵选型要点：**
1. **流量(Q)**：根据实际需求确定，m³/h或L/s
2. **扬程(H)**：包括静扬程+管路损失，单位米
3. **介质特性**：温度、粘度、腐蚀性、含固量
4. **安装方式**：卧式/立式、自吸/非自吸
5. **材质要求**：铸铁/不锈钢/工程塑料`,
  };

  /**
   * 获取污水处理知识
   */
  getWastewaterKnowledge(query: string): string {
    const keywords = {
      工艺: this.wastewaterKnowledge.processes,
      材质: this.wastewaterKnowledge.materials,
      标准: this.wastewaterKnowledge.standards,
    };

    for (const [key, value] of Object.entries(keywords)) {
      if (query.includes(key)) {
        return this.formatKnowledge(key, value);
      }
    }

    return '';
  }

  /**
   * 获取水泵知识
   */
  getPumpKnowledge(query: string): string {
    if (query.includes('选型')) {
      return this.pumpKnowledge.selectionGuide;
    }

    for (const [type, info] of Object.entries(this.pumpKnowledge.types)) {
      if (query.includes(type)) {
        return this.formatPumpInfo(type, info);
      }
    }

    return '';
  }

  private formatKnowledge(type: string, data: any): string {
    let result = `**${type}对比分析**\n\n`;

    for (const [key, value] of Object.entries(data)) {
      result += `**${key}**：\n`;
      if (typeof value === 'object' && value !== null) {
        const comparisonData = value as {
          advantages?: string[];
          disadvantages?: string[];
          price?: string;
          suitable?: string;
          case?: string;
        };
        if (comparisonData.advantages) {
          result += `- 优势：${comparisonData.advantages.join('、')}\n`;
        }
        if (comparisonData.disadvantages) {
          result += `- 劣势：${comparisonData.disadvantages.join('、')}\n`;
        }
        if (comparisonData.price) {
          result += `- 参考价格：${comparisonData.price}\n`;
        }
        if (comparisonData.suitable) {
          result += `- 适用场景：${comparisonData.suitable}\n`;
        }
        if (comparisonData.case) {
          result += `- 案例：${comparisonData.case}\n`;
        }
      }
      result += '\n';
    }

    return result;
  }

  private formatPumpInfo(type: string, info: any): string {
    return (
      `**${type}**\n` +
      `- 应用：${info.application}\n` +
      `- 价格：${info.price}\n` +
      `- 品牌：${info.brands.join('、')}`
    );
  }
}

// ============================================================================
// 专业对话引擎（增强版）
// ============================================================================

class ProfessionalDialogueEngine {
  private knowledgeBase: DomainKnowledgeBase;
  private memory: ConversationMemory;
  private webSearch: WebSearchService;

  constructor(memory: ConversationMemory) {
    this.knowledgeBase = new DomainKnowledgeBase();
    this.memory = memory;
    this.webSearch = new WebSearchService();
  }

  /**
   * 生成专业回复
   */
  async generateResponse(
    message: string,
    conversationId: string,
    context?: string
  ): Promise<{
    content: string;
    suggestions: string[];
    requiresFollowUp: boolean;
    followUpQuestions?: string[];
  }> {
    console.log('[ProfessionalEngine] ========== 开始分析 ==========');
    console.log('[ProfessionalEngine] 消息:', message);
    console.log('[ProfessionalEngine] 对话ID:', conversationId);

    // 1. 获取对话记忆
    const memory = this.memory.getMemory(conversationId);

    // 2. 分析意图
    const intent = this.analyzeIntent(message, memory);
    console.log('[ProfessionalEngine] 识别意图:', intent);

    // 3. 根据意图生成回复
    switch (intent.type) {
      case 'greeting':
        return this.handleGreeting(message, conversationId);
      case 'wastewater_inquiry':
        return this.handleWastewaterInquiry(message, conversationId);
      case 'pump_inquiry':
        return this.handlePumpInquiry(message, conversationId);
      case 'price_inquiry':
        return await this.handlePriceInquiry(message, conversationId);
      case 'technical_consultation':
        return this.handleTechnicalConsultation(message, conversationId);
      case 'comparison':
        return this.handleComparison(message, conversationId);
      case 'follow_up':
        return this.handleFollowUp(message, conversationId);
      default:
        return this.handleGeneralQuery(message, conversationId);
    }
  }

  /**
   * 意图分析
   */
  private analyzeIntent(message: string, memory: any): { type: string; confidence: number } {
    const msg = message.toLowerCase();

    // 问候语
    if (msg.match(/你好|您好|hi|hello|在吗|在不在/)) {
      return { type: 'greeting', confidence: 0.95 };
    }

    // 污水处理相关
    if (msg.match(/污水|处理|废水|生活污水|工业废水/)) {
      return { type: 'wastewater_inquiry', confidence: 0.9 };
    }

    // 水泵相关
    if (msg.match(/泵|水泵|离心泵|螺杆泵|隔膜泵/)) {
      return { type: 'pump_inquiry', confidence: 0.9 };
    }

    // 价格询问
    if (msg.match(/价格|多少钱|报价|市场价/)) {
      return { type: 'price_inquiry', confidence: 0.85 };
    }

    // 技术咨询
    if (msg.match(/技术|工艺|原理|怎么选|选型|如何选择/)) {
      return { type: 'technical_consultation', confidence: 0.9 };
    }

    // 产品对比
    if (msg.match(/对比|比较|哪个好|区别|差异/)) {
      return { type: 'comparison', confidence: 0.9 };
    }

    // 跟进对话
    if (memory.lastTopic && msg.length < 20) {
      return { type: 'follow_up', confidence: 0.7 };
    }

    return { type: 'general', confidence: 0.5 };
  }

  /**
   * 处理问候
   */
  private handleGreeting(
    message: string,
    conversationId: string
  ): {
    content: string;
    suggestions: string[];
    requiresFollowUp: boolean;
  } {
    const hour = new Date().getHours();
    let greeting = '';

    if (hour < 6) greeting = '凌晨好';
    else if (hour < 12) greeting = '早上好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 18) greeting = '下午好';
    else greeting = '晚上好';

    // 获取之前的对话记录
    const context = this.memory.getContext(conversationId, 3);
    const hasHistory = context.length > 0;

    let content = `${greeting}！我是您的专业报价助手✨\n\n`;

    if (hasHistory) {
      content += `欢迎回来！我们之前聊过：\n${context}\n\n`;
    }

    content +=
      `**我可以帮您解决这些问题：**\n\n` +
      `💧 **污水处理设备**\n` +
      `   - 工艺选择：A/O、A²/O、MBR对比\n` +
      `   - 价格分析：不同配置的价格差异\n` +
      `   - 选型建议：根据水质、规模推荐\n` +
      `   - 典型案例：成功项目参考\n\n` +
      `⚙️ **水泵设备**\n` +
      `   - 类型对比：离心泵、螺杆泵、隔膜泵\n` +
      `   - 选型指南：流量、扬程计算\n` +
      `   - 价格查询：不同品牌价格\n` +
      `   - 品牌推荐：主流品牌特点\n\n` +
      `📊 **报价生成**\n` +
      `   - 产品清单解析\n` +
      `   - 自动价格匹配\n` +
      `   - 专业报价单生成\n\n` +
      `🔧 **技术支持**\n` +
      `   - 工艺方案设计\n` +
      `   - 设备选型指导\n` +
      `   - 运行维护建议`;

    const suggestions = [
      '污水处理设备怎么选型',
      '50吨/天设备价格',
      'A/O和MBR工艺对比',
      '离心泵选型指南',
    ];

    return {
      content,
      suggestions,
      requiresFollowUp: true,
    };
  }

  /**
   * 处理污水处理咨询
   */
  private handleWastewaterInquiry(
    message: string,
    conversationId: string
  ): {
    content: string;
    suggestions: string[];
    requiresFollowUp: boolean;
    followUpQuestions?: string[];
  } {
    const msg = message.toLowerCase();

    // 检查是否包含具体规模
    const scaleMatch = msg.match(/(\d+)\s*吨/);
    const hasScale = !!scaleMatch;

    // 检查是否包含工艺
    const hasProcess =
      msg.includes('工艺') || msg.includes('A/O') || msg.includes('A2O') || msg.includes('MBR');

    // 检查是否包含材质
    const hasMaterial = msg.includes('材质') || msg.includes('碳钢') || msg.includes('不锈钢');

    // 检查是否包含标准
    const hasStandard = msg.includes('标准') || msg.includes('一级A') || msg.includes('一级B');

    let content = '';
    let followUpQuestions: string[] = [];

    if (hasScale && (hasProcess || hasMaterial || hasStandard)) {
      // 用户提供了详细信息，可以给出专业建议
      const scale = scaleMatch ? scaleMatch[1] : '50';
      content = `根据您提供的${scale}吨/天处理规模，我为您分析如下：\n\n`;

      // 添加工艺对比
      content += this.knowledgeBase.getWastewaterKnowledge('工艺');

      // 根据具体问题补充信息
      if (hasProcess) {
        content += `\n**工艺选择建议：**\n`;
        content += `- 生活污水：推荐A²/O工艺，脱氮除磷效果好\n`;
        content += `- 高标准排放：推荐MBR工艺，出水可直接回用\n`;
        content += `- 预算有限：可考虑A/O工艺，投资较低\n`;
      }

      if (hasMaterial) {
        content += this.knowledgeBase.getWastewaterKnowledge('材质');
      }

      if (hasStandard) {
        content += this.knowledgeBase.getWastewaterKnowledge('标准');
      }

      followUpQuestions = [
        '您处理的是什么类型的水？（生活污水/工业废水）',
        '对出水水质有什么具体要求？',
        '项目预算大概是多少？',
        '现场条件如何？（占地、电力等）',
      ];
    } else {
      // 信息不足，引导用户提供更多信息
      content = `关于污水处理设备，我可以从多个维度帮您分析：\n\n`;
      content += `**请告诉我更多信息：**\n\n`;
      content += `1️⃣ **处理规模** - 如50吨/天、100吨/天\n`;
      content += `2️⃣ **水质类型** - 生活污水/工业废水\n`;
      content += `3️⃣ **工艺要求** - A/O、A²/O、MBR等\n`;
      content += `4️⃣ **材质要求** - 碳钢、不锈钢、玻璃钢\n`;
      content += `5️⃣ **出水标准** - 一级A、一级B、回用标准\n\n`;
      content += `您提供的信息越详细，我的建议就越精准！`;

      followUpQuestions = [
        '处理规模是多少吨/天？',
        '处理的是什么类型的水？',
        '对工艺有什么具体要求吗？',
      ];
    }

    // 更新最后讨论的主题
    this.memory.updateLastTopic(conversationId, '污水处理');

    const suggestions = [
      '50吨/天生活污水设备价格',
      'A/O和MBR工艺对比',
      '不锈钢和碳钢材质对比',
      '一级A标准要求',
    ];

    return {
      content,
      suggestions,
      requiresFollowUp: true,
      followUpQuestions,
    };
  }

  /**
   * 处理水泵咨询
   */
  private handlePumpInquiry(
    message: string,
    conversationId: string
  ): {
    content: string;
    suggestions: string[];
    requiresFollowUp: boolean;
    followUpQuestions?: string[];
  } {
    const msg = message.toLowerCase();

    // 获取水泵知识
    const pumpKnowledge = this.knowledgeBase.getPumpKnowledge(msg);

    let content =
      pumpKnowledge ||
      `关于水泵设备，我可以帮您：\n\n` +
        `**常见水泵类型：**\n` +
        `- 离心泵：清水输送，流量大\n` +
        `- 螺杆泵：高粘度介质，污泥输送\n` +
        `- 隔膜泵：含颗粒介质，计量输送\n\n` +
        `**选型需要参数：**\n` +
        `- 流量(Q)：单位m³/h或L/s\n` +
        `- 扬程(H)：单位米\n` +
        `- 介质特性：温度、粘度、腐蚀性\n` +
        `- 安装方式：卧式/立式`;

    const suggestions = [
      '离心泵选型指南',
      '格兰富水泵价格',
      '水泵扬程计算方法',
      '不同品牌水泵对比',
    ];

    const followUpQuestions = [
      '需要什么类型的水泵？',
      '流量和扬程要求是多少？',
      '输送的是什么介质？',
    ];

    this.memory.updateLastTopic(conversationId, '水泵');

    return {
      content,
      suggestions,
      requiresFollowUp: true,
      followUpQuestions,
    };
  }

  /**
   * 处理价格咨询（增强版：优先知识库匹配，失败则联网搜索）
   */
  private async handlePriceInquiry(
    message: string,
    conversationId: string
  ): Promise<{
    content: string;
    suggestions: string[];
    requiresFollowUp: boolean;
    followUpQuestions?: string[];
  }> {
    console.log('[PriceInquiry] ========== 开始处理价格查询 ==========');

    // 尝试提取产品信息
    const parser = new TextParser();
    const products = parser.parse(message);

    let content = '';
    let followUpQuestions: string[] = [];

    if (products.length > 0) {
      console.log(`[PriceInquiry] 解析到 ${products.length} 个产品`);

      content = `我理解您想查询以下产品的价格：\n\n`;
      products.forEach((p, i) => {
        content += `${i + 1}. **${p.name}**`;
        if (p.specs) content += ` ${p.specs}`;
        if (p.quantity > 1) content += ` ×${p.quantity}`;
        content += '\n';
      });

      content += `\n`;

      // 第一步：尝试从价格库匹配
      console.log('[PriceInquiry] 尝试从价格库匹配...');
      const matchedProducts = [];
      const matchResults = [];

      for (const product of products) {
        const productMatch: ProductMatch = {
          name: product.name,
          model: product.model || product.specs,
          parameter_description: product.specs || product.model,
          quantity: product.quantity,
          unit: product.unit,
        };

        const matchResult = await PriceMatcher.matchPrice(productMatch, undefined);
        matchResults.push(matchResult);

        matchedProducts.push({
          ...product,
          marketPrice: matchResult.price,
          source: matchResult.source,
          confidence: matchResult.confidence,
          marketPriceInfo: matchResult.marketPrice
            ? {
                min: matchResult.marketPrice * 0.8,
                max: matchResult.marketPrice * 1.2,
              }
            : undefined,
        });
      }

      // 检查是否有足够高置信度的匹配
      const hasHighConfidenceMatch = matchResults.some(
        (r) => r.confidence >= 0.7 && r.source !== 'estimate' && r.source !== 'default'
      );

      if (hasHighConfidenceMatch) {
        console.log('[PriceInquiry] 从价格库匹配到高置信度价格');
        content += `**价格库匹配结果：**\n\n`;

        for (let i = 0; i < matchedProducts.length; i++) {
          const p = matchedProducts[i];
          const match = matchResults[i];

          content += `**${p.name}**`;
          if (p.specs) content += ` ${p.specs}`;
          content += `\n`;
          content += `- 参考价格：¥${p.marketPrice.toLocaleString()}/${p.unit || '台'}\n`;
          content += `- 价格来源：${this.getSourceName(match.source)}\n`;
          content += `- 可信度：${Math.round(match.confidence * 100)}%\n\n`;
        }

        // 添加价格影响因素说明
        content += `\n**价格影响因素：**\n`;
        content += `- 品牌差异：不同品牌价格差异可达30-50%\n`;
        content += `- 材质选择：不锈钢比碳钢贵40-60%\n`;
        content += `- 自动化程度：全自动比手动贵20-30%\n`;
        content += `- 采购数量：批量采购可享受8-9折优惠\n\n`;

        followUpQuestions = [
          '有偏好的品牌吗？',
          '对材质有什么要求？',
          '需要自动化控制吗？',
          '采购数量是多少？',
        ];
      } else {
        console.log('[PriceInquiry] 价格库匹配置信度不足，启动联网搜索');

        // 显示搜索状态
        content += `🔍 正在为您搜索实时市场价格...\n\n`;

        // 执行联网搜索获取实时价格
        const searchResult = await this.webSearch.searchPrices(products);

        content += searchResult.content;

        if (searchResult.sources && searchResult.sources.length > 0) {
          content += `\n**信息来源：**\n`;
          searchResult.sources.slice(0, 3).forEach((source, i) => {
            content += `${i + 1}. [${source.title}](${source.url})\n`;
          });
          content += `\n`;
        }

        followUpQuestions = [
          '有偏好的品牌吗？',
          '对材质有什么具体要求？',
          '需要什么配置（自动化程度）？',
          '采购数量是多少？（批量采购有优惠）',
        ];
      }

      // 添加服务选项
      content += `💡 **我可以为您：**\n`;
      content += `1️⃣ 生成详细报价单（含产品规格、价格明细）\n`;
      content += `2️⃣ 提供不同品牌价格对比\n`;
      content += `3️⃣ 根据您的预算推荐合适方案\n`;
    } else {
      console.log('[PriceInquiry] 未能解析出产品');
      content =
        `为了给您准确的价格，请提供：\n\n` +
        `- **产品名称**：如离心泵、污水处理设备\n` +
        `- **型号规格**：如IS150-125-250、50吨/天\n` +
        `- **数量**：需要几台/几套\n` +
        `- **品牌偏好**：如有指定品牌\n\n` +
        `价格会根据这些因素有较大差异，详细信息能让我报价更精准。`;

      followUpQuestions = ['需要查询什么产品的价格？', '有具体的型号或规格吗？', '需要多少数量？'];
    }

    const suggestions = [
      '格兰富水泵价格',
      '50吨污水处理设备报价',
      '不锈钢设备价格',
      '自动控制系统报价',
    ];

    // 更新最后讨论的主题
    this.memory.updateLastTopic(conversationId, '价格查询');

    console.log('[PriceInquiry] ========== 价格查询处理完成 ==========');

    return {
      content,
      suggestions,
      requiresFollowUp: true,
      followUpQuestions,
    };
  }

  /**
   * 获取来源名称
   */
  private getSourceName(source: string): string {
    const sourceMap: Record<string, string> = {
      database: '价格库',
      knowledge: '知识库',
      market: '市场参考价',
      estimate: '估算价',
      default: '默认价格',
      web_search: '实时网络搜索',
    };
    return sourceMap[source] || source;
  }

  /**
   * 处理技术咨询
   */
  private handleTechnicalConsultation(
    message: string,
    conversationId: string
  ): {
    content: string;
    suggestions: string[];
    requiresFollowUp: boolean;
    followUpQuestions?: string[];
  } {
    const msg = message.toLowerCase();

    let content = '';
    let followUpQuestions: string[] = [];

    if (msg.includes('选型') || msg.includes('怎么选')) {
      content = `**设备选型专业指南**\n\n`;
      content += `**1. 处理规模确定**\n`;
      content += `   - 根据实际水量确定设备规格\n`;
      content += `   - 建议预留10-20%余量应对峰值\n\n`;

      content += `**2. 水质分析**\n`;
      content += `   - 生活污水：COD 200-400mg/L\n`;
      content += `   - 工业废水：需专项检测\n`;
      content += `   - 特殊污染物：重金属、油脂等\n\n`;

      content += `**3. 出水标准选择**\n`;
      content += `   - 一级B：COD≤60mg/L，适用于一般排放\n`;
      content += `   - 一级A：COD≤50mg/L，适用于敏感区域\n`;
      content += `   - 回用标准：根据用途确定\n\n`;

      content += `**4. 工艺对比**\n`;
      content += this.knowledgeBase.getWastewaterKnowledge('工艺');

      followUpQuestions = ['处理规模是多少？', '进水水质情况如何？', '要求达到什么排放标准？'];
    } else {
      content =
        `关于技术问题，我可以提供：\n\n` +
        `**工艺方案设计**\n` +
        `- 根据水质特点推荐工艺路线\n` +
        `- 工艺参数计算和优化\n\n` +
        `**设备选型指导**\n` +
        `- 关键设备选型原则\n` +
        `- 品牌和型号推荐\n\n` +
        `**运行维护建议**\n` +
        `- 日常运行注意事项\n` +
        `- 常见故障处理\n\n` +
        `**成本分析**\n` +
        `- 投资估算\n` +
        `- 运行成本分析`;

      followUpQuestions = ['具体想了解哪方面的技术？', '项目处于什么阶段？', '有什么特殊要求吗？'];
    }

    const suggestions = ['工艺方案设计', '设备选型指南', '运行维护手册', '成本估算'];

    this.memory.updateLastTopic(conversationId, '技术咨询');

    return {
      content,
      suggestions,
      requiresFollowUp: true,
      followUpQuestions,
    };
  }

  /**
   * 处理产品对比
   */
  private handleComparison(
    _message: any,
    _conversationIdconversationId: string
  ): {
    content: string;
    suggestions: string[];
    requiresFollowUp: boolean;
    followUpQuestions?: string[];
  } {
    const content =
      `**产品对比分析框架**\n\n` +
      `当您需要对比不同产品时，可以从以下维度分析：\n\n` +
      `**1. 性能参数对比**\n` +
      `   - 处理能力/流量\n` +
      `   - 效率/能耗\n` +
      `   - 使用寿命\n\n` +
      `**2. 价格对比**\n` +
      `   - 初期投资\n` +
      `   - 运行成本\n` +
      `   - 维护费用\n\n` +
      `**3. 工艺对比**\n` +
      `   - 技术成熟度\n` +
      `   - 适用场景\n` +
      `   - 优缺点分析\n\n` +
      `**4. 品牌对比**\n` +
      `   - 市场口碑\n` +
      `   - 售后服务\n` +
      `   - 配件供应\n\n` +
      `请告诉我要对比的具体产品和维度，我为您详细分析。`;

    const suggestions = [
      'A/O和MBR工艺对比',
      '格兰富和威乐水泵对比',
      '不锈钢和碳钢材质对比',
      '手动和自动控制系统对比',
    ];

    const followUpQuestions = ['想对比什么产品？', '主要关注哪些方面？', '有预算限制吗？'];

    return {
      content,
      suggestions,
      requiresFollowUp: true,
      followUpQuestions,
    };
  }

  /**
   * 处理跟进对话
   */
  private handleFollowUp(
    message: string,
    conversationId: string
  ): {
    content: string;
    suggestions: string[];
    requiresFollowUp: boolean;
    followUpQuestions?: string[];
  } {
    const lastTopic = this.memory.getLastTopic(conversationId);

    let content = `关于您刚才提到的${lastTopic}，我建议您：\n\n`;
    content += `1. **明确具体需求**：提供更多细节，让我能精准分析\n`;
    content += `2. **分步推进**：先确定关键参数，再深入具体方案\n`;
    content += `3. **案例参考**：我可以分享类似项目经验\n\n`;
    content += `您想深入了解哪方面？`;

    const suggestions = ['提供更多需求细节', '查看类似案例', '技术方案建议', '成本分析'];

    return {
      content,
      suggestions,
      requiresFollowUp: true,
    };
  }

  /**
   * 处理通用查询
   */
  private handleGeneralQuery(
    _message: any,
    _conversationIdconversationId: string
  ): {
    content: string;
    suggestions: string[];
    requiresFollowUp: boolean;
    followUpQuestions?: string[];
  } {
    const content =
      `收到您的问题。我可以帮您解决以下专业问题：\n\n` +
      `💧 **污水处理设备**\n` +
      `   - 工艺选择、价格分析、选型建议\n` +
      `   - 典型案例分享\n\n` +
      `⚙️ **水泵设备**\n` +
      `   - 类型对比、选型指南、价格查询\n` +
      `   - 品牌推荐\n\n` +
      `📊 **报价生成**\n` +
      `   - 产品清单解析\n` +
      `   - 自动价格匹配\n` +
      `   - 专业报价单生成\n\n` +
      `🔧 **技术支持**\n` +
      `   - 方案设计、选型指导\n` +
      `   - 运行维护建议\n\n` +
      `您具体想了解什么？可以直接告诉我产品名称、规格和数量。`;

    const suggestions = ['污水处理设备选型', '离心泵价格查询', '生成报价单', '技术方案咨询'];

    const followUpQuestions = [
      '想了解哪方面的内容？',
      '有具体的产品或项目吗？',
      '需要什么类型的帮助？',
    ];

    return {
      content,
      suggestions,
      requiresFollowUp: true,
      followUpQuestions,
    };
  }
}

// ============================================================================
// 统一文件解析器（完全保留）
// ============================================================================

class UnifiedFileParser {
  private downloader: FileDownloader;
  private textParser: TextParser;

  constructor() {
    this.downloader = new FileDownloader();
    this.textParser = new TextParser();
  }

  async parseFile(fileInfo: FileInfo): Promise<ParseResult> {
    const ext = fileInfo.name.split('.').pop()?.toLowerCase() || '';

    console.log(`[Parser] 解析文件: ${fileInfo.name}, 类型: ${ext}`);

    try {
      if (['xlsx', 'xls'].includes(ext)) {
        const parser = new ExcelParser();
        return await parser.parse(fileInfo.buffer!);
      } else if (ext === 'pdf') {
        const parser = new PdfParser();
        return await parser.parse(fileInfo);
      } else if (['doc', 'docx'].includes(ext)) {
        const parser = new WordParser();
        return await parser.parse(fileInfo);
      }

      return { products: [], globalRemarks: ['不支持的文件类型'], parseLevel: 'error' };
    } catch (error) {
      console.error('[Parser] 解析失败:', error);
      return { products: [], globalRemarks: ['解析失败'], parseLevel: 'error' };
    }
  }

  /**
   * 解析文字描述
   */
  parseText(text: string): Product[] {
    return this.textParser.parse(text);
  }
}

// ============================================================================
// 报价生成（完全保留）
// ============================================================================

async function generateQuoteData(products: Product[]) {
  Logger.info('[QuoteGen] 开始生成报价单', { productCount: products.length });
  // 移除详细的产品列表输出，只输出产品名称
  Logger.info('[QuoteGen] 产品列表', products.map((p) => p.name).join(', '));

  // ✅ 自动获取商务信息（供应方、客户、商务条款）
  // 通过已有的 Supabase API 获取，确保与前端保存的数据一致
  let supplierData: any = null;
  let customerData: any = null;
  let termsData: any = null;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000';

    // 并行请求三个 API，获取最新的商务信息
    const [supplierRes, customerRes, termsRes] = await Promise.all([
      fetch(`${baseUrl}/api/suppliers`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${baseUrl}/api/customers`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${baseUrl}/api/terms`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    // 供应方信息（suppliers API 返回 camelCase）
    if (supplierRes?.supplier) {
      supplierData = supplierRes.supplier;
    }

    // 客户信息（customers API 返回 snake_case 数组，取最新一条）
    if (customerRes?.customers?.length > 0) {
      const c = customerRes.customers[0];
      customerData = {
        companyName: c.company_name,
        projectName: c.project_name,
        contactPerson: c.contact_person,
        phone: c.phone,
        email: c.email,
        address: c.address,
      };
    }

    // 商务条款（terms API 返回 camelCase 数组，取默认条款或第一条）
    if (termsRes?.terms?.length > 0) {
      const t = termsRes.terms.find((item: any) => item.isDefault) || termsRes.terms[0];
      termsData = t;
    }

    Logger.info('[QuoteGen] 商务信息获取成功', {
      hasSupplier: !!supplierData,
      hasCustomer: !!customerData,
      hasTerms: !!termsData,
    });
  } catch (error) {
    Logger.warn('[QuoteGen] 获取商务信息失败，使用默认信息', error);
  }

  const matchedProducts = [];
  const matchResults = [];
  const matchStats = {
    database: 0,
    knowledge: 0,
    market: 0,
    estimate: 0,
    default: 0,
  };

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[QuoteGen] ========== 处理产品 ${i + 1}/${products.length} ==========`);
    console.log('[QuoteGen] 产品:', product.name);

    // 使用 PriceMatcher 进行多级价格匹配
    const productMatch: ProductMatch = {
      name: product.name,
      model: product.model || product.specs,
      parameter_description: product.specs || product.model,
      quantity: product.quantity,
      unit: product.unit,
    };

    console.log('[QuoteGen] 调用 PriceMatcher.matchPrice');
    const matchResult = await PriceMatcher.matchPrice(productMatch, undefined);
    // 简化匹配结果输出，只输出关键信息
    console.log('[QuoteGen] 匹配结果:', {
      price: matchResult.price,
      source: matchResult.source,
      confidence: matchResult.confidence,
      productName: matchResult.productName,
    });
    matchResults.push(matchResult);

    // 统计匹配来源
    if (matchResult.source in matchStats) {
      matchStats[matchResult.source as keyof typeof matchStats]++;
    }

    matchedProducts.push({
      name: product.name,
      model: matchResult.model || product.model,
      brand: '',
      parameter_description: cleanParameterDescriptionEnhanced(product.specs || '').cleaned,
      quantity: product.quantity,
      unit: product.unit,
      unitPrice: matchResult.price,
      totalPrice: matchResult.price * product.quantity,
      note:
        matchResult.source === 'database'
          ? '来自价格库'
          : matchResult.source === 'knowledge'
            ? '来自知识库'
            : matchResult.source === 'market'
              ? '市场参考价'
              : matchResult.source === 'estimate'
                ? '估算价'
                : '默认价格',
      marketPrice: matchResult.marketPrice,
      priceSource: matchResult.source,
      confidence: matchResult.confidence,
    });
  }

  const subtotal = matchedProducts.reduce((sum, p) => sum + p.totalPrice, 0);
  const taxRate = 13;
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  console.log('[QuoteGen] ========== 报价生成完成 ==========');
  console.log('[QuoteGen] 匹配统计:', matchStats);
  console.log('[QuoteGen] 小计:', subtotal, '总计:', totalAmount);

  // ✅ 使用自动获取的商务信息，如果没有则使用默认值
  const supplier = supplierData || {};
  const customer = customerData || {};
  const terms = termsData || {};

  return {
    quoteNumber: `Q-${Date.now()}`,
    products: matchedProducts,
    subtotal,
    taxRate,
    taxAmount,
    totalAmount,
    // ✅ 整合商务条款信息
    terms: {
      payment: terms.paymentTerms || '',
      warranty: terms.warrantyPeriod || '',
      delivery: terms.deliveryPeriod || '',
      validity: terms.validityPeriod || '',
      remarks: terms.remarks || '',
    },
    // ✅ 添加供应方信息（suppliers API 返回 taxNumber，需映射到 taxId）
    supplierInfo: {
      companyName: supplier.companyName || '',
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      website: supplier.website || '',
      bankName: supplier.bankName || '',
      bankAccount: supplier.bankAccount || '',
      taxId: supplier.taxNumber || supplier.taxId || '',
    },
    // ✅ 添加客户信息（已在上游转换为 camelCase）
    customerInfo: {
      name: customer.companyName || '',
      projectName: customer.projectName || '',
      contactPerson: customer.contactPerson || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
    },
    matchStats,
  };
}

// ============================================================================
// 辅助函数（完全保留）
// ============================================================================

function processUploadedFile(file: any) {
  if (typeof file === 'string') {
    return { name: '文件', type: 'application/octet-stream', url: file };
  }

  return {
    name: file.name || file.fileName || '未知文件',
    type: file.type || 'application/octet-stream',
    url: file.url || '',
  };
}

// ============================================================================
// 项目信息解析器（新增）- 用于解析详细的项目需求
// ============================================================================

class ProjectInfoParser {
  /**
   * 解析项目描述中的关键信息
   */
  parseProjectInfo(text: string): {
    scale?: number; // 处理规模（吨/天）
    tankSize?: string; // 调节池尺寸
    pumpInfo?: string; // 水泵信息
    material?: string; // 材质要求
    standard?: string; // 排放标准
    address?: string; // 交货地址
    companyName?: string; // 公司名称
    contactInfo?: any; // 联系人信息
    requirements?: string[]; // 特殊要求
  } {
    const result: any = {};

    // 解析处理规模
    const scaleMatch = text.match(/(\d+)\s*(?:立方|m³|吨)\s*\/?\s*(?:天|日)/i);
    if (scaleMatch) {
      result.scale = parseInt(scaleMatch[1]);
    }

    // 解析调节池尺寸
    const tankMatch = text.match(
      /调节池[^。]*?长\s*(\d+(?:\.\d+)?)[\s×*]?米[^。]*?宽\s*(\d+(?:\.\d+)?)[\s×*]?米[^。]*?高\s*(\d+(?:\.\d+)?)[\s×*]?米/i
    );
    if (tankMatch) {
      result.tankSize = `${tankMatch[1]}m × ${tankMatch[2]}m × ${tankMatch[3]}m`;
    }

    // 解析水泵信息
    const pumpMatch = text.match(/(\d+(?:\.\d+)?)KW.*?泵/i);
    if (pumpMatch) {
      result.pumpInfo = pumpMatch[0];
    }

    // 解析材质要求
    const materialMatch = text.match(/(碳钢|不锈钢|玻璃钢).*?(\d+)mm/i);
    if (materialMatch) {
      result.material = materialMatch[0];
    }

    // 解析排放标准
    const standardMatch = text.match(/(一级A|一级B|回用标准|排放标准[^。]*)/i);
    if (standardMatch) {
      result.standard = standardMatch[1];
    }

    // 解析交货地址
    const addressMatch = text.match(/交货地址[：:]\s*([^\n]+)/i);
    if (addressMatch) {
      result.address = addressMatch[1].trim();
    }

    // 解析公司名称 - 从公司信息中提取
    const companyMatch = text.match(/公司名称[：:]\s*([^\n]+)/i);
    if (companyMatch) {
      // 直接使用用户输入的公司名称，不做任何修改
      result.companyName = companyMatch[1].trim();
    }

    return result;
  }
}

// ============================================================================
// 详细方案生成器（基于LLM智能生成）
// ============================================================================

class DetailedProposalGenerator {
  private aiClient: any;

  constructor() {
    // 使用已导入的 DeepSeek 客户端
    this.aiClient = aiClient;
  }

  /**
   * 生成详细技术方案
   */
  async generateDetailedProposal(
    projectInfo: any,
    products: Product[],
    _messagemessage: string
  ): Promise<string> {
    console.log('[DetailedProposalGenerator] 开始生成详细方案');

    try {
      // 并行生成各个章节，但添加错误处理
      const results = await Promise.allSettled([
        this.generateProjectOverview(projectInfo),
        this.generateProcessComparison(projectInfo, products),
        this.generateSelectedProcess(projectInfo),
        this.generateEquipmentListWithDetails(products),
        this.generateCostAnalysis(projectInfo, products),
        this.generateInstallationAndCommissioning(),
        this.generateOperationAndMaintenance(),
        this.generateAfterSalesService(),
      ]);

      // 收集成功的章节，失败的章节使用备用内容
      const sections: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          sections.push(result.value);
          console.log(`[DetailedProposalGenerator] 章节 ${index + 1} 生成成功`);
        } else {
          console.error(`[DetailedProposalGenerator] 章节 ${index + 1} 生成失败:`, result.reason);
          // 使用备用内容
          sections.push(this.getFallbackSection(index));
        }
      });

      const proposal = this.formatProposal(sections);
      console.log('[DetailedProposalGenerator] 详细方案生成完成');
      return proposal;
    } catch (error) {
      console.error('[DetailedProposalGenerator] 生成方案失败:', error);
      // 回退到基础方案
      return this.generateBasicProposal(projectInfo, products);
    }
  }

  /**
   * 获取备用章节内容
   */
  private getFallbackSection(index: number): string {
    const fallbackSections = [
      `## 一、项目概述\n\n本项目是污水处理工程项目，采用先进的生化处理技术，实现污水的达标排放，保护水环境。`,
      `## 二、工艺比选\n\n经综合比较，推荐采用A²/O工艺。该工艺技术成熟、运行稳定、脱氮除磷效果好，能够满足一级A排放标准要求。`,
      `## 三、选定工艺方案\n\n本项目采用A²/O工艺，工艺流程为：格栅→调节池→A²/O生化池→二沉池→消毒池→达标排放。`,
      `## 四、配置清单及价格\n\n详见设备清单表格。所有设备均按照国家标准制造，质量可靠，性能稳定。`,
      `## 五、投资及运行成本分析\n\n项目总投资合理，运行成本可控，具有良好的经济效益和环境效益。具体数据请参考详细报价。`,
      `## 六、安装调试\n\n设备安装调试由专业团队负责，严格按照规范施工，确保设备正常运行。`,
      `## 七、运行维护\n\n制定完善的运行维护制度，确保系统长期稳定运行。`,
      `## 八、售后服务\n\n提供全面的技术支持和售后服务，确保客户满意。`,
    ];

    return fallbackSections[index] || `## 章节内容\n\n内容生成中...`;
  }

  /**
   * 生成项目概述
   */
  private async generateProjectOverview(projectInfo: any): Promise<string> {
    const prompt = `请为以下污水处理项目生成项目概述（200-300字）：
项目信息：
- 项目名称：${projectInfo.projectName || '污水处理项目'}
- 处理规模：${projectInfo.scale || 60}吨/天
- 项目地点：${projectInfo.address || '待定'}
- 水质情况：${projectInfo.waterQuality || '生活污水'}
- 排放标准：${projectInfo.dischargeStandard || '一级A标准'}

要求：
1. 简明扼要描述项目背景和目标
2. 说明处理工艺的核心技术特点
3. 突出项目的环保效益和社会价值`;

    try {
      const response = await this.aiClient.chat({
        messages: [
          { role: 'system', content: '你是一位资深的环保工程师，擅长编写污水处理项目的技术方案。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        maxTokens: 500,
      });

      return `## 一、项目概述\n\n${response.text || '本项目是针对生活污水的治理工程，旨在采用先进的污水处理技术，实现污水的达标排放，保护水环境，改善区域生态环境质量。'}`;
    } catch (error) {
      console.error('[DetailedProposalGenerator] 生成项目概述失败:', error);
      return `## 一、项目概述\n\n本项目处理规模${projectInfo.scale || 60}吨/天，采用先进的生化处理技术，旨在实现污水的达标排放，保护水环境。`;
    }
  }

  /**
   * 生成工艺比选
   */
  private async generateProcessComparison(projectInfo: any, _products: any): Promise<string> {
    const prompt = `请为污水处理项目进行工艺比选分析：
处理规模：${projectInfo.scale || 60}吨/天
项目类型：${projectInfo.projectType || '生活污水'}

请对比以下3种工艺：
1. A²/O工艺
2. SBR工艺
3. MBR工艺

从以下维度分析：
- 技术成熟度
- 处理效果
- 占地面积
- 运行成本
- 维护管理难度
- 投资成本

最后给出推荐工艺及理由。`;

    try {
      const response = await this.aiClient.chat({
        messages: [
          { role: 'system', content: '你是一位资深的环保工程师，擅长污水处理工艺选择和技术分析。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        maxTokens: 800,
      });

      return `## 二、工艺比选\n\n${response.text || '根据项目特点，经综合比较分析，推荐采用A²/O工艺。该工艺技术成熟、运行稳定、处理效果好，能够满足一级A排放标准要求。'}`;
    } catch (error) {
      console.error('[DetailedProposalGenerator] 生成工艺比选失败:', error);
      return `## 二、工艺比选\n\n根据项目处理规模${projectInfo.scale || 60}吨/天的要求，对A²/O、SBR、MBR三种工艺进行对比分析：\n\n### 工艺对比\n\n| 工艺类型 | 技术成熟度 | 处理效果 | 占地面积 | 运行成本 |\n|----------|-----------|----------|----------|----------|\n| A²/O工艺 | 高 | 良好 | 中等 | 低 |\n| SBR工艺 | 高 | 良好 | 小 | 中等 |\n| MBR工艺 | 中 | 优秀 | 很小 | 高 |\n\n### 推荐工艺\n\n综合考虑技术成熟度、处理效果、投资成本和运行维护等因素，推荐采用**A²/O工艺**。\n\n**推荐理由：**\n- 技术成熟可靠，运行稳定\n- 脱氮除磷效果好，能够满足一级A排放标准\n- 投资成本适中，运行维护简单\n- 适用于${projectInfo.scale || 60}吨/天的生活污水处理`;
    }
  }

  /**
   * 生成选定工艺说明
   */
  private async generateSelectedProcess(projectInfo: any): Promise<string> {
    const prompt = `请详细描述A²/O工艺的工作原理和技术特点：
处理规模：${projectInfo.scale || 60}吨/天

要求包含：
1. 工艺流程图及说明
2. 各处理单元的功能和设计参数
3. 主要技术指标（去除率、停留时间等）
4. 工艺优势`;

    try {
      const response = await this.aiClient.chat({
        messages: [
          { role: 'system', content: '你是一位资深的环保工程师，擅长污水处理工艺设计。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        maxTokens: 600,
      });

      return `## 三、选定工艺方案\n\n${response.text || '本项目采用A²/O工艺，工艺流程为：格栅→调节池→A²/O生化池→二沉池→消毒池→达标排放。该工艺具有脱氮除磷效果好、运行稳定、管理方便等优点。'}`;
    } catch (error) {
      console.error('[DetailedProposalGenerator] 生成选定工艺失败:', error);
      return `## 三、选定工艺方案\n\n### 工艺流程\n\n**进水 → 粗格栅 → 细格栅 → 调节池 → A²/O生化池 → 二沉池 → 消毒池 → 出水**\n\n### 各处理单元说明\n\n#### 1. 预处理单元\n- **粗格栅**：拦截大颗粒杂物，保护后续设备\n- **细格栅**：拦截细小悬浮物，栅隙2mm\n- **调节池**：均衡水质水量，停留时间8小时\n\n#### 2. 生化处理单元（A²/O工艺）\n- **厌氧区**：释放磷，去除部分COD，停留时间2小时\n- **缺氧区**：反硝化脱氮，停留时间3小时\n- **好氧区**：硝化反应，去除COD和氨氮，停留时间8小时\n\n#### 3. 固液分离\n- **二沉池**：泥水分离，污泥回流，表面负荷0.8m³/m²·h\n\n#### 4. 消毒处理\n- **消毒池**：紫外线消毒，停留时间30分钟\n\n### 工艺技术指标\n\n| 指标 | 设计值 |\n|------|--------|\n| 处理规模 | ${projectInfo.scale || 60}吨/天 |\n| COD去除率 | ≥85% |\n| BOD去除率 | ≥90% |\n| 氨氮去除率 | ≥80% |\n| 总磷去除率 | ≥75% |\n| 出水COD | ≤50mg/L |\n| 出水氨氮 | ≤5mg/L |`;
    }
  }

  /**
   * 生成详细设备清单（含价格）
   */
  private async generateEquipmentListWithDetails(products: Product[]): Promise<string> {
    let content = `## 四、配置清单及价格\n\n`;
    content += `### 4.1 设备配置清单（完整版）\n\n`;
    content += `| 序号 | 设备名称 | 型号规格 | 数量 | 单价(元) | 总价(元) | 备注 |\n`;
    content += `|------|----------|----------|------|----------|----------|------|\n`;

    let total = 0;
    products.forEach((product, index) => {
      const price = product.price || 0;
      const subtotal = price * product.quantity;
      total += subtotal;

      content += `| ${index + 1} | ${product.name} | ${product.specs || '-'} | ${product.quantity} | ${price.toFixed(0)} | ${subtotal.toFixed(0)} | ${product.remark || '-'} |\n`;
    });

    content += `\n**设备总价：${total.toFixed(2)} 元**\n\n`;

    // 为每个设备生成详细描述（包含所有设备）
    content += `### 4.2 设备技术说明（完整版）\n\n`;
    for (const product of products) {
      // 为所有设备生成详细说明
      content += await this.generateEquipmentDescription(product);
    }

    return content;
  }

  /**
   * 生成单个设备描述
   */
  private async generateEquipmentDescription(product: Product): Promise<string> {
    const prompt = `请为以下设备生成技术说明（150-200字）：
设备名称：${product.name}
型号规格：${product.specs || product.model || '-'}

说明内容应包含：
1. 设备工作原理
2. 主要技术参数
3. 材质和结构特点
4. 适用范围`;

    try {
      const response = await this.aiClient.chat({
        messages: [
          { role: 'system', content: '你是一位设备工程师，擅长编写设备技术说明。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        maxTokens: 300,
      });

      return `**${product.name}**\n\n${response.text || '该设备采用先进的设计理念，结构紧凑，运行稳定，能够满足系统处理要求。'}\n\n`;
    } catch (_error) {
      return `**${product.name}**\n\n${product.remark || '标准配置，运行稳定。'}\n\n`;
    }
  }

  /**
   * 生成成本分析
   */
  private async generateCostAnalysis(projectInfo: any, products: Product[]): Promise<string> {
    const equipmentTotal = products.reduce((sum, p) => sum + (p.price || 0) * p.quantity, 0);
    const civilCost = equipmentTotal * 0.2; // 土建费
    const installCost = equipmentTotal * 0.15; // 安装费
    const otherCost = equipmentTotal * 0.1; // 其他费用
    const total = equipmentTotal + civilCost + installCost + otherCost;

    const prompt = `请为以下污水处理项目进行运行成本分析：
处理规模：${projectInfo.scale || 60}吨/天
设备投资：${equipmentTotal.toFixed(2)} 元

分析以下运行成本（按年计算）：
1. 电费（电耗估算）
2. 药剂费
3. 人工费
4. 维护费
5. 其他费用

计算吨水处理成本。`;

    try {
      const response = await this.aiClient.chat({
        messages: [
          { role: 'system', content: '你是一位环保工程师，擅长进行污水处理项目经济分析。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        maxTokens: 500,
      });

      let content = `## 五、投资及运行成本分析\n\n`;
      content += `### 5.1 工程总投资\n\n`;
      content += `| 项目 | 金额(元) | 占比 |\n`;
      content += `|------|----------|------|\n`;
      content += `| 设备费 | ${equipmentTotal.toFixed(2)} | ${((equipmentTotal / total) * 100).toFixed(1)}% |\n`;
      content += `| 土建费 | ${civilCost.toFixed(2)} | ${((civilCost / total) * 100).toFixed(1)}% |\n`;
      content += `| 安装费 | ${installCost.toFixed(2)} | ${((installCost / total) * 100).toFixed(1)}% |\n`;
      content += `| 其他费 | ${otherCost.toFixed(2)} | ${((otherCost / total) * 100).toFixed(1)}% |\n`;
      content += `| **合计** | **${total.toFixed(2)}** | **100%** |\n\n`;
      content += `### 5.2 运行成本分析\n\n`;
      content +=
        response.text ||
        `预计年运行成本约 ${(total * 0.1).toFixed(2)} 元，吨水处理成本约 ${((total * 0.1) / projectInfo.scale / 365).toFixed(2)} 元/吨。`;

      return content;
    } catch (error) {
      console.error('[DetailedProposalGenerator] 生成成本分析失败:', error);

      const dailyCost = total * 0.0002; // 每日成本约为总投资的0.02%
      const annualCost = dailyCost * 365;
      const unitCost = dailyCost / (projectInfo.scale || 60);

      let content = `## 五、投资及运行成本分析\n\n`;
      content += `### 5.1 工程总投资\n\n`;
      content += `| 项目 | 金额(元) | 占比 |\n`;
      content += `|------|----------|------|\n`;
      content += `| 设备费 | ${equipmentTotal.toFixed(2)} | ${((equipmentTotal / total) * 100).toFixed(1)}% |\n`;
      content += `| 土建费 | ${civilCost.toFixed(2)} | ${((civilCost / total) * 100).toFixed(1)}% |\n`;
      content += `| 安装费 | ${installCost.toFixed(2)} | ${((installCost / total) * 100).toFixed(1)}% |\n`;
      content += `| 其他费 | ${otherCost.toFixed(2)} | ${((otherCost / total) * 100).toFixed(1)}% |\n`;
      content += `| **合计** | **${total.toFixed(2)}** | **100%** |\n\n`;
      content += `### 5.2 运行成本分析\n\n`;
      content += `| 费用项目 | 年费用(元) | 占比 |\n`;
      content += `|----------|-----------|------|\n`;
      content += `| 电费 | ${(annualCost * 0.4).toFixed(2)} | 40% |\n`;
      content += `| 药剂费 | ${(annualCost * 0.2).toFixed(2)} | 20% |\n`;
      content += `| 人工费 | ${(annualCost * 0.25).toFixed(2)} | 25% |\n`;
      content += `| 维护费 | ${(annualCost * 0.1).toFixed(2)} | 10% |\n`;
      content += `| 其他费用 | ${(annualCost * 0.05).toFixed(2)} | 5% |\n`;
      content += `| **合计** | **${annualCost.toFixed(2)}** | **100%** |\n\n`;
      content += `### 5.3 经济指标\n\n`;
      content += `- **吨水处理成本**：${unitCost.toFixed(2)} 元/吨\n`;
      content += `- **年运行成本**：${annualCost.toFixed(2)} 元\n`;
      content += `- **投资回收期**：约 ${(total / annualCost).toFixed(1)} 年\n`;

      return content;
    }
  }

  /**
   * 生成安装调试内容
   */
  private async generateInstallationAndCommissioning(): Promise<string> {
    let content = `## 六、安装调试\n\n`;
    content += `### 6.1 安装要求\n\n`;
    content += `1. 设备基础：按照设备基础图施工，混凝土强度不低于C25\n`;
    content += `2. 设备就位：设备就位时应找平找正，水平度偏差≤2mm/m\n`;
    content += `3. 管道连接：管道安装应符合GB50242规范要求\n`;
    content += `4. 电气接线：电气安装应符合GB50303规范要求\n\n`;

    content += `### 6.2 调试步骤\n\n`;
    content += `1. 单机调试：各设备单独运行，检查运行状态\n`;
    content += `2. 联动调试：各设备联动运行，测试自控系统\n`;
    content += `3. 水质调试：通过进出水水质监测，调整运行参数\n`;
    content += `4. 性能验收：连续运行72小时，出水水质达标\n\n`;

    return content;
  }

  /**
   * 生成运行维护内容
   */
  private async generateOperationAndMaintenance(): Promise<string> {
    let content = `## 七、运行维护\n\n`;
    content += `### 7.1 运行管理\n\n`;
    content += `1. 运行人员需经过专业培训，持证上岗\n`;
    content += `2. 建立完善的运行记录制度，每日记录进出水水质、设备运行状态\n`;
    content += `3. 定期巡检，发现问题及时处理\n`;
    content += `4. 制定应急预案，应对突发情况\n\n`;

    content += `### 7.2 维护保养\n\n`;
    content += `1. 日常维护：每日检查设备运行状态，清理格栅杂物\n`;
    content += `2. 定期维护：每周检查曝气系统，每月清理沉淀池\n`;
    content += `3. 年度维护：每年对设备进行全面检修，更换易损件\n`;
    content += `4. 药剂管理：规范药剂存储和使用，定期检测药剂浓度\n\n`;

    return content;
  }

  /**
   * 生成售后服务内容
   */
  private async generateAfterSalesService(): Promise<string> {
    let content = `## 八、售后服务\n\n`;
    content += `### 8.1 质保期\n\n`;
    content += `- 设备质保期：12个月\n`;
    content += `- 电气系统质保期：18个月\n`;
    content += `- 钢结构质保期：24个月\n\n`;

    content += `### 8.2 服务承诺\n\n`;
    content += `1. 技术培训：免费为业主提供操作人员培训\n`;
    content += `2. 质保期内服务：免费维修或更换损坏部件\n`;
    content += `3. 技术支持：提供7×24小时电话技术支持\n`;
    content += `4. 应急响应：接到故障通知后24小时内到达现场\n`;
    content += `5. 终身服务：质保期后提供终身有偿服务\n\n`;

    return content;
  }

  /**
   * 格式化完整方案
   */
  private formatProposal(sections: string[]): string {
    return `# 污水处理工程详细技术方案\n\n${sections.join('\n\n')}`;
  }

  /**
   * 生成基础方案（回退方案）
   */
  private generateBasicProposal(projectInfo: any, products: Product[]): Promise<string> {
    return Promise.resolve(
      `# 污水处理工程方案\n\n## 一、项目概述\n\n本项目处理规模${projectInfo.scale || 60}吨/天，采用A²/O工艺，出水达到一级A标准。\n\n## 二、配置清单\n\n共配置设备${products.length}台（套），详见设备清单。\n\n## 三、服务承诺\n\n提供完善的安装调试、技术培训和售后服务。`
    );
  }
}

// ============================================================================
// 报价单生成器（增强版）- 优化PDF打印，保留所有颜色
// ============================================================================

class QuoteGenerator {
  private webSearch: WebSearchService;
  private priceMatcher: typeof PriceMatcher;

  constructor() {
    this.webSearch = new WebSearchService();
    this.priceMatcher = PriceMatcher;
  }

  /**
   * 根据项目信息生成专业报价单
   */
  async generateProfessionalQuote(projectInfo: any, _message: any): Promise<string> {
    const scale = projectInfo.scale || 60; // 默认60吨/天

    // 构建工艺流程
    const processFlow = this.generateProcessFlow(scale);

    // 生成设备清单（模拟数据）
    const equipmentList = await this.generateEquipmentList(scale, projectInfo);

    // 计算运费
    const freight = this.calculateFreight(projectInfo.address);

    // 生成报价单HTML（带真实下载功能）
    return this.formatQuoteHTML(projectInfo, processFlow, equipmentList, freight);
  }

  /**
   * 生成工艺流程
   */
  private generateProcessFlow(_scale: any): string {
    return (
      `**生活污水处理工艺流程图**\n\n` +
      `格栅 → 调节池 → A²/O生化池 → 二沉池 → 消毒池 → 达标排放\n\n` +
      `**工艺说明：**\n` +
      `- **格栅**：拦截大颗粒杂物，保护后续设备\n` +
      `- **调节池**：均衡水质水量，停留时间8小时\n` +
      `- **A²/O生化池**：厌氧-缺氧-好氧工艺，去除COD、BOD、脱氮除磷\n` +
      `- **二沉池**：泥水分离，污泥回流\n` +
      `- **消毒池**：紫外线/氯消毒，杀灭细菌\n`
    );
  }

  /**
   * 生成设备清单
   */
  private async generateEquipmentList(_scale: any, _projectInfo: any): Promise<any[]> {
    // 模拟设备清单数据
    const equipment = [
      {
        name: '机械格栅',
        model: 'GS-500',
        specs: '渠宽500mm，栅隙5mm，功率0.75KW',
        quantity: 1,
        unit: '台',
        unitPrice: 8500,
        totalPrice: 8500,
        note: '不锈钢材质',
      },
      {
        name: '提升泵',
        model: 'WQ40-15-4',
        specs: '流量40m³/h，扬程15m，功率4KW',
        quantity: 2,
        unit: '台',
        unitPrice: 3200,
        totalPrice: 6400,
        note: '一用一备，铸铁材质',
      },
      {
        name: '一体化污水处理设备',
        model: 'WSZ-60',
        specs: `处理量60m³/d，碳钢6mm，环氧煤沥青防腐`,
        quantity: 1,
        unit: '套',
        unitPrice: 156000,
        totalPrice: 156000,
        note: '含A²/O生化池、二沉池、消毒池',
      },
      {
        name: '鼓风机',
        model: 'SSR-80',
        specs: '风量2.5m³/min，风压0.3kgf/cm²，功率4KW',
        quantity: 2,
        unit: '台',
        unitPrice: 6800,
        totalPrice: 13600,
        note: '一用一备',
      },
      {
        name: '污泥回流泵',
        model: 'G30-1',
        specs: '流量30m³/h，扬程10m，功率2.2KW',
        quantity: 1,
        unit: '台',
        unitPrice: 2800,
        totalPrice: 2800,
        note: '',
      },
      {
        name: '消毒装置',
        model: 'UV-500',
        specs: '紫外线消毒，处理量60m³/d',
        quantity: 1,
        unit: '套',
        unitPrice: 12500,
        totalPrice: 12500,
        note: '',
      },
      {
        name: '电控系统',
        model: 'PLC-60',
        specs: '全自动控制，触摸屏操作',
        quantity: 1,
        unit: '套',
        unitPrice: 18500,
        totalPrice: 18500,
        note: '含远程监控接口',
      },
      {
        name: '管道阀门',
        model: 'DN50-DN100',
        specs: 'UPVC材质',
        quantity: 1,
        unit: '批',
        unitPrice: 9500,
        totalPrice: 9500,
        note: '含管件、阀门、支架',
      },
    ];

    return equipment;
  }

  /**
   * 计算运费
   */
  private calculateFreight(address?: string): number {
    // 根据距离估算运费
    return 3500; // 模拟运费3500元
  }

  /**
   * 生成下载脚本 - 优化PDF打印，保留所有颜色
   */
  private generateDownloadScripts(): string {
    return `
    <script>
    // Excel下载函数
    window.downloadAsExcel = function() {
      try {
        const content = document.querySelector('.quote-content')?.innerHTML;
        const style = document.querySelector('style')?.innerHTML;
        const dateStr = new Date().toISOString().split('T')[0];
        
        if (!content || !style) {
          alert('找不到报价单内容');
          return;
        }
        
        const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>报价单</title><style>' + style + '</style></head><body><div class="quote-content">' + content + '</div></body></html>';
        const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '报价单_' + dateStr + '.xls';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Excel下载失败:', error);
        alert('下载失败，请重试');
      }
    };

    // Word下载函数
    window.downloadAsWord = function() {
      try {
        const content = document.querySelector('.quote-content')?.innerHTML;
        const style = document.querySelector('style')?.innerHTML;
        const dateStr = new Date().toISOString().split('T')[0];
        
        if (!content || !style) {
          alert('找不到报价单内容');
          return;
        }
        
        const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>报价单</title><style>' + style + '</style></head><body><div class="quote-content">' + content + '</div></body></html>';
        const blob = new Blob([htmlContent], { type: 'application/msword' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '报价单_' + dateStr + '.doc';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Word下载失败:', error);
        alert('下载失败，请重试');
      }
    };

    // PDF下载函数 - 使用HTML预览方式，保留所有颜色和样式
    window.downloadAsPDF = function() {
      try {
        // 获取整个报价单的HTML内容
        const quoteContainer = document.querySelector('.quote-container');
        const style = document.querySelector('style')?.innerHTML;
        
        if (!quoteContainer || !style) {
          alert('找不到报价单内容');
          return;
        }
        
        // 复制容器内容，移除下载按钮
        const cloneContainer = quoteContainer.cloneNode(true);
        const downloadButtons = cloneContainer.querySelector('.download-buttons');
        if (downloadButtons) {
          downloadButtons.remove();
        }
        
        // 构建完整的HTML文档
        const htmlContent = \`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>污水处理项目报价单</title>
  <style>
    \${style}
    body {
      background: #fff;
      margin: 0;
      padding: 20px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .download-buttons {
      display: none !important;
    }
    .quote-container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .equipment-table th {
      background: #2563eb !important;
      color: white !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .info-section, .process-section {
      background: #f8fafc !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .company-section {
      background: #f8fafc !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .remarks {
      background: #fff3cd !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  \${cloneContainer.outerHTML}
</body>
</html>
        \`;
        
        // 在新窗口中打开预览
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          alert('请允许弹出窗口');
          return;
        }
        
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        // 等待内容加载完成后打印
        printWindow.onload = function() {
          setTimeout(function() {
            printWindow.print();
          }, 500);
        };
      } catch (error) {
        console.error('PDF打印失败:', error);
        alert('打印失败，请重试');
      }
    };
    </script>
    `;
  }

  /**
   * 数字转中文大写
   */
  private numberToChinese(num: number): string {
    const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
    const units = ['', '拾', '佰', '仟', '万', '拾', '佰', '仟', '亿'];

    const numStr = Math.round(num).toString();
    let result = '';

    for (let i = 0; i < numStr.length; i++) {
      const digit = parseInt(numStr[i]);
      const unit = units[numStr.length - 1 - i];
      result += digits[digit] + unit;
    }

    return result + '圆整';
  }

  /**
   * 格式化报价单HTML（优化商务样式）
   */
  private formatQuoteHTML(
    projectInfo: any,
    processFlow: string,
    equipmentList: any[],
    freight: number
  ): string {
    const subtotal = equipmentList.reduce((sum, item) => sum + item.totalPrice, 0);
    const taxRate = 13;
    const taxAmount = (subtotal * taxRate) / 100;
    const totalAmount = subtotal + taxAmount + freight;

    const today = new Date().toLocaleDateString('zh-CN');
    const totalChinese = this.numberToChinese(totalAmount);

    // 使用用户输入的公司名称
    const companyName = projectInfo.companyName || '兴燊环境技术（深圳）有限公司';

    // 生成设备清单表格
    const equipmentTable = equipmentList
      .map((item, index) => {
        return `<tr>
        <td style="padding: 6px 8px; border: 1px solid #ddd; text-align: center;">${index + 1}</td>
        <td style="padding: 6px 8px; border: 1px solid #ddd;">${item.name}</td>
        <td style="padding: 6px 8px; border: 1px solid #ddd;">${item.model}</td>
        <td style="padding: 6px 8px; border: 1px solid #ddd;">${item.specs}</td>
        <td style="padding: 6px 8px; border: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 6px 8px; border: 1px solid #ddd; text-align: center;">${item.unit}</td>
        <td style="padding: 6px 8px; border: 1px solid #ddd; text-align: right;">¥${item.unitPrice.toLocaleString()}</td>
        <td style="padding: 6px 8px; border: 1px solid #ddd; text-align: right;">¥${item.totalPrice.toLocaleString()}</td>
        <td style="padding: 6px 8px; border: 1px solid #ddd;">${item.note || '-'}</td>
      </tr>`;
      })
      .join('');

    // 优化的CSS样式 - 商务风格，包含颜色
    const styles = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Microsoft YaHei', Arial, sans-serif; line-height: 1.4; background: #fff; }
      .quote-container { max-width: 1200px; margin: 0 auto; padding: 20px; background: #fff; }
      .quote-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
      .quote-header h1 { font-size: 24px; color: #1e40af; margin: 0 0 5px; font-weight: 600; }
      .quote-header h2 { font-size: 18px; color: #333; margin: 0 0 5px; font-weight: 500; }
      .quote-header p { color: #666; margin: 0; font-size: 13px; }
      .info-section { background: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
      .info-section h3 { color: #1e40af; margin: 0 0 10px; font-size: 16px; border-left: 4px solid #2563eb; padding-left: 10px; font-weight: 500; }
      .info-table { width: 100%; border-collapse: collapse; }
      .info-table td { padding: 6px 0; color: #334155; font-size: 13px; }
      .info-table td:first-child { width: 100px; color: #475569; font-weight: 500; }
      .process-section { background: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
      .process-section h3 { color: #1e40af; margin: 0 0 10px; font-size: 16px; border-left: 4px solid #2563eb; padding-left: 10px; font-weight: 500; }
      .process-content { background: white; padding: 12px; border-radius: 4px; font-size: 13px; line-height: 1.5; }
      .equipment-section { margin-bottom: 20px; }
      .equipment-section h3 { color: #1e40af; margin: 0 0 10px; font-size: 16px; border-left: 4px solid #2563eb; padding-left: 10px; font-weight: 500; }
      .equipment-table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; font-size: 12px; }
      .equipment-table th { background: #2563eb; color: white; padding: 10px 6px; border: 1px solid #1d4ed8; font-weight: 500; }
      .equipment-table td { padding: 6px; border: 1px solid #ddd; }
      .company-section { display: flex; justify-content: space-between; margin-top: 25px; padding: 15px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px; }
      .company-section div { flex: 1; }
      .company-section h4 { color: #1e40af; margin: 0 0 8px; font-size: 14px; font-weight: 500; }
      .company-section p { margin: 4px 0; color: #334155; }
      .remarks { margin-top: 20px; padding: 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 13px; }
      .remarks p { margin: 0; color: #856404; }
      .download-buttons { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; padding: 15px 0; border-top: 1px solid #e2e8f0; }
      .download-btn { padding: 8px 20px; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; color: white; transition: opacity 0.2s; }
      .download-btn:hover { opacity: 0.9; }
      .btn-excel { background: #2563eb; }
      .btn-word { background: #16a34a; }
      .btn-pdf { background: #dc2626; }
      .quote-content { margin: 0; }
    `;

    return `
<style>${styles}</style>
<div class="quote-container">
  <div class="quote-content">
    <!-- 公司抬头 -->
    <div class="quote-header">
      <h1>${companyName}</h1>
      <h2>污水处理项目报价单</h2>
      <p>报价单号：Q-${Date.now()} | 报价日期：${today}</p>
    </div>

    <!-- 项目信息 -->
    <div class="info-section">
      <h3>📋 项目基本信息</h3>
      <table class="info-table">
        <tr><td>项目名称：</td><td>广东省阳西县溪头镇凤凰岭矿区建筑用片麻岩矿项目-倒班楼污水处理</td></tr>
        <tr><td>处理规模：</td><td>60 m³/天</td></tr>
        <tr><td>调节池尺寸：</td><td>5m × 3m × 2m</td></tr>
        <tr><td>设备材质：</td><td>碳钢6mm，内外环氧煤沥青防腐</td></tr>
        <tr><td>排放标准：</td><td>直排到雨水管网（一级B标准）</td></tr>
        <tr><td>交货地址：</td><td>${projectInfo.address || '广东省阳西县溪头镇凤凰岭矿区'}</td></tr>
      </table>
    </div>

    <!-- 工艺流程图 -->
    <div class="process-section">
      <h3>🔧 工艺流程</h3>
      <div class="process-content">
        ${processFlow.replace(/\n/g, '<br>')}
      </div>
    </div>

    <!-- 设备清单 -->
    <div class="equipment-section">
      <h3>📦 设备配置清单</h3>
      <table class="equipment-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>设备名称</th>
            <th>型号</th>
            <th>规格参数</th>
            <th>数量</th>
            <th>单位</th>
            <th>单价(元)</th>
            <th>总价(元)</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          ${equipmentTable}
        </tbody>
        <tfoot>
          <tr style="background: #f1f5f9;">
            <td colspan="7" style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">设备小计：</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #1e40af;">¥${subtotal.toLocaleString()}</td>
            <td style="padding: 8px; border: 1px solid #ddd;"></td>
          </tr>
          <tr>
            <td colspan="7" style="padding: 8px; border: 1px solid #ddd; text-align: right;">运费（东莞→阳西）：</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">¥${freight.toLocaleString()}</td>
            <td style="padding: 8px; border: 1px solid #ddd;"></td>
          </tr>
          <tr>
            <td colspan="7" style="padding: 8px; border: 1px solid #ddd; text-align: right;">小计（含运费）：</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">¥${(subtotal + freight).toLocaleString()}</td>
            <td style="padding: 8px; border: 1px solid #ddd;"></td>
          </tr>
          <tr>
            <td colspan="7" style="padding: 8px; border: 1px solid #ddd; text-align: right;">增值税 (${taxRate}%)：</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">¥${taxAmount.toLocaleString()}</td>
            <td style="padding: 8px; border: 1px solid #ddd;"></td>
          </tr>
          <tr style="background: #f1f5f9;">
            <td colspan="7" style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold; font-size: 15px;">合计金额（含税）：</td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold; font-size: 16px; color: #dc2626;">¥${totalAmount.toLocaleString()}</td>
            <td style="padding: 10px; border: 1px solid #ddd;"></td>
          </tr>
          <tr>
            <td colspan="9" style="padding: 8px; border: 1px solid #ddd; text-align: right; font-size: 13px; color: #4b5563;">
              大写金额：${totalChinese}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 公司信息 -->
    <div class="company-section">
      <div>
        <h4>🏢 公司信息</h4>
        <p>${companyName}</p>
        <p>深圳市龙岗区龙城街道愉园社区愉园新村7栋一层102</p>
        <p>联系人：陈生 | 电话：13924606978</p>
        <p>邮箱：519733058@qq.com</p>
      </div>
      <div>
        <h4>🏦 账户信息</h4>
        <p>纳税人识别号：914403000769128313</p>
        <p>开户行：中国建设银行深圳翠竹支行</p>
        <p>账号：44201011200052542287</p>
        <p>行号：105584000771</p>
      </div>
    </div>

    <!-- 备注 -->
    <div class="remarks">
      <p><strong>备注：</strong><br>
      1. 本报价有效期15天<br>
      2. 价格含13%增值税，含运费到指定地点<br>
      3. 设备质保期12个月（易损件除外）<br>
      4. 付款方式：预付30%，发货前付清尾款<br>
      5. 交货期：合同签订后15个工作日内</p>
    </div>
  </div>

  <!-- 下载按钮 - 放在底部右侧 -->
  <div class="download-buttons">
    <button onclick="window.downloadAsExcel()" class="download-btn btn-excel">📥 下载Excel</button>
    <button onclick="window.downloadAsWord()" class="download-btn btn-word">📥 下载Word</button>
    <button onclick="window.downloadAsPDF()" class="download-btn btn-pdf">📥 下载PDF</button>
  </div>
</div>
${this.generateDownloadScripts()}
    `;
  }
}

// ============================================================================
// 意图驱动的回复生成器（增强版）
// ============================================================================

class IntentResponseGenerator {
  private projectParser: ProjectInfoParser;
  private quoteGenerator: QuoteGenerator;
  private webSearch: WebSearchService;
  private detailedProposalGenerator: DetailedProposalGenerator;

  constructor() {
    this.projectParser = new ProjectInfoParser();
    this.quoteGenerator = new QuoteGenerator();
    this.webSearch = new WebSearchService();
    this.detailedProposalGenerator = new DetailedProposalGenerator();
  }

  /**
   * 根据意图生成专业回复
   */
  async generateResponse(
    intent: IntentResult,
    processedInput: ProcessedInput,
    conversationId?: string
  ): Promise<string> {
    console.log('[ResponseGenerator] 根据意图生成回复:', intent.intent);

    const baseContent = processedInput.textContent || '';

    // 检测是否是详细的项目需求
    const hasDetailedProject =
      baseContent.includes('项目描述') ||
      baseContent.includes('公司名称') ||
      baseContent.includes('交货地址') ||
      (baseContent.includes('污水') && baseContent.includes('立方'));

    if (hasDetailedProject && intent.intent === 'ask_quote') {
      console.log('[ResponseGenerator] 检测到详细项目需求，生成专业报价');

      // 解析项目信息
      const projectInfo = this.projectParser.parseProjectInfo(baseContent);

      // 生成专业报价单
      const quoteHTML = await this.quoteGenerator.generateProfessionalQuote(
        projectInfo,
        baseContent
      );

      return quoteHTML;
    }

    // 原有逻辑保持不变
    const previewLength = 200;

    switch (intent.intent) {
      case 'ask_quote':
        return `根据您的需求，我可以帮您生成报价单。\n\n${baseContent && !baseContent.startsWith('[') ? `您提到：${baseContent.substring(0, previewLength)}${baseContent.length > previewLength ? '...' : ''}` : ''}\n\n请确认以下信息，以便我为您生成准确报价：\n1️⃣ 产品具体型号和规格\n2️⃣ 所需数量\n3️⃣ 材质要求（如不锈钢、碳钢等）\n4️⃣ 品牌偏好（如有）\n\n您可以直接回复补充这些信息，或上传产品清单Excel文件。`;

      case 'upload_document':
        const fileName = intent.entities.fileName || '文件';
        const fileType = intent.entities.fileType || '';

        let response = `我已收到您上传的「${fileName}」文件。\n\n`;

        if (
          processedInput.textContent &&
          !processedInput.textContent.startsWith('[') &&
          processedInput.textContent.length > 10
        ) {
          response += `从文件中提取到以下内容：\n\n${processedInput.textContent.substring(0, previewLength)}${processedInput.textContent.length > previewLength ? '...' : ''}\n\n`;
        }

        // 智能判断：根据文件内容和类型自动判断生成报价单还是方案
        console.log('[ResponseGenerator] 智能判断文件处理方向');

        // 判断特征
        const hasProductKeywords = /产品|设备|规格|型号|数量|单价|价格|泵|阀|罐|电机/.test(
          baseContent
        );
        const hasProjectKeywords = /项目|工艺|流程|方案|设计|技术|要求|标准|处理|建设/.test(
          baseContent
        );
        const hasTableStructure = baseContent.includes('|') && baseContent.split('\n').length > 5;
        const isExcel = fileType === 'excel';

        console.log('[ResponseGenerator] 文件内容分析:', {
          hasProductKeywords,
          hasProjectKeywords,
          hasTableStructure,
          isExcel,
          fileType,
        });

        // Excel 文件或包含产品清單的文件 → 生成报价单
        if (
          isExcel ||
          (hasProductKeywords && !hasProjectKeywords) ||
          (hasTableStructure && hasProductKeywords)
        ) {
          console.log('[ResponseGenerator] 判断为：生成报价单');
          response += `根据文件内容分析，我检测到这是一份产品清单，为您生成报价单。\n\n`;
          response += `📊 **生成报价单中**\n\n`;
          response += `正在为您处理：\n`;
          response += `✅ 解析产品信息\n`;
          response += `✅ 匹配市场价格\n`;
          response += `✅ 计算报价总额\n\n`;
          response += `报价单将在下方显示，您可以直接导出或继续修改。`;
          return response;
        }

        // 包含项目描述和技术要求的文件 → 生成方案
        if (hasProjectKeywords || (!hasProductKeywords && baseContent.length > 200)) {
          console.log('[ResponseGenerator] 判断为：生成技术方案');
          response += `根据文件内容分析，我检测到这是一份项目需求文档，为您生成技术方案。\n\n`;
          response += `📝 **生成技术方案中**\n\n`;
          response += `正在为您处理：\n`;
          response += `✅ 分析项目需求\n`;
          response += `✅ 设计工艺流程\n`;
          response += `✅ 配置设备清单\n`;
          response += `✅ 计算投资估算\n\n`;
          response += `技术方案将在下方显示，如需报价单请告知。`;
          return response;
        }

        // 无法明确判断时，提供选项
        console.log('[ResponseGenerator] 无法明确判断，提供选项');
        response += `请选择您需要的服务：\n📊 生成报价单 - 基于文件内容生成专业报价\n📝 生成技术方案 - 提供详细的技术方案\n🔍 查询价格 - 查询具体产品价格\n📑 两者都生成 - 同时生成报价单和技术方案\n\n直接回复数字或文字选择即可。`;

        return response;

      case 'compare_quotes':
        return `我理解您想要比较不同的报价方案。\n\n${baseContent ? `您提到：${baseContent.substring(0, previewLength)}${baseContent.length > previewLength ? '...' : ''}` : ''}\n\n请告诉我您想比较哪些方面：\n• 价格对比\n• 性能参数对比\n• 品牌对比\n• 售后服务的差异\n\n或者直接提供需要对比的产品清单，我为您详细分析。`;

      case 'modify_quote':
        return `我理解您想要修改现有的报价。\n\n${baseContent ? `您提到：${baseContent.substring(0, previewLength)}${baseContent.length > previewLength ? '...' : ''}` : ''}\n\n请告诉我具体的修改要求：\n• 调整产品数量\n• 更改产品规格\n• 更换品牌\n• 修改价格\n\n我会根据您的要求更新报价单。`;

      case 'export_quote':
        return `我理解您想要导出报价单。\n\n${baseContent ? `您提到：${baseContent.substring(0, previewLength)}${baseContent.length > previewLength ? '...' : ''}` : ''}\n\n我可以为您：\n📄 生成PDF格式报价单\n📊 导出Excel格式报价单\n📧 发送报价单到邮箱\n\n请告诉我您需要的格式和接收方式。`;

      case 'generate_proposal':
        console.log('[ResponseGenerator] 检测到方案生成需求');

        // 自动生成技术方案
        let proposalResponse = `根据您的需求，我将为您生成技术方案。\n\n`;

        if (baseContent && !baseContent.startsWith('[') && baseContent.length > 10) {
          proposalResponse += `**需求分析**：\n${baseContent.substring(0, previewLength)}${baseContent.length > previewLength ? '...' : ''}\n\n`;
        }

        proposalResponse += `正在为您生成详细的技术方案，包括：\n\n`;
        proposalResponse += `📋 **工艺流程设计**\n   • 工艺流程图\n   • 处理单元配置\n   • 关键设备选型\n\n`;
        proposalResponse += `⚙️ **设备配置方案**\n   • 核心设备清单\n   • 技术参数要求\n   • 布置建议\n\n`;
        proposalResponse += `💧 **技术参数**\n   • 处理能力\n   • 水质标准\n   • 运行参数\n\n`;
        proposalResponse += `📊 **经济效益分析**\n   • 投资估算\n   • 运行成本\n   • 经济指标\n\n`;

        // 尝试执行联网搜索以获取更详细的方案信息
        try {
          console.log('[ResponseGenerator] 执行联网搜索以丰富方案内容');
          const searchResult = await this.webSearch.searchAndGenerate(
            baseContent || '污水处理技术方案'
          );

          if (searchResult.content) {
            proposalResponse += `\n---\n**参考案例**：\n${searchResult.content.substring(0, 500)}...\n\n`;
          }

          if (searchResult.sources && searchResult.sources.length > 0) {
            proposalResponse += `**参考资料**：\n`;
            searchResult.sources.slice(0, 3).forEach((source, index) => {
              proposalResponse += `${index + 1}. [${source.title}](${source.url})\n`;
            });
          }
        } catch (error) {
          console.error('[ResponseGenerator] 联网搜索失败:', error);
          proposalResponse += `\n---\nℹ️ 如需更详细的技术方案，请提供更具体的需求描述。`;
        }

        return proposalResponse;

      case 'simple_quote':
        console.log('[ResponseGenerator] 生成纯报价单（基础版）');
        return `正在为您生成纯报价单...\n\n报价单将包含：\n• 供需双方信息\n• 设备清单及报价\n• 商务条款\n\n请稍候...`;

      case 'enhanced_quote':
        console.log('[ResponseGenerator] 生成增强型报价单');
        return `正在为您生成增强型报价单...\n\n报价单将包含：\n• 供需双方信息\n• 设备清单及报价\n• 设备应用范围描述\n• 安装调试说明\n• 商务条款\n\n请稍候...`;

      case 'detailed_proposal':
        console.log('[ResponseGenerator] 生成详细技术方案');

        try {
          // 解析项目信息
          const projectInfo = this.projectParser.parseProjectInfo(baseContent);

          // 模拟产品清单（实际应从文件或输入中提取）
          const products: Product[] = [
            {
              name: '机械格栅',
              model: 'GS-500',
              brand: '',
              specs: '渠宽500mm，栅隙5mm',
              quantity: 1,
              unit: '台',
              price: 8500,
              total: 8500,
              remark: '不锈钢材质',
            },
            {
              name: '一体化污水处理设备',
              model: 'WSZ-60',
              brand: '',
              specs: '处理量60m³/d',
              quantity: 1,
              unit: '套',
              price: 156000,
              total: 156000,
              remark: '含A²/O生化系统',
            },
          ];

          // 生成详细方案
          const detailedProposal = await this.detailedProposalGenerator.generateDetailedProposal(
            projectInfo,
            products,
            baseContent
          );

          return detailedProposal;
        } catch (error) {
          console.error('[ResponseGenerator] 生成详细方案失败:', error);
          return `抱歉，生成详细方案时出现错误：${error instanceof Error ? error.message : '未知错误'}\n\n请稍后重试或联系技术支持。`;
        }

      case 'unknown':
        if (processedInput.type === 'image') {
          return `您上传了一张图片。目前图片分析功能正在完善中，请上传Excel、Word或PDF格式的文件，或直接输入文字描述您的需求。`;
        }
        if (processedInput.type === 'unknown') {
          return `抱歉，我无法解析您上传的文件格式。请上传以下格式的文件：\n• Excel (.xlsx, .xls)\n• Word (.docx, .doc)\n• PDF (.pdf)\n• 文本文件 (.txt)\n\n或者直接输入文字描述您的需求。`;
        }
      // 继续到默认情况

      default:
        // 一般性问题
        return `收到您的问题。我可以帮您解决以下专业问题：\n\n💧 **污水处理设备**\n   - 工艺选择、价格分析、选型建议\n   - 典型案例分享\n\n⚙️ **水泵设备**\n   - 类型对比、选型指南、价格查询\n   - 品牌推荐\n\n📊 **报价生成**\n   - 产品清单解析\n   - 自动价格匹配\n   - 专业报价单生成\n\n🔧 **技术支持**\n   - 方案设计、选型指导\n   - 运行维护建议\n\n您具体想了解什么？可以直接告诉我产品名称、规格和数量。`;
    }
  }
}

// ============================================================================
// 主 API 路由（重构版，集成输入处理器和意图判断器）
// ============================================================================

// 创建全局实例
const globalConversationMemory = new ConversationMemory();
const inputProcessor = new InputProcessor();
// ❌ 移除固定意图检测器
// const intentDetector = new IntentDetector();
// const responseGenerator = new IntentResponseGenerator();
// ✅ 使用智能对话处理器
const smartProcessor = smartChatProcessor;

export async function POST(request: NextRequest) {
  try {
    console.log('[Chat API] ========== 新请求 ==========');

    // 1. 解析请求（兼容两种格式：JSON 或 FormData）
    let message: string | null = null;
    let files: any[] | null = null;
    let intent: string | null = null;
    let conversationId: string | null = null;
    let uploadedFile: File | null = null;
    let userId: string | null = null;

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // FormData 格式（前端上传文件）
      const formData = await request.formData();
      message = formData.get('message') as string;
      uploadedFile = formData.get('file') as File | null;
      conversationId = formData.get('conversationId') as string;
      intent = formData.get('intent') as string;
      userId = formData.get('userId') as string | null;
    } else {
      // JSON 格式
      const body = await request.json();
      message = body.message;
      files = body.files;
      conversationId = body.conversationId;
      intent = body.intent;
      userId = body.userId;
    }

    console.log('[Chat API] 请求参数:', {
      hasMessage: !!message,
      messagePreview: message?.substring(0, 50),
      hasFile: !!uploadedFile,
      fileName: uploadedFile?.name,
      fileType: uploadedFile?.type,
      filesCount: files?.length,
      intent,
      conversationId,
    });

    // 2. 处理文件上传解析模式（保留原有逻辑）
    if (files && files.length > 0 && !intent) {
      console.log('[Chat API] 文件上传解析模式（原有逻辑）');

      const fileParser = new UnifiedFileParser();
      const downloader = new FileDownloader();
      const parsedFiles = [];

      for (const file of files) {
        const processedFile = processUploadedFile(file);
        const buffer = await downloader.download(file, file.fileKey);

        const fileInfo: FileInfo = {
          name: processedFile.name,
          type: processedFile.type,
          url: processedFile.url,
          fileKey: file.fileKey,
          buffer: buffer || undefined,
        };

        const parseResult = await fileParser.parseFile(fileInfo);

        parsedFiles.push({
          ...file,
          name: processedFile.name,
          productCount: parseResult.products.length,
          products: parseResult.products,
          remarks: parseResult.globalRemarks,
          parseLevel: parseResult.parseLevel,
        });
      }

      const totalProducts = parsedFiles.reduce((sum, f) => sum + (f.products?.length || 0), 0);

      if (totalProducts === 0) {
        return NextResponse.json({
          action: 'ERROR',
          content: '无法从文件中解析到产品信息',
          files: parsedFiles,
        });
      }

      return NextResponse.json({
        action: 'ASK_INTENT',
        files: parsedFiles,
        content: `文件解析完成，共找到 ${totalProducts} 个产品`,
      });
    }

    // 3. 处理意图选择模式（保留原有逻辑）
    if (intent) {
      console.log('[Chat API] 意图选择模式（原有逻辑）:', intent);

      // 纯文字对话意图选择
      if (!files || files.length === 0) {
        console.log('[Chat API] 纯文字对话意图选择，进行联网搜索');

        const currentMessage = message || '';

        if (!currentMessage) {
          return NextResponse.json({
            content: '请提供具体需求，我会为您生成方案',
          });
        }

        // 执行联网搜索
        const webSearch = new WebSearchService();
        const searchResult = await webSearch.searchAndGenerate(currentMessage);

        let responseContent = searchResult.content;

        if (searchResult.followUpQuestions && searchResult.followUpQuestions.length > 0) {
          responseContent += `\n\n---\n`;
          responseContent += `### 💬 为了给您更精准的方案，请告诉我：\n`;
          searchResult.followUpQuestions.forEach((q, index) => {
            responseContent += `${index + 1}. ${q}\n`;
          });
          responseContent += `\n您可以继续提问，我会根据您的回答提供更详细的建议。`;
        }

        return NextResponse.json({
          content: responseContent,
          sources: searchResult.sources,
          action: 'GENERATED_PROPOSAL',
          followUpQuestions: searchResult.followUpQuestions,
        });
      }

      // 有文件，处理文件并生成报价（完全保留）
      if (files && files.length > 0) {
        console.log('[Chat API] 有文件，处理文件并生成报价（原有逻辑）');

        const fileParser = new UnifiedFileParser();
        const downloader = new FileDownloader();
        const allProducts: Product[] = [];

        for (const file of files) {
          const processedFile = processUploadedFile(file);
          const buffer = await downloader.download(file, file.fileKey);

          const fileInfo: FileInfo = {
            name: processedFile.name,
            type: processedFile.type,
            url: processedFile.url,
            fileKey: file.fileKey,
            buffer: buffer || undefined,
          };

          const parseResult = await fileParser.parseFile(fileInfo);
          allProducts.push(...parseResult.products);
        }

        if (allProducts.length === 0) {
          return NextResponse.json({
            content: '无法从文件中解析到产品信息',
          });
        }

        if (intent === 'quote' || intent === 'both') {
          const quoteData = await generateQuoteData(allProducts);

          return NextResponse.json({
            content: `已为您生成报价方案，共 ${quoteData.products.length} 个产品`,
            quoteData,
          });
        }

        return NextResponse.json({
          content: `已为您生成产品方案，共 ${allProducts.length} 个产品`,
        });
      }

      return NextResponse.json({
        content: '请提供具体需求，我会为您生成方案',
      });
    }

    // 4. 新流程：智能对话处理（使用 LLM 语义理解）
    if (message || uploadedFile) {
      console.log('[Chat API] ========== 智能对话处理模式 ==========');

      // 4.1 处理输入（统一格式化）
      let processedInput: ProcessedInput;

      if (uploadedFile) {
        // 有文件上传
        console.log(
          '[Chat API] 处理文件上传:',
          uploadedFile.name,
          uploadedFile.type,
          uploadedFile.size
        );
        const buffer = Buffer.from(await uploadedFile.arrayBuffer());

        processedInput = await inputProcessor.process({
          type: 'file',
          content: buffer,
          mimeType: uploadedFile.type,
          fileName: uploadedFile.name,
        });

        console.log('[Chat API] 文件处理结果:', {
          type: processedInput.type,
          textLength: processedInput.textContent.length,
          metadata: processedInput.metadata,
        });
      } else {
        // 纯文本输入
        console.log('[Chat API] 处理文本输入:', message);
        processedInput = await inputProcessor.process({
          type: 'text',
          content: message || '',
        });
      }

      // 4.2 ✅ 使用智能对话处理器（LLM 语义理解，无需固定意图检测）
      console.log('[Chat API] 调用智能对话处理器进行语义理解...');
      const smartResponse = await smartProcessor.process(
        message || '',
        processedInput,
        conversationId || undefined,
        userId || undefined
      );

      console.log('[Chat API] 智能响应生成完成:', {
        intent: smartResponse.intent,
        contentLength: smartResponse.content.length,
        suggestions: smartResponse.suggestions?.length,
        requiresFollowUp: smartResponse.requiresFollowUp,
      });

      // 4.3 保存对话历史（如果有conversationId）
      if (conversationId) {
        globalConversationMemory.addToHistory(conversationId, 'user', message || '[文件上传]');
        globalConversationMemory.addToHistory(conversationId, 'assistant', smartResponse.content);
      }

      // 4.4 返回响应
      return NextResponse.json({
        response: smartResponse.content,
        content: smartResponse.content,
        conversationId,
        suggestions: smartResponse.suggestions,
        followUpQuestions: smartResponse.followUpQuestions,
        metadata: {
          intent: smartResponse.intent, // 动态识别的意图，不固定
          inputType: processedInput.type,
          confidence: smartResponse.metadata?.confidence || 0.9,
          entities: smartResponse.metadata?.extractedEntities,
        },
      });
    }

    // 5. 没有有效输入
    return NextResponse.json({
      content: '请上传文件或输入产品需求',
      response: '请上传文件或输入产品需求',
    });
  } catch (error) {
    console.error('[Chat API] 处理失败:', error);
    return NextResponse.json(
      {
        error: '处理请求时发生错误',
        message: error instanceof Error ? error.message : '未知错误',
        content: '处理请求时发生错误，请稍后重试',
        response: '处理请求时发生错误，请稍后重试',
      },
      { status: 500 }
    );
  }
}

// 添加 GET 方法以支持模型查询
export async function GET(_request: NextRequest) {
  try {
    // 获取可用模型列表
    const availableModels = aiClient.getAvailableModels();

    return NextResponse.json({
      success: true,
      models: availableModels,
      defaultModel: 'deepseek',
      message: availableModels.includes('deepseek')
        ? 'DeepSeek API已就绪，请配置 API Key 使用'
        : '未检测到可用的AI模型，请检查环境变量配置',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Chat API GET] 错误:', error);
    return NextResponse.json(
      {
        error: error.message,
        models: [],
        success: false,
        message: '获取模型列表失败',
      },
      { status: 500 }
    );
  }
}
