/**
 * 智能产品信息提取器
 * 
 * 核心理念：
 * 1. 使用 LLM 进行语义理解，应对千变万化的用户表达
 * 2. 多策略组合：LLM 提取 + 规则匹配 + 模糊搜索
 * 3. 宽松匹配 + 精确验证的策略
 * 
 * 支持的用户表达方式：
 * - "化粪池100立方的多少钱一个"
 * - "100立方的化粪池价格"
 * - "化粪池，规格100立方米，多少钱"
 * - "HFC(GFE)13#型号化粪池多少钱"
 * - "化粪池 100立方 价格"
 * - "100m³化粪池报价"
 * - "化粪池型号100，成本价和售价"
 * - "查询一下化粪池，100立方的"
 */

import { callDeepSeekChat } from './deepseek-client';

export interface ExtractedProduct {
  productName: string;
  model?: string;
  specifications?: string;
  category?: string;
  brand?: string;
  confidence: number; // 0-100
  originalInput: string;
  normalizedInput: string;
}

export class ProductExtractor {
  /**
   * 使用 LLM 进行语义理解提取
   * 这是最高优先级的方法，能够理解各种复杂的表达方式
   */
  static async extractWithLLM(userInput: string): Promise<ExtractedProduct | null> {
    try {
      const systemPrompt = `你是一个专业的产品信息提取专家。你的任务是从用户的自然语言输入中提取产品信息。

提取规则：
1. 产品名称：提取核心产品名称，不包含型号、规格、品牌等信息
   - 例如："HFC(GFE)13#化粪池" -> "化粪池"
   - 例如："100立方化粪池" -> "化粪池"
   - 例如："普耐尔氩弧焊枪10M" -> "氩弧焊枪"

2. 型号：提取产品的型号、规格、容量等标识信息
   - 支持数字（100、10M、5.5）
   - 支持字母数字组合（HFC-13、PW-100、KQ-150）
   - 支持带单位（100立方、50吨、10M³、5L）
   - 提取时保留核心标识，如"100立方"提取为"100"

3. 规格：提取详细的技术规格（如果有）
   - 例如："HFC(GFE)13#" -> "HFC(GFE)13#"
   - 例如："150mm" -> "150mm"

4. 品牌：提取品牌信息（如果有）
   - 例如："普耐尔焊枪" -> "普耐尔"

5. 置信度：根据输入的清晰度给出0-100的分数

输出格式（JSON）：
{
  "productName": "产品名称",
  "model": "型号（可选）",
  "specifications": "规格（可选）",
  "brand": "品牌（可选）",
  "confidence": 95,
  "explanation": "简短说明提取逻辑"
}

注意：
- 如果无法提取出产品名称，返回 null
- 型号可以是纯数字或字母数字组合
- 不要过度提取，保持信息准确`;

      const userPrompt = `请从以下用户输入中提取产品信息：

用户输入："${userInput}"

请输出JSON格式的提取结果。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // 低温度确保一致性
        maxTokens: 500
      });

      // 解析 LLM 返回的 JSON
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[ProductExtractor] LLM 返回的不是有效的 JSON');
        return null;
      }

      const result = JSON.parse(jsonMatch[0]);

      // 验证提取结果
      if (!result.productName || result.productName.length === 0) {
        console.warn('[ProductExtractor] LLM 未提取到产品名称');
        return null;
      }

      return {
        productName: result.productName,
        model: result.model,
        specifications: result.specifications,
        brand: result.brand,
        confidence: result.confidence || 70,
        originalInput: userInput,
        normalizedInput: this.normalizeInput(userInput)
      };
    } catch (error) {
      console.error('[ProductExtractor] LLM 提取失败:', error);
      return null;
    }
  }

  /**
   * 使用规则引擎提取（LLM 失败时的回退方案）
   * 基于正则表达式和关键词匹配
   */
  static extractWithRules(userInput: string): ExtractedProduct | null {
    try {
      const normalized = this.normalizeInput(userInput);
      
      // 1. 移除价格查询关键词
      const priceKeywords = ['多少钱', '价格', '单价', '售价', '报价', '成本', '费用', '询问', '查询', '想知道'];
      let cleaned = normalized;
      priceKeywords.forEach(keyword => {
        cleaned = cleaned.replace(keyword, '');
      });

      // 2. 移除量词
      const unitKeywords = ['一个', '一台', '一套', '一件', '一只', '一支', '每台', '每套', '每件', '个', '台', '套', '件'];
      unitKeywords.forEach(keyword => {
        cleaned = cleaned.replace(keyword, '');
      });

      // 3. 提取型号（多种模式）
      const patterns = [
        // 模式1: 数字 + 中文单位（100立方、50吨、10升）
        /(\d+(\.\d+)?)\s*(立方|立方米|m³|m3|吨|升|升|L|ML|毫米|mm|厘米|cm|米|m|万|亿)/gi,
        // 模式2: 字母数字组合（HFC-13、PW-100、10M、5.5K）
        /([A-Za-z]*[-_]?\d+(\.\d+)?[A-Za-z]*|\d+(\.\d+)?[A-Za-z]+)/gi,
        // 模式3: 纯数字（100、50、10）
        /(\d+(\.\d+)?)/g
      ];

      let model: string | undefined;
      for (const pattern of patterns) {
        const matches = cleaned.match(pattern);
        if (matches && matches.length > 0) {
          // 提取第一个匹配的型号
          model = matches[0].trim();
          
          // 如果是带单位的型号，只保留数字部分
          if (/[立方|立方米|m³|m3|吨|升|毫米|厘米|米]/.test(model)) {
            const numberMatch = model.match(/(\d+(\.\d+)?)/);
            if (numberMatch) {
              model = numberMatch[1];
            }
          }
          break;
        }
      }

      // 4. 从输入中移除型号，得到产品名称
      let productName = cleaned;
      if (model) {
        productName = cleaned.replace(new RegExp(model, 'gi'), '').trim();
      }

      // 5. 清理产品名称
      productName = this.cleanProductName(productName);

      // 6. 验证结果
      if (!productName || productName.length < 2) {
        return null;
      }

      return {
        productName,
        model,
        specifications: model,
        confidence: 60, // 规则匹配置信度较低
        originalInput: userInput,
        normalizedInput: normalized
      };
    } catch (error) {
      console.error('[ProductExtractor] 规则提取失败:', error);
      return null;
    }
  }

  /**
   * 智能提取（主方法）
   * 优先使用 LLM，失败时回退到规则匹配
   */
  static async extract(userInput: string): Promise<ExtractedProduct | null> {
    console.log('[ProductExtractor] ========== 开始智能提取 ==========');
    console.log('[ProductExtractor] 用户输入:', userInput);

    // 策略1: 使用 LLM 提取（最高优先级）
    const llmResult = await this.extractWithLLM(userInput);
    if (llmResult && llmResult.confidence > 60) {
      console.log('[ProductExtractor] ✅ LLM 提取成功:', llmResult);
      return llmResult;
    }

    // 策略2: 使用规则匹配（回退方案）
    const ruleResult = this.extractWithRules(userInput);
    if (ruleResult) {
      console.log('[ProductExtractor] ⚠️ 规则提取成功:', ruleResult);
      return ruleResult;
    }

    console.log('[ProductExtractor] ❌ 提取失败');
    return null;
  }

  /**
   * 标准化输入文本
   */
  private static normalizeInput(input: string): string {
    return input
      .toLowerCase()
      .replace(/[？?！!，,。.;;、\s]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 清理产品名称
   */
  private static cleanProductName(name: string): string {
    return name
      .replace(/[型号|规格|品牌|系列|款式|款式|种类|类型]/g, '')
      .replace(/[，,。.;;、]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 验证提取结果的合理性
   */
  static validate(extraction: ExtractedProduct): boolean {
    // 产品名称不能为空
    if (!extraction.productName || extraction.productName.length < 2) {
      return false;
    }

    // 产品名称不能是纯数字
    if (/^\d+$/.test(extraction.productName)) {
      return false;
    }

    // 产品名称不能是纯符号
    if (/^[^\w\u4e00-\u9fa5]+$/.test(extraction.productName)) {
      return false;
    }

    return true;
  }
}
